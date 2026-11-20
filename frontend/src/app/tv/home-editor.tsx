import { useLayoutEffect, useRef, useState } from "react";
import { entryId, removeEntry, type HomeEntry } from "./home-layout";

export function HomeEditor({
  id,
  layout,
  label,
  close,
  save,
}: {
  id: string;
  layout: HomeEntry[];
  label: (id: string) => string;
  close: () => void;
  save: (layout: HomeEntry[], focus: string) => void;
}) {
  const [mode, setMode] = useState<"menu" | "move" | "create" | "rename">(
    "menu",
  );
  const root = useRef<HTMLDivElement>(null);
  const folder = layout.find(
    (e) => typeof e !== "string" && e.items.includes(id),
  );
  const entry = layout.find((e) => entryId(e) === id);
  const isFolder = entry && typeof entry !== "string";
  const [name, setName] = useState(isFolder ? entry.name : "新文件夹");
  useLayoutEffect(() => {
    root.current?.querySelector<HTMLElement>("input,button")?.focus();
  }, [mode]);
  const doneName = () => {
    const title = name.trim();
    if (!title) return;
    if (mode === "rename" && isFolder) {
      save(
        layout.map((e) => (e === entry ? { ...entry, name: title } : e)),
        id,
      );
    } else {
      const newFolder = {
        id: "folder-" + crypto.randomUUID(),
        name: title,
        items: [id],
      };
      save(
        layout.map((e) => (e === id ? newFolder : e)),
        newFolder.id,
      );
    }
  };
  const button = (title: string, fn: () => void) => (
    <button key={title} data-tv-focus onClick={fn}>
      {title}
    </button>
  );
  return (
    <div
      className="tv-organize"
      role="dialog"
      data-tv-dialog
      aria-modal="true"
      aria-label="整理主屏幕"
      ref={root}
    >
      <div className="tv-organize-panel">
        <h2>{mode === "move" ? "移到此位置" : label(id)}</h2>
        {mode === "menu" && (
          <>
            {button("移动位置", () => setMode("move"))}
            {isFolder ? (
              button("重命名文件夹", () => setMode("rename"))
            ) : (
              <>
                {!folder && button("新建文件夹", () => setMode("create"))}
                {layout.map(
                  (e) =>
                    typeof e !== "string" &&
                    e !== folder &&
                    button("移到「" + e.name + "」", () => {
                      const next = removeEntry(layout, id).map((x) =>
                        typeof x !== "string" && x.id === e.id
                          ? { ...x, items: [...x.items, id] }
                          : x,
                      );
                      save(next, e.id);
                    }),
                )}
                {folder &&
                  button("移回主屏幕", () =>
                    save([...removeEntry(layout, id), id], id),
                  )}
              </>
            )}
          </>
        )}
        {mode === "move" &&
          layout.map((e, index) =>
            button(index + 1 + " · " + label(entryId(e)), () => {
              const next = removeEntry(layout, id);
              next.splice(Math.min(index, next.length), 0, entry ?? id);
              save(next, id);
            }),
          )}
        {(mode === "create" || mode === "rename") && (
          <>
            <input
              data-tv-focus
              aria-label="文件夹名称"
              maxLength={32}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) doneName();
              }}
            />
            {button("完成", doneName)}
          </>
        )}
        <button data-tv-back data-tv-focus onClick={close}>
          取消
        </button>
      </div>
    </div>
  );
}
