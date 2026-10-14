// Avatar style options:
// - "pixel-halfbody-v3": Pixel art style (retro 8-bit aesthetic)
// - "original": Original uploaded avatar (anime/realistic/custom art)
// - null/undefined: Use original avatar without transformation
const AGENT_AVATAR_ASSET_VERSION: string | null = null; // Changed from "pixel-halfbody-v3" to null

export function withAgentAvatarVersion(src: string): string {
  if (!src.includes("/api/agents/") || !src.includes("/avatar")) {
    return src;
  }
  if (src.includes("avatar_style=")) {
    return src;
  }
  // If no avatar style is configured, return the original URL unchanged
  if (!AGENT_AVATAR_ASSET_VERSION) {
    return src;
  }
  const separator = src.includes("?") ? "&" : "?";
  return `${src}${separator}avatar_style=${AGENT_AVATAR_ASSET_VERSION}`;
}

/**
 * Avatar token the runtime sends for the default Echo agent (and for
 * sub-agents of an unknown role). It means "draw the ECHO mark", never a
 * picture. `🐙` is the retired value that older profiles still carry.
 */
export const ECHO_MARK_AVATAR = "echo";
const ECHO_MARK_AVATARS = new Set([ECHO_MARK_AVATAR, "🐙"]);

/** Ids of the default Echo agent: the `general` profile and the fixed assistant. */
const ECHO_AGENT_IDS = new Set(["general", "echo"]);

const ECHO_AVATAR_URL = /\/api\/agents\/(?:general|echo)\/avatar(?:[?#]|$)/;

export function isEchoAgentId(agentId?: string | null): boolean {
  return Boolean(agentId && ECHO_AGENT_IDS.has(agentId.trim().toLowerCase()));
}

export function isEchoMarkAvatar(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    ECHO_MARK_AVATARS.has(trimmed.toLowerCase()) ||
    ECHO_AVATAR_URL.test(trimmed)
  );
}

export function isImageAvatar(value?: string | null): boolean {
  if (!value) return false;
  const trimmed = value.trim();
  return (
    trimmed.startsWith("/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  );
}

const PICTOGRAPH = /\p{Extended_Pictographic}|\p{Regional_Indicator}/u;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;
const SHORT_MONOGRAM = /^[A-Za-z0-9]{1,2}$/;

/** True for avatar values that are emoji: those are never drawn as icons. */
export function isEmojiAvatar(value?: string | null): boolean {
  return Boolean(value && PICTOGRAPH.test(value));
}

/** The letter for a monogram tile: the first letter of the first name that has one. */
export function agentMonogram(
  ...candidates: Array<string | null | undefined>
): string {
  for (const candidate of candidates) {
    if (!candidate || isImageAvatar(candidate)) continue;
    for (const char of candidate.trim()) {
      if (LETTER_OR_DIGIT.test(char)) return char.toUpperCase();
    }
  }
  return "A";
}

export type AgentAvatarSpec =
  | { kind: "echo" }
  | { kind: "image"; src: string; monogram: string }
  | { kind: "monogram"; monogram: string };

/**
 * How an agent's avatar is drawn. The default Echo agent is always the ECHO
 * mark; an image avatar stays an image; everything else (emoji included)
 * becomes a neutral monogram tile.
 */
export function resolveAgentAvatar({
  agentId,
  name,
  avatar,
  imageUrl,
}: {
  agentId?: string | null;
  name?: string | null;
  avatar?: string | null;
  imageUrl?: string | null;
}): AgentAvatarSpec {
  if (
    isEchoAgentId(agentId) ||
    isEchoMarkAvatar(avatar) ||
    isEchoMarkAvatar(imageUrl)
  ) {
    return { kind: "echo" };
  }
  // A short text avatar ("CC", "OC") already is a monogram.
  const text = avatar?.trim() ?? "";
  const monogram = SHORT_MONOGRAM.test(text)
    ? text.toUpperCase()
    : agentMonogram(name, agentId);
  const src = [imageUrl, avatar].find(isImageAvatar);
  if (src) return { kind: "image", src: src.trim(), monogram };
  return { kind: "monogram", monogram };
}
