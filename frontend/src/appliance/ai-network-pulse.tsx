"use client";

import { useEffect, useRef, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CheckIcon, RadioIcon } from "lucide-react";
import { LiveDeviceList } from "./live-device-list";
import type { LinkedDevice } from "./device-link";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type RoutingPolicy =
  | "local-first"
  | "auto"
  | "quality-first"
  | "cost-first"
  | "privacy-first";

export type ModelOption = {
  id: string;
  name: string;
  provider: string;
  tag?: string;
};

export const AVAILABLE_MODELS: ModelOption[] = [
  {
    id: "auto",
    name: "自动智能路由",
    provider: "Echo Routing",
    tag: "智能自适应",
  },
  {
    id: "claude-3-5-sonnet",
    name: "Claude 3.5 Sonnet",
    provider: "Anthropic",
    tag: "架构/代码",
  },
  { id: "gpt-4o", name: "GPT-4o", provider: "OpenAI", tag: "全模态旗舰" },
  {
    id: "deepseek-v3",
    name: "DeepSeek-V3",
    provider: "DeepSeek",
    tag: "极致性价比",
  },
  {
    id: "gemini-1-5-pro",
    name: "Gemini 1.5 Pro",
    provider: "Google",
    tag: "超长上下文",
  },
  {
    id: "echo-local-llama3",
    name: "Echo Llama-3.3-70B",
    provider: "Station Local",
    tag: "本地私有化",
  },
];

const POLICY_SHORT_NAMES: Record<RoutingPolicy, string> = {
  "local-first": "本地",
  auto: "自动",
  "quality-first": "品质",
  "cost-first": "成本",
  "privacy-first": "隐私",
};

export interface AiNetworkPulseProps {
  onOpenWorkbench?: () => void;
  onOpenSettings?: () => void;
  onOpenPhoneMirror?: (device: LinkedDevice) => void;
  onSelectModel?: (modelId: string) => void;
  selectedModel?: string;
  defaultOpen?: boolean;
  className?: string;
}

/** Room the Dock takes at the bottom of the screen, plus a small gap. */
const AI_NETWORK_PANEL_DOCK_CLEARANCE = 96;

export function AiNetworkPulse({
  onOpenWorkbench,
  onOpenSettings,
  onOpenPhoneMirror,
  onSelectModel,
  selectedModel = "auto",
  defaultOpen = false,
  className,
}: AiNetworkPulseProps) {
  const [policy, setPolicy] = useState<RoutingPolicy>("local-first");
  const [activeModel, setActiveModel] = useState(selectedModel);
  const [open, setOpen] = useState(defaultOpen);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const triggerRef = useRef<HTMLButtonElement>(null);
  const lastPointerDownRef = useRef<number>(0);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      setPortalContainer(
        triggerRef.current?.closest<HTMLElement>(".macos-desktop-root") ?? null,
      );
    } else {
      setPortalContainer(null);
    }
  };

  const handlePointerDown = () => {
    lastPointerDownRef.current = Date.now();
  };

  const handleClick = (_e: React.MouseEvent) => {
    // If pointerdown already triggered this interaction in the last 400ms,
    // skip the click handler to prevent double-toggling against Radix's onPointerDown.
    if (Date.now() - lastPointerDownRef.current < 400) {
      return;
    }
    handleOpenChange(!open);
  };

  useEffect(() => {
    setActiveModel(selectedModel);
  }, [selectedModel]);

  const policyLabels: Record<RoutingPolicy, { name: string; desc: string }> = {
    "local-first": {
      name: "本地优先",
      desc: "敏感数据零出网，仅在本地算力受限时申请云端",
    },
    auto: {
      name: "智能自适应",
      desc: "根据任务复杂度、时延与配额动态平衡",
    },
    "quality-first": {
      name: "极致品质",
      desc: "无视成本优先调度最顶尖旗舰大模型",
    },
    "cost-first": {
      name: "成本压制",
      desc: "优先采用本地与经济型模型，控制月度预算",
    },
    "privacy-first": {
      name: "极致隐私",
      desc: "物理断网隔离，严禁任何数据上传云端",
    },
  };

  const handleSelectPolicy = (newPolicy: RoutingPolicy) => {
    setPolicy(newPolicy);
    toast.success(`演示：调度原则切换为${policyLabels[newPolicy].name}`, {
      description: `${policyLabels[newPolicy].desc}。演示数据，不会改变实际调度。`,
    });
  };

  const fallbackModel: ModelOption = AVAILABLE_MODELS[0]!;
  const activeModelObj: ModelOption =
    AVAILABLE_MODELS.find((m) => m.id === activeModel) ?? fallbackModel;

  const handleSelectModel = (model: ModelOption) => {
    setActiveModel(model.id);
    onSelectModel?.(model.id);
    toast.success(`演示：主选模型切换为 ${model.name}`, {
      description: `${model.provider} · ${model.tag || ""}。演示数据，不会改变实际使用的模型。`,
    });
  };

  return (
    <DropdownMenu open={open} onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          ref={triggerRef}
          type="button"
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          className={cn(
            "group inline-flex h-6 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 text-[12px] font-medium text-slate-100 shadow-sm backdrop-blur-md transition-all hover:scale-[1.02] hover:bg-white/20 select-none cursor-pointer",
            open && "scale-[1.02] bg-white/20 ring-1 ring-white/30",
            className,
          )}
          aria-label="打开 AI Network 面板（演示数据）"
          title="AI 网络 · 演示数据，非实时遥测"
        >
          <span className="relative flex size-2 items-center justify-center">
            <span className="relative inline-flex size-1.5 rounded-full bg-core" />
          </span>
          <span className="font-semibold tracking-tight">AI</span>
          <span className="opacity-40">·</span>
          <span className="text-[12px] opacity-70">
            {activeModelObj.id === "auto"
              ? "演示"
              : activeModelObj.name.split(" ")[0]}
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        // Keep the panel above the Dock; it scrolls when the screen is short
        // (1280x720 ran its footer under the Dock).
        collisionPadding={{ bottom: AI_NETWORK_PANEL_DOCK_CLEARANCE }}
        portalContainer={portalContainer}
        className="z-[200] w-[420px] max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-popover/95 p-4 text-popover-foreground shadow-2xl shadow-black/20 backdrop-blur-2xl"
      >
        {/* 顶部标题与状态：整个面板是演示数据，先说清楚 */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <RadioIcon className="size-4 text-core" />
            <div>
              <h3 className="text-sm font-semibold">AI 网络</h3>
              <p className="text-[12px] text-muted-foreground">
                以下数字和模型均为示例，不是实时遥测
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-signal/10 px-2 py-0.5 text-[12px] font-medium text-signal">
            <span className="size-1.5 rounded-full bg-signal" /> 演示数据
          </span>
        </div>

        {/* 概览（示例） */}
        <div className="my-3 grid grid-cols-3 gap-2 rounded-xl bg-foreground/[0.04] p-2.5 text-center">
          <div>
            <div className="text-[12px] text-muted-foreground">今日吞吐</div>
            <div className="font-mono text-xs font-semibold text-foreground">
              4.8M
            </div>
          </div>
          <div>
            <div className="text-[12px] text-muted-foreground">本地处理</div>
            <div className="font-mono text-xs font-semibold text-core">48%</div>
          </div>
          <div>
            <div className="text-[12px] text-muted-foreground">数字员工</div>
            <div className="text-xs font-semibold text-foreground">
              3 位协同
            </div>
          </div>
        </div>

        {/* 调度原则 */}
        <div className="mb-3 space-y-1.5">
          <div className="flex items-center justify-between text-[12px] font-medium text-muted-foreground">
            <span>调度原则</span>
            <span className="text-foreground">{policyLabels[policy].name}</span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {(
              [
                "local-first",
                "auto",
                "quality-first",
                "cost-first",
                "privacy-first",
              ] as RoutingPolicy[]
            ).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => handleSelectPolicy(item)}
                className={cn(
                  "rounded-lg border border-border py-1 text-[12px] font-medium transition-all",
                  policy === item
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
                )}
              >
                {POLICY_SHORT_NAMES[item]}
              </button>
            ))}
          </div>
        </div>

        {/* 主选模型（示例） */}
        <div className="mb-3 space-y-1.5">
          <div className="flex items-center justify-between text-[12px] font-medium text-muted-foreground">
            <span>主选模型（示例）</span>
            <span className="font-medium text-core">{activeModelObj.name}</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {AVAILABLE_MODELS.map((m) => {
              const isSelected = activeModel === m.id;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => handleSelectModel(m)}
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-2 text-left transition-all",
                    isSelected
                      ? "border-core/50 bg-core/10 font-medium text-foreground shadow-sm"
                      : "border-border bg-foreground/5 text-foreground hover:bg-foreground/10",
                  )}
                >
                  <div className="min-w-0 pr-1">
                    <div className="truncate text-[12px] font-medium leading-tight">
                      {m.name}
                    </div>
                    <div className="truncate text-[12px] text-muted-foreground">
                      {m.provider} · {m.tag}
                    </div>
                  </div>
                  {isSelected && (
                    <CheckIcon className="size-3.5 shrink-0 text-core" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 数字员工（示例） */}
        <div className="mb-3 space-y-1.5">
          <div className="flex items-center justify-between text-[12px] font-medium text-muted-foreground">
            <span>数字员工（示例）</span>
            <span>当前路由</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between rounded-lg border border-border bg-foreground/5 p-2">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-foreground/10 text-[12px] font-semibold text-foreground">
                  调
                </span>
                <div>
                  <div className="font-semibold">调研员</div>
                  <div className="text-[12px] text-muted-foreground">
                    论文检索 · 专利拆解 · 知识图谱
                  </div>
                </div>
              </div>
              <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[12px] font-medium">
                Gemini 1.5 Pro
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-foreground/5 p-2">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-foreground/10 text-[12px] font-semibold text-foreground">
                  架
                </span>
                <div>
                  <div className="font-semibold">架构师</div>
                  <div className="text-[12px] text-muted-foreground">
                    终端指令 · 代码编译 · 方案生成
                  </div>
                </div>
              </div>
              <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[12px] font-medium">
                Claude 3.5 Sonnet
              </span>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border bg-foreground/5 p-2">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-foreground/10 text-[12px] font-semibold text-foreground">
                  管
                </span>
                <div>
                  <div className="font-semibold">管家</div>
                  <div className="text-[12px] text-muted-foreground">
                    ZFS 存储 · Docker · 相册聚类
                  </div>
                </div>
              </div>
              <span className="rounded bg-core/10 px-1.5 py-0.5 text-[12px] font-medium text-core">
                全部本地
              </span>
            </div>
          </div>
        </div>

        <div className="space-y-2" data-testid="softbus-radar-section">
          <h3 className="text-xs font-semibold">设备互联</h3>
          <LiveDeviceList
            enabled={open}
            onOpen={(device) => {
              setOpen(false);
              onOpenPhoneMirror?.(device);
            }}
          />
        </div>

        {/* 底部功能按钮 */}
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[12px]">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenWorkbench?.();
            }}
            className="font-medium text-core transition hover:underline"
          >
            打开 AI 网络工作台 →
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenSettings?.();
            }}
            className="text-muted-foreground transition hover:text-foreground"
          >
            连接设置
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
