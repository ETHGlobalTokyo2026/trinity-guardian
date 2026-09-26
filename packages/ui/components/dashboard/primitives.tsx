"use client";

import { useEffect, useState, type ReactNode } from "react";
import { shortAddr } from "./utils";

/** Small on/off/warn status pill used in the header. */
export function Pill({ on, label, warn }: { on: boolean; label: string; warn?: boolean }) {
  const cls = warn ? "bg-hold-soft text-hold" : on ? "bg-allow-soft text-allow" : "bg-deny-soft text-deny";
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      <span className={`size-1.5 rounded-full ${warn ? "bg-hold" : on ? "bg-allow" : "bg-deny"}`} aria-hidden />
      {label}
    </span>
  );
}

/** What a scenario is expected to do, shown next to its button. */
export function Expect({ verdict }: { verdict: "allow" | "deny" | "ask_human" }) {
  const map = {
    allow: ["pays", "pass"],
    deny: ["blocked", "fail"],
    ask_human: ["asks owner", "soft"],
  } as const;
  const [label, tone] = map[verdict];
  return <StatusChip tone={tone}>{label}</StatusChip>;
}

/** Pass / soft-fail / hard-fail / skipped chip for a named check. */
export function StatusChip({ tone, children, title }: { tone: "pass" | "fail" | "soft" | "skip"; children: ReactNode; title?: string }) {
  return (
    <span className={`chip chip-${tone}`} title={title}>
      {children}
    </span>
  );
}

/** Rotates to indicate expand/collapse state; respects reduced motion via the global CSS reset. */
export function Caret({ open }: { open: boolean }) {
  return (
    <span className={`inline-block shrink-0 transition-transform text-ink-3 ${open ? "rotate-90" : ""}`} aria-hidden>
      {"›"}
    </span>
  );
}

/**
 * Click-to-copy for addresses / hashes. Shows the truncated value, keeps the
 * full value in `title` for a tooltip, and flashes "copied" feedback.
 */
export function CopyText({ value, display, className = "" }: { value: string; display?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  const label = display ?? shortAddr(value);
  return (
    <button
      type="button"
      title={value}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        } catch {
          /* clipboard not available; the title attribute still shows the full value */
        }
      }}
      className={`mono inline-flex items-center gap-1 rounded hover:bg-guard-soft hover:text-guard px-0.5 -mx-0.5 transition-colors ${className}`}
    >
      {copied ? "copied" : label}
    </button>
  );
}

/** mm:ss (or "expired") countdown to an ISO timestamp, ticking once a second. */
export function useCountdown(targetIso?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!targetIso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  if (!targetIso) return { label: "—", expired: false };
  const remainingMs = Date.parse(targetIso) - now;
  if (remainingMs <= 0) return { label: "expired", expired: true };
  const totalSec = Math.ceil(remainingMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return { label: `${m}:${String(s).padStart(2, "0")}`, expired: false };
}
