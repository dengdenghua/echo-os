import {
  FolderKanbanIcon,
  MoreHorizontalIcon,
  PanelRightOpenIcon,
  UnlinkIcon,
} from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useI18n } from "@/core/i18n/hooks";
import { ProjectIcon } from "@/core/projects/project-icons";
import { cn } from "@/lib/utils";

const PROJECT_STATUS_DOT: Record<string, string> = {
  planning: "bg-warning",
  running: "bg-core",
  blocked: "bg-warning",
  done: "bg-primary",
  failed: "bg-destructive",
};

/** A lightweight Project OS capability marker for a normal work group.
 *
 * Project/member identity deliberately stays out of this component: the
 * canonical group title, roster, invitations, chat and AI participation live
 * in the shared header. This marker only opens or detaches the workbench.
 */
export function ProjectGroupHeaderBadge({
  name,
  status,
  icon,
  onOpenWorkbench,
  canDetach = false,
  onDetach,
  isDetaching = false,
}: {
  name: string;
  status?: string;
  /** Icon id picked when the project was created; omitted keeps the kanban mark. */
  icon?: string | null;
  onOpenWorkbench: () => void;
  canDetach?: boolean;
  onDetach?: () => void;
  isDetaching?: boolean;
}) {
  const { t } = useI18n();
  const copy = t.projectCapability;
  const safeName = name.trim();
  const safeStatus = status?.trim().toLowerCase() || "planning";
  const statusLabel =
    safeStatus === "running"
      ? copy.statusRunning
      : safeStatus === "blocked"
        ? copy.statusBlocked
        : safeStatus === "done"
          ? copy.statusDone
          : safeStatus === "failed"
            ? copy.statusFailed
            : copy.statusPlanning;

  return (
    <div
      data-testid="project-capability-badge"
      className="inline-flex min-w-0 shrink-0 items-center rounded-md border border-primary/15 bg-primary/[0.06] text-primary"
    >
      <button
        type="button"
        data-slot="project-capability-button"
        onClick={onOpenWorkbench}
        aria-label={`${copy.openWorkbench}：${safeName}`}
        title={`${copy.openWorkbench}：${safeName}`}
        className="inline-flex h-7 min-w-0 max-w-52 items-center gap-1.5 rounded-l-md px-2 text-xs font-medium transition-colors hover:bg-primary/10"
      >
        <ProjectIcon
          icon={icon}
          fallback={FolderKanbanIcon}
          data-slot="project-capability-icon"
          className="size-3.5 shrink-0"
        />
        <span data-slot="project-capability-label" className="truncate">
          {copy.enabled}
        </span>
        <span data-slot="project-capability-separator" aria-hidden="true">
          ·
        </span>
        <span
          className={cn(
            "size-1.5 shrink-0 rounded-full",
            PROJECT_STATUS_DOT[safeStatus] || "bg-muted-foreground/55",
          )}
        />
        <span className="truncate text-foreground/70">{statusLabel}</span>
      </button>

      {canDetach && onDetach ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={`${copy.moreActions}：${safeName}`}
              title={copy.moreActions}
              disabled={isDetaching}
              className="flex size-7 shrink-0 items-center justify-center border-l border-primary/15 text-primary/75 transition-colors hover:bg-primary/10 hover:text-primary disabled:cursor-wait disabled:opacity-50"
            >
              {isDetaching ? (
                <span className="size-3 animate-spin rounded-full border border-current border-t-transparent" />
              ) : (
                <MoreHorizontalIcon className="size-3.5" />
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52">
            <DropdownMenuItem onSelect={onOpenWorkbench}>
              <PanelRightOpenIcon />
              <span>{copy.openWorkbench}</span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              disabled={isDetaching}
              onSelect={onDetach}
            >
              <UnlinkIcon />
              <span>{copy.detach}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}
