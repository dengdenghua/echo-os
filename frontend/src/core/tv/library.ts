import {
  listNASFiles,
  listNASSources,
  listNASDirectory,
  nasResourceId,
  type NASFileAsset,
} from "@/core/storage/api";

const VIDEO_EXTENSIONS = new Set([
  "mp4",
  "m4v",
  "webm",
  "mkv",
  "mov",
  "avi",
  "mpeg",
  "mpg",
  "ts",
  "m2ts",
]);
export type TVLibrary = { items: NASFileAsset[]; partial: boolean };
const api = { listNASFiles, listNASSources, listNASDirectory, nasResourceId };

/** The lightweight storage plugin has no semantic media index. Its authorized
 * directory API still provides real file identities and streaming permissions.
 * Bound discovery by items, directories, depth and time; never read movie blobs.
 */
export async function loadTVLibrary(
  signal?: AbortSignal,
  source = api,
): Promise<TVLibrary> {
  const check = () => {
    if (signal?.aborted) throw new DOMException("Cancelled", "AbortError");
  };
  const indexed = await source.listNASFiles("video", 100);
  check();
  if (indexed.length) return { items: indexed, partial: indexed.length >= 100 };
  const sources = await source.listNASSources();
  check();
  const queue = sources.map((item) => ({
    path: item.path,
    source: item,
    depth: 0,
  }));
  const visited = new Set<string>(),
    seen = new Set<string>(),
    items: NASFileAsset[] = [];
  const deadline = Date.now() + 5000;
  let partial = false,
    successful = 0;
  while (
    queue.length &&
    visited.size < 20 &&
    items.length < 100 &&
    Date.now() < deadline
  ) {
    check();
    const current = queue.shift()!;
    if (visited.has(current.path)) continue;
    visited.add(current.path);
    try {
      const entries = await source.listNASDirectory(current.path);
      check();
      successful++;
      if (entries.length >= 1000) partial = true;
      for (const entry of entries) {
        if (entry.type === "dir") {
          if (current.source.recursive && current.depth < 4)
            queue.push({
              ...current,
              path: entry.path,
              depth: current.depth + 1,
            });
          else if (current.source.recursive) partial = true;
          continue;
        }
        const extension = entry.name.split(".").at(-1)?.toLowerCase() ?? "";
        const id = source.nasResourceId(entry);
        if (!VIDEO_EXTENSIONS.has(extension) || !id || seen.has(id)) continue;
        seen.add(id);
        items.push({
          asset_id: id,
          resource_id: id,
          source_id: entry.source_id ?? current.source.source_id,
          name: entry.name,
          path: entry.path,
          extension: `.${extension}`,
          kind: "video",
          size: entry.size ?? 0,
          mtime_ns: 0,
          indexed: false,
        });
        if (items.length >= 100) {
          partial = true;
          break;
        }
      }
    } catch (error) {
      check();
      partial = true;
      if (queue.length === 0 && successful === 0) throw error;
    }
  }
  return { items, partial: partial || queue.length > 0 };
}
