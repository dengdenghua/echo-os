/**
 * AvatarCell — extracted from `workspace-sidebar.tsx` (P3 decomposition).
 * One agent's cell in a thread avatar: the agent's image, the ECHO mark for
 * the default Echo agent, or a monogram tile when the image is missing.
 */
import { AgentAvatarTile } from "@/components/brand/agent-avatar";
import { withAgentAvatarVersion } from "@/core/agents/avatar";
import { getBackendBaseURL } from "@/core/config";
import { cn } from "@/lib/utils";

export function AvatarCell({
  agentId,
  className,
}: {
  agentId: string;
  className?: string;
}) {
  return (
    <span
      title={agentId}
      className={cn("inline-flex shrink-0 overflow-hidden", className)}
    >
      <AgentAvatarTile
        agentId={agentId}
        name={agentId}
        imageUrl={withAgentAvatarVersion(
          `${getBackendBaseURL()}/api/agents/${encodeURIComponent(agentId)}/avatar`,
        )}
        className="size-full rounded-none shadow-none"
      />
    </span>
  );
}
