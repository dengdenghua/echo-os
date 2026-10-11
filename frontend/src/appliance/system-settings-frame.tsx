import { useRef, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";

import { useInSystemAppWindow } from "./system-app-window";

/** Keep the standalone settings dialog while giving desktop windows inline content. */
export function SystemSettingsFrame({
  onClose,
  blocked,
  nestedApprovalOpen,
  children,
}: {
  onClose: () => void;
  blocked: boolean;
  nestedApprovalOpen: boolean;
  children: ReactNode;
}) {
  const inWindow = useInSystemAppWindow();
  const returnFocusRef = useRef<HTMLElement | null>(null);
  if (inWindow) {
    return (
      <section
        aria-label="系统设置"
        className="flex h-full min-h-0 flex-col overflow-hidden bg-[#f4f4f5]/95 text-slate-900 md:flex-row"
      >
        {children}
      </section>
    );
  }
  return (
    <Dialog.Root open onOpenChange={(next) => !next && !blocked && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/20 backdrop-blur-[4px]" />
        <Dialog.Content
          onOpenAutoFocus={() => {
            returnFocusRef.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            returnFocusRef.current?.focus();
          }}
          aria-describedby={undefined}
          onEscapeKeyDown={(event) => {
            if (blocked) event.preventDefault();
            if (!nestedApprovalOpen) event.stopPropagation();
          }}
          className="fixed left-1/2 top-1/2 z-[81] flex h-[min(740px,calc(100dvh-48px))] w-[min(1180px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[22px] border border-white/70 bg-[#f4f4f5]/95 text-slate-900 shadow-[0_30px_90px_rgba(15,23,42,0.38)] outline-none md:flex-row"
          data-desktop-interactive
        >
          <Dialog.Title className="sr-only">系统设置</Dialog.Title>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
