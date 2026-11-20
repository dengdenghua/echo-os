import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import {
  isRemoteBack,
  nextFocusIndex,
  remoteDirection,
} from "@/core/tv/navigation";

function targets(scope: HTMLElement) {
  return Array.from(
    scope.querySelectorAll<HTMLElement>("[data-tv-focus]"),
  ).filter(
    (element) =>
      !element.matches(":disabled,[aria-disabled=true]") &&
      !element.closest("[inert],[hidden]") &&
      element.getClientRects().length > 0,
  );
}

export function useTVFocus(
  root: RefObject<HTMLElement | null>,
  onBack: () => void,
) {
  const back = useRef(onBack);
  useLayoutEffect(() => {
    back.current = onBack;
  }, [onBack]);
  useEffect(() => {
    const element = root.current;
    if (!element) return;
    const scope = () =>
      Array.from(element.querySelectorAll<HTMLElement>("[data-tv-dialog]"))
        .filter((el) => !el.closest("[hidden],[inert]"))
        .at(-1) ?? element;
    const initial = () => {
      const items = targets(scope());
      return (
        items.find((item) => item.hasAttribute("data-tv-initial")) ?? items[0]
      );
    };
    const frame = requestAnimationFrame(() => {
      if (!element.contains(document.activeElement)) initial()?.focus();
    });
    const onKey = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.isComposing ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const active = document.activeElement as HTMLElement | null;
      const editing = active?.matches("input,textarea,[contenteditable=true]");
      if (isRemoteBack(event.key) && !(editing && event.key === "Backspace")) {
        event.preventDefault();
        const localBack = Array.from(
          scope().querySelectorAll<HTMLElement>("[data-tv-back]"),
        ).find(
          (el) =>
            !el.closest("[hidden],[inert]") && el.getClientRects().length > 0,
        );
        if (localBack) {
          if (!localBack.matches(":disabled,[aria-disabled=true]"))
            localBack.click();
        } else back.current();
        return;
      }
      const direction = remoteDirection(event.key);
      if (
        active?.hasAttribute("data-tv-scroll") &&
        (direction === "up" || direction === "down")
      ) {
        const delta = direction === "down" ? 1 : -1;
        const canScroll =
          delta > 0
            ? active.scrollTop + active.clientHeight < active.scrollHeight - 2
            : active.scrollTop > 2;
        if (canScroll) {
          event.preventDefault();
          active.scrollBy({
            top: delta * active.clientHeight * 0.7,
            behavior: "instant",
          });
          return;
        }
      }
      // Plain arrows always navigate TV controls, including the keyboard
      // button beside an input. Shift/Ctrl+arrows remain native text editing.
      if (editing && direction && event.shiftKey) return;
      if (!direction && event.key !== "Tab") return;
      const items = targets(scope());
      if (!items.length) return;
      event.preventDefault();
      const current = active ? items.indexOf(active) : -1;
      let next = 0;
      if (event.key === "Tab")
        next =
          (current + (event.shiftKey ? -1 : 1) + items.length) % items.length;
      else if (current >= 0 && direction) {
        next = nextFocusIndex(
          items[current]!.getBoundingClientRect(),
          items.map((item) => item.getBoundingClientRect()),
          direction,
        );
        if (next < 0) return;
      }
      items[next]?.focus({ preventScroll: true });
      items[next]?.scrollIntoView({
        block: "nearest",
        inline: "nearest",
        behavior: "instant",
      });
    };
    // A focused button can become disabled during a request, moving focus to
    // body. Keep Back reachable and repair focus when async content changes.
    const repair = new MutationObserver(() => {
      const active = document.activeElement as HTMLElement | null;
      if (
        !active ||
        active === document.body ||
        active.matches(":disabled") ||
        active.closest("[hidden],[inert]") ||
        !scope().contains(active)
      ) {
        initial()?.focus();
      }
    });
    repair.observe(element, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled", "inert", "hidden"],
    });
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      repair.disconnect();
    };
  }, [root]);
}

export function useTVDialogFocus(
  root: RefObject<HTMLElement | null>,
  restoreLabel?: string,
) {
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const previousLabel = previous?.getAttribute("aria-label");
    const previousText = previous?.textContent;
    const frame = requestAnimationFrame(() => {
      if (root.current) targets(root.current)[0]?.focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (
          active instanceof HTMLElement &&
          active.matches("[data-home-id]") &&
          !active.closest("[inert],[hidden]")
        )
          return;
        if (
          !restoreLabel &&
          previous?.isConnected &&
          !previous.closest("[inert],[hidden]")
        )
          previous.focus();
        else if (previous || restoreLabel) {
          // Editors can replace their launching list. Restore the equivalent
          // control when React recreated it, rather than jumping to the page Back.
          const replacement = Array.from(
            document.querySelectorAll<HTMLElement>(".echo-tv [data-tv-focus]"),
          ).find(
            (el) =>
              (!previous || restoreLabel || el.tagName === previous.tagName) &&
              !el.closest("[inert],[hidden]") &&
              !el.matches(":disabled") &&
              el.getClientRects().length > 0 &&
              (restoreLabel
                ? el.getAttribute("aria-label") === restoreLabel ||
                  el.textContent?.trim() === restoreLabel
                : previousLabel
                  ? el.getAttribute("aria-label") === previousLabel
                  : el.textContent === previousText),
          );
          replacement?.focus();
        }
      });
    };
  }, [root, restoreLabel]);
}
