import { AgentAvatarTile } from "@/components/brand/agent-avatar";
import { Badge } from "@/components/ui/badge";
import { getBackendBaseURL } from "@/core/config";

interface AgentMessageHeaderProps {
  agentDisplayName: string;
  avatarUrl?: string;
  icon?: string | null;
  role?: "tl" | "member";
}

export function AgentAvatar({
  agentDisplayName,
  agentId,
  avatarUrl,
  icon,
  className = "h-6 w-6 rounded-lg",
}: {
  agentDisplayName: string;
  agentId?: string | null;
  avatarUrl?: string;
  icon?: string | null;
  className?: string;
}) {
  const backendBase = getBackendBaseURL();
  const fullAvatarUrl = avatarUrl
    ? avatarUrl.startsWith("http")
      ? avatarUrl
      : `${backendBase}${avatarUrl}`
    : null;
  return (
    <AgentAvatarTile
      agentId={agentId}
      name={agentDisplayName}
      avatar={icon}
      imageUrl={fullAvatarUrl}
      className={className}
      label={agentDisplayName}
    />
  );
}

export function AgentMessageHeader({
  agentDisplayName,
  avatarUrl,
  icon,
  role,
}: AgentMessageHeaderProps) {
  return (
    <div className="mt-3 mb-1 flex items-center gap-2 first:mt-0">
      <AgentAvatar
        agentDisplayName={agentDisplayName}
        avatarUrl={avatarUrl}
        icon={icon}
      />
      <span className="text-sm font-semibold">{agentDisplayName}</span>
      {role === "tl" && (
        <Badge
          variant="outline"
          className="border-success/50 bg-success/10 text-success px-1.5 py-0 text-xs leading-4 dark:text-success"
        >
          TL
        </Badge>
      )}
    </div>
  );
}
