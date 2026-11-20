export type Folder = { id: string; name: string; items: string[] };
export type HomeEntry = string | Folder;
export const entryId = (entry: HomeEntry) =>
  typeof entry === "string" ? entry : entry.id;

export function readHomeLayout(key: string, defaults: string[]): HomeEntry[] {
  const seen = new Set<string>();
  const take = (id: unknown): id is string => {
    if (typeof id !== "string" || seen.has(id) || !defaults.includes(id))
      return false;
    seen.add(id);
    return true;
  };
  const entries: HomeEntry[] = [];
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) || "[]");
    if (Array.isArray(saved)) {
      for (const value of saved) {
        if (take(value)) entries.push(value);
        else if (
          value &&
          typeof value.id === "string" &&
          /^folder-[\w-]+$/.test(value.id) &&
          !seen.has(value.id) &&
          typeof value.name === "string" &&
          Array.isArray(value.items)
        ) {
          const items = value.items.filter(take);
          if (items.length) {
            seen.add(value.id);
            entries.push({ id: value.id, name: value.name, items });
          }
        }
      }
    }
  } catch {
    /* Use the default grid if storage is unavailable. */
  }
  return [...entries, ...defaults.filter((id) => !seen.has(id))];
}

export function removeEntry(layout: HomeEntry[], id: string): HomeEntry[] {
  return layout.flatMap<HomeEntry>((entry) => {
    if (entryId(entry) === id) return [];
    if (typeof entry === "string") return [entry];
    const items = entry.items.filter((item) => item !== id);
    return items.length ? [{ ...entry, items }] : [];
  });
}
