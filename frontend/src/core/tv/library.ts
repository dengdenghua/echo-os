import {
  listNASFiles,
  listNASSources,
  listNASDirectory,
  nasResourceId,
  getNASFileContentURL,
  isNASConnectivityError,
  NASRequestError,
  type NASFileAsset,
  type NASDirectoryEntry,
  type NASSource,
} from "@/core/storage/api";
import { getBackendBaseURL } from "@/core/config";
import { listDir } from "@/appliance/files";

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
export type TVLibraryAsset = NASFileAsset & { provider?: "appliance" };
export type TVLibrary = { items: TVLibraryAsset[]; partial: boolean };
const api = { listNASFiles, listNASSources, listNASDirectory, nasResourceId };

export function tvAssetContentURL(asset: TVLibraryAsset): string {
  return asset.provider === "appliance"
    ? `${getBackendBaseURL()}/api/appliance/files/download?path=${encodeURIComponent(asset.path)}`
    : getNASFileContentURL(asset.asset_id);
}

async function applianceDirectory(path: string): Promise<NASDirectoryEntry[]> {
  const { entries } = await listDir(path);
  return entries.map((file) => ({
    path: file.path,
    name: file.name,
    type: file.kind,
    size: file.size,
    resource_id: file.resource_id,
  }));
}

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
  check();
  let sources: Pick<NASSource, "source_id" | "path" | "recursive">[];
  let appliance = false;
  try {
    const indexed = await source.listNASFiles("video", 100);
    check();
    if (indexed.length)
      return { items: indexed, partial: indexed.length >= 100 };
    sources = await source.listNASSources();
  } catch (error) {
    check();
    if (
      !(error instanceof NASRequestError && error.status === 404) &&
      !isNASConnectivityError(error)
    )
      throw error;
    // The preview and standalone appliance can run without the Storage plugin.
    // Its own directory and Range routes enforce this account's file permissions.
    sources = [{ source_id: "appliance", path: "", recursive: true }];
    appliance = true;
  }
  check();
  const queue = sources.map((item) => ({
    path: item.path,
    source: item,
    depth: 0,
  }));
  const visited = new Set<string>(),
    seen = new Set<string>(),
    items: TVLibraryAsset[] = [];
  const deadline = Date.now() + 5000;
  let partial = false;
  let successful = 0;
  let startedFirstLevel = false;
  let failure: PromiseRejectedResult | undefined;
  while (queue.length && visited.size < 20 && items.length < 100) {
    check();
    const depth = queue[0]!.depth;
    // A cold root can consume the entire time budget before exposing any of its
    // media folders. Allow one bounded batch of its children in that case.
    if (Date.now() >= deadline && (depth !== 1 || startedFirstLevel)) break;
    const batch = [];
    while (queue[0]?.depth === depth && batch.length < 4 && visited.size < 20) {
      const current = queue.shift()!;
      if (visited.has(current.path)) continue;
      visited.add(current.path);
      batch.push(current);
    }
    if (batch.length === 0) continue;
    if (depth === 1) startedFirstLevel = true;
    const listings = await Promise.allSettled(
      batch.map(({ path }) =>
        appliance ? applianceDirectory(path) : source.listNASDirectory(path),
      ),
    );
    check();
    for (const [index, listing] of listings.entries()) {
      if (listing.status === "rejected") {
        failure = listing;
        partial = true;
        continue;
      }
      const current = batch[index]!;
      const entries = listing.value;
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
          ...(appliance && { provider: "appliance" }),
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
      if (items.length >= 100) break;
    }
  }
  if (!successful && failure) throw failure.reason;
  return { items, partial: partial || queue.length > 0 };
}
