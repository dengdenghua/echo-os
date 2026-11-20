import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/harness";
import TVPage from "./page";
import { rememberPhoto, readContinueItems } from "@/core/tv/continuity";
import { saveWatchProgress } from "@/core/tv/playback";
import { Link, Route, Routes, useLocation } from "react-router-dom";

const list = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({ actor: "tv-test" }));
vi.mock(import("@/core/storage/api"), async (importOriginal) => ({
  ...(await importOriginal()),
  listNASFiles: list,
  listNASSources: async () => [],
  listNASDirectory: async () => [],
  nasResourceId: () => undefined,
  getNASFileContentURL: (id: string) => `/api/storage/v1/files/${id}/content`,
}));
vi.mock("@/appliance/agent-health", () => ({
  useAgentDesktopHealth: () => ({ state: "unavailable" }),
}));
vi.mock("@/appliance/task-space", () => ({
  useEchoTaskProjection: () => ({}),
  startEchoTask: vi.fn(),
}));
vi.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ user: { actor_id: session.actor } }),
}));
vi.mock("@/core/coder/api", () => ({
  getCoderModelProfile: async () => ({ execution_available: true }),
}));
beforeEach(() => {
  session.actor = "tv-test";
  localStorage.clear();
  HTMLElement.prototype.scrollTo = vi.fn();
  list.mockReset();
  list.mockResolvedValue([]);
});

it("follows the desktop wallpaper and gives each TV app a decorative tile", () => {
  renderWithProviders(<TVPage />);
  const shell = screen.getByTestId("tv-shell");
  expect(shell).toHaveAttribute("data-wallpaper", "shared");
  expect(shell.style.getPropertyValue("--tv-wallpaper")).toContain(
    "wallpaper-lakeshore",
  );
  const tiles = within(screen.getByLabelText("常用应用")).getAllByRole(
    "button",
  );
  expect(tiles).toHaveLength(6);
  for (const tile of tiles) {
    expect(tile).toHaveAccessibleName();
    expect(tile.textContent).toBe("");
    expect(tile.querySelector(".tv-app-tile")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
    expect(
      tile.querySelector(".tv-tile-art svg, .tv-tile-art img"),
    ).toBeInTheDocument();
  }
});

it("switches to the desktop by an explicit remote control", () => {
  function Path() {
    return <output>{useLocation().pathname}</output>;
  }
  renderWithProviders(
    <>
      <TVPage />
      <Path />
    </>,
    { initialRoute: "/tv" },
  );
  expect(screen.getByText("娱乐模式", { exact: true })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "办公模式" }));
  expect(screen.getByRole("status")).toHaveTextContent("/desktop");
});

it("shows six icon-only shortcuts on an empty home, links both rows by column and restores the shelf", () => {
  renderWithProviders(<TVPage />);
  const launcher = screen.getByLabelText("常用应用");
  const row = screen.getByLabelText("常用功能");
  const apps = within(launcher).getAllByRole("button");
  const shortcuts = within(row).getAllByRole("button");
  expect(shortcuts.map((button) => button.getAttribute("aria-label"))).toEqual([
    "影片搜索",
    "本地播放",
    "壁纸",
    "声音与设备",
    "媒体来源",
    "插件中心",
  ]);
  const shell = screen.getByTestId("tv-shell");
  shortcuts.forEach((shortcut, i) => {
    expect(shortcut.textContent).toBe("");
    expect(shortcut.querySelector("svg")).toBeInTheDocument();
    shortcut.scrollIntoView = vi.fn();
    const app = apps[i]!;
    act(() => app.focus());
    fireEvent.keyDown(app, { key: "ArrowDown" });
    expect(shortcut).toHaveFocus();
    expect(shortcut.scrollIntoView).toHaveBeenCalledWith({
      block: "nearest",
      inline: "nearest",
      behavior: "smooth",
    });
    fireEvent.keyDown(shortcut, { key: "ArrowUp" });
    expect(app).toHaveFocus();
  });
  expect(shell.scrollTo).toHaveBeenCalledTimes(6);
  fireEvent.keyDown(apps[5]!, { key: "ArrowUp" });
  expect(row).toHaveAttribute("hidden");
  expect(row).toHaveAttribute("inert");
});

it("opens movie search at its input and returns to the search shortcut", () => {
  renderWithProviders(<TVPage />);
  fireEvent.click(screen.getByRole("button", { name: "影片搜索" }));
  const search = screen.getByRole("textbox", { name: "搜索影视库" });
  expect(search).toHaveFocus();
  fireEvent.keyDown(search, { key: "Escape" });
  fireEvent.keyUp(search, { key: "Escape" });
  expect(screen.getByRole("button", { name: "影片搜索" })).toHaveFocus();
});

it.each([
  ["壁纸", "画面与操作"],
  ["声音与设备", "声音与设备"],
  ["媒体来源", "资料来源"],
  ["插件中心", "插件"],
])("opens the %s shortcut directly in its detail page", (label, heading) => {
  renderWithProviders(<TVPage />);
  const tile = screen.getByRole("button", { name: label, exact: true });
  act(() => tile.focus());
  fireEvent.click(tile);
  const panel = screen.getByRole("dialog", { name: "娱乐模式设置" });
  expect(panel).toHaveAttribute("data-overview", "false");
  expect(
    within(panel).getByRole("heading", { name: heading, level: 2 }),
  ).toBeVisible();
  if (label === "壁纸")
    expect(within(panel).getByLabelText("选择壁纸")).toBeVisible();
  fireEvent.click(within(panel).getByRole("button", { name: "返回娱乐模式" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(tile).toBeVisible();
});

it("opens the home file picker synchronously and plays its chosen local video", async () => {
  const create = vi.fn(() => "blob:local-video");
  const release = vi.fn();
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = release;
    },
  );
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  const view = renderWithProviders(<TVPage />);
  try {
    const picker = screen.getByLabelText("选择视频文件");
    const pick = vi.spyOn(picker, "click");
    fireEvent.click(screen.getByRole("button", { name: "本地播放" }));
    expect(pick).toHaveBeenCalledOnce();
    const file = new File(["video"], "这片海.webm", { type: "video/webm" });
    fireEvent.change(picker, { target: { files: [file] } });
    const player = await screen.findByRole("dialog", {
      name: "播放：这片海.webm",
    });
    expect(create).toHaveBeenCalledWith(file);
    expect(player.querySelector("video")?.src).toBe("blob:local-video");
    fireEvent.keyDown(player, { key: "Escape" });
    fireEvent.keyUp(player, { key: "Escape" });
    expect(release).toHaveBeenCalledWith("blob:local-video");
    expect(screen.getByRole("button", { name: "本地播放" })).toBeVisible();
  } finally {
    view.unmount();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

it("restricts the native companion to visible hero artwork and releases its desktop position on exit", async () => {
  const setTVHomeRegion = vi.fn(async () => {});
  vi.stubGlobal("echo", { desktopCompanion: { setTVHomeRegion } });
  vi.stubGlobal("innerWidth", 1280);
  vi.stubGlobal("innerHeight", 800);
  let heroTop = 94,
    copyRight = 837;
  const geometry = vi
    .spyOn(HTMLElement.prototype, "getBoundingClientRect")
    .mockImplementation(function (this: HTMLElement) {
      if (this.matches(".tv-top-shelf"))
        return DOMRect.fromRect({
          x: 61,
          y: heroTop,
          width: 1158,
          height: 416,
        });
      if (this.matches(".tv-shelf-copy"))
        return DOMRect.fromRect({
          x: 61,
          y: heroTop,
          width: copyRight - 61,
          height: 200,
        });
      if (this.matches(".tv-header"))
        return DOMRect.fromRect({ x: 61, y: 20, width: 1158, height: 50 });
      return DOMRect.fromRect({});
    });
  const hidden = { x: 0, y: 0, width: 0, height: 0 };
  const view = renderWithProviders(<TVPage />);
  try {
    expect(setTVHomeRegion).toHaveBeenLastCalledWith({
      x: 847,
      y: 104,
      width: 362,
      height: 396,
    });
    heroTop = -90;
    fireEvent.scroll(view.container.querySelector(".tv-home")!);
    await waitFor(() =>
      expect(setTVHomeRegion).toHaveBeenLastCalledWith({
        x: 847,
        y: 80,
        width: 362,
        height: 236,
      }),
    );
    vi.stubGlobal("innerWidth", 780);
    fireEvent(window, new Event("resize"));
    await waitFor(() =>
      expect(setTVHomeRegion).toHaveBeenLastCalledWith(hidden),
    );
    copyRight = 425;
    act(() =>
      screen.getByRole("button", { name: "影视库", exact: true }).focus(),
    );
    const resized = { x: 435, y: 80, width: 335, height: 236 };
    await waitFor(() =>
      expect(setTVHomeRegion).toHaveBeenLastCalledWith(resized),
    );
    fireEvent.click(screen.getByRole("button", { name: "设置", exact: true }));
    expect(setTVHomeRegion).toHaveBeenLastCalledWith(hidden);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    fireEvent.keyUp(screen.getByRole("dialog"), { key: "Escape" });
    expect(setTVHomeRegion).toHaveBeenLastCalledWith(resized);
    fireEvent.click(
      screen.getByRole("button", { name: "影视库", exact: true }),
    );
    expect(setTVHomeRegion).toHaveBeenLastCalledWith(hidden);
    fireEvent.click(screen.getByRole("button", { name: "首页" }));
    expect(setTVHomeRegion).toHaveBeenLastCalledWith(resized);
    view.unmount();
    expect(setTVHomeRegion).toHaveBeenLastCalledWith(null);
  } finally {
    view.unmount();
    geometry.mockRestore();
    vi.unstubAllGlobals();
  }
});

it("opens the same authorized photo on the TV and returns to the home rail", async () => {
  rememberPhoto("tv-test", { path: "旅行/湖.jpeg", title: "湖.jpeg" });
  renderWithProviders(<TVPage />);
  const card = screen.getByRole("button", { name: "查看照片 湖.jpeg" });
  card.focus();
  fireEvent.click(card);
  const dialog = screen.getByRole("dialog", { name: "最近查看的照片" });
  const photo = within(dialog).getByRole("img", { name: "湖.jpeg" });
  const original = new URL(photo.getAttribute("src")!, location.origin);
  expect(original.pathname).toBe("/api/appliance/photos/original");
  expect(original.searchParams.get("path")).toBe("旅行/湖.jpeg");
  fireEvent.load(photo);
  expect(readContinueItems("tv-test")[0]?.title).toBe("湖.jpeg");
  fireEvent.keyDown(dialog, { key: "Escape" });
  fireEvent.keyUp(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  await waitFor(() => expect(card).toHaveFocus());
});

it("previews a recent photo immediately and upgrades only while focus stays on it", async () => {
  rememberPhoto("tv-test", { path: "旅行/湖.jpeg", title: "湖.jpeg" });
  const view = renderWithProviders(<TVPage />);
  const card = screen.getByRole("button", { name: "查看照片 湖.jpeg" });
  const echo = screen.getByRole("button", { name: "呼出 Echo" });
  const thumbnail = () =>
    view.container.querySelector<HTMLImageElement>(
      ".tv-shelf-media[src*='thumbnail']",
    );
  const original = () =>
    view.container.querySelector<HTMLImageElement>(
      ".tv-shelf-media[src*='original']",
    );
  vi.useFakeTimers();
  try {
    act(() => card.focus());
    expect(screen.getByRole("heading", { name: "湖" })).toBeVisible();
    const url = new URL(thumbnail()!.src);
    expect(url.searchParams.get("path")).toBe("旅行/湖.jpeg");
    expect(url.searchParams.get("size")).toBe("512");
    act(() => {
      vi.advanceTimersByTime(200);
      echo.focus();
      vi.advanceTimersByTime(600);
    });
    expect(original()).toBeNull();
    act(() => card.focus());
    expect(original()).toBeNull();
    act(() => vi.advanceTimersByTime(600));
    expect(new URL(original()!.src).searchParams.get("path")).toBe(
      "旅行/湖.jpeg",
    );
    fireEvent.error(original()!);
    expect(thumbnail()).toBeVisible();
    act(() => echo.focus());
    act(() => card.focus());
    act(() => vi.advanceTimersByTime(600));
    fireEvent.load(original()!);
    expect(original()).toBeVisible();
    expect(thumbnail()).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "全屏预览" }));
    expect(screen.getByRole("button", { name: "打开照片" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "打开照片" }));
    expect(
      screen.getByRole("dialog", { name: "最近查看的照片" }),
    ).toBeVisible();
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it("keeps a HEIC photo on its decoded thumbnail", () => {
  rememberPhoto("tv-test", { path: "湖.heic", title: "湖.heic" });
  const view = renderWithProviders(<TVPage />);
  vi.useFakeTimers();
  try {
    act(() => screen.getByRole("button", { name: "查看照片 湖.heic" }).focus());
    act(() => vi.advanceTimersByTime(1000));
    expect(
      view.container.querySelector(".tv-shelf-media[src*='thumbnail']"),
    ).toBeVisible();
    expect(
      view.container.querySelector(".tv-shelf-media[src*='original']"),
    ).toBeNull();
  } finally {
    view.unmount();
    vi.useRealTimers();
  }
});

it("opens the latest authorized movie directly from its preview and restores its position", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  list.mockResolvedValue([
    { asset_id: "first", name: "晨光.mp4", extension: ".mp4" },
    { asset_id: "movie", name: "海岸.mp4", extension: ".mp4" },
  ]);
  saveWatchProgress("tv-test", {
    id: "movie",
    title: "旧名字.mp4",
    position: 18,
    duration: 120,
    updatedAt: 2,
  });
  // The six newest history records may all point to removed files.
  for (let i = 0; i < 6; i++) {
    saveWatchProgress("tv-test", {
      id: `removed-${i}`,
      position: 10,
      duration: 100,
      updatedAt: i + 3,
    });
  }
  const view = renderWithProviders(<TVPage />);
  try {
    const tile = screen.getByRole("button", { name: "影视库", exact: true });
    act(() => tile.focus());
    expect(await screen.findByRole("heading", { name: "海岸" })).toBeVisible();
    fireEvent.keyDown(tile, { key: "ArrowUp" });
    const action = screen.getByRole("button", { name: "从 0:18 继续" });
    expect(action).toHaveFocus();
    fireEvent.keyDown(action, { key: "ArrowDown" });
    expect(tile).toHaveFocus();
    fireEvent.keyDown(tile, { key: "ArrowUp" });
    await userEvent.keyboard("{Enter}");
    const player = await screen.findByRole("dialog", {
      name: "播放：海岸.mp4",
    });
    const movie = player.querySelector("video")!;
    await waitFor(() => expect(movie.src).toContain("/files/movie/content"));
    Object.defineProperty(movie, "duration", {
      value: 120,
      configurable: true,
    });
    fireEvent.loadedMetadata(movie);
    expect(movie.currentTime).toBe(18);
    fireEvent.keyDown(player, { key: "Escape" });
    fireEvent.keyUp(player, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "播放：海岸.mp4" })).toBeNull();
    expect(screen.getByRole("dialog", { name: "海岸预览" })).toBeVisible();
    await waitFor(() => expect(action).toHaveFocus());
    fireEvent.keyDown(action, { key: "Escape" });
    fireEvent.keyUp(action, { key: "Escape" });
    expect(tile).toHaveFocus();
  } finally {
    view.unmount();
    vi.restoreAllMocks();
  }
});

it("keeps the full-screen preview focus in its own controls and returns to the originating card", () => {
  rememberPhoto("tv-test", { path: "旅行/湖.jpeg", title: "湖.jpeg" });
  renderWithProviders(<TVPage />);
  const home = screen.getByRole("region", { name: "娱乐模式首页" });
  const launcher = screen.getByLabelText("常用应用");
  const recent = screen.getByRole("region", { name: "继续上次" });
  const tile = screen.getByRole("button", { name: "知识库", exact: true });
  const photo = screen.getByRole("button", { name: "查看照片 湖.jpeg" });
  expect(home).toHaveAttribute("data-preview-expanded", "false");
  expect(screen.queryByRole("button", { name: "和 Echo 聊聊" })).toBeNull();
  act(() => tile.focus());
  for (const key of ["Escape", "BrowserBack", "ArrowDown"]) {
    fireEvent.keyDown(tile, { key: "ArrowUp" });
    const preview = screen.getByRole("dialog", { name: "知识库预览" });
    const action = within(preview).getByRole("button", { name: "搜索知识库" });
    expect(action).toHaveFocus();
    expect(home).toHaveAttribute("data-preview-expanded", "true");
    expect(launcher).toHaveAttribute("inert");
    expect(recent).not.toBeVisible();
    fireEvent.keyDown(action, { key });
    fireEvent.keyUp(action, { key });
    expect(home).toHaveAttribute("data-preview-expanded", "false");
    expect(tile).toHaveFocus();
  }
  act(() => photo.focus());
  fireEvent.click(screen.getByRole("button", { name: "全屏预览" }));
  const preview = screen.getByRole("dialog", { name: "湖预览" });
  fireEvent.click(
    within(preview).getByRole("button", { name: "退出全屏预览" }),
  );
  expect(photo).toHaveFocus();
});

it("takes one paused frame at the resume point for the shelf and the recent card", async () => {
  const create = vi.spyOn(document, "createElement");
  const drawImage = vi.fn();
  const frame = "data:image/jpeg;base64,Zm9v";
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  const play = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage,
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(frame);
  list.mockResolvedValue([
    { asset_id: "lake", name: "湖面.mp4", extension: ".mp4" },
  ]);
  saveWatchProgress("tv-test", {
    id: "lake",
    position: 42,
    duration: 150,
    updatedAt: 1,
  });
  const view = renderWithProviders(<TVPage />);
  try {
    act(() =>
      screen.getByRole("button", { name: "影视库", exact: true }).focus(),
    );
    await screen.findByRole("heading", { name: "湖面" });
    const videos = create.mock.results
      .map((result) => result.value)
      .filter(
        (node): node is HTMLVideoElement =>
          node instanceof HTMLVideoElement &&
          node.src.endsWith("/files/lake/content"),
      );
    expect(videos).toHaveLength(1);
    const video = videos[0]!;
    expect(video.isConnected).toBe(false);
    Object.defineProperties(video, {
      duration: { value: 150 },
      readyState: { value: 2 },
      videoWidth: { value: 3840 },
      videoHeight: { value: 2160 },
    });
    fireEvent.loadedMetadata(video);
    expect(video.currentTime).toBe(42);
    fireEvent.seeked(video);
    await waitFor(() =>
      expect(view.container.querySelector(".tv-shelf-media")).toHaveAttribute(
        "src",
        frame,
      ),
    );
    expect(view.container.querySelector(".tv-resume-art img")).toHaveAttribute(
      "src",
      frame,
    );
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(video, 0, 0, 1280, 720);
    expect(video).not.toHaveAttribute("src");
    expect(play).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    vi.restoreAllMocks();
  }
});

it("lets the remote move up one app row on a wrapped launcher", () => {
  renderWithProviders(<TVPage />);
  const echo = screen.getByRole("button", { name: "呼出 Echo" });
  const lowerTile = screen.getByRole("button", { name: "应用", exact: true });
  for (const [top, item] of [
    [100, echo],
    [200, lowerTile],
  ] as const) {
    const bounds = DOMRect.fromRect({ x: 0, y: top, width: 100, height: 80 });
    Object.defineProperty(item, "offsetTop", { value: top });
    vi.spyOn(item, "getBoundingClientRect").mockReturnValue(bounds);
    vi.spyOn(item, "getClientRects").mockReturnValue([
      bounds,
    ] as unknown as DOMRectList);
    item.scrollIntoView = vi.fn();
  }
  act(() => lowerTile.focus());
  fireEvent.keyDown(lowerTile, { key: "ArrowUp" });
  expect(echo).toHaveFocus();
});

it.each([
  [6, false],
  [3, false],
  [3, true],
] as const)(
  "stops horizontal remote navigation at each physical row edge with %i columns and rtl=%s",
  (columns, rtl) => {
    renderWithProviders(<TVPage />);
    const grid = screen.getByLabelText("常用应用");
    if (rtl) grid.dir = "rtl";
    const cards = within(grid).getAllByRole("button");
    const office = screen.getByRole("button", { name: "办公模式" });
    function place(item: HTMLElement, x: number, y: number) {
      const rect = DOMRect.fromRect({ x, y, width: 90, height: 65 });
      Object.defineProperties(item, {
        offsetTop: { value: y },
        offsetLeft: { value: x },
      });
      vi.spyOn(item, "getBoundingClientRect").mockReturnValue(rect);
      vi.spyOn(item, "getClientRects").mockReturnValue([
        rect,
      ] as unknown as DOMRectList);
      item.scrollIntoView = vi.fn();
    }
    place(office, columns * 110 + 40, 0);
    cards.forEach((item, i) => {
      const column = rtl ? columns - 1 - (i % columns) : i % columns;
      place(item, column * 110, 100 + Math.floor(i / columns) * 80);
    });
    for (let start = 0; start < cards.length; start += columns) {
      const row = cards.slice(start, start + columns);
      if (rtl) row.reverse();
      const left = row[0]!,
        right = row.at(-1)!;
      act(() => right.focus());
      fireEvent.keyDown(right, { key: "ArrowRight" });
      expect(right).toHaveFocus();
      fireEvent.keyDown(right, { key: "ArrowLeft" });
      expect(row.at(-2)).toHaveFocus();
      act(() => left.focus());
      fireEvent.keyDown(left, { key: "ArrowLeft" });
      expect(left).toHaveFocus();
      fireEvent.keyDown(left, { key: "ArrowRight" });
      expect(row[1]).toHaveFocus();
    }
    act(() => cards.at(-1)!.focus());
    fireEvent.keyDown(cards.at(-1)!, { key: "Tab" });
    expect(office).toHaveFocus();
  },
);

it("scrolls a partially visible recent item inside its horizontal rail", () => {
  rememberPhoto("tv-test", { path: "湖.jpeg", title: "湖.jpeg" });
  const view = renderWithProviders(<TVPage />);
  const card = screen.getByRole("button", { name: "查看照片 湖.jpeg" });
  const rail = view.container.querySelector<HTMLElement>(".tv-resume-list")!;
  vi.spyOn(rail, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 10, y: 400, width: 370, height: 80 }),
  );
  vi.spyOn(card, "getBoundingClientRect").mockReturnValue(
    DOMRect.fromRect({ x: 234, y: 405, width: 209, height: 65 }),
  );
  card.scrollIntoView = vi.fn();
  act(() => card.focus());
  expect(card.scrollIntoView).toHaveBeenCalledWith({
    block: "nearest",
    inline: "nearest",
    behavior: "instant",
  });
});

it("opens a desktop resume link at the matching authorized movie", async () => {
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  list.mockResolvedValue([
    { asset_id: "one", name: "山间.mp4", extension: ".mp4" },
    { asset_id: "two", name: "潮汐.mp4", extension: ".mp4" },
  ]);
  saveWatchProgress("tv-test", {
    id: "two",
    position: 17,
    duration: 100,
    updatedAt: 1,
  });
  const view = renderWithProviders(<TVPage />, {
    initialRoute: "/tv?resumeVideo=two",
  });
  const player = await screen.findByRole("dialog", { name: "播放：潮汐.mp4" });
  const movie = player.querySelector("video")!;
  expect(movie.src).toContain("/files/two/content");
  Object.defineProperty(movie, "duration", { value: 100, configurable: true });
  fireEvent.loadedMetadata(movie);
  expect(movie.currentTime).toBe(17);
  const back = within(player).getByRole("button", { name: "返回" });
  expect(fireEvent.keyDown(back, { key: " ", code: "Space" })).toBe(true);
  expect(fireEvent.keyDown(back, { key: "MediaPlayPause" })).toBe(false);
  view.unmount();
  vi.restoreAllMocks();
});

it("recovers in the library when the requested movie cannot be found", async () => {
  renderWithProviders(<TVPage />, { initialRoute: "/tv?resumeVideo=removed" });
  expect(
    await screen.findByRole("heading", { name: "我的影视库" }),
  ).toBeVisible();
  expect(screen.getByText("这部视频已移出当前媒体库。")).toBeVisible();
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

function indexedMovies(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    asset_id: `movie-${i + 1}`,
    name: `影片 ${i + 1}.mp4`,
    extension: ".mp4",
  }));
}

it("requests the expanded desktop index only for a resume target beyond the first 100 entries", async () => {
  const movies = indexedMovies(499);
  list.mockImplementation((_kind, limit) =>
    Promise.resolve(movies.slice(0, limit)),
  );
  const home = renderWithProviders(<TVPage />);
  fireEvent.click(screen.getByRole("button", { name: "影视库", exact: true }));
  expect(await screen.findByText("影片 100.mp4")).toBeVisible();
  expect(list.mock.calls).toEqual([["video", 100]]);
  home.unmount();
  vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
  const view = renderWithProviders(<TVPage />, {
    initialRoute: "/tv?resumeVideo=movie-499",
  });
  const player = await screen.findByRole("dialog", {
    name: "播放：影片 499.mp4",
  });
  await waitFor(() =>
    expect(player.querySelector("video")!.src).toContain(
      "/files/movie-499/content",
    ),
  );
  expect(list.mock.calls).toEqual([
    ["video", 100],
    ["video", 100],
    ["video", 500],
  ]);
  view.unmount();
  vi.restoreAllMocks();
});

it("discards a pending expansion when the viewer changes accounts", async () => {
  const movies = indexedMovies(101);
  let resolveFirstAccount!: (rows: typeof movies) => void;
  list
    .mockResolvedValueOnce(movies.slice(0, 100))
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveFirstAccount = resolve;
        }),
    )
    .mockResolvedValue([]);
  const view = renderWithProviders(<TVPage />, {
    initialRoute: "/tv?resumeVideo=movie-101",
  });
  await waitFor(() => expect(list).toHaveBeenCalledWith("video", 500));
  session.actor = "second-account";
  view.rerender(<TVPage />);
  expect(await screen.findByText("这部视频已移出当前媒体库。")).toBeVisible();
  await act(async () => resolveFirstAccount(movies));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it.each([true, false])(
  "returns a desktop resume request to its origin, available = %s",
  async (available) => {
    vi.spyOn(HTMLMediaElement.prototype, "load").mockImplementation(() => {});
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    list.mockResolvedValue(
      available
        ? [{ asset_id: "one", name: "山间.mp4", extension: ".mp4" }]
        : [],
    );
    renderWithProviders(
      <Routes>
        <Route
          path="/desktop"
          element={
            <Link to="/tv?resumeVideo=one" state={{ resumeFrom: "desktop" }}>
              继续播放
            </Link>
          }
        />
        <Route path="/tv" element={<TVPage />} />
      </Routes>,
      { initialRoute: "/desktop" },
    );
    fireEvent.click(screen.getByRole("link", { name: "继续播放" }));
    if (available) {
      const player = await screen.findByRole("dialog", {
        name: "播放：山间.mp4",
      });
      fireEvent.keyDown(player, { key: "Escape" });
      fireEvent.keyUp(player, { key: "Escape" });
    } else {
      fireEvent.click(
        await screen.findByRole("button", { name: "返回办公模式" }),
      );
    }
    expect(await screen.findByRole("link", { name: "继续播放" })).toBeVisible();
    vi.restoreAllMocks();
  },
);

it("opens the television conversation from the desktop companion", () => {
  renderWithProviders(<TVPage />);
  fireEvent(
    window,
    new CustomEvent("echo:companion-chat", {
      detail: { threadId: "" },
    }),
  );
  expect(screen.getByRole("dialog", { name: "Echo 对话" })).toBeInTheDocument();
  expect(screen.getByTestId("tv-shell")).toBeInTheDocument();
});

it("shows real unavailable media state and a recovery route instead of fictional content", async () => {
  list.mockRejectedValue(new Error("service unavailable"));
  renderWithProviders(<TVPage />);
  fireEvent.click(screen.getByRole("button", { name: "影视库", exact: true }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "媒体库暂时不可用",
  );
  expect(
    screen.getByRole("button", { name: "管理媒体来源" }),
  ).toBeInTheDocument();
});

it("filters actual library entries by Chinese title and can clear an empty search", async () => {
  list.mockResolvedValue([
    { asset_id: "one", name: "旅行记录.mp4", extension: ".mp4" },
    { asset_id: "two", name: "家庭录像.webm", extension: ".webm" },
  ]);
  renderWithProviders(<TVPage />);
  fireEvent.click(screen.getByRole("button", { name: "影视库", exact: true }));
  expect(await screen.findByText("旅行记录.mp4")).toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "搜索影视库" }), {
    target: { value: "旅行" },
  });
  expect(screen.queryByText("家庭录像.webm")).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "搜索影视库" }), {
    target: { value: "不存在" },
  });
  fireEvent.click(screen.getByRole("button", { name: "清除搜索" }));
  expect(screen.getByText("家庭录像.webm")).toBeInTheDocument();
});

it("closes the Agent on Back without leaving TV mode", async () => {
  renderWithProviders(<TVPage />);
  fireEvent.click(screen.getByRole("button", { name: "呼出 Echo" }));
  const dialog = screen.getByRole("dialog", { name: "Echo 对话" });
  fireEvent.keyDown(dialog, { key: "Escape" });
  fireEvent.keyUp(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByTestId("tv-shell")).toBeInTheDocument();
});

it("keeps settings entirely inside TV and restores the home on Back", () => {
  renderWithProviders(<TVPage />);
  expect(screen.getByRole("button", { name: "办公模式" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "设置", exact: true }));
  const dialog = screen.getByRole("dialog", { name: "娱乐模式设置" });
  expect(
    within(dialog).queryByRole("button", { name: "办公模式" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "模型与账号" })).toBeVisible();
  fireEvent.keyDown(dialog, { key: "Escape" });
  fireEvent.keyUp(dialog, { key: "Escape" });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "娱乐模式首页" })).toBeVisible();
});

it("previews the focused app and opens knowledge queries within the TV Agent", async () => {
  renderWithProviders(<TVPage />);
  const knowledge = screen.getByRole("button", { name: "知识库", exact: true });
  fireEvent.focus(knowledge);
  expect(
    screen.getByRole("heading", { name: "知识库", exact: true }),
  ).toBeVisible();
  fireEvent.click(knowledge);
  expect(screen.getByRole("textbox", { name: "给 Agent 的任务" })).toHaveValue(
    "请在我的知识库中查找：",
  );
  expect(await screen.findByRole("button", { name: "发送任务" })).toBeVisible();
  expect(screen.getByTestId("tv-shell")).toBeVisible();
});

it("returns from a settings detail to categories before leaving TV settings", () => {
  renderWithProviders(<TVPage />);
  fireEvent.click(screen.getByRole("button", { name: "设置", exact: true }));
  fireEvent.click(
    screen.getByRole("button", { name: "画面与操作", exact: true }),
  );
  expect(screen.getByRole("button", { name: "海岸日落" })).toBeVisible();
  // JSDOM has no geometric visibility; real remote Back is covered in browser tests.
  fireEvent.click(
    screen.getByRole("button", { name: "返回设置", exact: true }),
  );
  expect(screen.getByRole("navigation", { name: "设置分类" })).toBeVisible();
  expect(screen.getByRole("dialog", { name: "娱乐模式设置" })).toBeVisible();
  fireEvent.keyDown(screen.getByRole("dialog", { name: "娱乐模式设置" }), {
    key: "Escape",
  });
  fireEvent.keyUp(screen.getByRole("dialog", { name: "娱乐模式设置" }), {
    key: "Escape",
  });
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

it("keeps the chosen wallpaper after remounting the actual TV shell", async () => {
  const view = renderWithProviders(<TVPage />);
  fireEvent.click(screen.getByRole("button", { name: "设置", exact: true }));
  fireEvent.click(
    screen.getByRole("button", { name: "画面与操作", exact: true }),
  );
  fireEvent.click(screen.getByRole("button", { name: "地球夜弧" }));
  await vi.waitFor(() =>
    expect(screen.getByTestId("tv-shell")).toHaveAttribute(
      "data-wallpaper",
      "orbit",
    ),
  );
  view.unmount();
  renderWithProviders(<TVPage />);
  expect(screen.getByTestId("tv-shell")).toHaveAttribute(
    "data-wallpaper",
    "orbit",
  );
});

it("saves a folder and a cross-row move, then releases the held selection without opening the app", async () => {
  const view = renderWithProviders(<TVPage />);
  const library = screen.getByRole("button", { name: "影视库", exact: true });
  act(() => library.focus());
  vi.useFakeTimers();
  try {
    fireEvent.keyDown(library, { key: "Enter" });
    act(() => vi.advanceTimersByTime(650));
    const repeat = new KeyboardEvent("keydown", {
      key: "Enter",
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    document.activeElement!.dispatchEvent(repeat);
    expect(repeat.defaultPrevented).toBe(true);
    fireEvent.keyUp(document.activeElement!, { key: "Enter" });
  } finally {
    vi.useRealTimers();
  }
  fireEvent.click(screen.getByRole("button", { name: "新建文件夹" }));
  fireEvent.change(screen.getByRole("textbox", { name: "文件夹名称" }), {
    target: { value: "周末" },
  });
  fireEvent.click(screen.getByRole("button", { name: "完成" }));
  const folder = screen.getByRole("button", { name: "周末" });
  expect(folder).toHaveFocus();
  fireEvent.contextMenu(folder);
  fireEvent.click(screen.getByRole("button", { name: "移动位置" }));
  fireEvent.click(screen.getByRole("button", { name: "8 · 本地播放" }));
  view.unmount();
  renderWithProviders(<TVPage />);
  const moved = within(screen.getByLabelText("常用功能")).getByRole("button", {
    name: "周末",
  });
  fireEvent.click(moved);
  expect(
    within(screen.getByRole("dialog", { name: "周末" })).getByRole("button", {
      name: "影视库",
    }),
  ).toHaveFocus();
});

it("long Back from settings returns directly to the first tile", () => {
  renderWithProviders(<TVPage />);
  fireEvent.click(screen.getByRole("button", { name: "设置", exact: true }));
  fireEvent.click(
    within(screen.getByRole("dialog")).getByRole("button", {
      name: "声音与设备",
      exact: true,
    }),
  );
  vi.useFakeTimers();
  try {
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    act(() => vi.advanceTimersByTime(650));
    fireEvent.keyUp(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByRole("button", { name: "呼出 Echo" })).toHaveFocus();
    expect(screen.getByTestId("tv-shell").scrollTo).toHaveBeenCalledWith({
      top: 0,
      behavior: "instant",
    });
  } finally {
    vi.useRealTimers();
  }
});

it("previews the focused movie silently and switches titles in full screen", async () => {
  list.mockResolvedValue([
    { asset_id: "a", extension: ".mp4", name: "甲.mp4" },
    { asset_id: "b", extension: ".mp4", name: "乙.mp4" },
  ]);
  const view = renderWithProviders(<TVPage />);
  const library = screen.getByRole("button", { name: "影视库", exact: true });
  act(() => library.focus());
  await screen.findByRole("heading", { name: "甲" });
  await waitFor(
    () =>
      expect(
        view.container.querySelector("video.tv-shelf-media"),
      ).toHaveProperty("muted", true),
    { timeout: 2000 },
  );
  fireEvent.keyDown(library, { key: "ArrowUp" });
  fireEvent.keyDown(document.activeElement!, { key: "ArrowRight" });
  expect(screen.getByRole("dialog", { name: "乙预览" })).toBeVisible();
  fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
  expect(library).toHaveFocus();
});
