/**
 * 桌面外观统一偏好 hook。
 *
 * 把原先四套独立的 localStorage 键合并为一个 `DesktopAppearance` 对象
 * （`echo:desktop-appearance`），一次读写；主题切换联动玻璃参数，
 * 消除 theme/liquid-glass-style/intensity/wallpaper 碎片化导致的视觉打架。
 *
 * 兼容策略：首次读取时如果新 key 不存在，从旧四个 key 迁移并写回新 key，
 * 旧 key 保留（别的组件可能还在读），后续以新 key 为准。
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import type { CSSProperties } from "react";

import type { DesktopTheme } from "./intent-desktop-surface";
import type { DesktopWallpaperVariant } from "./desktop-wallpaper";
import { desktopWallpaperSources } from "./desktop-wallpaper";
import {
  DEFAULT_LIQUID_GLASS_TUNING,
  isDefaultLiquidGlassTuning,
  LIQUID_GLASS_TUNING_STORAGE_KEY,
  liquidGlassCssVariables,
  normalizeLiquidGlassTuning,
  parseLiquidGlassTuning,
  type LiquidGlassTuning,
} from "./liquid-glass-settings";
import type {
  MacLiquidGlassIntensity,
  MacLiquidGlassStyle,
} from "./macos-shell";

export type WallpaperVariant = DesktopWallpaperVariant;

export type DesktopAppearance = {
  theme: DesktopTheme;
  liquidGlassStyle: MacLiquidGlassStyle;
  liquidGlassIntensity: MacLiquidGlassIntensity;
  liquidGlassTuning: LiquidGlassTuning;
  wallpaper: WallpaperVariant;
};

const APPEARANCE_STORAGE_KEY = "echo:desktop-appearance";

const DEFAULT_APPEARANCE: DesktopAppearance = {
  // Daylight is the new-install default; saved choices remain explicit.
  theme: "theme-white",
  liquidGlassStyle: "softlight",
  liquidGlassIntensity: "weak",
  liquidGlassTuning: DEFAULT_LIQUID_GLASS_TUNING,
  wallpaper: "lakeshore",
};

const THEME_NAMES: Record<DesktopTheme, string> = {
  "theme-white": "雪白",
  "theme-glass": "神经玻璃",
  "theme-dark": "石墨",
};

/** 主题与玻璃参数的联动预设：切主题时把玻璃调到视觉协调的组合，并联动壁纸。 */
const THEME_GLASS_PRESETS: Record<
  DesktopTheme,
  Pick<
    DesktopAppearance,
    "liquidGlassStyle" | "liquidGlassIntensity" | "wallpaper"
  >
> = {
  "theme-white": {
    liquidGlassStyle: "softlight",
    liquidGlassIntensity: "weak",
    wallpaper: "lakeshore",
  },
  "theme-glass": {
    liquidGlassStyle: "crystal",
    liquidGlassIntensity: "balanced",
    wallpaper: "orbit",
  },
  "theme-dark": {
    liquidGlassStyle: "crystal",
    liquidGlassIntensity: "strong",
    wallpaper: "orbit",
  },
};

function normalizeWallpaper(
  value: string | null,
  theme: DesktopTheme,
): WallpaperVariant {
  // 旧值迁移：tahoe→orbit, sequoia→aurora, sonoma→sunset
  if (value === "tahoe") return "orbit";
  if (value === "sequoia") return "aurora";
  if (value === "sonoma") return "sunset";
  return value === "lakeshore" ||
    value === "daylight" ||
    value === "orbit" ||
    value === "aurora" ||
    value === "sunset" ||
    value === "midnight" ||
    value === "ocean-glass" ||
    value === "violet-ribbon" ||
    value === "amber-dusk"
    ? value
    : THEME_GLASS_PRESETS[theme].wallpaper;
}

function normalizeTheme(value: string | null): DesktopTheme {
  return value === "theme-white" ||
    value === "theme-glass" ||
    value === "theme-dark"
    ? value
    : "theme-white";
}

function normalizeStyle(value: string | null): MacLiquidGlassStyle {
  return value === "softlight" || value === "harmony" ? "softlight" : "crystal";
}

function normalizeIntensity(value: string | null): MacLiquidGlassIntensity {
  return value === "weak" || value === "strong" ? value : "balanced";
}

function loadAppearance(): DesktopAppearance {
  if (typeof window === "undefined") return DEFAULT_APPEARANCE;
  try {
    const raw = localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DesktopAppearance>;
      const theme = normalizeTheme(parsed.theme ?? null);
      // orbit 是 ECHO 石墨回响壁纸，深浅主题都直接使用，不再改写为 midnight。
      const wallpaper = normalizeWallpaper(parsed.wallpaper ?? null, theme);
      return {
        theme,
        liquidGlassStyle: normalizeStyle(
          parsed.liquidGlassStyle ??
            THEME_GLASS_PRESETS[theme].liquidGlassStyle,
        ),
        liquidGlassIntensity: normalizeIntensity(
          parsed.liquidGlassIntensity ??
            THEME_GLASS_PRESETS[theme].liquidGlassIntensity,
        ),
        liquidGlassTuning: parsed.liquidGlassTuning
          ? normalizeLiquidGlassTuning(parsed.liquidGlassTuning)
          : DEFAULT_LIQUID_GLASS_TUNING,
        wallpaper,
      };
    }
    // 旧四键迁移
    if (
      ![
        "echo-desktop-theme",
        "echo:desktop-wallpaper",
        "echo:liquid-glass-style",
        "echo:liquid-glass-intensity",
        LIQUID_GLASS_TUNING_STORAGE_KEY,
      ].some((key) => localStorage.getItem(key) !== null)
    ) {
      return DEFAULT_APPEARANCE;
    }
    const theme = normalizeTheme(localStorage.getItem("echo-desktop-theme"));
    const wallpaper = normalizeWallpaper(
      localStorage.getItem("echo:desktop-wallpaper"),
      theme,
    );
    const migrated: DesktopAppearance = {
      theme,
      liquidGlassStyle: normalizeStyle(
        localStorage.getItem("echo:liquid-glass-style") ??
          THEME_GLASS_PRESETS[theme].liquidGlassStyle,
      ),
      liquidGlassIntensity: normalizeIntensity(
        localStorage.getItem("echo:liquid-glass-intensity") ??
          THEME_GLASS_PRESETS[theme].liquidGlassIntensity,
      ),
      liquidGlassTuning: parseLiquidGlassTuning(
        localStorage.getItem(LIQUID_GLASS_TUNING_STORAGE_KEY),
      ),
      wallpaper,
    };
    return migrated;
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function readDesktopWallpaperUrl(): string {
  const { theme, wallpaper } = loadAppearance();
  return desktopWallpaperSources(
    theme === "theme-white" ? "snow" : "graphite",
    wallpaper,
  ).url;
}

function persistAppearance(appearance: DesktopAppearance) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(APPEARANCE_STORAGE_KEY, JSON.stringify(appearance));
    // 同步旧键，保证还在读旧键的组件（如 liquid-glass-settings 面板）一致
    localStorage.setItem("echo-desktop-theme", appearance.theme);
    localStorage.setItem(
      "echo:liquid-glass-style",
      appearance.liquidGlassStyle,
    );
    localStorage.setItem(
      "echo:liquid-glass-intensity",
      appearance.liquidGlassIntensity,
    );
    localStorage.setItem(
      LIQUID_GLASS_TUNING_STORAGE_KEY,
      JSON.stringify(appearance.liquidGlassTuning),
    );
    localStorage.setItem("echo:desktop-wallpaper", appearance.wallpaper);
  } catch {
    // localStorage 不可用时静默降级为会话内状态
  }
}

function applyThemeClass(theme: DesktopTheme) {
  if (typeof document === "undefined") return;
  document.documentElement.classList.remove(
    "theme-white",
    "theme-glass",
    "theme-dark",
  );
  document.documentElement.classList.add(theme);
  // Radix menus, popovers and dialogs portal to <body>, outside the desktop
  // root's .dark scope; scope the ECHO tokens on <html> so they match the desktop.
  document.documentElement.dataset.echoTheme =
    theme === "theme-white" ? "snow" : "graphite";
}

export function useDesktopAppearance() {
  const [appearance, setAppearance] =
    useState<DesktopAppearance>(loadAppearance);

  useEffect(() => {
    applyThemeClass(appearance.theme);
  }, [appearance.theme]);

  const update = useCallback((patch: Partial<DesktopAppearance>) => {
    setAppearance((current) => {
      const next: DesktopAppearance = {
        ...current,
        ...patch,
        liquidGlassTuning: patch.liquidGlassTuning
          ? normalizeLiquidGlassTuning(patch.liquidGlassTuning)
          : current.liquidGlassTuning,
      };
      persistAppearance(next);
      if (patch.theme && patch.theme !== current.theme) {
        applyThemeClass(patch.theme);
      }
      return next;
    });
  }, []);

  const setTheme = useCallback(
    (
      theme: DesktopTheme,
      options?: { linkGlass?: boolean; silent?: boolean },
    ) => {
      const linkGlass = options?.linkGlass ?? true;
      update({
        theme,
        ...(linkGlass ? THEME_GLASS_PRESETS[theme] : {}),
      });
      if (!options?.silent) {
        toast.success(`桌面主题已切换为：${THEME_NAMES[theme]}`);
      }
    },
    [update],
  );

  const toggleTheme = useCallback(() => {
    const cycle: Record<DesktopTheme, DesktopTheme> = {
      "theme-white": "theme-glass",
      "theme-glass": "theme-dark",
      "theme-dark": "theme-white",
    };
    setTheme(cycle[appearance.theme] ?? "theme-white");
  }, [appearance.theme, setTheme]);

  const setLiquidGlassStyle = useCallback(
    (liquidGlassStyle: MacLiquidGlassStyle) => update({ liquidGlassStyle }),
    [update],
  );
  const setLiquidGlassIntensity = useCallback(
    (liquidGlassIntensity: MacLiquidGlassIntensity) =>
      update({ liquidGlassIntensity }),
    [update],
  );
  const patchLiquidGlassTuning = useCallback(
    (patch: Partial<LiquidGlassTuning>) =>
      update({
        liquidGlassTuning: { ...appearance.liquidGlassTuning, ...patch },
      }),
    [appearance.liquidGlassTuning, update],
  );
  const setWallpaper = useCallback(
    (wallpaper: WallpaperVariant) => update({ wallpaper }),
    [update],
  );

  const cycleWallpaper = useCallback(() => {
    const order: WallpaperVariant[] = [
      "lakeshore",
      "daylight",
      "orbit",
      "aurora",
      "sunset",
      "midnight",
      "ocean-glass",
      "violet-ribbon",
      "amber-dusk",
    ];
    const index = order.indexOf(appearance.wallpaper);
    setWallpaper(order[(index + 1) % order.length] ?? "orbit");
  }, [appearance.wallpaper, setWallpaper]);

  const resetLiquidGlass = useCallback(() => {
    update({
      liquidGlassStyle: "crystal",
      liquidGlassIntensity: "balanced",
      liquidGlassTuning: DEFAULT_LIQUID_GLASS_TUNING,
    });
  }, [update]);

  const liquidGlassVariables = useMemo(
    () =>
      liquidGlassCssVariables(appearance.liquidGlassTuning) as CSSProperties,
    [appearance.liquidGlassTuning],
  );
  const liquidGlassUsesNativeDefaults = isDefaultLiquidGlassTuning(
    appearance.liquidGlassTuning,
  );

  return {
    ...appearance,
    setTheme,
    toggleTheme,
    setLiquidGlassStyle,
    setLiquidGlassIntensity,
    patchLiquidGlassTuning,
    setWallpaper,
    cycleWallpaper,
    resetLiquidGlass,
    liquidGlassVariables,
    liquidGlassUsesNativeDefaults,
  };
}
