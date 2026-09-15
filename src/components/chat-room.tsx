"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  Cable,
  Hash,
  Info,
  LogOut,
  Radio,
  RefreshCw,
  Send,
  TerminalSquare,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Backdrop } from "@/components/backdrop";
import { CopyButton } from "@/components/copy-button";
import { Logo } from "@/components/logo";
import type {
  PresenceUser,
  RoomInfo,
  ServerEvent,
  StoredMessage,
} from "@/lib/chat/types";

type ChatLine =
  | ({ kind: "msg" } & StoredMessage)
  | { kind: "sys"; id: string; text: string; at: number };

type Status = "connecting" | "online" | "reconnecting" | "offline";

const USERNAME_KEY = "relay:username";
const USERNAME_COLORS = [
  "#d9f64f",
  "#6ee7f9",
  "#ffb648",
  "#ff8fab",
  "#b7a6ff",
  "#7ef0c1",
  "#f9f871",
  "#ff9d6e",
];

function colorFor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i += 1) {
    hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  }
  return USERNAME_COLORS[hash % USERNAME_COLORS.length];
}

function formatTime(at: number): string {
  return new Date(at).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export function ChatRoom({
  code,
  initialUsername,
}: {
  code: string;
  initialUsername: string | null;
}) {
  const router = useRouter();
  const [username, setUsername] = useState<string | null>(initialUsername);
  const [gateInput, setGateInput] = useState("");
  const [status, setStatus] = useState<Status>("connecting");
  const [closeInfo, setCloseInfo] = useState<string | null>(null);
  const [room, setRoom] = useState<RoomInfo | null>(null);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [users, setUsers] = useState<PresenceUser[]>([]);
  const [typingUsers, setTypingUsers] = useState<string[]>([]);
  const [input, setInput] = useState("");
  const [serverNotice, setServerNotice] = useState<string | null>(null);
  const [showPanel, setShowPanel] = useState(false);
  const [pendingJumps, setPendingJumps] = useState(0);
  const [nearBottom, setNearBottom] = useState(true);

  const wsRef = useRef<WebSocket | null>(null);
  const intentionalCloseRef = useRef(false);
  const attemptRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const typingSentRef = useRef(false);
  const typingStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const nearBottomRef = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const usernameRef = useRef<string | null>(initialUsername);
  usernameRef.current = username;

  /* ---------- helpers ---------- */

  const pushSystemLine = useCallback((text: string) => {
    setLines((prev) => [
      ...prev.slice(-499),
      { kind: "sys", id: `sys-${Date.now()}-${Math.random()}`, text, at: Date.now() },
    ]);
  }, []);

  const flashNotice = useCallback((text: string) => {
    setServerNotice(text);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setServerNotice(null), 4200);
  }, []);

  const markTyping = useCallback((name: string, isTyping: boolean) => {
    const timers = typingTimersRef.current;
    const existing = timers.get(name);
    if (existing) clearTimeout(existing);
    timers.delete(name);
    if (isTyping) {
      timers.set(
        name,
        setTimeout(() => {
          setTypingUsers((prev) => prev.filter((u) => u !== name));
          typingTimersRef.current.delete(name);
        }, 4000),
      );
    }
    setTypingUsers((prev) => {
      const without = prev.filter((u) => u !== name);
      return isTyping ? [...without, name] : without;
    });
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: smooth ? "smooth" : "auto" });
    setPendingJumps(0);
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    nearBottomRef.current = near;
    setNearBottom(near);
    if (near) setPendingJumps(0);
  }, []);

  /* ---------- connection ---------- */

  const connect = useCallback(() => {
    const name = usernameRef.current;
    if (!name) return;
    intentionalCloseRef.current = false;
    setStatus(attemptRef.current > 0 ? "reconnecting" : "connecting");

    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(
      `${proto}://${window.location.host}/ws?room=${encodeURIComponent(
        code,
      )}&username=${encodeURIComponent(name)}`,
    );
    wsRef.current = ws;

    ws.onopen = () => {
      attemptRef.current = 0;
      setStatus("online");
      setCloseInfo(null);
    };

    ws.onmessage = (event) => {
      let data: ServerEvent;
      try {
        data = JSON.parse(String(event.data)) as ServerEvent;
      } catch {
        return;
      }
      switch (data.type) {
        case "welcome":
          setRoom(data.room);
          setUsers(data.users);
          setLines(
            data.messages.map((message) => ({ kind: "msg" as const, ...message })),
          );
          requestAnimationFrame(() => scrollToBottom(false));
          break;
        case "message":
          setLines((prev) => [
            ...prev.slice(-499),
            { kind: "msg" as const, ...data.message },
          ]);
          if (!nearBottomRef.current && data.message.username !== usernameRef.current) {
            setPendingJumps((n) => n + 1);
          }
          break;
        case "presence":
          setUsers(data.users);
          break;
        case "user_joined":
          pushSystemLine(`→ ${data.user.username} joined the room`);
          break;
        case "user_left":
          pushSystemLine(`← ${data.username} left the room`);
          markTyping(data.username, false);
          break;
        case "typing":
          markTyping(data.username, data.isTyping);
          break;
        case "error":
          flashNotice(data.message);
          break;
        default:
          break;
      }
    };

    ws.onclose = (event) => {
      if (intentionalCloseRef.current) return;
      const reason = event.reason || "connection lost";
      setCloseInfo(reason);
      if (event.code === 4404 || event.code === 4400 || event.code === 4409) {
        setStatus("offline");
        return; // handshake rejection — do not hammer reconnects
      }
      attemptRef.current += 1;
      const delay = Math.min(8000, 600 * 2 ** attemptRef.current);
      setStatus("reconnecting");
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(connect, delay);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [code, flashNotice, markTyping, pushSystemLine, scrollToBottom]);

  useEffect(() => {
    if (!username) {
      const stored = window.localStorage.getItem(USERNAME_KEY);
      if (stored) {
        setUsername(stored);
        return;
      }
      setStatus("connecting");
      return;
    }
    connect();
    return () => {
      intentionalCloseRef.current = true;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      wsRef.current?.close(1000, "leaving");
    };
  }, [username, connect]);

  /* auto scroll on new lines */
  useEffect(() => {
    if (nearBottomRef.current) scrollToBottom(false);
  }, [lines, scrollToBottom]);

  /* ---------- sending ---------- */

  const sendEvent = useCallback((payload: unknown) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }, []);

  const sendTyping = useCallback(
    (isTyping: boolean) => {
      sendEvent({ type: "typing", isTyping });
      typingSentRef.current = isTyping;
    },
    [sendEvent],
  );

  const onInputChange = (value: string) => {
    setInput(value);
    if (!typingSentRef.current && value.trim()) sendTyping(true);
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    typingStopRef.current = setTimeout(() => sendTyping(false), 1400);
  };

  const sendMessage = useCallback(() => {
    const text = input.trim();
    if (!text || status !== "online") return;
    sendEvent({ type: "message", text });
    if (typingSentRef.current) sendTyping(false);
    if (typingStopRef.current) clearTimeout(typingStopRef.current);
    setInput("");
    inputRef.current?.focus();
  }, [input, sendEvent, sendTyping, status]);

  /* ---------- username gate ---------- */

  const submitGate = () => {
    const name = gateInput.trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9 _.\-]{0,23}$/.test(name)) return;
    window.localStorage.setItem(USERNAME_KEY, name);
    window.history.replaceState(null, "", `/r/${code}?u=${encodeURIComponent(name)}`);
    setUsername(name);
  };

  const wsUrl = useMemo(() => {
    if (typeof window === "undefined") return "";
    const proto = window.location.protocol === "https:" ? "wss" : "ws";
    return `${proto}://${window.location.host}/ws?room=${code}&username=${username ?? "YOUR_USERNAME"}`;
  }, [code, username]);

  const statusMeta: Record<Status, { label: string; dot: string }> = {
    connecting: { label: "CONNECTING", dot: "bg-amber" },
    online: { label: "LIVE", dot: "bg-volt animate-pulse-dot" },
    reconnecting: { label: "RECONNECTING", dot: "bg-amber" },
    offline: { label: "OFFLINE", dot: "bg-alert" },
  };

  /* ---------- username gate UI ---------- */
  if (!username) {
    return (
      <div className="relative flex min-h-dvh items-center justify-center">
        <Backdrop intensity={0.7} />
        <div className="panel tick-frame relative z-10 w-[min(92vw,420px)] animate-pop p-7">
          <div className="mb-6 flex items-center justify-between">
            <Logo size={26} />
            <span className="text-[10px] tracking-[0.3em] text-fog">IDENT REQUIRED</span>
          </div>
          <p className="mb-1 text-[11px] tracking-[0.25em] text-fog">JOINING ROOM</p>
          <p className="mb-5 font-display text-2xl font-bold tracking-[0.3em] text-volt">
            {code}
          </p>
          <label htmlFor="gate-username" className="mb-1.5 block text-[10px] tracking-[0.25em] text-fog">
            CALLSIGN / USERNAME
          </label>
          <input
            id="gate-username"
            value={gateInput}
            maxLength={24}
            autoFocus
            onChange={(event) => setGateInput(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && submitGate()}
            placeholder="neo"
            autoComplete="off"
            spellCheck={false}
            className="mb-4 w-full border border-edge bg-abyss/80 px-3.5 py-3 text-sm text-white placeholder:text-fog/50 focus:border-volt/70 focus:outline-none"
          />
          <button
            type="button"
            onClick={submitGate}
            className="w-full cursor-pointer bg-volt py-3 text-xs font-bold tracking-[0.25em] text-ink transition-colors hover:bg-white"
          >
            ENTER ROOM →
          </button>
          <p className="mt-4 text-[10px] leading-relaxed text-fog/70">
            letters, numbers, spaces and _ . — up to 24 chars
          </p>
        </div>
      </div>
    );
  }

  /* ---------- chat UI ---------- */
  const visibleTyping = typingUsers.filter((u) => u !== username);

  return (
    <div className="relative flex h-dvh flex-col">
      <Backdrop intensity={0.4} />

      {/* header */}
      <header className="relative z-20 border-b border-edge/80 bg-abyss/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="cursor-pointer opacity-80 transition-opacity hover:opacity-100"
            aria-label="Back to home"
          >
            <Logo size={24} />
          </button>
          <span className="hidden h-5 w-px bg-edge sm:block" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Hash className="h-3.5 w-3.5 shrink-0 text-volt" />
              <span className="truncate font-display text-base font-bold tracking-[0.25em] text-white">
                {code}
              </span>
              <CopyButton value={code} className="text-fog" />
            </div>
            <p className="truncate text-[10px] tracking-[0.15em] text-fog">
              {room?.name ?? "connecting…"}
            </p>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span
              className={`hidden items-center gap-2 border px-3 py-1.5 text-[10px] tracking-[0.2em] sm:inline-flex ${
                status === "online"
                  ? "border-volt/40 text-volt"
                  : status === "offline"
                    ? "border-alert/50 text-alert"
                    : "border-amber/40 text-amber"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusMeta[status].dot}`} />
              {statusMeta[status].label}
            </span>
            {status !== "online" && (
              <button
                type="button"
                onClick={() => {
                  attemptRef.current = 0;
                  wsRef.current?.close();
                  connect();
                }}
                className="cursor-pointer border border-edge p-2 text-mist transition-colors hover:border-volt/60 hover:text-volt"
                aria-label="Reconnect"
              >
                <RefreshCw className={`h-4 w-4 ${status === "reconnecting" ? "animate-spin" : ""}`} />
              </button>
            )}
            <button
              type="button"
              onClick={() => setShowPanel((v) => !v)}
              className={`cursor-pointer border p-2 transition-colors lg:hidden ${
                showPanel ? "border-volt/60 text-volt" : "border-edge text-mist hover:border-volt/60 hover:text-volt"
              }`}
              aria-label="Room info"
            >
              <Users className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="cursor-pointer border border-edge p-2 text-mist transition-colors hover:border-alert/60 hover:text-alert"
              aria-label="Leave room"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
        {closeInfo && status !== "online" && (
          <div className="border-t border-edge/60 bg-raise/60 px-4 py-1.5 text-center text-[10px] tracking-[0.15em] text-amber">
            {status === "offline" ? "LINK TERMINATED" : "LINK LOST"} — {closeInfo}
            {status === "reconnecting" ? " · retrying…" : ""}
          </div>
        )}
      </header>

      {/* body */}
      <div className="relative z-10 mx-auto flex min-h-0 w-full max-w-7xl flex-1">
        {/* main column */}
        <main className="flex min-w-0 flex-1 flex-col">
          {/* messages */}
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="min-h-0 flex-1 overflow-y-auto px-4 pt-6 pb-4 sm:px-6"
          >
            <div className="mb-6 border border-edge/70 bg-panel/60 px-4 py-3 backdrop-blur-sm">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] tracking-[0.2em] text-fog">
                <TerminalSquare className="h-3.5 w-3.5 text-volt" />
                CHANNEL OPEN
                <span className="text-fog/50">/</span>
                <span className="text-mist">share the code</span>
                <CopyButton
                  value={typeof window !== "undefined" ? window.location.href : `/r/${code}`}
                  label="COPY INVITE LINK"
                  className="text-volt"
                />
              </p>
            </div>

            {lines.length === 0 && status === "online" && (
              <div className="py-16 text-center">
                <p className="font-display text-2xl font-bold tracking-[0.2em] text-edge sm:text-3xl">
                  START TRANSMISSION
                </p>
                <p className="mt-2 text-[11px] tracking-[0.25em] text-fog">
                  THIS CHANNEL IS SILENT — SAY SOMETHING
                </p>
              </div>
            )}

            <ol className="space-y-1">
              {lines.map((line) =>
                line.kind === "sys" ? (
                  <li key={line.id} className="animate-pop py-1 text-center">
                    <span className="text-[10px] tracking-[0.2em] text-fog/80">{line.text}</span>
                  </li>
                ) : (
                  <li
                    key={line.id}
                    className={`group animate-pop border-l-2 px-3 py-1.5 ${
                      line.username === username
                        ? "border-volt bg-volt/5"
                        : "border-transparent hover:border-edge hover:bg-panel/40"
                    }`}
                  >
                    <div className="flex items-baseline gap-3">
                      <span className="shrink-0 text-[10px] tabular-nums text-fog/60">
                        {formatTime(line.at)}
                      </span>
                      <span
                        className="shrink-0 text-xs font-bold"
                        style={{ color: colorFor(line.username) }}
                      >
                        {line.username}
                        {line.username === username && (
                          <span className="ml-1.5 text-[9px] font-normal tracking-[0.2em] text-fog">
                            YOU
                          </span>
                        )}
                      </span>
                      <p className="min-w-0 flex-1 text-sm break-words whitespace-pre-wrap text-mist">
                        {line.text}
                      </p>
                    </div>
                  </li>
                ),
              )}
            </ol>
          </div>

          {/* typing + jump */}
          <div className="relative px-4 sm:px-6">
            {pendingJumps > 0 && !nearBottom && (
              <button
                type="button"
                onClick={() => scrollToBottom()}
                className="absolute -top-11 left-1/2 z-10 flex -translate-x-1/2 cursor-pointer items-center gap-2 border border-volt/50 bg-abyss px-3.5 py-1.5 text-[10px] tracking-[0.2em] text-volt shadow-[0_0_24px_rgba(217,246,79,0.15)] transition-colors hover:bg-volt hover:text-ink"
              >
                <ArrowDown className="h-3 w-3" />
                {pendingJumps} NEW
              </button>
            )}
            <p className="h-5 text-[10px] tracking-[0.2em] text-fog">
              {visibleTyping.length > 0 && (
                <span className="animate-pulse">
                  {visibleTyping.join(", ")} {visibleTyping.length === 1 ? "is" : "are"} typing
                  <span className="animate-blink">…</span>
                </span>
              )}
            </p>
          </div>

          {/* composer */}
          <div className="border-t border-edge/80 bg-abyss/80 px-4 pt-3 pb-4 backdrop-blur-md sm:px-6">
            {serverNotice && (
              <p className="mb-2 animate-pop text-[10px] tracking-[0.15em] text-alert">
                ! {serverNotice}
              </p>
            )}
            <div className="flex items-center gap-2">
              <span className="hidden shrink-0 font-display text-lg font-bold text-volt sm:block">
                ›
              </span>
              <input
                ref={inputRef}
                value={input}
                maxLength={2000}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    sendMessage();
                  }
                }}
                placeholder={
                  status === "online" ? `transmit as ${username}…` : "waiting for link…"
                }
                disabled={status !== "online"}
                autoComplete="off"
                spellCheck={false}
                className="min-w-0 flex-1 border border-edge bg-panel/70 px-4 py-3.5 text-sm text-white placeholder:text-fog/50 focus:border-volt/70 focus:outline-none disabled:opacity-40"
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={status !== "online" || !input.trim()}
                className="shrink-0 cursor-pointer bg-volt p-3.5 text-ink transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-2 flex items-center justify-between text-[9px] tracking-[0.2em] text-fog/70">
              <span>ENTER ↵ TO SEND</span>
              <span className={input.length > 1800 ? "text-amber" : ""}>
                {input.length}/2000
              </span>
            </div>
          </div>
        </main>

        {/* sidebar */}
        <aside
          className={`panel w-72 shrink-0 flex-col overflow-y-auto border-l border-edge/80 bg-abyss/70 backdrop-blur-md max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-30 max-lg:border-l max-lg:pt-3 max-lg:shadow-2xl max-lg:transition-transform max-lg:duration-300 lg:flex ${
            showPanel ? "flex max-lg:translate-x-0" : "hidden max-lg:translate-x-full lg:flex"
          }`}
        >
          <div className="flex items-center justify-between border-b border-edge/70 px-5 py-4">
            <span className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] text-fog">
              <Users className="h-3.5 w-3.5 text-volt" />
              ONLINE — {users.length}
            </span>
            <button
              type="button"
              onClick={() => setShowPanel(false)}
              className="cursor-pointer text-fog transition-colors hover:text-white lg:hidden"
              aria-label="Close panel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <ul className="flex-1 overflow-y-auto px-3 py-3">
            {users.map((user) => (
              <li
                key={user.username}
                className="flex items-center gap-3 px-2 py-2 transition-colors hover:bg-panel/60"
              >
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center font-display text-sm font-bold text-ink"
                  style={{ backgroundColor: colorFor(user.username) }}
                >
                  {user.username[0]?.toUpperCase()}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-bold text-white">
                    {user.username}
                    {user.username === username && (
                      <span className="ml-1.5 text-[9px] font-normal tracking-[0.2em] text-fog">
                        YOU
                      </span>
                    )}
                  </span>
                  <span className="block text-[9px] tracking-[0.15em] text-fog">
                    JOINED {formatTime(user.joinedAt)}
                  </span>
                </span>
              </li>
            ))}
          </ul>

          <div className="border-t border-edge/70 px-5 py-4">
            <p className="mb-3 inline-flex items-center gap-2 text-[10px] tracking-[0.3em] text-fog">
              <Info className="h-3.5 w-3.5 text-volt" />
              WIRE PROTOCOL
            </p>
            <div className="space-y-3 text-[10px] leading-relaxed">
              <div className="border border-edge/70 bg-panel/60 p-3">
                <p className="mb-1.5 flex items-center justify-between tracking-[0.2em] text-fog">
                  <span className="inline-flex items-center gap-1.5">
                    <Cable className="h-3 w-3 text-volt" /> SOCKET
                  </span>
                  <CopyButton value={wsUrl} label="COPY" className="text-fog" />
                </p>
                <p className="break-all text-mist">{wsUrl}</p>
              </div>
              <div className="border border-edge/70 bg-panel/60 p-3">
                <p className="mb-1.5 flex items-center justify-between tracking-[0.2em] text-fog">
                  <span className="inline-flex items-center gap-1.5">
                    <Radio className="h-3 w-3 text-volt" /> STATUS
                  </span>
                  {status === "online" ? (
                    <Wifi className="h-3 w-3 text-volt" />
                  ) : (
                    <WifiOff className="h-3 w-3 text-alert" />
                  )}
                </p>
                <p className="text-mist">
                  {statusMeta[status].label} · {users.length} online ·{" "}
                  {lines.filter((l) => l.kind === "msg").length} frames
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
