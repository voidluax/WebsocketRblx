"use client";

import { useCallback, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

export function CopyButton({
  value,
  label,
  className = "",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setCopied(true);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), 1600);
  }, [value]);

  return (
    <button
      type="button"
      onClick={copy}
      className={`group inline-flex cursor-pointer items-center gap-1.5 transition-colors hover:text-volt ${className}`}
      aria-live="polite"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-volt" />
      ) : (
        <Copy className="h-3.5 w-3.5 opacity-60 transition-opacity group-hover:opacity-100" />
      )}
      {label ? <span>{copied ? "COPIED" : label}</span> : null}
    </button>
  );
}
