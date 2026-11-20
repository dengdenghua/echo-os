/** Input mode belongs to this device. Activity and playback belong to the account. */
export type ShellMode = "desktop" | "tv";
const preferenceKey = "echo:device-shell-mode";

export function preferredShellRoute(): "/desktop" | "/tv" {
  try {
    return localStorage.getItem(preferenceKey) === "tv" ? "/tv" : "/desktop";
  } catch {
    return "/desktop";
  }
}

export function chooseShellMode(mode: ShellMode): "/desktop" | "/tv" {
  try {
    localStorage.setItem(preferenceKey, mode);
  } catch {
    // Navigation also works with storage disabled.
  }
  return mode === "tv" ? "/tv" : "/desktop";
}
