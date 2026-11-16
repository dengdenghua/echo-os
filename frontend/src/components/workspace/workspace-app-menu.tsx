import * as Dialog from "@radix-ui/react-dialog";
import {
  DatabaseIcon,
  HomeIcon,
  MoreHorizontalIcon,
  StoreIcon,
  UserRoundPenIcon,
  XIcon,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import {
  isMainConversationRoute,
  useConversationHomeRoute,
} from "@/core/workspace/knowledge-application";
import { preserveWorkbenchPresentation } from "@/core/router/desktop-workspace-route";
import { useI18n } from "@/core/i18n/hooks";
import { useActiveAgentId } from "@/core/agents/active";
import {
  MODULE_CATALOG,
  MODULE_GROUP_LABEL_KEYS,
  MODULE_GROUP_ORDER,
} from "@/core/modules/catalog";
import {
  setModuleEnabled,
  useEnabledModuleIds,
  useModuleAvailabilitySnapshot,
} from "@/core/modules/enabled-modules";
import { moduleMatchesLocation } from "@/core/modules/module-routing";
import { desktopCopy } from "@/core/workspace/desktop-navigation";
import { WORKBENCH_BUILTIN_APPS } from "@/core/workbench/apps";
import {
  SidebarGroup,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { WORKBENCH_APP_ICONS } from "./module-icons";
import { AppShortcutRow } from "./app-shortcut-row";

function moduleIcon(id: string) {
  const app = WORKBENCH_BUILTIN_APPS.find((entry) => entry.moduleId === id);
  if (app) return WORKBENCH_APP_ICONS[app.icon];
  if (id === "knowledge") return DatabaseIcon;
  if (id === "assistant") return UserRoundPenIcon;
  return StoreIcon;
}

export function WorkspaceAppMenu({ onManage }: { onManage: () => void }) {
  const { t, locale } = useI18n();
  const copy = desktopCopy(locale);
  const agent = useActiveAgentId() ?? "general";
  const pins = useEnabledModuleIds(agent);
  const availability = useModuleAvailabilitySnapshot();
  const { pathname, search } = useLocation();
  const home = useConversationHomeRoute();
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState({ left: 48, top: 80 });
  useEffect(() => setOpen(false), [pathname, search]);
  const label = (key: string) =>
    (t.sidebar as unknown as Record<string, string>)[key] ?? key;
  const entries = MODULE_CATALOG.filter((entry) => {
    if (!entry.removable || availability?.get(entry.id) === false) return false;
    const app = WORKBENCH_BUILTIN_APPS.find(
      (item) => item.moduleId === entry.id,
    );
    return (
      !app || app.delivery !== "remote" || availability?.get(entry.id) === true
    );
  });
  return (
    <Dialog.Root open={open} onOpenChange={setOpen} modal={false}>
      <SidebarGroup className="p-0 px-1 pb-0.5 group-data-[collapsible=icon]:px-0">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              asChild
              isActive={isMainConversationRoute(pathname)}
            >
              <Link
                to={preserveWorkbenchPresentation(home, search)}
                data-conversation-home="true"
              >
                <HomeIcon className="size-4" />
                <span>{locale.startsWith("zh") ? "首页" : "Home"}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <Dialog.Trigger asChild>
              <SidebarMenuButton
                tooltip={copy.more}
                aria-label={copy.more}
                className="h-8 text-muted-foreground"
                onClick={(event) => {
                  const rect = event.currentTarget.getBoundingClientRect();
                  setAnchor({
                    left: Math.max(
                      8,
                      Math.min(rect.right + 8, window.innerWidth - 308),
                    ),
                    top: Math.max(
                      8,
                      Math.min(rect.top, window.innerHeight - 340),
                    ),
                  });
                }}
              >
                <MoreHorizontalIcon className="size-4" />
                <span>{copy.more}</span>
              </SidebarMenuButton>
            </Dialog.Trigger>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroup>
      <Dialog.Portal>
        <Dialog.Content
          className="fixed z-[100] flex w-[300px] max-w-[calc(100vw-16px)] flex-col rounded-xl border border-border bg-card text-card-foreground shadow-xl outline-none"
          style={{
            ...anchor,
            maxHeight: `calc(100svh - ${anchor.top + 12}px)`,
          }}
        >
          <div className="flex items-center justify-between px-3.5 pb-1 pt-3">
            <Dialog.Title className="text-sm font-semibold">
              {copy.more}
            </Dialog.Title>
            <Dialog.Close
              aria-label={copy.close}
              className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            >
              <XIcon className="size-4" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            {copy.saved}
          </Dialog.Description>
          <div className="min-h-0 overflow-y-auto px-2 pb-2">
            {MODULE_GROUP_ORDER.map((group) => {
              const items = entries.filter((entry) => entry.group === group);
              if (!items.length) return null;
              return (
                <section key={group}>
                  <h3 className="mb-1 mt-3 px-2.5 text-xs font-medium text-muted-foreground">
                    {label(MODULE_GROUP_LABEL_KEYS[group])}
                  </h3>
                  {items.map((entry) => (
                    <AppShortcutRow
                      key={entry.id}
                      id={entry.id}
                      to={preserveWorkbenchPresentation(entry.to, search)}
                      label={label(entry.labelKey)}
                      icon={moduleIcon(entry.id)}
                      active={moduleMatchesLocation(entry, pathname, search)}
                      pinned={pins.includes(entry.id)}
                      pinLabel={copy.pin}
                      unpinLabel={copy.unpin}
                      onOpen={() => setOpen(false)}
                      onTogglePin={() =>
                        setModuleEnabled(
                          entry.id,
                          !pins.includes(entry.id),
                          agent,
                        )
                      }
                    />
                  ))}
                </section>
              );
            })}
          </div>
          <div className="border-t border-border px-3 py-2">
            <button
              type="button"
              className="min-h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => {
                setOpen(false);
                onManage();
              }}
            >
              {copy.manage}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
