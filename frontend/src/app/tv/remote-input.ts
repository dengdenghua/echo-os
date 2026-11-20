import { isRemoteBack } from "@/core/tv/navigation";

export function bindRemoteInput(root: HTMLElement, goHome: () => void) {
  let timer = 0,
    held = "",
    fired = false,
    sending = false;
  let keyTarget: HTMLElement | null = null;
  let pointer: {
    id: number;
    x: number;
    y: number;
    tile: HTMLElement | null;
  } | null = null;
  let suppressClickUntil = 0;
  const cancel = () => {
    clearTimeout(timer);
    keyTarget = null;
    held = "";
    fired = false;
    pointer = null;
  };
  const edit = (tile: HTMLElement) =>
    tile.dispatchEvent(new CustomEvent("tv-edit-tile", { bubbles: true }));
  const tileOf = (target: EventTarget | null) =>
    target instanceof Element
      ? target.closest<HTMLElement>("[data-home-id]")
      : null;
  const send = (target: EventTarget, key: string) => {
    sending = true;
    try {
      target.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    } finally {
      sending = false;
    }
  };
  const startKey = (e: KeyboardEvent) => {
    if (sending || e.isComposing || e.ctrlKey || e.altKey || e.metaKey) return;
    // X11 keeps delivering repeats to the newly focused menu after a hold.
    if (held === e.key) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    const tile = tileOf(e.target);
    const back = isRemoteBack(e.key);
    if (
      back &&
      e.key === "Backspace" &&
      (e.target as HTMLElement)?.closest?.(
        "input,textarea,[contenteditable=true]",
      )
    )
      return;
    if (!back && (e.key !== "Enter" || !tile)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.repeat) return;
    cancel();
    held = e.key;
    keyTarget = e.target instanceof HTMLElement ? e.target : null;
    timer = window.setTimeout(() => {
      fired = true;
      if (back) goHome();
      else if (tile?.isConnected) edit(tile);
    }, 600);
  };
  const endKey = (e: KeyboardEvent) => {
    if (e.key !== held) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const short = !fired;
    const active = keyTarget?.isConnected ? keyTarget : document.activeElement;
    cancel();
    if (!short || !active || !root.contains(active)) return;
    if (isRemoteBack(e.key)) send(active, e.key);
    else if (active instanceof HTMLButtonElement) active.click();
  };
  const down = (e: PointerEvent) => {
    if (!e.isPrimary || e.button !== 0 || held) return;
    const tile = tileOf(e.target);
    if (!tile && !(e.target as HTMLElement).closest(".tv-home")) return;
    suppressClickUntil = 0;
    pointer = { id: e.pointerId, x: e.clientX, y: e.clientY, tile };
    if (tile)
      timer = window.setTimeout(() => {
        fired = true;
        edit(tile);
      }, 600);
  };
  const move = (e: PointerEvent) => {
    if (
      pointer?.id === e.pointerId &&
      Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 10
    )
      clearTimeout(timer);
  };
  const up = (e: PointerEvent) => {
    if (!pointer || pointer.id !== e.pointerId) return;
    const dx = e.clientX - pointer.x,
      dy = e.clientY - pointer.y;
    if (
      !fired &&
      e.pointerType !== "mouse" &&
      Math.max(Math.abs(dx), Math.abs(dy)) >= 32
    ) {
      const key =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "ArrowRight"
            : "ArrowLeft"
          : dy > 0
            ? "ArrowDown"
            : "ArrowUp";
      send(document.activeElement || root, key);
      fired = true;
    }
    if (fired) suppressClickUntil = performance.now() + 500;
    cancel();
  };
  const click = (e: MouseEvent) => {
    if (performance.now() < suppressClickUntil) {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  let wheelLast = 0,
    wheelX = 0,
    wheelY = 0,
    wheelMoved = false;
  const wheel = (e: WheelEvent) => {
    if (
      e.ctrlKey ||
      !(e.target instanceof Element) ||
      !e.target.closest(".tv-home") ||
      e.target.closest(".tv-organize") ||
      Math.abs(e.deltaX) + Math.abs(e.deltaY) === 0
    )
      return;
    e.preventDefault();
    if (performance.now() - wheelLast > 140) {
      wheelX = 0;
      wheelY = 0;
      wheelMoved = false;
    }
    wheelLast = performance.now();
    const unit =
      e.deltaMode === 0 ? 1 : e.deltaMode === 1 ? 16 : window.innerHeight;
    wheelX += e.deltaX * unit;
    wheelY += e.deltaY * unit;
    if (wheelMoved || Math.max(Math.abs(wheelX), Math.abs(wheelY)) < 28) return;
    wheelMoved = true;
    send(
      document.activeElement || root,
      Math.abs(wheelX) > Math.abs(wheelY)
        ? wheelX > 0
          ? "ArrowRight"
          : "ArrowLeft"
        : wheelY > 0
          ? "ArrowDown"
          : "ArrowUp",
    );
  };
  root.addEventListener("wheel", wheel, { passive: false });
  root.addEventListener("keydown", startKey, true);
  window.addEventListener("keyup", endKey, true);
  root.addEventListener("pointerdown", down);
  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", up);
  window.addEventListener("pointercancel", cancel);
  window.addEventListener("blur", cancel);
  root.addEventListener("click", click, true);
  return () => {
    cancel();
    root.removeEventListener("wheel", wheel);
    root.removeEventListener("keydown", startKey, true);
    window.removeEventListener("keyup", endKey, true);
    root.removeEventListener("pointerdown", down);
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", up);
    window.removeEventListener("pointercancel", cancel);
    window.removeEventListener("blur", cancel);
    root.removeEventListener("click", click, true);
  };
}
