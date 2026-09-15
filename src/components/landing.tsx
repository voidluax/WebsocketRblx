"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  ArrowUpRight,
  BookOpenText,
  Braces,
  Cable,
  Hash,
  LogIn,
  Plus,
  Radio,
  RefreshCw,
  ShieldCheck,
  TerminalSquare,
  Users,
  Zap,
} from "lucide-react";
import { Backdrop } from "@/components/backdrop";
import { CopyButton } from "@/components/copy-button";
import { Logo } from "@/components/logo";

type RoomSummaryWire = {
  code: string;
  name: string;
  createdAt: number;
  users: number;
};

type RoomsResponse = {
  ok: boolean;
  persistence: string;
  stats: { rooms: number; connections: number; users: number };
  rooms: RoomSummaryWire[];
};

const TICKER_ITEMS = [
  "CUSTOM WS GATEWAY",
  "POST /api/rooms → ROOM CODE",
  "WSS /ws?room=CODE&username=NAME",
  "TYPING + PRESENCE EVENTS",
  "RENDER FREE-TIER READY",
  "OPTIONAL POSTGRES PERSISTENCE",
  "AUTO-RECONNECTING CLIENT",
];

const USERNAME_KEY = "relay:username";

export function Landing() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [roomName, setRoomName] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<RoomsResponse | null>(null);
  const [origin, setOrigin] = useState("https://your-app.onrender.com");
  const usernameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setOrigin(window.location.origin);
    const stored = window.localStorage.getItem(USERNAME_KEY);
    if (stored) setUsername(stored);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/rooms", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as RoomsResponse;
        if (!cancelled) setData(json);
      } catch {
        // stats are decorative — stay quiet
      }
    };
    load();
    const interval = setInterval(load, 15_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const wsOrigin = origin.replace(/^http/, "ws");

  const needUsername = useCallback(() => {
    const trimmed = username.trim();
    if (!trimmed) {
      setError("Pick a username first — it identifies you in rooms.");
      usernameRef.current?.focus();
      return null;
    }
    window.localStorage.setItem(USERNAME_KEY, trimmed);
    return trimmed;
  }, [username]);

  const createRoom = useCallback(async () => {
    const name = needUsername();
    if (!name || busy) return;
    setBusy("create");
    setError(null);
    try {
      const res = await fetch("/api/rooms", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: roomName.trim() || undefined, username: name }),
      });
      const json = (await res.json()) as {
        ok: boolean;
        room?: { code: string };
        message?: string;
      };
      if (!res.ok || !json.ok || !json.room) {
        throw new Error(json.message ?? "Could not create room.");
      }
      router.push(`/r/${json.room.code}?u=${encodeURIComponent(name)}`);
    } catch (error_) {
      setError(error_ instanceof Error ? error_.message : "Could not create room.");
      setBusy(null);
    }
  }, [busy, needUsername, roomName, router]);

  const joinRoom = useCallback(
    async (codeRaw?: string) => {
      const name = needUsername();
      if (!name || busy) return;
      const code = (codeRaw ?? joinCode).trim().toUpperCase();
      if (!/^[A-Z2-9]{4,8}$/.test(code)) {
        setError("Room codes are 4–8 characters (A–Z, 2–9).");
        return;
      }
      setBusy("join");
      setError(null);
      try {
        const res = await fetch(`/api/rooms/${code}`, { cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; message?: string };
        if (res.status === 404 || !json.ok) {
          throw new Error(`Room ${code} does not exist. Create it first.`);
        }
        router.push(`/r/${code}?u=${encodeURIComponent(name)}`);
      } catch (error_) {
        setError(error_ instanceof Error ? error_.message : "Could not join room.");
        setBusy(null);
      }
    },
    [busy, joinCode, needUsername, router],
  );

  const snippets = [
    {
      icon: TerminalSquare,
      title: "01 · CREATE",
      caption: "HTTP — mint a room code",
      code: `curl -X POST ${origin}/api/rooms \\
  -H "content-type: application/json" \\
  -d '{"name":"war room"}'

# → {"ok":true,"room":{"code":"K7X2QM", …}}`,
      copy: `curl -X POST ${origin}/api/rooms -H "content-type: application/json" -d '{"name":"war room"}'`,
    },
    {
      icon: Cable,
      title: "02 · CONNECT",
      caption: "WebSocket — attach to the room",
      code: `wscat -c "${wsOrigin}/ws?room=K7X2QM&username=neo"

# ← {"type":"welcome","room":{…},
#    "users":[…],"messages":[…]}`,
      copy: `wscat -c "${wsOrigin}/ws?room=K7X2QM&username=neo"`,
    },
    {
      icon: Braces,
      title: "03 · TRANSMIT",
      caption: "JSON frames in both directions",
      code: `> {"type":"message","text":"hello room"}
< {"type":"message","message":{
    "username":"neo","text":"hello room",
    "at":1767225600000,"id":"…"}}
< {"type":"typing","username":"trinity",
   "isTyping":true}`,
      copy: `{"type":"message","text":"hello room"}`,
    },
  ];

  return (
    <div className="relative min-h-dvh">
      <Backdrop />

      {/* ticker */}
      <div className="relative z-10 overflow-hidden border-b border-edge/70 bg-abyss/70 backdrop-blur-sm">
        <div className="flex w-max animate-marquee gap-0 py-2">
          {[...TICKER_ITEMS, ...TICKER_ITEMS].map((item, index) => (
            <span
              key={index}
              className="mx-6 flex items-center gap-2 text-[10px] tracking-[0.3em] whitespace-nowrap text-fog"
            >
              <span className="h-1 w-1 rounded-full bg-volt/70" />
              {item}
            </span>
          ))}
        </div>
      </div>

      {/* nav */}
      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 pt-7">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 border border-edge bg-panel/80 px-3 py-1.5 text-[10px] tracking-[0.2em] text-mist sm:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse-dot rounded-full bg-volt" />
            OPERATIONAL
          </span>
          <a
            href="https://github.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 border border-edge bg-panel/80 px-3 py-1.5 text-[10px] tracking-[0.2em] text-mist transition-colors hover:border-volt/60 hover:text-volt"
          >
            <BookOpenText className="h-3.5 w-3.5" />
            DOCS
          </a>
        </div>
      </header>

      {/* hero */}
      <main className="relative z-10 mx-auto max-w-6xl px-6">
        <section className="grid items-end gap-12 pt-16 pb-14 lg:grid-cols-[1.2fr_1fr] lg:pt-24">
          <div className="animate-fade-rise">
            <p className="mb-5 flex items-center gap-2 text-[11px] tracking-[0.35em] text-volt">
              <Radio className="h-3.5 w-3.5" />
              REALTIME CHAT · RAW WEBSOCKET PROTOCOL
            </p>
            <h1 className="font-display text-[clamp(4.5rem,13vw,10.5rem)] leading-[0.85] font-bold tracking-tight text-white">
              REL
              <span className="glow-volt text-volt">A</span>
              Y
            </h1>
            <p className="mt-6 max-w-md text-sm leading-relaxed text-mist">
              One Node process, two protocols. Mint a room over{" "}
              <span className="text-white">HTTP</span>, grab its six-char code, and
              talk over <span className="text-volt">WebSocket</span> — built to run
              on Render&apos;s free tier with zero adapters.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3 text-[11px] tracking-wider text-fog">
              <span className="inline-flex items-center gap-2">
                <Zap className="h-3.5 w-3.5 text-volt" />
                {wsOrigin}/ws
              </span>
              <span className="inline-flex items-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5 text-volt" />
                POST /api/rooms
              </span>
            </div>
          </div>

          {/* console card */}
          <div className="panel tick-frame animate-fade-rise p-6 [animation-delay:120ms]">
            <div className="mb-5 flex items-center justify-between">
              <span className="text-[10px] tracking-[0.3em] text-fog">ACCESS CONSOLE</span>
              <span className="flex gap-1.5">
                <span className="h-2 w-2 rounded-full bg-alert/70" />
                <span className="h-2 w-2 rounded-full bg-amber/70" />
                <span className="h-2 w-2 rounded-full bg-volt/70" />
              </span>
            </div>

            <label className="mb-1.5 block text-[10px] tracking-[0.25em] text-fog" htmlFor="username">
              CALLSIGN / USERNAME
            </label>
            <input
              id="username"
              ref={usernameRef}
              value={username}
              maxLength={24}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="neo"
              autoComplete="off"
              spellCheck={false}
              className="mb-4 w-full border border-edge bg-abyss/80 px-3.5 py-3 text-sm text-white placeholder:text-fog/50 focus:border-volt/70 focus:outline-none"
            />

            <div className="mb-4">
              <label className="mb-1.5 block text-[10px] tracking-[0.25em] text-fog" htmlFor="room-name">
                NEW ROOM NAME <span className="text-fog/60">(OPTIONAL)</span>
              </label>
              <div className="flex gap-2">
                <input
                  id="room-name"
                  value={roomName}
                  maxLength={48}
                  onChange={(event) => setRoomName(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && createRoom()}
                  placeholder="war room"
                  autoComplete="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 border border-edge bg-abyss/80 px-3.5 py-3 text-sm text-white placeholder:text-fog/50 focus:border-volt/70 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={createRoom}
                  disabled={busy !== null}
                  className="inline-flex shrink-0 cursor-pointer items-center gap-2 bg-volt px-4 py-3 text-xs font-bold tracking-[0.15em] text-ink transition-all hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "create" ? (
                    <RefreshCw className="h-4 w-4 animate-spin" />
                  ) : (
                    <Plus className="h-4 w-4" />
                  )}
                  CREATE
                </button>
              </div>
            </div>

            <div className="my-5 flex items-center gap-3 text-[10px] tracking-[0.3em] text-fog">
              <span className="h-px flex-1 bg-edge" />
              OR JOIN WITH CODE
              <span className="h-px flex-1 bg-edge" />
            </div>

            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <Hash className="absolute top-1/2 left-3.5 h-4 w-4 -translate-y-1/2 text-fog" />
                <input
                  value={joinCode}
                  maxLength={8}
                  onChange={(event) =>
                    setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))
                  }
                  onKeyDown={(event) => event.key === "Enter" && joinRoom()}
                  placeholder="K7X2QM"
                  autoComplete="off"
                  spellCheck={false}
                  className="w-full border border-edge bg-abyss/80 py-3 pr-3.5 pl-10 font-display text-base font-bold tracking-[0.4em] text-volt placeholder:text-fog/40 focus:border-volt/70 focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => joinRoom()}
                disabled={busy !== null}
                className="inline-flex shrink-0 cursor-pointer items-center gap-2 border border-volt/60 px-4 py-3 text-xs font-bold tracking-[0.15em] text-volt transition-all hover:bg-volt hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === "join" ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4" />
                )}
                JOIN
              </button>
            </div>

            <p
              className={`mt-4 min-h-4 text-[11px] leading-snug ${
                error ? "text-alert" : "text-fog/70"
              }`}
              role="status"
            >
              {error ?? "> awaiting input_"}
            </p>
          </div>
        </section>

        {/* stats strip */}
        <section className="mb-16 grid grid-cols-2 gap-px border border-edge bg-edge/60 animate-fade-rise [animation-delay:200ms] sm:grid-cols-4">
          {[
            { icon: Activity, label: "LIVE ROOMS", value: data?.stats.rooms ?? "—" },
            { icon: Users, label: "USERS ONLINE", value: data?.stats.users ?? "—" },
            { icon: Cable, label: "OPEN SOCKETS", value: data?.stats.connections ?? "—" },
            {
              icon: ShieldCheck,
              label: "PERSISTENCE",
              value: data ? (data.persistence === "postgres" ? "POSTGRES" : "MEMORY") : "—",
            },
          ].map((stat) => (
            <div key={stat.label} className="bg-panel/70 px-5 py-4 backdrop-blur-sm">
              <stat.icon className="mb-2 h-4 w-4 text-volt" />
              <div className="font-display text-2xl font-bold text-white">{stat.value}</div>
              <div className="mt-0.5 text-[9px] tracking-[0.3em] text-fog">{stat.label}</div>
            </div>
          ))}
        </section>

        {/* live rooms directory */}
        {data && data.rooms.some((room) => room.users > 0) && (
          <section className="mb-16 animate-fade-rise">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[11px] tracking-[0.35em] text-fog">
                <span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse-dot rounded-full bg-volt align-middle" />
                HOT CHANNELS
              </h2>
              <span className="text-[10px] tracking-[0.2em] text-fog/70">GET /api/rooms</span>
            </div>
            <div className="grid gap-px border border-edge bg-edge/60 sm:grid-cols-2 lg:grid-cols-3">
              {data.rooms
                .filter((room) => room.users > 0)
                .slice(0, 6)
                .map((room) => (
                  <button
                    key={room.code}
                    type="button"
                    onClick={() => joinRoom(room.code)}
                    className="group cursor-pointer bg-panel/70 px-5 py-4 text-left backdrop-blur-sm transition-colors hover:bg-raise"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-lg font-bold tracking-[0.2em] text-volt">
                        {room.code}
                      </span>
                      <ArrowUpRight className="h-4 w-4 text-fog transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-volt" />
                    </div>
                    <div className="mt-1 truncate text-xs text-mist">{room.name}</div>
                    <div className="mt-2 text-[10px] tracking-[0.2em] text-fog">
                      {room.users} ONLINE
                    </div>
                  </button>
                ))}
            </div>
          </section>
        )}

        {/* protocol cards */}
        <section className="pb-20">
          <div className="mb-6 flex items-end justify-between">
            <div>
              <p className="mb-2 text-[11px] tracking-[0.35em] text-volt">THE PROTOCOL</p>
              <h2 className="font-display text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Three frames to chat.
              </h2>
            </div>
            <span className="hidden text-[10px] tracking-[0.2em] text-fog sm:block">
              FULL DOCS IN README.md
            </span>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            {snippets.map((snippet, index) => (
              <div
                key={snippet.title}
                className="panel animate-fade-rise p-5"
                style={{ animationDelay: `${index * 90}ms` }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-[11px] font-bold tracking-[0.25em] text-white">
                    <snippet.icon className="h-4 w-4 text-volt" />
                    {snippet.title}
                  </span>
                  <CopyButton value={snippet.copy} label="COPY" className="text-[10px] text-fog" />
                </div>
                <p className="mb-4 text-[10px] tracking-[0.2em] text-fog">{snippet.caption}</p>
                <pre className="overflow-x-auto border border-edge/70 bg-abyss/80 p-4 text-[11px] leading-relaxed text-mist">
                  <code>{snippet.code}</code>
                </pre>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="relative z-10 border-t border-edge/70">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-[10px] tracking-[0.2em] text-fog">
          <span>RELAY — SINGLE NODE PROCESS · NEXT.JS + WS</span>
          <span className="flex items-center gap-5">
            <a href="/api/rooms" className="transition-colors hover:text-volt">
              /api/rooms
            </a>
            <a href="/api/health" className="transition-colors hover:text-volt">
              /api/health
            </a>
            <span className="text-fog/60">MADE FOR RENDER FREE TIER</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
