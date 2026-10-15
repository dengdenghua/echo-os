import { ChevronDownIcon } from "lucide-react";
import type { Agent } from "@/core/agents/types";
import {
  isPrimaryPersonaAgentId,
  WHITE_GHOST_AGENT_ORDER,
} from "@/core/agents/persona-policy";
import { emitAgentChanged } from "@/core/events";
import { useI18n } from "@/core/i18n/hooks";
import { AgentAvatarTile } from "@/components/brand/agent-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

/**
 * The personas the browser assistant can switch to, in squad order. ECHO OS
 * keeps the stable agent ids (`general`, `coder`, …), so no alias mapping is
 * needed here.
 */
export function browserPersonaRoster(agents: Agent[]): Agent[] {
  const rank = new Map<string, number>(
    WHITE_GHOST_AGENT_ORDER.map((id, index) => [id, index]),
  );
  const seen = new Set<string>();
  return agents
    .filter((agent) => isPrimaryPersonaAgentId(agent.name))
    .filter((agent) => {
      if (seen.has(agent.name)) return false;
      seen.add(agent.name);
      return true;
    })
    .sort(
      (left, right) =>
        (rank.get(left.name) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(right.name) ?? Number.MAX_SAFE_INTEGER),
    );
}

export function BrowserAgentPicker({
  activeAgent,
  agents,
  activeAgentId,
}: {
  activeAgent: Agent | null;
  agents: Agent[];
  activeAgentId: string;
}) {
  const { t } = useI18n();
  const resolvedAgent =
    activeAgent ?? agents.find((item) => item.name === activeAgentId) ?? null;
  const display =
    resolvedAgent?.display_name || resolvedAgent?.name || activeAgentId;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${t.sidebar.switchAgent} · ${display}`}
          className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-md px-1.5 py-1 text-sm font-medium hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <AgentAvatarTile
            agentId={resolvedAgent?.name ?? activeAgentId}
            name={display}
            avatar={resolvedAgent?.icon}
            className="size-6 rounded-md"
          />
          <span className="max-w-32 truncate">{display}</span>
          <ChevronDownIcon className="size-3 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        sideOffset={5}
        className="w-64 max-w-[calc(100vw-24px)]"
      >
        <DropdownMenuLabel className="px-2 py-1.5 text-xs font-normal text-muted-foreground">
          {t.sidebar.switchAgent}
        </DropdownMenuLabel>
        {agents.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">
            {t.browser.assistant.noAgents}
          </div>
        ) : (
          agents.map((agent) => {
            const active = agent.name === activeAgentId;
            const name = agent.display_name || agent.name;
            return (
              <DropdownMenuItem
                key={agent.name}
                aria-current={active ? "true" : undefined}
                onSelect={() => {
                  if (isPrimaryPersonaAgentId(agent.name))
                    emitAgentChanged(agent.name);
                }}
                className={cn(
                  "my-0.5 min-h-11 gap-2.5 rounded-md px-2",
                  active && "bg-foreground/[0.065]",
                )}
              >
                <AgentAvatarTile
                  agentId={agent.name}
                  name={name}
                  avatar={agent.icon}
                  className="size-7 rounded-md"
                />
                <span className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "block truncate text-xs",
                      active && "font-medium",
                    )}
                  >
                    {name}
                  </span>
                  {agent.description ? (
                    <span className="block truncate text-xs text-muted-foreground">
                      {agent.description}
                    </span>
                  ) : null}
                </span>
              </DropdownMenuItem>
            );
          })
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
