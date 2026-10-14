import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export type EchoMarkTone = "brand" | "light" | "current";

/** Echo Core light language: the core dot reports system state. */
export type EchoCoreState =
  | "sync"
  | "signal"
  | "resonance"
  | "warning"
  | "nano"
  | "breach";

export interface EchoMarkProps extends Omit<ComponentProps<"svg">, "children"> {
  tone?: EchoMarkTone;
  /** Core colour; defaults to the stable-sync cyan. Ignored for `tone="current"`. */
  state?: EchoCoreState;
  title?: string;
}

const CORE_COLOR: Record<EchoCoreState, string> = {
  sync: "var(--echo-core)",
  signal: "var(--echo-signal)",
  resonance: "var(--echo-resonance)",
  warning: "var(--echo-warning)",
  nano: "var(--echo-nano)",
  breach: "var(--echo-breach)",
};

/**
 * Canonical ECHO mark: an open frame (the shell) holding the Echo Core.
 * Without the core the frame is a C, so the wordmark's E and C share one shape.
 */
export function EchoMark({
  className,
  tone = "brand",
  state = "sync",
  title,
  ...props
}: EchoMarkProps) {
  const labelled = Boolean(title || props["aria-label"]);
  const frame =
    tone === "light"
      ? "#eef1f4"
      : tone === "current"
        ? "currentColor"
        : "var(--echo-ink)";
  const core = tone === "current" ? "currentColor" : CORE_COLOR[state];

  return (
    <svg
      {...props}
      className={cn("shrink-0", className)}
      viewBox="0 0 64 64"
      fill="none"
      role={labelled ? "img" : undefined}
      aria-hidden={labelled ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <path
        d="M50 17H24a7 7 0 0 0-7 7v16a7 7 0 0 0 7 7h26"
        stroke={frame}
        strokeWidth="6"
      />
      <circle cx="38" cy="32" r="5" fill={core} />
    </svg>
  );
}

/** The ECHO wordmark; its E is the mark itself. */
export function EchoWordmark({
  className,
  tone = "brand",
  title = "ECHO",
  ...props
}: Omit<EchoMarkProps, "state">) {
  const ink =
    tone === "light"
      ? "#eef1f4"
      : tone === "current"
        ? "currentColor"
        : "var(--echo-ink)";
  const core = tone === "current" ? "currentColor" : "var(--echo-core)";
  return (
    <svg
      {...props}
      className={cn("shrink-0", className)}
      viewBox="14 14 174 36"
      fill="none"
      role="img"
    >
      <title>{title}</title>
      <g stroke={ink} strokeWidth="6">
        <path d="M50 17H24a7 7 0 0 0-7 7v16a7 7 0 0 0 7 7h26" />
        <path d="M93 17H67a7 7 0 0 0-7 7v16a7 7 0 0 0 7 7h26" />
        <path d="M104 14v36M137 14v36M104 32h33" />
        <rect x="152" y="17" width="33" height="30" rx="7" />
      </g>
      <circle cx="38" cy="32" r="5" fill={core} />
    </svg>
  );
}
