import { currentActorId } from "@/core/auth/api";
export const TV_WALLPAPERS = [
  { id: "shared", label: "跟随办公模式壁纸", image: null },
  { id: "beach", label: "晴海沙岸", image: "/tv/wallpapers/beach.png" },
  { id: "ocean", label: "海洋流光", image: "/tv/wallpapers/ocean.png" },
  { id: "coast", label: "海岸日落", image: "/tv/wallpapers/coast.png" },
  { id: "alpine", label: "雪山晨光", image: "/tv/wallpapers/alpine.png" },
  { id: "orbit", label: "地球夜弧", image: "/tv/wallpapers/orbit.png" },
  { id: "lake", label: "湖畔晴光", image: "/tv/wallpapers/lake-natural.png" },
] as const;
export type TVWallpaper = (typeof TV_WALLPAPERS)[number]["id"];
export const DEFAULT_TV_WALLPAPER: TVWallpaper = "shared";
export type TVPreferences = {
  largeText: boolean;
  reduceMotion: boolean;
  wallpaper?: TVWallpaper;
};
const key = () => `echo.tv.preferences.v1:${currentActorId() || "local"}`;
export function readTVPreferences(): TVPreferences {
  try {
    const v = JSON.parse(localStorage.getItem(key()) || "{}");
    return {
      largeText: v.largeText === true,
      reduceMotion: v.reduceMotion === true,
      wallpaper: TV_WALLPAPERS.some((w) => w.id === v.wallpaper)
        ? v.wallpaper
        : DEFAULT_TV_WALLPAPER,
    };
  } catch {
    return {
      largeText: false,
      reduceMotion: false,
      wallpaper: DEFAULT_TV_WALLPAPER,
    };
  }
}
export function saveTVPreferences(value: TVPreferences) {
  localStorage.setItem(key(), JSON.stringify(value));
  window.dispatchEvent(new Event("echo-tv-preferences"));
}
