import { expect, it, vi } from "vitest";
import { loadTVLibrary, tvAssetContentURL } from "./library";
import { NASRequestError } from "@/core/storage/api";
import * as files from "@/appliance/files";
import type { NASDirectoryEntry, NASSource } from "@/core/storage/api";

const root = {
  source_id: "owned",
  path: "/media",
  recursive: true,
} as NASSource;
const api = () => ({
  listNASFiles: vi.fn().mockResolvedValue([]),
  listNASSources: vi.fn().mockResolvedValue([root]),
  listNASDirectory: vi.fn().mockResolvedValue([]),
  nasResourceId: (entry: Pick<NASDirectoryEntry, "resource_id">) =>
    entry.resource_id ?? undefined,
});

it("streams visible appliance videos if the optional Storage gateway is absent", async () => {
  const source = api();
  source.listNASFiles.mockRejectedValue(new NASRequestError("/v1/files", 503));
  const list = vi.spyOn(files, "listDir").mockResolvedValue({
    path: "",
    entries: [
      {
        name: "旅行 #1.webm",
        path: "旅行 #1.webm",
        kind: "file",
        size: 80,
        mtime: 0,
        resource_id: "owned-video",
      },
    ],
  });
  try {
    const { items } = await loadTVLibrary(undefined, source);
    expect(items[0]).toMatchObject({
      asset_id: "owned-video",
      provider: "appliance",
    });
    expect(tvAssetContentURL(items[0]!)).toContain(
      "/api/appliance/files/download?path=" +
        encodeURIComponent("旅行 #1.webm"),
    );
    source.listNASFiles.mockRejectedValue(
      new NASRequestError("/v1/files", 403),
    );
    await expect(loadTVLibrary(undefined, source)).rejects.toMatchObject({
      status: 403,
    });
    expect(list).toHaveBeenCalledTimes(1);
  } finally {
    list.mockRestore();
  }
});

it("discovers authorized video files when the lightweight plugin has no media index", async () => {
  const source = api();
  source.listNASDirectory.mockImplementation(async (path: string) =>
    path === "/media"
      ? [{ type: "dir", path: "/media/trip" }]
      : [
          {
            type: "file",
            path: "/media/trip/a.webm",
            name: "旅行.webm",
            resource_id: "owned-video",
            size: 10,
          },
          { type: "file", name: "secret.mp4", size: 10 },
          { type: "file", name: "notes.txt", resource_id: "notes", size: 1 },
        ],
  );
  const result = await loadTVLibrary(undefined, source);
  expect(result.items.map((item) => item.asset_id)).toEqual(["owned-video"]);
  expect(result.items[0]?.indexed).toBe(false);
  expect(result.partial).toBe(false);
});

it("bounds recursive discovery and reports partial results", async () => {
  const source = api();
  source.listNASDirectory.mockImplementation(async (path: string) => [
    { type: "dir", path: `${path}/child` },
  ]);
  const result = await loadTVLibrary(undefined, source);
  expect(source.listNASDirectory).toHaveBeenCalledTimes(5);
  expect(result.partial).toBe(true);
});

it.each([2, 9])(
  "reads one shallow batch after a cold root with %i folders",
  async (folderCount) => {
    const source = api();
    let now = 0;
    const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
    let active = 0,
      peak = 0;
    source.listNASDirectory.mockImplementation(async (path: string) => {
      if (path === "/media") {
        now += 6500;
        return Array.from({ length: folderCount }, (_, i) => ({
          type: "dir",
          path: `/media/${i}`,
        }));
      }
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      return path === "/media/0"
        ? [
            {
              type: "file",
              path: "/media/0/落日.webm",
              name: "落日.webm",
              resource_id: "sunset",
            },
          ]
        : [];
    });
    try {
      const result = await loadTVLibrary(undefined, source);
      expect(result.items.map((item) => item.asset_id)).toEqual(["sunset"]);
      expect(result.partial).toBe(folderCount > 4);
      expect(source.listNASDirectory).toHaveBeenCalledTimes(
        1 + Math.min(folderCount, 4),
      );
      expect(peak).toBe(Math.min(folderCount, 4));
    } finally {
      clock.mockRestore();
    }
  },
);

it("retains the directory and item caps across parallel discovery", async () => {
  const source = api();
  source.listNASDirectory.mockImplementation(async (path: string) =>
    path === "/media"
      ? Array.from({ length: 30 }, (_, i) => ({
          type: "dir",
          path: `/media/${i}`,
        }))
      : [],
  );
  expect((await loadTVLibrary(undefined, source)).partial).toBe(true);
  expect(source.listNASDirectory).toHaveBeenCalledTimes(20);
  source.listNASDirectory
    .mockClear()
    .mockImplementation(async (path: string) =>
      path === "/media"
        ? [
            { type: "dir", path: "/media/one" },
            { type: "dir", path: "/media/two" },
          ]
        : Array.from({ length: 75 }, (_, i) => ({
            type: "file",
            name: i + ".mp4",
            path: path + "/" + i + ".mp4",
            resource_id: path + "#" + i,
          })),
    );
  const result = await loadTVLibrary(undefined, source);
  expect(result.items).toHaveLength(100);
  expect(result.partial).toBe(true);
});

it("stops walking on cancellation and respects non-recursive sources", async () => {
  const source = api();
  source.listNASSources.mockResolvedValue([{ ...root, recursive: false }]);
  source.listNASDirectory.mockResolvedValue([
    { type: "dir", path: "/media/child" },
  ]);
  await loadTVLibrary(undefined, source);
  expect(source.listNASDirectory).toHaveBeenCalledTimes(1);
  const controller = new AbortController();
  controller.abort();
  await expect(loadTVLibrary(controller.signal, source)).rejects.toMatchObject({
    name: "AbortError",
  });
  expect(source.listNASDirectory).toHaveBeenCalledTimes(1);
});
