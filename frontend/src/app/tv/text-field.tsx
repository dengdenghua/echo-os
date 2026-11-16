import { useRef, useState } from "react";
import dictionary from "@/core/tv/pinyin-dictionary.json";
import { useTVDialogFocus } from "./use-tv-focus";

export function TVKeyboard({
  value,
  label,
  secret,
  maxLength = 4000,
  onDone,
  onClose,
}: {
  value: string;
  label: string;
  secret?: boolean;
  maxLength?: number;
  onDone: (text: string) => void;
  onClose: () => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState(value),
    [mode, setMode] = useState<"abc" | "ABC" | "中文" | "符号">("abc");
  const [composition, setComposition] = useState(""),
    [page, setPage] = useState(0);
  useTVDialogFocus(root);
  const choices = Array.from(
    (dictionary as Record<string, string>)[composition] ?? "",
  );
  const keys =
    mode === "符号"
      ? Array.from("0123456789-_=+/@.:,?!#%&*()[]{}\\|~`'\";$<>^")
      : Array.from(
          mode === "ABC"
            ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
            : "abcdefghijklmnopqrstuvwxyz",
        );
  const append = (text: string) =>
    setDraft((current) => (current + text).slice(0, maxLength));
  const key = (text: string) => {
    if (mode === "中文" && /^[a-z]$/.test(text)) {
      setComposition((v) => (v + text).slice(0, 8));
      setPage(0);
    } else append(text);
  };
  return (
    <div className="tv-keyboard-backdrop">
      <section
        ref={root}
        data-tv-dialog
        role="dialog"
        aria-modal="true"
        aria-label={`${label}屏幕键盘`}
        className="tv-keyboard"
      >
        <header>
          <button data-tv-focus data-tv-back onClick={onClose}>
            取消输入
          </button>
          <h2>{label}</h2>
          <button
            data-tv-focus
            className="tv-primary"
            disabled={Boolean(composition)}
            onClick={() => onDone(draft)}
          >
            完成输入
          </button>
        </header>
        <output aria-label="键盘草稿" className="tv-keyboard-draft">
          {secret ? "•".repeat(draft.length) : draft || "开始输入…"}
        </output>
        <div className="tv-actions">
          {(["abc", "ABC", "中文", "符号"] as const).map((m) => (
            <button
              data-tv-focus
              aria-pressed={mode === m}
              key={m}
              onClick={() => {
                setMode(m);
                setComposition("");
                setPage(0);
              }}
            >
              {m}
            </button>
          ))}
          <button
            data-tv-focus
            onClick={() => {
              if (composition) setComposition((v) => v.slice(0, -1));
              else setDraft((v) => Array.from(v).slice(0, -1).join(""));
              setPage(0);
            }}
          >
            退格
          </button>
          <button data-tv-focus onClick={() => append(" ")}>
            空格
          </button>
          <button
            data-tv-focus
            onClick={() => {
              setDraft("");
              setComposition("");
            }}
          >
            清空
          </button>
        </div>
        {mode === "中文" && (
          <section className="tv-candidates" aria-label="拼音候选">
            <span>{composition || "逐字输入拼音（ü 用 v）"}</span>
            {choices.slice(page * 8, page * 8 + 8).map((char) => (
              <button
                key={char}
                data-tv-focus
                onClick={() => {
                  append(char);
                  setComposition("");
                  setPage(0);
                }}
              >
                {char}
              </button>
            ))}
            <button
              data-tv-focus
              disabled={!page}
              onClick={() => setPage((p) => p - 1)}
            >
              上一页
            </button>
            <button
              data-tv-focus
              disabled={(page + 1) * 8 >= choices.length}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
            {composition && !choices.length && (
              <span>继续输入或退格修改拼音</span>
            )}
          </section>
        )}
        <div className="tv-key-grid">
          {keys.map((char) => (
            <button
              data-tv-focus
              key={char}
              aria-label={`键 ${char}`}
              onClick={() => key(char)}
            >
              {char}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

export function TVTextField({
  label,
  value,
  onChange,
  secret = false,
  multiline = false,
  maxLength = 4000,
  placeholder = "",
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  secret?: boolean;
  multiline?: boolean;
  maxLength?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const props = {
    "data-tv-focus": true,
    "aria-label": label,
    value,
    disabled,
    maxLength,
    placeholder,
    onChange: (
      event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => onChange(event.target.value),
    onKeyDown: (event: React.KeyboardEvent) => {
      if (
        event.key === "Enter" &&
        !event.nativeEvent.isComposing &&
        !event.shiftKey
      ) {
        event.preventDefault();
        setEditing(true);
      }
    },
  };
  return (
    <div className="tv-field">
      <label>{label}</label>
      <div className="tv-field-row">
        {multiline ? (
          <textarea {...props} />
        ) : (
          <input
            {...props}
            type={secret ? "password" : "text"}
            autoComplete="off"
          />
        )}
        <button
          data-tv-focus
          disabled={disabled}
          aria-label={`输入${label}`}
          onClick={() => setEditing(true)}
        >
          键盘
        </button>
      </div>
      {editing && (
        <TVKeyboard
          label={label}
          value={value}
          secret={secret}
          maxLength={maxLength}
          onClose={() => setEditing(false)}
          onDone={(text) => {
            onChange(text);
            setEditing(false);
          }}
        />
      )}
    </div>
  );
}
