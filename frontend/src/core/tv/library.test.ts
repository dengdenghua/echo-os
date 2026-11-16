import { expect, it, vi } from "vitest";
import { loadTVLibrary } from "./library";
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
