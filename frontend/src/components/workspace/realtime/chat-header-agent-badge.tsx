/**
 * ChatHeaderAgentBadge — extracted from `workspace/realtime/[thread_id]/page.tsx`
 * (P3 decomposition). Behavior-preserving move.
 */
import { AgentAvatarTile } from "@/components/brand/agent-avatar";
import type { useAgent } from "@/core/agents";
import { getAssistantDisplayName } from "@/core/agents/assistant-naming";
import { withAgentAvatarVersion } from "@/core/agents/avatar";
import { getBackendBaseURL } from "@/core/config";
import { cn } from "@/lib/utils";

import type { ChatCollaborationRosterEntry } from "./task-collaborator-control";

export function ChatHeaderAgentBadge({
  agent,
  agentId,
  collaborators,
}: {
  agent: ReturnType<typeof useAgent>["agent"];
  agentId: string;
  collaborators?: ChatCollaborationRosterEntry[];
}) {
  const label =
    agentId === "echo"
      ? getAssistantDisplayName()
      : agent?.display_name?.trim() || agent?.name?.trim() || agentId;
  const icon = agent?.icon?.trim() || "";
  const avatarUrl = agent?.avatar_url
    ? withAgentAvatarVersion(
        agent.avatar_url.startsWith("http://") ||
          agent.avatar_url.startsWith("https://")
          ? agent.avatar_url
          : `${getBackendBaseURL()}${agent.avatar_url}`,
      )
    : "";

  const resolveAvatarUrl = (url?: string | null): string => {
    if (!url) return "";
    return withAgentAvatarVersion(
      url.startsWith("http://") || url.startsWith("https://")
        ? url
        : `${getBackendBaseURL()}${url}`,
    );
  };

  // Multi-agent mode: show avatars side by side
  if (collaborators && collaborators.length > 1) {
    const displayAgents = collaborators.slice(0, 4);
    const extraCount = collaborators.length - displayAgents.length;
    const displayLabel =
      collaborators.length === 2
        ? collaborators.map((a) => a.display_name).join("、")
        : `${collaborators[0]?.display_name || label} 等${collaborators.length}人`;
    return (
      <div
        className="inline-flex h-8 max-w-[220px] shrink-0 items-center gap-1.5 px-1.5 text-xs text-foreground/88"
        title={collaborators.map((a) => a.display_name).join("、")}
      >
        <span className="flex items-center -space-x-1.5">
          {displayAgents.map((collab, index) => (
            <span
              key={collab.agent_id}
              className={cn(
                "flex size-5 shrink-0 overflow-hidden rounded-full border-2 border-background bg-muted",
                index === 0 && "z-30",
                index === 1 && "z-20",
                index === 2 && "z-10",
              )}
            >
              <AgentAvatarTile
                agentId={collab.agent_id}
                name={collab.display_name || collab.name}
                avatar={collab.icon}
                imageUrl={resolveAvatarUrl(collab.avatar_url)}
                className="size-4 rounded-full"
              />
            </span>
          ))}
          {extraCount > 0 && (
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] font-semibold text-muted-foreground z-0">
              +{extraCount}
            </span>
          )}
        </span>
        <span className="truncate">{displayLabel}</span>
      </div>
    );
  }

  if (!label || label === "general") return null;
  return (
    <div
      className="inline-flex h-8 max-w-[180px] shrink-0 items-center gap-1.5 px-1.5 text-xs text-foreground/88"
      title={label}
    >
      <AgentAvatarTile
        agentId={agentId}
        name={label}
        avatar={icon}
        imageUrl={avatarUrl}
        className="size-5 rounded-full"
      />
      <span className="truncate">{label}</span>
    </div>
  );
}
