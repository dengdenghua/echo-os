/**
 * Echo OS 原创桌面栏邻近缩放。
 *
 * 原创实现,不依赖任何专有资源或动画库(仓库把 motion/react 别名成了
 * 精简 shim,缺 useTransform 等;故用纯 React + CSS 变量实现)。
 *
 * 工作方式:Dock 在 pointermove(rAF 节流)时量取每个 .dock-item 的中心,
 * 按光标距离算出缩放比写入 CSS 变量 --dock-s;宽高与内容缩放、过渡缓动
 * 全部交给 .dock-item 的 CSS(见 globals.css),每帧每图标仅一次 DOM 写入。
 */

import {
  useLayoutEffect,
  useRef,
  type MouseEventHandler,
  type ReactNode,
} from "react";

import { useDesktopWallpaperSources } from "@/appliance/desktop-wallpaper";

// 应用图标属于稳定的系统识别层，不随鼠标或玻璃模式改变尺寸和基线。
const BASE_SIZE = 62;

function isDockLayoutChild(element: Element): element is HTMLElement {
  return (
    element instanceof HTMLElement &&
    !element.classList.contains("mac-dock-lens")
  );
}

const TRACK_CLASS = "mac-dock-track";

/**
 * Items live in one track. On a wide screen the track is `display: contents`
 * (the nav lays the items out); on a phone-width screen it becomes the
 * horizontal scroller, so every item stays reachable.
 */
function dockLayoutChildren(nav: HTMLElement): HTMLElement[] {
  return Array.from(nav.children)
    .flatMap((child) =>
      child.classList.contains(TRACK_CLASS)
        ? Array.from(child.children)
        : [child],
    )
    .filter(isDockLayoutChild);
}

function scrollingTrack(nav: HTMLElement): HTMLElement | null {
  const track = Array.from(nav.children).find(
    (child): child is HTMLElement =>
      child instanceof HTMLElement && child.classList.contains(TRACK_CLASS),
  );
  if (!track || getComputedStyle(track).display === "contents") return null;
  return track.scrollWidth > track.clientWidth + 1 ? track : null;
}

/** Which ends of a scrolling track hide items, for the edge fades. */
export function dockTrackOverflow(
  track: Pick<HTMLElement, "scrollLeft" | "scrollWidth" | "clientWidth">,
): "none" | "start" | "end" | "both" {
  const hiddenStart = track.scrollLeft > 1;
  const hiddenEnd =
    track.scrollLeft + track.clientWidth < track.scrollWidth - 1;
  if (hiddenStart && hiddenEnd) return "both";
  if (hiddenStart) return "start";
  if (hiddenEnd) return "end";
  return "none";
}

/**
 * 邻近缩放会改变按钮的布局宽度,但 Dock 玻璃应保持静息尺寸。这里从每个
 * item 的未缩放 inner 宽度计算底座宽度,不受当前 --dock-s 影响。
 */
function measureRestingGlassWidth(nav: HTMLElement): number {
  const navStyle = getComputedStyle(nav);
  const children = dockLayoutChildren(nav);
  const gap = Number.parseFloat(navStyle.columnGap || navStyle.gap) || 0;
  const chrome =
    (Number.parseFloat(navStyle.paddingLeft) || 0) +
    (Number.parseFloat(navStyle.paddingRight) || 0) +
    (Number.parseFloat(navStyle.borderLeftWidth) || 0) +
    (Number.parseFloat(navStyle.borderRightWidth) || 0);
  const content = children.reduce((total, child) => {
    const childStyle = getComputedStyle(child);
    const inner = child.matches(".dock-item")
      ? child.querySelector<HTMLElement>(".dock-item-inner")
      : null;
    const width = inner
      ? Number.parseFloat(getComputedStyle(inner).width) || BASE_SIZE
      : Number.parseFloat(childStyle.width) ||
        child.getBoundingClientRect().width;
    return (
      total +
      width +
      (Number.parseFloat(childStyle.marginLeft) || 0) +
      (Number.parseFloat(childStyle.marginRight) || 0)
    );
  }, 0);
  const track = scrollingTrack(nav);
  // A phone-width dock scrolls inside its glass: the glass spans the visible
  // track, not every item.
  if (track) return Math.ceil(chrome + track.clientWidth);
  return Math.ceil(chrome + content + Math.max(0, children.length - 1) * gap);
}

/**
 * Return the centers from the unscaled flex layout. During hover the button
 * widths grow to make room for the enlarged icons; measuring their live rects
 * would feed that growth back into the next distance calculation and make the
 * magnification feel like a single jumping icon instead of one smooth wave.
 */
export function Dock({
  children,
  className,
  onItemActivate,
}: {
  children: ReactNode;
  className?: string;
  /** 在图标自身的 onClick 之前调用，用于切换应用前收起当前面板。 */
  onItemActivate?: () => void;
}) {
  const navRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const wallpaper = useDesktopWallpaperSources();

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const syncTrackOverflow = () => {
      const track = trackRef.current;
      if (!track) return;
      track.dataset.overflow = scrollingTrack(nav)
        ? dockTrackOverflow(track)
        : "none";
    };
    const syncGlassWidth = () => {
      syncTrackOverflow();
      const glassWidth = measureRestingGlassWidth(nav);
      nav.style.setProperty("--dock-glass-width", `${glassWidth}px`);
      const lens = nav.querySelector<HTMLElement>(".mac-dock-lens");
      if (lens) {
        const rect = lens.getBoundingClientRect();
        lens.style.setProperty("--mac-dock-lens-left", `${rect.left}px`);
        lens.style.setProperty("--mac-dock-lens-top", `${rect.top}px`);
      }
    };
    syncGlassWidth();
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(syncGlassWidth);
    observer?.observe(nav);
    const track = trackRef.current;
    if (track) observer?.observe(track);
    track?.addEventListener("scroll", syncTrackOverflow, { passive: true });
    window.addEventListener("resize", syncGlassWidth);
    return () => {
      observer?.disconnect();
      track?.removeEventListener("scroll", syncTrackOverflow);
      window.removeEventListener("resize", syncGlassWidth);
    };
  }, [children]);

  return (
    <nav
      ref={navRef}
      aria-label="程序坞"
      data-desktop-interactive
      className={className}
      onClickCapture={(event) => {
        if (
          onItemActivate &&
          event.target instanceof Element &&
          event.target.closest(".dock-item")
        ) {
          onItemActivate();
        }
      }}
    >
      <span className="mac-dock-lens" aria-hidden>
        <img
          src={wallpaper.url}
          srcSet={wallpaper.srcSet}
          sizes={wallpaper.sizes}
          alt=""
        />
      </span>
      <div ref={trackRef} className={TRACK_CLASS} data-overflow="none">
        {children}
      </div>
    </nav>
  );
}

export function DockItem({
  children,
  onClick,
  onContextMenu,
  title,
  className,
  running = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  onContextMenu?: MouseEventHandler<HTMLButtonElement>;
  title?: string;
  className?: string;
  running?: boolean;
}) {
  return (
    <button
      type="button"
      data-liquid-icon
      onClick={onClick}
      onContextMenu={onContextMenu}
      title={title}
      aria-label={title}
      className={`dock-item ${className ?? ""}`}
    >
      <span className="dock-item-inner relative grid size-full place-items-center">
        <span className="dock-item-spring">{children}</span>
      </span>
      {running && <span className="mac-dock-running-dot" aria-hidden />}
    </button>
  );
}
