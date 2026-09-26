"use client";

import { useEffect, useState, type CSSProperties, type ReactNode } from "react";
import { shortAddr, type RunVerdict } from "./utils";

export type StampVerdict = "paid" | "refused" | "hold" | "failed" | "screening";

export const STAMP_FOR_RUN: Record<RunVerdict, StampVerdict> = {
  allow: "paid",
  hold: "hold",
  deny: "refused",
  failed: "failed",
  pending: "screening",
};

const STAMP_TEXT: Record<StampVerdict, [en: string, jp: string, color: string]> = {
  paid: ["PAID", "済", "var(--allow)"],
  refused: ["REFUSED", "否", "var(--deny)"],
  hold: ["HOLD", "保留", "var(--hold)"],
  failed: ["NOT SETTLED", "未済", "var(--ink-2)"],
  screening: ["SCREENING", "審査中", "var(--ink-3)"],
};

const STAMP_SIZE = {
  sm: { fs: 13, jfs: 10, pad: "5px 8px 4px", bw: 2, radius: 6, gap: 3, jpad: 3, inset: 1, ring: 2 },
  md: { fs: 18, jfs: 12, pad: "8px 12px 6px", bw: 3, radius: 8, gap: 4, jpad: 4, inset: 2, ring: 3.5 },
  lg: { fs: 30, jfs: 16, pad: "12px 18px 9px", bw: 4, radius: 12, gap: 6, jpad: 6, inset: 3, ring: 5 },
  xl: { fs: 44, jfs: 20, pad: "16px 24px 12px", bw: 5, radius: 14, gap: 8, jpad: 8, inset: 4, ring: 6.5 },
} as const;

/**
 * Hanko-style verdict seal: outer rule + inset inner rule, rotated like a hand
 * stamp. The English word is the accessible label; the kanji is decoration.
 * SCREENING is dashed and upright because nothing has been decided yet.
 */
export function Stamp({ verdict, size = "md", kanji = true, live = false }: { verdict: StampVerdict; size?: keyof typeof STAMP_SIZE; kanji?: boolean; live?: boolean }) {
  const [en, jp, color] = STAMP_TEXT[verdict];
  const s = STAMP_SIZE[size];
  const pending = verdict === "screening";
  const style: CSSProperties = {
    gap: s.gap,
    padding: s.pad,
    border: `${s.bw}px ${pending ? "dashed" : "solid"} currentColor`,
    borderRadius: s.radius,
    boxShadow: pending ? "none" : `inset 0 0 0 ${s.inset}px var(--sheet), inset 0 0 0 ${s.ring}px currentColor`,
    color,
    transform: `rotate(${pending ? 0 : -4}deg)`,
    opacity: 0.95,
  };
  return (
    <span role="img" aria-label={en} style={style} className={`inline-flex flex-none flex-col items-center leading-none whitespace-nowrap ${live && !pending ? "stamp-in" : ""}`}>
      <span className="font-black tracking-[.07em]" style={{ fontSize: s.fs }}>
        {en}
      </span>
      {kanji && (
        <span aria-hidden className="font-bold tracking-[.25em] border-t border-current min-w-[60%] text-center" style={{ fontSize: s.jfs, paddingTop: s.jpad }}>
          {jp}
        </span>
      )}
    </span>
  );
}

export type Tone = "pass" | "fail" | "soft" | "skip";

const TONE_CLASS: Record<Tone, string> = {
  pass: "bg-allow-soft text-allow",
  soft: "bg-hold-soft text-hold",
  fail: "bg-deny-soft text-deny",
  skip: "bg-line text-ink-2",
};
export const TONE_GLYPH: Record<Tone, string> = { pass: "✓", soft: "!", fail: "✕", skip: "–" };

/** Pass / soft-fail / hard-fail / skipped chip. The glyph carries the status so it never relies on colour alone. */
export function StatusChip({ tone, children, title, outlined = false }: { tone: Tone; children: ReactNode; title?: string; outlined?: boolean }) {
  return (
    <span
      title={title}
      className={`inline-flex max-w-full items-center gap-1.5 rounded-full px-[11px] py-1 text-sm font-bold leading-tight ${TONE_CLASS[tone]} ${outlined ? "border border-current" : ""}`}
    >
      <span aria-hidden>{TONE_GLYPH[tone]}</span>
      <span className="min-w-0 break-words">{children}</span>
    </span>
  );
}

/** Integration status pill in the header: ● live, ✓ configured, ! degraded, ✕ missing. */
export function Pill({ on, label, warn, live }: { on: boolean; label: string; warn?: boolean; live?: boolean }) {
  const cls = warn ? "bg-hold-soft text-hold" : on ? "bg-allow-soft text-allow" : "bg-deny-soft text-deny";
  const glyph = warn ? "!" : !on ? "✕" : live ? "●" : "✓";
  return (
    <li className={`inline-flex items-center gap-[7px] rounded-full py-[5px] pl-2.5 pr-3 text-sm font-bold leading-tight ${cls}`}>
      <span aria-hidden className="text-xs">
        {glyph}
      </span>
      {label}
    </li>
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
  return (
    <span className={`inline-flex flex-none items-center gap-[5px] rounded-full px-2.5 py-[3px] text-[13px] font-bold ${TONE_CLASS[tone]}`}>
      <span aria-hidden>{TONE_GLYPH[tone]}</span>
      {label}
    </span>
  );
}

/** Torii line glyph for a checkpoint (関所). `closed` adds the bar that shuts the gate. */
export function GateGlyph({ size = 30, strokeWidth = 3, closed = false, className = "" }: { size?: number; strokeWidth?: number; closed?: boolean; className?: string }) {
  return (
    <svg width={size} height={Math.round((size * 44) / 48)} viewBox="0 0 48 44" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" aria-hidden className={className}>
      <path d="M3 9 Q24 4.5 45 9" />
      <path d="M8 17 H40" />
      <path d="M14 9.5 V40" />
      <path d="M34 9.5 V40" />
      {closed && <path d="M10 30 H38" />}
    </svg>
  );
}

/** Rotates to indicate expand/collapse state; respects reduced motion via the global CSS reset. */
export function Caret({ open }: { open: boolean }) {
  return (
    <span className={`inline-block shrink-0 text-xl text-ink-3 transition-transform ${open ? "rotate-90" : ""}`} aria-hidden>
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
      className={`mono inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 font-medium text-ink transition-colors hover:border-guard hover:text-guard ${className}`}
    >
      {copied ? "copied" : label}
      <span aria-hidden className="text-ink-3">
        ⧉
      </span>
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
  if (!targetIso) return { label: "—", expired: false, remainingMs: 0 };
  const remainingMs = Date.parse(targetIso) - now;
  if (remainingMs <= 0) return { label: "expired", expired: true, remainingMs: 0 };
  const totalSec = Math.ceil(remainingMs / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return { label: `${m}:${String(s).padStart(2, "0")}`, expired: false, remainingMs };
}
