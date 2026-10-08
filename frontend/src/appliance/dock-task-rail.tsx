/**
 * Dock 任务轨：把还没结束的 Agent 任务放进 Dock，和应用并列。
 *
 * 桌面上的任务卡片在窗口之下，一开窗口就被挡住；Dock 永远在最上层，
 * 所以进度和"等你批准"在这里始终可见。点击等你处理的任务进入任务空间，
 * 其余任务直接打开它所在的会话。
 */

import { cn } from "@/lib/utils";

import { DockItem } from "./dock";
import type { EchoTaskProjection } from "./task-space";
import {
  selectLiveTasks,
  taskNeedsUser,
  taskProgress,
  taskStatusView,
} from "./task-presentation";

const RAIL_LIMIT = 3;
const RING_RADIUS = 21;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
/** 进度未知时显示一段转动的弧，表示"在做，但没有汇报进度"。 */
const INDETERMINATE_ARC = 0.28;

export interface DockTaskAgent {
  id: string;
  name: string;
  icon?: string | null;
}

export function DockTaskRail({
  tasks,
  agents,
  onOpenTask,
  onOpenTaskSpace,
}: {
  tasks: readonly EchoTaskProjection[] | undefined;
  agents: readonly DockTaskAgent[];
  onOpenTask: (task: EchoTaskProjection) => void;
  onOpenTaskSpace: (taskId?: string) => void;
}) {
  if (!tasks) return null;
  const live = selectLiveTasks(tasks);
  if (live.length === 0) return null;
  const shown = live.slice(0, RAIL_LIMIT);
  const hidden = live.length - shown.length;
  const agentById = new Map(agents.map((agent) => [agent.id, agent]));

  return (
    <>
      <span className="mac-dock-separator" />
      {shown.map((task) => {
        const agent = agentById.get(task.agentId ?? "general");
        const agentName = agent?.name ?? task.agentId ?? "Echo";
        const status = taskStatusView(task);
        const progress = taskProgress(task);
        const needsUser = taskNeedsUser(task);
        const indeterminate = status.tone === "active" && progress == null;
        // 没有进度时不画一段看起来像百分比的静止弧：等你处理的画满一圈
        // 琥珀色，进行中的画一段转动的弧，暂停的只留底环。
        const filled =
          progress != null
            ? Math.max(progress, 4) / 100
            : needsUser
              ? 1
              : indeterminate
                ? INDETERMINATE_ARC
                : 0;
        const label = `${agentName}：${task.title} · ${status.label}${
          status.tone === "active" && progress != null ? ` ${progress}%` : ""
        }`;
        return (
          <DockItem
            key={`task:${task.id}`}
            title={label}
            running={status.tone === "active"}
            onClick={() =>
              needsUser || !task.threadId
                ? onOpenTaskSpace(task.id)
                : onOpenTask(task)
            }
          >
            <span
              data-dock-task={task.id}
              className={cn(
                "mac-dock-task",
                `is-${status.tone}`,
                indeterminate && "is-indeterminate",
              )}
            >
              <svg
                viewBox="0 0 48 48"
                aria-hidden
                className="mac-dock-task-ring"
              >
                <circle
                  cx="24"
                  cy="24"
                  r={RING_RADIUS}
                  className="mac-dock-task-ring-track"
                />
                <circle
                  cx="24"
                  cy="24"
                  r={RING_RADIUS}
                  className="mac-dock-task-ring-value"
                  strokeDasharray={RING_CIRCUMFERENCE}
                  strokeDashoffset={RING_CIRCUMFERENCE * (1 - filled)}
                />
              </svg>
              <span className="mac-dock-task-glyph" aria-hidden>
                {agent?.icon ?? "✦"}
              </span>
              {needsUser && (
                <span className="mac-dock-task-badge" aria-hidden>
                  !
                </span>
              )}
            </span>
          </DockItem>
        );
      })}
      {hidden > 0 && (
        <DockItem
          title={`还有 ${hidden} 个进行中的任务 · 打开任务空间`}
          onClick={() => onOpenTaskSpace()}
        >
          <span className="mac-dock-task is-more">+{hidden}</span>
        </DockItem>
      )}
    </>
  );
}
