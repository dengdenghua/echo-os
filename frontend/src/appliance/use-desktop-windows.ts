import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { currentActorId } from "@/core/auth/api";
import { actorScopedStorageKey } from "@/core/auth/scoped-storage";
import { threadIdForWorkspaceRoute } from "@/core/router/task-workspace-route";
import type { DesktopWindow } from "./app-window";

export type WindowGeometry = {
  x: number;
  y: number;
  w: number;
  h: number;
  maximized?: boolean;
};

export type DesktopSessionSnapshot = {
  version: 1;
  geometries: Record<string, WindowGeometry>;
};

const DESKTOP_SESSION_PREFIX = "echo-desktop-session";

function loadSessionSnapshot(actor: string): Record<string, WindowGeometry> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(
      actorScopedStorageKey(DESKTOP_SESSION_PREFIX, actor),
    );
    if (!raw) return null;
    const data = JSON.parse(raw) as DesktopSessionSnapshot;
    if (data && data.version === 1 && data.geometries) {
      return data.geometries;
    }
  } catch {
    // 存储解析失败时忽略
  }
  return null;
}

function persistSessionSnapshot(
  actor: string,
  geometries: Record<string, WindowGeometry>,
) {
  if (typeof window === "undefined") return;
  try {
    const snapshot: DesktopSessionSnapshot = {
      version: 1,
      geometries,
    };
    window.localStorage.setItem(
      actorScopedStorageKey(DESKTOP_SESSION_PREFIX, actor),
      JSON.stringify(snapshot),
    );
  } catch {
    // 存储不可用时静默降级
  }
}

type State = {
  windows: DesktopWindow[];
  minimized: Set<string>;
  focusedWin: string | null;
  geometries: Record<string, WindowGeometry>;
  /** 叠放顺序（最近使用在末尾）。与渲染顺序解耦，聚焦不移动 DOM，iframe 不会重载。 */
  stack: string[];
};

function raise(stack: string[], id: string): string[] {
  if (stack[stack.length - 1] === id) return stack;
  return [...stack.filter((entry) => entry !== id), id];
}

type Action =
  | { type: "open"; window: DesktopWindow; geometry?: WindowGeometry }
  | { type: "reset" }
  | { type: "close" | "minimize" | "restore" | "focus"; id: string }
  | { type: "route"; id: string; route: string; url: string }
  | { type: "geometry"; id: string; geometry: WindowGeometry }
  | { type: "restore_geometries"; geometries: Record<string, WindowGeometry> };

function reduce(state: State, action: Action): State {
  if (action.type === "reset") {
    return {
      windows: [],
      minimized: new Set<string>(),
      focusedWin: null,
      geometries: {},
      stack: [],
    };
  }
  if (action.type === "restore_geometries") {
    return {
      ...state,
      geometries: action.geometries,
    };
  }
  if (action.type === "geometry") {
    return {
      ...state,
      geometries: {
        ...state.geometries,
        [action.id]: action.geometry,
      },
    };
  }
  const minimized = new Set(state.minimized);
  if (action.type === "open") {
    const existing = state.windows.find(
      (entry) =>
        (action.window.workspaceRoute
          ? !action.window.threadId &&
            !entry.threadId &&
            entry.workspaceRoute === action.window.workspaceRoute
          : entry.id === action.window.id) ||
        (action.window.threadId && entry.threadId === action.window.threadId),
    );
    const target = existing ?? action.window;
    const artifact = action.window.workspaceRoute
      ? new URL(
          action.window.workspaceRoute,
          "https://echo.invalid",
        ).searchParams.get("artifact")
      : null;
    const updated =
      existing && artifact
        ? {
            ...existing,
            artifactRequest: {
              path: artifact,
              revision: (existing.artifactRequest?.revision ?? 0) + 1,
            },
          }
        : target;
    minimized.delete(target.id);
    const geometries = action.geometry
      ? { ...state.geometries, [target.id]: action.geometry }
      : state.geometries;
    return {
      windows: existing
        ? state.windows.map((entry) =>
            entry.id === existing.id ? updated : entry,
          )
        : [...state.windows, target],
      minimized,
      focusedWin: target.id,
      geometries,
      stack: raise(state.stack, target.id),
    };
  }
  if (action.type === "route") {
    const threadId = threadIdForWorkspaceRoute(action.route);
    return {
      ...state,
      windows: state.windows.map((entry) =>
        entry.id === action.id
          ? {
              ...entry,
              threadId,
              workspaceRoute: action.route,
              url: action.url,
            }
          : entry,
      ),
    };
  }
  // 激活一个已最小化的窗口（调度中心、菜单等入口）等同于恢复它，
  // 否则焦点会落在一个看不见的窗口上。
  if (action.type === "restore" || action.type === "focus") {
    if (!state.windows.some((entry) => entry.id === action.id)) return state;
    if (
      action.type === "focus" &&
      state.focusedWin === action.id &&
      !state.minimized.has(action.id) &&
      state.stack[state.stack.length - 1] === action.id
    ) {
      return state;
    }
    minimized.delete(action.id);
    return {
      ...state,
      minimized,
      focusedWin: action.id,
      stack: raise(state.stack, action.id),
    };
  }
  const windows =
    action.type === "close"
      ? state.windows.filter((entry) => entry.id !== action.id)
      : state.windows;
  if (action.type === "close") minimized.delete(action.id);
  else minimized.add(action.id);
  const stack =
    action.type === "close"
      ? state.stack.filter((entry) => entry !== action.id)
      : state.stack;
  // 焦点交给叠放顺序里最上面的可见窗口，而不是打开顺序里的最后一个。
  const focusedWin =
    state.focusedWin === action.id
      ? ([...stack].reverse().find((id) => !minimized.has(id)) ?? null)
      : state.focusedWin;
  return {
    windows,
    minimized,
    focusedWin,
    geometries: state.geometries,
    stack,
  };
}

/** Resolve identity, restore minimization and focus in a single state transition. */
export function useDesktopWindows() {
  const actor = currentActorId();
  const ownerRef = useRef(actor);
  const [owner, setOwner] = useState(actor);
  const [state, dispatch] = useReducer(
    reduce,
    undefined,
    () => ({
      windows: [],
      minimized: new Set<string>(),
      focusedWin: null,
      geometries: loadSessionSnapshot(actor) ?? {},
      stack: [],
    }),
  );

  useEffect(() => {
    if (ownerRef.current === actor) return;
    ownerRef.current = actor;
    setOwner(actor);
    dispatch({ type: "reset" });
    const restored = loadSessionSnapshot(actor);
    if (restored) {
      dispatch({ type: "restore_geometries", geometries: restored });
    }
  }, [actor]);

  useEffect(() => {
    if (owner === actor) {
      persistSessionSnapshot(actor, state.geometries);
    }
  }, [actor, owner, state.geometries]);

  const openWindow = useCallback(
    (window: DesktopWindow, geometry?: WindowGeometry) =>
      dispatch({ type: "open", window, geometry }),
    [],
  );
  const closeWindow = useCallback(
    (id: string) => dispatch({ type: "close", id }),
    [],
  );
  const minimizeWindow = useCallback(
    (id: string) => dispatch({ type: "minimize", id }),
    [],
  );
  const restoreWindow = useCallback(
    (id: string) => dispatch({ type: "restore", id }),
    [],
  );
  const focusWindow = useCallback(
    (id: string) => dispatch({ type: "focus", id }),
    [],
  );
  const reportWindowRoute = useCallback(
    (id: string, route: string, url: string) =>
      dispatch({ type: "route", id, route, url }),
    [],
  );
  const updateWindowGeometry = useCallback(
    (id: string, geometry: WindowGeometry) =>
      dispatch({ type: "geometry", id, geometry }),
    [],
  );

  return {
    ...(owner === actor
      ? state
      : {
          windows: [],
          minimized: new Set<string>(),
          focusedWin: null,
          geometries: {},
          stack: [],
        }),
    openWindow,
    closeWindow,
    minimizeWindow,
    restoreWindow,
    focusWindow,
    reportWindowRoute,
    updateWindowGeometry,
  };
}
