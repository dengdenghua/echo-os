import { useState } from "react";
import { BrainIcon, FileTextIcon, NetworkIcon } from "lucide-react";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { KnowledgeGraphPanel } from "@/components/workspace/knowledge-graph-panel";
import { MemoryAssetsPanel } from "@/components/workspace/memory-assets-panel";
import { WikiPanel } from "@/components/workspace/wiki-panel";
import {
  WorkspaceBody,
  WorkspaceContainer,
} from "@/components/workspace/workspace-container";
import { canAccessGlobalControlPlane } from "@/core/auth/control-plane-access";
import { useI18n } from "@/core/i18n/hooks";
import { useOptionalAuth } from "@/providers/AuthProvider";

type KnowledgeTab = "graph" | "memory" | "wiki";

export default function KnowledgePage() {
  const { t } = useI18n();
  const auth = useOptionalAuth();
  // The graph is one device-wide store, served only to an account with the
  // cross-tenant scope. The appliance owner is an admin without it, so the
  // tab would only ever answer 403; such accounts start on their own memories.
  const graphAllowed = canAccessGlobalControlPlane(
    auth?.authStatus ?? null,
    auth?.user ?? null,
  );
  const [chosenTab, setChosenTab] = useState<KnowledgeTab | null>(null);
  const activeTab: KnowledgeTab =
    chosenTab && (chosenTab !== "graph" || graphAllowed)
      ? chosenTab
      : graphAllowed
        ? "graph"
        : "memory";
  return (
    <WorkspaceContainer>
      <WorkspaceBody>
        <div className="flex h-full min-h-0 w-full flex-col bg-card">
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-border bg-muted px-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">知识库</div>
              <div className="truncate text-xs text-muted-foreground">
                实体、关系与本地记忆
              </div>
            </div>
            <Tabs
              value={activeTab}
              onValueChange={(value) => setChosenTab(value as KnowledgeTab)}
            >
              <TabsList className="flex h-8 rounded-md bg-transparent p-0">
                {graphAllowed && (
                  <TabsTrigger
                    value="graph"
                    className="h-8 gap-1.5 px-3 text-xs"
                  >
                    <NetworkIcon className="size-3.5" />
                    {t.knowledgeGraph.graph}
                  </TabsTrigger>
                )}
                <TabsTrigger
                  value="memory"
                  className="h-8 gap-1.5 px-3 text-xs"
                >
                  <BrainIcon className="size-3.5" />
                  {t.evolutionDashboard.memories}
                </TabsTrigger>
                <TabsTrigger value="wiki" className="h-8 gap-1.5 px-3 text-xs">
                  <FileTextIcon className="size-3.5" />
                  Wiki
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          <div className="min-h-0 flex-1 overflow-auto border-0 bg-card p-3">
            {activeTab === "graph" && graphAllowed && <KnowledgeGraphPanel />}
            {activeTab === "memory" && <MemoryAssetsPanel />}
            {activeTab === "wiki" && <WikiPanel />}
          </div>
        </div>
      </WorkspaceBody>
    </WorkspaceContainer>
  );
}
