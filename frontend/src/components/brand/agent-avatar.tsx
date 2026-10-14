import { useState, type ComponentProps } from "react";

import { resolveAgentAvatar } from "@/core/agents/avatar";
import { cn } from "@/lib/utils";

import { EchoMark } from "./echo-mark";

export interface AgentAvatarTileProps {
  /** The default Echo agent (`general` / `echo`) always draws the ECHO mark. */
  agentId?: string | null;
  /** Display name; its first letter is the monogram. */
  name?: string | null;
  /** Avatar value from the API: an image URL, the `echo` token, an emoji or short text. */
  avatar?: string | null;
  /** Image avatar URL; wins over `avatar` when both are set. */
  imageUrl?: string | null;
  /** Size and corner classes, e.g. `size-6 rounded-md` (default `size-5`). */
  className?: string;
  /** Extra classes for an image avatar, e.g. pixel-art rendering. */
  imageClassName?: string;
  /** Accessible name; the avatar is decorative when omitted. */
  label?: string;
}

const CJK = /[぀-ヿ㐀-鿿가-힯]/;

/**
 * One avatar for every agent surface. ECHO draws no emoji: the default Echo
 * agent is the ECHO mark on a graphite tile (the app icon), an agent with an
 * image keeps it, and every other agent is a neutral graphite monogram tile.
 * Size it with classes; the monogram scales with the tile.
 */
export function AgentAvatarTile({
  agentId,
  name,
  avatar,
  imageUrl,
  className,
  imageClassName,
  label,
}: AgentAvatarTileProps) {
  const spec = resolveAgentAvatar({ agentId, name, avatar, imageUrl });
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const a11y = label
    ? ({ role: "img", "aria-label": label } as const)
    : ({ "aria-hidden": true } as const);

  if (spec.kind === "echo") {
    return (
      <span
        {...a11y}
        data-echo-theme="graphite"
        data-agent-avatar="echo"
        className={cn(
          "inline-flex size-5 shrink-0 overflow-hidden rounded-md bg-[var(--echo-surface)] shadow-[inset_0_0_0_1px_var(--echo-line-strong)]",
          className,
        )}
      >
        <EchoMark className="size-full" />
      </span>
    );
  }

  if (spec.kind === "monogram" || failedSrc === spec.src) {
    return <Monogram {...a11y} letter={spec.monogram} className={className} />;
  }
  return (
    <span
      aria-hidden={label ? undefined : true}
      data-agent-avatar="image"
      className={cn(
        "inline-flex size-5 shrink-0 overflow-hidden rounded-md bg-muted",
        className,
      )}
    >
      <img
        src={spec.src}
        alt={label ?? ""}
        loading="lazy"
        className={cn("size-full object-cover", imageClassName)}
        onError={() => setFailedSrc(spec.src)}
      />
    </span>
  );
}

function Monogram({
  letter,
  className,
  ...rest
}: Omit<ComponentProps<"span">, "children"> & { letter: string }) {
  // The letter scales with the tile (container units). Chinese never drops
  // below the 12px brand floor; a Latin glyph may sit at 10px.
  const fontSize = CJK.test(letter)
    ? "text-[length:max(12px,46cqh)]"
    : letter.length > 1
      ? "text-[length:max(10px,36cqh)]"
      : "text-[length:max(10px,46cqh)]";
  return (
    <span
      {...rest}
      data-echo-theme="graphite"
      data-agent-avatar="monogram"
      className={cn(
        "inline-flex size-5 shrink-0 select-none items-center justify-center overflow-hidden rounded-md bg-[var(--echo-surface-raised)] font-semibold leading-none text-[color:var(--echo-ink)] shadow-[inset_0_0_0_1px_var(--echo-line-strong)] [container-type:size]",
        className,
      )}
    >
      <span className={fontSize}>{letter}</span>
    </span>
  );
}
