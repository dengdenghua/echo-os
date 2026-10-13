import { lazy, Suspense } from "react";

import { PanelLoading } from "@/components/ui/progress-line";

import AppearanceSettingsPage from "./appearance-settings-page";
import type { SettingsSection } from "./settings-sections";

const ConversationSettingsPage = lazy(
  () => import("./conversation-settings-page"),
);
const ModelSettingsPage = lazy(() => import("./model-settings-page"));
const MemorySettingsPage = lazy(() => import("./memory-settings-page"));
const NotificationSettingsPage = lazy(
  () => import("./notification-settings-page"),
);
const McpSettingsPage = lazy(() =>
  import("./mcp-settings-page").then((module) => ({
    default: module.McpSettingsPage,
  })),
);
const BrowserAutomationSettingsPage = lazy(
  () => import("./browser-automation-settings-page"),
);
const DesktopAutomationSettingsPage = lazy(
  () => import("./desktop-automation-settings-page"),
);
const AutomationSecuritySettingsPage = lazy(
  () => import("./automation-security-settings-page"),
);
const PrivacySettingsPage = lazy(() => import("./privacy-settings-page"));

export const OS_AGENT_SETTINGS_ITEMS = [
  { id: "models", label: "模型与 Codex" },
  { id: "tools", label: "工具、技能与 MCP" },
  { id: "memory", label: "记忆与个人规则" },
  { id: "browserAutomation", label: "浏览器自动化" },
  { id: "desktopAutomation", label: "桌面自动化" },
  { id: "automationSecurity", label: "执行与安全" },
  { id: "conversation", label: "对话" },
  { id: "notification", label: "通知" },
  { id: "appearance", label: "界面与语言" },
  { id: "privacy", label: "个人空间与安全" },
] as const satisfies ReadonlyArray<{ id: SettingsSection; label: string }>;

export type OsAgentSettingsSection =
  (typeof OS_AGENT_SETTINGS_ITEMS)[number]["id"];

function SettingsContentLoading() {
  return <PanelLoading label="正在加载设置" className="min-h-64" />;
}

export function SystemAgentSettingsContent({
  section,
}: {
  section: OsAgentSettingsSection;
}) {
  let content;
  switch (section) {
    case "models":
      content = <ModelSettingsPage />;
      break;
    case "tools":
      content = <McpSettingsPage />;
      break;
    case "memory":
      content = <MemorySettingsPage />;
      break;
    case "browserAutomation":
      content = <BrowserAutomationSettingsPage />;
      break;
    case "desktopAutomation":
      content = <DesktopAutomationSettingsPage />;
      break;
    case "automationSecurity":
      content = <AutomationSecuritySettingsPage />;
      break;
    case "conversation":
      content = <ConversationSettingsPage />;
      break;
    case "notification":
      content = <NotificationSettingsPage />;
      break;
    case "privacy":
      content = <PrivacySettingsPage />;
      break;
    case "appearance":
      content = <AppearanceSettingsPage />;
      break;
  }

  return <Suspense fallback={<SettingsContentLoading />}>{content}</Suspense>;
}
