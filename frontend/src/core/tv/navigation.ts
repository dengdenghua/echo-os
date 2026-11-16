export type Direction = "left" | "right" | "up" | "down";
export type FocusRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/** Geometry is shared by Linux keyboard/remote and a future Android input bridge. */
export function nextFocusIndex(
  current: FocusRect,
  candidates: FocusRect[],
  direction: Direction,
): number {
  const horizontal = direction === "left" || direction === "right";
  const sign = direction === "left" || direction === "up" ? -1 : 1;
  const cx = current.left + current.width / 2,
    cy = current.top + current.height / 2;
  let winner = -1,
    best = Infinity;
  candidates.forEach((rect, index) => {
    const dx = rect.left + rect.width / 2 - cx,
      dy = rect.top + rect.height / 2 - cy;
    const primary = (horizontal ? dx : dy) * sign;
    if (primary <= 1) return;
    const overlap = horizontal
      ? rect.top < current.top + current.height &&
        rect.top + rect.height > current.top
      : rect.left < current.left + current.width &&
        rect.left + rect.width > current.left;
    const score =
      primary + Math.abs(horizontal ? dy : dx) * 3 + (overlap ? 0 : 10_000);
    if (score < best) {
      best = score;
      winner = index;
    }
  });
  return winner;
}

export function remoteDirection(key: string): Direction | null {
  const keys: Record<string, Direction> = {
    ArrowLeft: "left",
    ArrowRight: "right",
    ArrowUp: "up",
    ArrowDown: "down",
  };
  return keys[key] ?? null;
}

export function isRemoteBack(key: string): boolean {
  return ["Escape", "BrowserBack", "GoBack", "Backspace"].includes(key);
}
