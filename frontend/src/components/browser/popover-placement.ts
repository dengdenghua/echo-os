/** Vertical placement of a popover that opens below an anchor inside a
 * clipping container (e.g. the AI browser start page inside its window). */
export interface PopoverPlacementInput {
  /** Anchor's top edge and height, in viewport pixels. */
  anchorTop: number;
  anchorHeight: number;
  popoverHeight: number;
  /** The clipping container's top and bottom edges, in viewport pixels. */
  boundaryTop: number;
  boundaryBottom: number;
  /** Space between the anchor and the popover. */
  gap?: number;
  /** Space kept clear inside the container's edges. */
  margin?: number;
}

export interface PopoverPlacement {
  /** Offset from the anchor's top edge, in pixels. */
  top: number;
  /** Set when the popover is taller than the room it has; scroll inside. */
  maxHeight?: number;
}

/**
 * Open below the anchor when it fits; otherwise move up just enough to end
 * inside the container, never past its top edge. A popover taller than the
 * container is pinned to the top and capped so its list scrolls instead of
 * being clipped by the window.
 */
export function placePopoverWithin({
  anchorTop,
  anchorHeight,
  popoverHeight,
  boundaryTop,
  boundaryBottom,
  gap = 8,
  margin = 12,
}: PopoverPlacementInput): PopoverPlacement {
  const below = anchorHeight + gap;
  const highest = boundaryTop + margin - anchorTop;
  const room = boundaryBottom - boundaryTop - margin * 2;
  if (popoverHeight > room) {
    return { top: highest, maxHeight: Math.max(0, room) };
  }
  const lowestFitting = boundaryBottom - margin - popoverHeight - anchorTop;
  return { top: Math.max(highest, Math.min(below, lowestFitting)) };
}
