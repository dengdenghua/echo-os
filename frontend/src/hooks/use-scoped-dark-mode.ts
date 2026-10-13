import { useTheme } from "next-themes";
import { useCallback, useState, useSyncExternalStore } from "react";

/*
 * The ECHO OS desktop paints graphite by putting `.dark` on its own wrapper,
 * not on <html>, so next-themes still reports `light` there. Components that
 * pick a theme in JS (Shiki, CodeMirror) must follow the nearest theme scope
 * the same way the CSS tokens do: `.dark` / `[data-echo-theme="graphite"]`
 * is dark, `[data-echo-theme="snow"]` is a light island, and no scope at all
 * means the snow defaults on :root.
 */
const SCOPE_SELECTOR = ".dark, [data-echo-theme]";
const SCOPE_ATTRIBUTES = ["class", "data-echo-theme"];

export function isInDarkScope(element: Element): boolean {
  const scope = element.closest(SCOPE_SELECTOR);
  if (!scope) return false;
  const echoTheme = scope.getAttribute("data-echo-theme");
  if (echoTheme === "graphite") return true;
  if (echoTheme === "snow") return false;
  return scope.classList.contains("dark");
}

const noopUnsubscribe = () => undefined;

/**
 * Returns a callback ref and whether the element it is attached to sits in a
 * dark theme scope. Before the element mounts it falls back to next-themes.
 */
export function useScopedDarkMode<T extends Element = HTMLElement>(): [
  (node: T | null) => void,
  boolean,
] {
  const { resolvedTheme } = useTheme();
  const [node, setNode] = useState<T | null>(null);

  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!node || typeof MutationObserver === "undefined") {
        return noopUnsubscribe;
      }
      // A theme switch toggles a class on one ancestor (the desktop wrapper
      // or <html>), so watching the ancestor chain is enough and cheap.
      const observer = new MutationObserver(onChange);
      for (let el: Element | null = node; el; el = el.parentElement) {
        observer.observe(el, {
          attributes: true,
          attributeFilter: SCOPE_ATTRIBUTES,
        });
      }
      return () => observer.disconnect();
    },
    [node],
  );

  const scopedDark = useSyncExternalStore(
    subscribe,
    () => (node ? isInDarkScope(node) : null),
    () => null,
  );

  return [setNode, scopedDark ?? resolvedTheme === "dark"];
}
