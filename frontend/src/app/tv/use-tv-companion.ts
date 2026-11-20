import { useLayoutEffect, type RefObject } from "react";

const hidden = { x: 0, y: 0, width: 0, height: 0 };

/** The companion is a separate native window. Keep its entire window inside
 * the visible artwork beside the copy, including when the TV page scrolls. */
export function useTVCompanion(
  root: RefObject<HTMLElement | null>,
  homeVisible: boolean,
) {
  useLayoutEffect(() => {
    const sync = window.echo?.desktopCompanion?.setTVHomeRegion;
    return () => {
      void sync?.(null).catch(() => {});
    };
  }, []);

  useLayoutEffect(() => {
    const sync = window.echo?.desktopCompanion?.setTVHomeRegion;
    if (!sync) return;
    const shell = root.current;
    const shelf = shell?.querySelector<HTMLElement>(".tv-top-shelf");
    const copy = shelf?.querySelector<HTMLElement>(".tv-shelf-copy");
    const header = shell?.querySelector<HTMLElement>(".tv-header");
    if (!homeVisible || !shell || !shelf || !copy) {
      void sync(hidden).catch(() => {});
      return;
    }
    let frame = 0;
    let previous: typeof hidden | undefined;
    const measure = () => {
      frame = 0;
      const hero = shelf.getBoundingClientRect();
      const inset = 10;
      const x = Math.ceil(
        Math.max(0, hero.left, copy.getBoundingClientRect().right) + inset,
      );
      const y = Math.ceil(
        Math.max(0, hero.top, header?.getBoundingClientRect().bottom ?? 0) +
          inset,
      );
      const width =
        Math.floor(Math.min(window.innerWidth, hero.right) - inset) - x;
      const height =
        Math.floor(Math.min(window.innerHeight, hero.bottom) - inset) - y;
      const region =
        width > 0 && height > 0 && !shelf.matches('[aria-modal="true"]')
          ? { x, y, width, height }
          : hidden;
      if (
        previous &&
        region.x === previous.x &&
        region.y === previous.y &&
        region.width === previous.width &&
        region.height === previous.height
      )
        return;
      previous = region;
      void sync(region).catch(() => {});
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    observer?.observe(shelf);
    observer?.observe(copy);
    if (header) observer?.observe(header);
    shell.addEventListener("focusin", schedule);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      shell.removeEventListener("focusin", schedule);
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, [root, homeVisible]);
}
