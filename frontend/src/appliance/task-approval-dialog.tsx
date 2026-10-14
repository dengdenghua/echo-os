import { ShieldCheckIcon } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import type { ApprovalConsent } from "./task-approval-consent";
import { approvalOperation } from "./task-presentation";

export { approvalOperation };

export function TaskApprovalDialog({
  consent,
  busy,
  onCancel,
  onConfirm,
}: {
  consent: ApprovalConsent;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useRef<HTMLElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  useEffect(() => {
    // 提交中按钮被禁用会让焦点掉到 body；把焦点留在对话框里，Tab 才不会跑到背后的窗口。
    const dialog = dialogRef.current;
    if (busy && dialog && !dialog.contains(document.activeElement))
      dialog.focus();
  }, [busy]);
  const reason = consent.task.approval?.reason;
  return (
    <div className="absolute inset-0 z-30 grid place-items-center bg-slate-950/30 p-5 backdrop-blur-sm">
      <section
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-label="确认审批决定"
        tabIndex={-1}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            if (!busy) onCancel();
          }
          if (event.key === "Tab") {
            const buttons =
              event.currentTarget.querySelectorAll<HTMLButtonElement>(
                "button:not(:disabled)",
              );
            const first = buttons[0],
              last = buttons[buttons.length - 1];
            if (!first) {
              event.preventDefault();
            } else if (
              event.shiftKey &&
              (document.activeElement === first ||
                document.activeElement === event.currentTarget)
            ) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }
        }}
        className="w-full max-w-sm rounded-2xl border border-border bg-card p-5 shadow-2xl outline-none"
      >
        <div className="flex items-start gap-3">
          <ShieldCheckIcon className="size-8 shrink-0 text-warning" />
          <div>
            <h2 className="text-sm font-semibold text-foreground">
              {consent.approved ? "批准这个操作？" : "拒绝这个操作？"}
            </h2>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {consent.task.title}
            </p>
            <p className="text-xs leading-5 text-muted-foreground">
              {approvalOperation(consent.task)}
            </p>
            {reason && (
              <p className="text-xs leading-5 text-muted-foreground">
                {reason}
              </p>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            ref={cancelRef}
            onClick={onCancel}
            disabled={busy}
            className="rounded-lg border border-border px-3 py-2 text-xs"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={cn(
              "rounded-lg px-3 py-2 text-xs font-semibold text-primary-foreground disabled:opacity-60",
              // Approve is the view's one monochrome primary action; reject is a breach.
              consent.approved ? "bg-primary" : "bg-breach",
            )}
          >
            {busy ? "提交中…" : "确认"}
          </button>
        </div>
      </section>
    </div>
  );
}
