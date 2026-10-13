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

export interface AiNetworkPulseProps {
  onOpenWorkbench?: () => void;
  onOpenSettings?: () => void;
  onOpenPhoneMirror?: (device: LinkedDevice) => void;
  onSelectModel?: (modelId: string) => void;
  selectedModel?: string;
  defaultOpen?: boolean;
  className?: string;
}

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
    toast.success(`调度原则已切换为：${policyLabels[newPolicy].name}`, {
      description: policyLabels[newPolicy].desc,
    });
  };

  const fallbackModel: ModelOption = AVAILABLE_MODELS[0]!;
  const activeModelObj: ModelOption =
    AVAILABLE_MODELS.find((m) => m.id === activeModel) ?? fallbackModel;

  const handleSelectModel = (model: ModelOption) => {
    setActiveModel(model.id);
    onSelectModel?.(model.id);
    toast.success(`系统主模型已切换为：${model.name}`, {
      description: `算力供应：${model.provider} · 特性：${model.tag || ""}`,
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
            "group inline-flex h-6 items-center gap-1.5 rounded-full border border-white/15 bg-white/10 px-2.5 text-[11px] font-medium text-slate-100 shadow-sm backdrop-blur-md transition-all hover:scale-[1.02] hover:bg-white/20 select-none cursor-pointer",
            open && "scale-[1.02] bg-white/20 ring-1 ring-white/30",
            className,
          )}
          aria-label="打开 AI Network 实时脉搏"
          title="AI Network · 演示预览，非实时遥测"
        >
          <span className="relative flex size-2 items-center justify-center">
            <span className="relative inline-flex size-1.5 rounded-full bg-core" />
          </span>
          <span className="font-semibold tracking-tight">AI</span>
          <span className="opacity-40">·</span>
          <span className="text-[10px] opacity-70">
            {activeModelObj.id === "auto"
              ? "演示"
              : activeModelObj.name.split(" ")[0]}
          </span>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="end"
        sideOffset={8}
        portalContainer={portalContainer}
        className="z-[200] w-[420px] max-w-[calc(100vw-24px)] rounded-2xl border border-border bg-popover/95 p-4 text-popover-foreground shadow-2xl shadow-black/20 backdrop-blur-2xl"
      >
        {/* 顶部标题与状态 */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <RadioIcon className="size-4 text-core" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider">
                ECHO AI NETWORK
              </h3>
              <p className="text-[10px] text-muted-foreground">
                演示预览 · 下方为示例数据，非实时遥测
              </p>
            </div>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 px-2 py-0.5 text-[9px] font-semibold text-warning">
            <span className="size-1.5 rounded-full bg-warning" /> 演示数据
          </span>
        </div>

        {/* 实时心跳度量条 */}
        <div className="my-3 grid grid-cols-4 gap-2 rounded-xl bg-foreground/[0.04] p-2.5 text-center">
          <div>
            <div className="text-[9px] font-semibold uppercase text-muted-foreground">
              今日吞吐
            </div>
            <div className="text-xs font-bold text-foreground">4.8M</div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase text-muted-foreground">
              本地私有
            </div>
            <div className="text-xs font-bold text-core">48%</div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase text-muted-foreground">
              预估花费
            </div>
            <div className="text-xs font-bold text-foreground">$2.31</div>
          </div>
          <div>
            <div className="text-[9px] font-semibold uppercase text-muted-foreground">
              数字员工
            </div>
            <div className="text-xs font-bold text-foreground">3 协同</div>
          </div>
        </div>

        {/* 1. Policy 调度原则 (Master Rule) */}
        <div className="mb-3 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>1. 全局调度原则 (Policy)</span>
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
                  "rounded-lg border border-border py-1 text-[10px] font-medium transition-all",
                  policy === item
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-foreground/5 text-muted-foreground hover:bg-foreground/10 hover:text-foreground",
                )}
              >
                {item === "local-first" && "Local"}
                {item === "auto" && "Auto"}
                {item === "quality-first" && "Quality"}
                {item === "cost-first" && "Cost"}
                {item === "privacy-first" && "Privacy"}
              </button>
            ))}
          </div>
        </div>

        {/* 2. 状态栏主选模型快速切换 (Model Switcher) */}
        <div className="mb-3 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>2. 状态栏主选模型 (Model Switcher)</span>
            <span className="font-semibold text-core">
              {activeModelObj.name}
            </span>
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
                    <div className="truncate text-[11px] font-medium leading-tight">
                      {m.name}
                    </div>
                    <div className="text-[9px] text-muted-foreground">
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

        {/* 3. Agents 数字员工 (Digital Coworkers) */}
        <div className="mb-3 space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>3. 数字工作人员 (Agents)</span>
            <span>当前主选路线</span>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between rounded-lg border border-border bg-foreground/5 p-2">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-foreground/10 text-[10px] font-bold text-foreground">
                  R
                </span>
                <div>
                  <div className="font-semibold">Researcher (调研员)</div>
                  <div className="text-[9px] text-muted-foreground">
                    论文检索 · 专利拆解 · 知识图谱
                  </div>
                </div>
              </div>
              <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[9px] font-medium">
                Gemini 1.5 Pro
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-foreground/5 p-2">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-foreground/10 text-[10px] font-bold text-foreground">
                  B
                </span>
                <div>
                  <div className="font-semibold">Builder (架构师)</div>
                  <div className="text-[9px] text-muted-foreground">
                    终端指令 · 代码编译 · 方案生成
                  </div>
                </div>
              </div>
              <span className="rounded bg-foreground/10 px-1.5 py-0.5 text-[9px] font-medium">
                Claude 3.5 Sonnet
              </span>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border bg-foreground/5 p-2">
              <div className="flex items-center gap-2">
                <span className="grid size-6 place-items-center rounded-md bg-foreground/10 text-[10px] font-bold text-foreground">
                  O
                </span>
                <div>
                  <div className="font-semibold">Operator (管家)</div>
                  <div className="text-[9px] text-muted-foreground">
                    ZFS 存储 · Docker · 相册聚类
                  </div>
                </div>
              </div>
              <span className="rounded bg-core/10 px-1.5 py-0.5 text-[9px] font-semibold text-core">
                Station 100% Local
              </span>
            </div>
          </div>
        </div>

        {/* 4. Plans 套餐池 */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            <span>4. 算力套餐池 (Plans)</span>
            <span>4 个已连接源</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 text-xs">
            <div className="rounded-lg border border-border bg-foreground/5 p-2">
              <div className="flex items-center justify-between text-[11px] font-medium">
                <span>OpenAI Pro</span>
                <span className="text-[9px] text-muted-foreground">42%</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full bg-foreground/70"
                  style={{ width: "42%" }}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-foreground/5 p-2">
              <div className="flex items-center justify-between text-[11px] font-medium">
                <span>Anthropic Max</span>
                <span className="text-[9px] text-muted-foreground">68%</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full bg-foreground/70"
                  style={{ width: "68%" }}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-foreground/5 p-2">
              <div className="flex items-center justify-between text-[11px] font-medium">
                <span>Google AI Pro</span>
                <span className="text-[9px] text-muted-foreground">31%</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                <div
                  className="h-full bg-foreground/70"
                  style={{ width: "31%" }}
                />
              </div>
            </div>

            <div className="rounded-lg border border-border bg-foreground/5 p-2">
              <div className="flex items-center justify-between text-[11px] font-medium text-core">
                <span>Echo Station (NPU)</span>
                <span className="text-[9px]">48%</span>
              </div>
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                <div className="h-full bg-core" style={{ width: "48%" }} />
              </div>
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
        <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-[11px]">
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenWorkbench?.();
            }}
            className="font-medium text-core transition hover:underline"
          >
            打开完整 AI Network 工作台 →
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
