import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2Icon,
  FileSearchIcon,
  Loader2Icon,
  RefreshCwIcon,
  TriangleAlertIcon,
} from "lucide-react";

import { requestHighRiskApproval } from "@/appliance/approval";
import {
  applyExt4Check,
  fetchExt4Checks,
  planExt4Check,
  type Ext4CheckFilesystem,
  type Ext4CheckPlan,
} from "@/appliance/ext4-check";
import { HighRiskApprovalDialog } from "@/appliance/high-risk-approval-dialog";
import { fetchNativeStatus } from "@/appliance/omv";
import { cn } from "@/lib/utils";

const CAPABILITY = "storage.volume.ext4.offline-check.v1";

export function Ext4CheckPanel() {
  const [filesystems, setFilesystems] = useState<Ext4CheckFilesystem[]>([]);
  const [available, setAvailable] = useState(false);
  const [plan, setPlan] = useState<Ext4CheckPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<{
    tone: "ok" | "warning";
    text: string;
  } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await fetchNativeStatus();
      const capable = status.capabilities?.includes(CAPABILITY) ?? false;
      setAvailable(capable);
      setFilesystems(capable ? await fetchExt4Checks() : []);
    } catch (reason) {
      setFilesystems([]);
      setError(
        reason instanceof Error ? reason.message : "无法读取 EXT4 离线检查状态",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const preview = async (filesystem: Ext4CheckFilesystem) => {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      setPlan(
        await planExt4Check({
          schema: "echo.omv.ext4-check-desired.v1",
          filesystemUuid: filesystem.filesystemUuid,
          operation: "check",
        }),
      );
    } catch (reason) {
      setError(
        reason instanceof Error ? reason.message : "无法预览 EXT4 离线检查",
      );
    } finally {
      setBusy(false);
    }
  };

  const apply = async (password: string) => {
    if (!plan) return;
    const approval = await requestHighRiskApproval(
      "omv.ext4.offline-check",
      plan.planId,
      password,
    );
    const result = await applyExt4Check(
      plan.desired,
      plan.planId,
      approval.approvalToken,
    );
    setPlan(null);
    setMessage(
      result.clean
        ? {
            tone: "ok",
            text: `${result.filesystem.name} 离线只读检查完成，未发现错误`,
          }
        : {
            tone: "warning",
            text: `${result.filesystem.name} 检查发现文件系统错误；未执行修复，请保持卸载并人工处理`,
          },
    );
    await refresh();
  };

  return (
    <>
      <section className="mt-4 rounded-[22px] bg-card/78 p-5 shadow-sm ring-1 ring-border">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              <FileSearchIcon className="size-5 text-core" /> EXT4 离线只读检查
            </h2>
            <p className="mt-2 max-w-2xl text-[12px] leading-5 text-muted-foreground">
              只接受 Echo 登记且位于健康 RAID1 上的
              EXT4。卷必须事先卸载；系统不会自动停止共享、
              卸载、挂载或修复。检查期间仅执行 e2fsck
              强制只读扫描，并临时屏蔽对应挂载单元。
            </p>
          </div>
          <button
            type="button"
            aria-label="刷新 EXT4 检查状态"
            onClick={() => void refresh()}
            disabled={loading || busy}
            className="grid size-8 place-items-center rounded-full bg-background text-muted-foreground ring-1 ring-border disabled:opacity-40"
          >
            <RefreshCwIcon
              className={cn("size-3.5", loading && "animate-spin")}
            />
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs text-breach">
            {error}
          </p>
        )}
        {message && (
          <p
            role="status"
            className={cn(
              "mt-3 flex items-start gap-2 rounded-xl px-3 py-2 text-xs",
              message.tone === "ok"
                ? "bg-core/10 text-core"
                : "bg-warning/10 text-warning",
            )}
          >
            {message.tone === "ok" ? (
              <CheckCircle2Icon className="mt-0.5 size-4 shrink-0" />
            ) : (
              <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" />
            )}
            {message.text}
          </p>
        )}

        {loading ? (
          <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2Icon className="size-4 animate-spin" /> 正在核验 EXT4
            挂载状态…
          </p>
        ) : !available ? (
          <p className="mt-4 rounded-xl bg-background p-3 text-xs text-muted-foreground">
            当前主机缺少受控 EXT4 离线检查能力。
          </p>
        ) : filesystems.length === 0 ? (
          <p className="mt-4 rounded-xl bg-background p-3 text-xs text-muted-foreground">
            当前没有 Echo 登记的 EXT4 数据卷。
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {filesystems.map((filesystem) => (
              <article
                key={filesystem.filesystemUuid}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-background px-3 py-3"
              >
                <div>
                  <p className="text-xs font-semibold text-foreground">
                    {filesystem.name}
                  </p>
                  <p className="mt-1 text-[12px] text-muted-foreground">
                    {filesystem.mountpoint} ·{" "}
                    {filesystem.mounted ? "已挂载，不能检查" : "已卸载，可检查"}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!filesystem.canCheck || busy}
                  onClick={() => void preview(filesystem)}
                  className="h-8 rounded-lg bg-primary px-3 text-[12px] font-semibold text-primary-foreground disabled:opacity-40"
                >
                  {filesystem.canCheck ? "预览离线检查" : "需先安全卸载"}
                </button>
              </article>
            ))}
          </div>
        )}
      </section>

      <HighRiskApprovalDialog
        open={Boolean(plan)}
        title="确认执行 EXT4 离线检查"
        description="检查会产生较高磁盘 I/O，但只以 -f -n 模式读取，不自动修复。执行前会再次确认卷仍处于卸载状态。"
        targetLabel={
          plan
            ? `${plan.filesystem.name} · ${plan.filesystem.filesystemUuid}`
            : undefined
        }
        confirmLabel="开始只读检查"
        onCancel={() => setPlan(null)}
        onConfirm={apply}
      />
    </>
  );
}
