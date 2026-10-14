import { HistoryIcon } from "lucide-react";

import { useI18n } from "@/core/i18n/hooks";
import { cn } from "@/lib/utils";
import { useEchoDesktopWindowChrome } from "./embedded-window-bridge";

/** Opens the searchable conversation-history drawer from the chat header. */
export function ChatHeaderMenuButton({
  onClick,
  className,
}: {
  onClick: () => void;
  className?: string;
}) {
  const { t } = useI18n();
  // Inside an Echo OS window the top-left 64px belong to the window controls.
  const echoDesktopOwnsChrome = useEchoDesktopWindowChrome();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={t.codeMode.threadsHistory}
      title={t.codeMode.threadsHistory}
      className={cn(
        "flex size-[42px] shrink-0 items-center justify-center rounded-lg text-muted-foreground sm:size-8",
        "transition-colors duration-base hover:bg-muted hover:text-foreground",
        "outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
        className,
        echoDesktopOwnsChrome && "left-16",
      )}
    >
      <HistoryIcon className="size-4" strokeWidth={2} />
    </button>
  );
}
