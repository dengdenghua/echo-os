import { useRef, useState } from "react";
import { useTVDialogFocus } from "./use-tv-focus";

export function useTVAction() {
  const running = useRef(false);
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const run = async (work: () => Promise<unknown>, done = "已保存") => {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await work();
      setMessage(done);
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作失败，请重试");
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return {
    busy,
    run,
    feedback: (
      <>
        {error && (
          <p role="alert" className="tv-error">
            {error}
          </p>
        )}
        {message && <p role="status">{message}</p>}
      </>
    ),
  };
}

export function TVConfirm({
  title,
  children,
  onCancel,
  onConfirm,
  busy,
}: {
  title: string;
  children: React.ReactNode;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useTVDialogFocus(root);
  return (
    <div className="tv-confirm-backdrop">
      <section
        ref={root}
        data-tv-dialog
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="tv-confirm"
      >
        <h2>{title}</h2>
        <p>{children}</p>
        <div className="tv-actions">
          <button data-tv-focus data-tv-back disabled={busy} onClick={onCancel}>
            取消
          </button>
          <button data-tv-focus disabled={busy} onClick={onConfirm}>
            确认
          </button>
        </div>
      </section>
    </div>
  );
}
