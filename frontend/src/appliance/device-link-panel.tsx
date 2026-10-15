import { DeviceTaskSection } from "./device-task-panel";
import { PhoneTransferList } from "./phone-transfer-list";
import {
  useDeviceDirectory,
  publishDeviceStatus,
  refreshDeviceDirectory,
} from "./device-directory";
import { useEffect, useMemo, useState } from "react";
import {
  BatteryChargingIcon,
  BatteryMediumIcon,
  CheckIcon,
  ClipboardIcon,
  ExternalLinkIcon,
  FileIcon,
  Globe2Icon,
  ImagesIcon,
  LaptopIcon,
  Link2Icon,
  Loader2Icon,
  LockKeyholeIcon,
  PlusIcon,
  RefreshCwIcon,
  RouterIcon,
  ShieldCheckIcon,
  SmartphoneIcon,
  Trash2Icon,
  UnplugIcon,
  UploadCloudIcon,
  WifiIcon,
} from "lucide-react";

import { requestHighRiskApproval } from "@/appliance/approval";
import {
  createPairingInvitation,
  disableDeviceLink,
  enableDeviceLink,
  revokeLinkedDevice,
  type LinkedDevice,
  type PairingInvitation,
} from "@/appliance/device-link";
import {
  fetchDeviceSyncStatus,
  setDeviceSyncScope,
  type DeviceSyncDevice,
  type DeviceSyncScope,
  type DeviceSyncStatus,
} from "@/appliance/device-sync";
import { HighRiskApprovalDialog } from "@/appliance/high-risk-approval-dialog";
import {
  SystemAppFrame,
  useInSystemAppWindow,
  SystemAppTrafficLights,
} from "@/appliance/system-app-window";
import { cn } from "@/lib/utils";

type DeviceLinkSection = "devices" | "pair" | "sync" | "remote";
type PendingAction =
  | { kind: "enable" }
  | { kind: "disable" }
  | { kind: "pair" }
  | {
      kind: "sync";
      device: DeviceSyncDevice;
      scope: DeviceSyncScope;
      enabled: boolean;
    }
  | { kind: "revoke"; device: LinkedDevice };

function timeLabel(value: number | null) {
  if (!value) return "尚无记录";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value * 1_000));
}

function deviceName(device: LinkedDevice) {
  return [device.brand, device.model].filter(Boolean).join(" ") || device.id;
}

function bytesLabel(value: number) {
  if (!value) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const order = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  return `${(value / 1024 ** order).toFixed(order > 1 ? 1 : 0)} ${units[order]}`;
}

function DeviceCard({
  device,
  onRevoke,
  onOpenPhoneMirror,
}: {
  device: LinkedDevice;
  onRevoke: () => void;
  onOpenPhoneMirror?: (device: LinkedDevice) => void;
}) {
  const DeviceIcon = device.type === "desktop" ? LaptopIcon : SmartphoneIcon;
  return (
    <article className="flex items-center gap-4 rounded-[20px] border border-border bg-card/78 p-4 shadow-[0_10px_30px_rgba(51,65,85,.07)]">
      <span className="relative grid size-12 shrink-0 place-items-center rounded-[16px] bg-primary text-primary-foreground shadow-sm">
        <DeviceIcon className="size-6" />
        <i
          aria-label={device.online ? "在线" : "离线"}
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-border",
            device.online ? "bg-core" : "bg-muted-foreground/50",
          )}
        />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <strong className="truncate text-[14px] text-foreground">
            {deviceName(device)}
          </strong>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[12px] font-semibold",
              device.online
                ? "bg-core/10 text-core"
                : "bg-muted text-muted-foreground",
            )}
          >
            {device.online ? (device.busy ? "使用中" : "在线") : "离线"}
          </span>
        </div>
        <p className="mt-1 truncate text-[12px] text-muted-foreground">
          {device.platform} · {device.id} · 最近连接{" "}
          {timeLabel(device.lastSeenAt)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {device.battery !== null && (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[12px] text-muted-foreground">
              {device.charging ? (
                <BatteryChargingIcon className="size-3" />
              ) : (
                <BatteryMediumIcon className="size-3" />
              )}
              {device.battery}%
            </span>
          )}
          {device.totalCapabilities > 0 && (
            <span className="rounded-full bg-core/10 px-2 py-1 text-[12px] text-core">
              {device.totalCapabilities} 项设备能力
            </span>
          )}
          {device.currentApp && (
            <span className="max-w-40 truncate rounded-full bg-core/10 px-2 py-1 text-[12px] text-core">
              {device.currentApp}
            </span>
          )}
        </div>
      </div>
      {device.type !== "desktop" && device.online && onOpenPhoneMirror && (
        <button
          type="button"
          aria-label={`多屏协同 ${deviceName(device)}`}
          title="发起多屏协同 (手机镜像)"
          onClick={() => onOpenPhoneMirror(device)}
          className="flex items-center gap-1 rounded-xl bg-core/10 px-2.5 py-1.5 text-xs font-semibold text-core hover:bg-core/10 transition-colors shadow-sm"
        >
          <SmartphoneIcon className="size-3.5" />
          <span>多屏协同</span>
        </button>
      )}
      {device.individuallyRevocable && (
        <button
          type="button"
          aria-label={`移除 ${deviceName(device)}`}
          title="移除设备"
          onClick={onRevoke}
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-breach/10 hover:text-breach"
        >
          <Trash2Icon className="size-4" />
        </button>
      )}
    </article>
  );
}

/** 手机镜像入口的说明：没有手机、手机离线、可以开始三种情况。 */
function PhoneMirrorNotice({ devices }: { devices: LinkedDevice[] }) {
  const phones = devices.filter((device) => device.type !== "desktop");
  const online = phones.some((device) => device.online);
  const title = !phones.length
    ? "还没有配对的手机"
    : online
      ? "选择一台手机开始镜像"
      : "已配对的手机当前不在线";
  const detail = !phones.length
    ? "手机镜像需要一台已配对的手机。在上方添加设备，用手机扫码加入后即可在这里镜像。"
    : online
      ? "在下方点“多屏协同”，手机画面会在新窗口中打开。"
      : "在手机上打开 Echo Mobile 并连上同一网络，上线后即可在这里开始镜像。";
  return (
    <section
      role="status"
      aria-label="手机镜像"
      className="mt-4 flex items-start gap-3 rounded-2xl bg-card/72 p-4 ring-1 ring-border"
    >
      <SmartphoneIcon
        aria-hidden
        className="mt-0.5 size-5 shrink-0 text-muted-foreground"
      />
      <div>
        <strong className="block text-[13px] text-foreground">{title}</strong>
        <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
          {detail}
        </p>
      </div>
    </section>
  );
}

export function DeviceLinkPanel({
  open,
  intent = "devices",
  onClose,
  onOpenPhoneMirror,
}: {
  open: boolean;
  /** 从「手机镜像」打开时先说明有没有可以镜像的手机。 */
  intent?: "devices" | "phone-mirror";
  onClose: () => void;
  onOpenPhoneMirror?: (device: LinkedDevice) => void;
}) {
  const inWindow = useInSystemAppWindow();
  const [section, setSection] = useState<DeviceLinkSection>("devices");
  const directory = useDeviceDirectory(open);
  const status = directory.status;
  const setStatus = publishDeviceStatus;
  const [syncStatus, setSyncStatus] = useState<DeviceSyncStatus | null>(null);
  const [invitation, setInvitation] = useState<PairingInvitation | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  const refresh = () => {
    setLoading(true);
    setError(null);
    return Promise.all([
      refreshDeviceDirectory(),
      fetchDeviceSyncStatus().catch(() => null),
    ])
      .then(([, nextSyncStatus]) => {
        setSyncStatus(nextSyncStatus);
      })
      .catch((reason) => {
        setError(
          reason instanceof Error ? reason.message : "无法读取设备连接状态",
        );
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    if (!open) return;
    setSection("devices");
    setInvitation(null);
    setCopied(false);
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5_000);
    return () => window.clearInterval(timer);
  }, [open]);

  const approvalCopy = useMemo(() => {
    if (!pendingAction) return null;
    if (pendingAction.kind === "enable") {
      return {
        title: "开启局域网设备连接",
        description:
          "Echo 将在局域网开放一个经过配对凭据保护的设备入口，用于连接你的手机或其他终端。",
        target: "仅同一局域网 · 端口 8765",
        confirm: "确认开启",
        destructive: false,
      };
    }
    if (pendingAction.kind === "disable") {
      return {
        title: "关闭设备连接",
        description: "所有当前设备连接会断开，之后需要重新开启才能连接。",
        target: "局域网设备入口",
        confirm: "关闭连接",
        destructive: true,
      };
    }
    if (pendingAction.kind === "pair") {
      return {
        title: "创建配对邀请",
        description:
          "邀请包含设备访问凭据，只应复制到你本人持有的 Echo Mobile。",
        target: "一台新设备",
        confirm: "创建邀请",
        destructive: false,
      };
    }
    if (pendingAction.kind === "sync") {
      const scopeName = pendingAction.scope === "photos" ? "照片" : "文件";
      return {
        title: `${pendingAction.enabled ? "开启" : "关闭"}${scopeName}自动备份`,
        description: pendingAction.enabled
          ? `允许 ${pendingAction.device.name} 使用自己的设备凭据，将${scopeName}写入专属目录。`
          : `停止这台设备的${scopeName}备份；已安全落盘的内容不会删除。`,
        target: pendingAction.device.name,
        confirm: pendingAction.enabled ? "确认开启" : "停止备份",
        destructive: !pendingAction.enabled,
      };
    }
    return {
      title: "移除已配对设备",
      description: "该设备的凭据将立即失效，在线连接也会断开。",
      target: deviceName(pendingAction.device),
      confirm: "移除设备",
      destructive: true,
    };
  }, [pendingAction]);

  const runApprovedAction = async (password: string) => {
    if (!pendingAction) return;
    if (pendingAction.kind === "enable") {
      const approval = await requestHighRiskApproval(
        "device-link.enable",
        "lan",
        password,
      );
      setStatus(await enableDeviceLink(approval.approvalToken));
      setPendingAction(null);
      return;
    }
    if (pendingAction.kind === "disable") {
      const approval = await requestHighRiskApproval(
        "device-link.disable",
        "lan",
        password,
      );
      setStatus(await disableDeviceLink(approval.approvalToken));
      setInvitation(null);
      setPendingAction(null);
      return;
    }
    if (pendingAction.kind === "pair") {
      const approval = await requestHighRiskApproval(
        "device-link.pair",
        "lan",
        password,
      );
      setInvitation(await createPairingInvitation(approval.approvalToken));
      setSection("pair");
      setPendingAction(null);
      return;
    }
    if (pendingAction.kind === "sync") {
      const { device, scope, enabled } = pendingAction;
      const approval = await requestHighRiskApproval(
        `device-sync.${scope}.${enabled ? "enable" : "disable"}`,
        device.id,
        password,
      );
      setSyncStatus(
        await setDeviceSyncScope(
          device.id,
          scope,
          enabled,
          approval.approvalToken,
        ),
      );
      setPendingAction(null);
      return;
    }
    const deviceId = pendingAction.device.id;
    const approval = await requestHighRiskApproval(
      "device-link.device.revoke",
      deviceId,
      password,
    );
    setStatus(await revokeLinkedDevice(deviceId, approval.approvalToken));
    setPendingAction(null);
  };

  if (!open) return null;

  const managed = status?.mode === "echo-managed";
  const active = !!status?.enabled && !!status?.listenerActive;
  const remote = status?.remoteAccess;
  const remoteConnected = !!remote?.available;

  return (
    <SystemAppFrame
      label="设备连接"
      onClose={onClose}
      backdropButtonLabel="关闭设备连接"
      overlayClassName="absolute inset-0 z-[82] grid place-items-center bg-scrim/22 px-5 pb-20 pt-10 backdrop-blur-[5px]"
      className="relative flex h-[min(620px,calc(100vh-120px))] w-[min(920px,calc(100vw-34px))] overflow-hidden rounded-[24px] border border-border bg-background/94 text-foreground shadow-[var(--echo-shadow-window)] backdrop-blur-3xl"
      windowClassName="relative flex size-full overflow-hidden bg-background text-foreground"
      trailing={
        <HighRiskApprovalDialog
          open={!!pendingAction}
          title={approvalCopy?.title ?? "确认设备连接操作"}
          description={approvalCopy?.description ?? "请输入管理员密码继续。"}
          targetLabel={approvalCopy?.target}
          confirmLabel={approvalCopy?.confirm}
          destructive={approvalCopy?.destructive}
          onCancel={() => setPendingAction(null)}
          onConfirm={runApprovedAction}
        />
      }
    >
      <aside className="relative w-56 shrink-0 border-r border-border bg-card/44 px-3 py-4">
        <div className="mb-5 flex items-center justify-between px-1">
          <div className="flex gap-2">
            {inWindow ? (
              <span aria-hidden className="block h-3 w-11" />
            ) : (
              <SystemAppTrafficLights closeLabel="关闭" onClose={onClose} />
            )}
          </div>
        </div>
        <div className="mb-4 flex items-center gap-3 rounded-2xl bg-card/72 p-3 ring-1 ring-border">
          <span className="grid size-10 place-items-center rounded-[14px] bg-primary text-primary-foreground shadow-sm">
            <Link2Icon className="size-5" />
          </span>
          <span className="min-w-0">
            <strong className="block text-[13px]">设备连接</strong>
            <small className="mt-0.5 block text-[12px] text-muted-foreground">
              {active
                ? `${status?.onlineDeviceCount ?? 0} 台在线`
                : "当前未开启"}
            </small>
          </span>
        </div>
        {(
          [
            ["devices", SmartphoneIcon, "我的设备"],
            ["pair", PlusIcon, "添加设备"],
            ["sync", UploadCloudIcon, "自动备份"],
            ["remote", Globe2Icon, "远程访问"],
          ] as const
        ).map(([id, Icon, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSection(id)}
            className={cn(
              "mt-1 flex h-9 w-full items-center gap-2 rounded-xl px-3 text-left text-[12px] font-medium transition",
              section === id
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:bg-card/70",
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
        <div className="absolute bottom-4 left-3 right-3 rounded-xl bg-card/45 px-3 py-2.5 text-[12px] leading-4 text-muted-foreground ring-1 ring-border">
          <span className="flex items-center gap-1.5 font-semibold text-muted-foreground">
            <ShieldCheckIcon className="size-3.5 text-core" />
            配对凭据受保护
          </span>
          状态页不会显示设备密钥；新增、关闭和移除均需管理员复核。
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-y-auto px-7 py-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight">
              {section === "devices"
                ? "我的设备"
                : section === "pair"
                  ? "添加设备"
                  : section === "sync"
                    ? "自动备份"
                    : "远程访问"}
            </h1>
            <p className="mt-1 text-[12px] text-muted-foreground">
              {section === "remote"
                ? "查看公网连接能力与当前安全边界"
                : section === "sync"
                  ? "按设备分别授权照片与文件，断点续传且不覆盖冲突版本"
                  : "连接手机与其他个人终端"}
            </p>
          </div>
          <button
            type="button"
            aria-label="刷新设备连接状态"
            disabled={loading}
            onClick={() => void refresh()}
            className="grid size-9 place-items-center rounded-full bg-card/72 text-muted-foreground shadow-sm ring-1 ring-border transition hover:bg-card disabled:opacity-50"
          >
            <RefreshCwIcon
              className={cn("size-4", loading && "animate-spin")}
            />
          </button>
        </header>

        {(error || directory.error) && (
          <p
            role="alert"
            className="mt-4 rounded-xl bg-breach/10 px-3 py-2.5 text-xs text-breach ring-1 ring-breach/30"
          >
            {error}
          </p>
        )}

        {loading && !status ? (
          <div className="grid min-h-72 place-items-center text-sm text-muted-foreground">
            <span className="flex items-center gap-2">
              <Loader2Icon className="size-5 animate-spin" /> 正在读取设备连接…
            </span>
          </div>
        ) : section === "devices" ? (
          <>
            <section
              data-echo-theme="graphite"
              className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[20px] bg-gradient-to-br from-[#1b1f25] to-[#0c0e11] p-5 text-foreground shadow-[var(--echo-shadow-raised)]"
            >
              <div className="flex items-center gap-3">
                <span
                  className={cn(
                    "grid size-11 place-items-center rounded-[15px]",
                    active ? "bg-core/16" : "bg-card/10",
                  )}
                >
                  {active ? (
                    <WifiIcon className="size-5 text-core" />
                  ) : (
                    <UnplugIcon className="size-5 text-white/55" />
                  )}
                </span>
                <div>
                  <strong className="block text-[15px]">
                    {active ? "局域网设备入口已开启" : "设备连接尚未开启"}
                  </strong>
                  <span className="mt-0.5 block text-[12px] text-white/50">
                    {active
                      ? `${status?.pairedDeviceCount ?? 0} 台已配对 · ${status?.onlineDeviceCount ?? 0} 台在线`
                      : "默认不开放网络监听，开启后才能配对设备"}
                  </span>
                </div>
              </div>
              {!status?.enabled && managed ? (
                <button
                  type="button"
                  onClick={() => setPendingAction({ kind: "enable" })}
                  className="h-9 rounded-full bg-card px-4 text-[12px] font-semibold text-core transition hover:bg-core/10"
                >
                  开启连接…
                </button>
              ) : active ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPendingAction({ kind: "pair" })}
                    className="h-9 rounded-full bg-card px-4 text-[12px] font-semibold text-core transition hover:bg-core/10"
                  >
                    添加设备…
                  </button>
                  {status?.canManageListener && (
                    <button
                      type="button"
                      onClick={() => setPendingAction({ kind: "disable" })}
                      className="h-9 rounded-full bg-card/10 px-3.5 text-[12px] font-semibold text-white/72 transition hover:bg-card/15"
                    >
                      关闭
                    </button>
                  )}
                </div>
              ) : null}
            </section>

            {status?.startupError && (
              <p className="mt-3 rounded-xl bg-warning/10 px-3 py-2.5 text-[12px] text-warning ring-1 ring-warning/30">
                设备入口启动失败：{status.startupError}
              </p>
            )}
            {status?.mode === "agent-shared" && (
              <p className="mt-3 rounded-xl bg-signal/10 px-3 py-2.5 text-[12px] leading-4 text-signal ring-1 ring-signal/30">
                当前是开发模式连接：所有设备共用一份配对凭据，暂不能单独撤销某一台。
                正式安装的 ECHO OS 会为每台设备单独签发凭据。
              </p>
            )}

            {intent === "phone-mirror" && (
              <PhoneMirrorNotice devices={status?.devices ?? []} />
            )}

            <div className="mt-4 space-y-3">
              {status?.devices.length ? (
                status.devices.map((device) => (
                  <DeviceCard
                    key={device.id}
                    device={device}
                    onOpenPhoneMirror={onOpenPhoneMirror}
                    onRevoke={() =>
                      setPendingAction({ kind: "revoke", device })
                    }
                  />
                ))
              ) : (
                <div className="grid min-h-44 place-items-center rounded-[20px] border border-dashed border-border bg-card/42 px-6 text-center">
                  <div>
                    <SmartphoneIcon className="mx-auto size-8 text-muted-foreground" />
                    <strong className="mt-3 block text-[13px] text-muted-foreground">
                      还没有已配对设备
                    </strong>
                    <p className="mt-1 text-[12px] text-muted-foreground">
                      开启连接后，从“添加设备”创建配对邀请。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : section === "pair" ? (
          <div className="mt-5">
            {!active ? (
              <section className="rounded-[22px] bg-card/72 p-6 text-center ring-1 ring-border">
                <RouterIcon className="mx-auto size-9 text-muted-foreground" />
                <h2 className="mt-3 text-[15px] font-semibold">
                  先开启局域网设备连接
                </h2>
                <p className="mx-auto mt-1 max-w-sm text-[12px] leading-5 text-muted-foreground">
                  Echo 默认不开放额外端口。开启后，手机才能在同一 Wi-Fi
                  中找到这台设备。
                </p>
                {managed && (
                  <button
                    type="button"
                    onClick={() => setPendingAction({ kind: "enable" })}
                    className="mt-4 h-9 rounded-full bg-primary px-5 text-[12px] font-semibold text-primary-foreground hover:bg-primary"
                  >
                    开启连接…
                  </button>
                )}
              </section>
            ) : invitation ? (
              <section className="rounded-[22px] bg-card/78 p-6 shadow-sm ring-1 ring-border">
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-[14px] bg-core/10 text-core">
                    <CheckIcon className="size-5" />
                  </span>
                  <div>
                    <h2 className="text-[15px] font-semibold">
                      配对邀请已创建
                    </h2>
                    <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
                      在 Echo Mobile 的“连接设备”中粘贴以下链接。
                      {invitation.expiresAt
                        ? " 邀请将在 5 分钟后失效；首次连接后只绑定该设备。"
                        : " 当前是开发模式连接，链接使用共享设备凭据。"}
                    </p>
                  </div>
                </div>
                <div className="mt-5 rounded-[16px] bg-primary p-4 text-primary-foreground shadow-inner">
                  <code className="block break-all text-[12px] leading-5 text-white/72">
                    {invitation.connectString}
                  </code>
                  <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
                    <span className="text-[12px] text-white/35">
                      {invitation.credentialMode === "per-device"
                        ? `有效至 ${timeLabel(invitation.expiresAt)}`
                        : "共享凭据 · 仅开发兼容模式"}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard
                          .writeText(invitation.connectString)
                          .then(() => {
                            setCopied(true);
                            window.setTimeout(() => setCopied(false), 1_500);
                          });
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full bg-card/12 px-3 text-[12px] font-semibold text-white transition hover:bg-card/18"
                    >
                      {copied ? (
                        <CheckIcon className="size-3.5" />
                      ) : (
                        <ClipboardIcon className="size-3.5" />
                      )}
                      {copied ? "已复制" : "复制配对链接"}
                    </button>
                  </div>
                </div>
                <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-4 text-muted-foreground">
                  <LockKeyholeIcon className="mt-0.5 size-3.5 shrink-0" />
                  <span>
                    配对链接包含设备凭据，请勿发送到群聊或公开网络。状态页与日志不会记录该链接。
                    {invitation.deviceSync
                      ? ` 自动备份入口已一并配置（${
                          invitation.deviceSync.transport === "tailnet-https"
                            ? "Tailscale 私网 HTTPS"
                            : "可信局域网"
                        }）。`
                      : " 当前共享凭据模式不提供自动备份。"}
                  </span>
                </p>
              </section>
            ) : (
              <section className="rounded-[22px] bg-card/72 p-6 text-center ring-1 ring-border">
                <Link2Icon className="mx-auto size-9 text-core" />
                <h2 className="mt-3 text-[15px] font-semibold">
                  连接一台新设备
                </h2>
                <p className="mx-auto mt-1 max-w-md text-[12px] leading-5 text-muted-foreground">
                  创建短时配对邀请。原生 Echo
                  模式下，邀请只会绑定首次使用它的设备，之后可单独撤销。
                </p>
                <button
                  type="button"
                  onClick={() => setPendingAction({ kind: "pair" })}
                  className="mt-4 h-9 rounded-full bg-primary px-5 text-[12px] font-semibold text-primary-foreground hover:bg-primary"
                >
                  创建配对邀请…
                </button>
              </section>
            )}
          </div>
        ) : section === "sync" ? (
          <div className="mt-5 space-y-4">
            <section
              data-echo-theme="graphite"
              className="rounded-[22px] bg-gradient-to-br from-[#1b1f25] to-[#0c0e11] p-5 text-foreground shadow-[0_18px_50px_rgba(0,0,0,.28)]"
            >
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-card/14">
                  <UploadCloudIcon className="size-6" />
                </span>
                <div>
                  <span className="rounded-full bg-core/20 px-2.5 py-1 text-[12px] font-semibold text-core">
                    服务端同步已就绪
                  </span>
                  <h2 className="mt-3 text-[18px] font-semibold">
                    每台设备、每类内容单独授权
                  </h2>
                  <p className="mt-1 max-w-lg text-[12px] leading-5 text-white/62">
                    手机凭据只可写入自己的备份目录。传输中断会从已保存位置继续；同名但内容不同的文件保留两份，不静默覆盖。
                  </p>
                </div>
              </div>
            </section>

            {!syncStatus ? (
              <section className="rounded-[20px] bg-card/72 p-5 text-center ring-1 ring-border">
                <UploadCloudIcon className="mx-auto size-8 text-muted-foreground" />
                <strong className="mt-3 block text-[13px] text-muted-foreground">
                  自动备份服务暂不可用
                </strong>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  请确认文件存储已经挂载，然后刷新状态。
                </p>
              </section>
            ) : !syncStatus.available ? (
              <section className="rounded-[20px] bg-warning/10 p-5 ring-1 ring-warning/30">
                <strong className="text-[13px] text-warning">
                  开发模式连接下不能开启自动备份
                </strong>
                <p className="mt-1 text-[12px] leading-5 text-warning">
                  共享凭据无法判断是哪台手机，也不能单独撤销。原生 Echo
                  的一机一凭据模式才会开放写入。
                </p>
              </section>
            ) : syncStatus.devices.length ? (
              syncStatus.devices.map((device) => (
                <section
                  key={device.id}
                  className="rounded-[20px] bg-card/78 p-4 shadow-[0_10px_30px_rgba(51,65,85,.06)] ring-1 ring-border"
                >
                  <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-[13px] bg-core/10 text-core">
                        <SmartphoneIcon className="size-4.5" />
                      </span>
                      <span className="min-w-0">
                        <strong className="block truncate text-[13px]">
                          {device.name}
                        </strong>
                        <small className="block truncate text-[12px] text-muted-foreground">
                          {device.id}
                        </small>
                      </span>
                    </div>
                    <span
                      className={cn(
                        "rounded-full px-2 py-1 text-[12px] font-semibold",
                        device.online
                          ? "bg-core/10 text-core"
                          : "bg-muted text-muted-foreground",
                      )}
                    >
                      {device.online ? "在线" : "离线可续传"}
                    </span>
                  </div>
                  <div className="divide-y divide-border">
                    {(
                      [
                        ["photos", ImagesIcon, "照片", "相机照片与图片"],
                        ["files", FileIcon, "文件", "文档与其他文件"],
                      ] as const
                    ).map(([scope, Icon, label, description]) => {
                      const enabled = device.grants[scope];
                      const summary = device.summary[scope];
                      return (
                        <div
                          key={scope}
                          className="flex items-center gap-3 py-3 first:pt-3 last:pb-0"
                        >
                          <span
                            className={cn(
                              "grid size-9 shrink-0 place-items-center rounded-xl",
                              scope === "photos"
                                ? "bg-breach/10 text-breach"
                                : "bg-warning/10 text-warning",
                            )}
                          >
                            <Icon className="size-4.5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <strong className="text-[12px]">{label}</strong>
                              {summary.conflicts > 0 && (
                                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[12px] font-semibold text-warning">
                                  {summary.conflicts} 个冲突已保留
                                </span>
                              )}
                            </div>
                            <p className="mt-0.5 text-[12px] text-muted-foreground">
                              {enabled
                                ? `${summary.committed} 项 · ${bytesLabel(summary.bytes)}${summary.uploading ? ` · ${summary.uploading} 项续传中` : ""}`
                                : description}
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label={`${enabled ? "关闭" : "开启"}${label}备份：${device.name}`}
                            onClick={() =>
                              setPendingAction({
                                kind: "sync",
                                device,
                                scope,
                                enabled: !enabled,
                              })
                            }
                            className={cn(
                              "h-8 rounded-full px-3 text-[12px] font-semibold transition",
                              enabled
                                ? "bg-core/10 text-core hover:bg-core/10"
                                : "bg-primary text-primary-foreground hover:bg-primary",
                            )}
                          >
                            {enabled ? "已开启" : "开启…"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              ))
            ) : (
              <section className="rounded-[20px] border border-dashed border-border bg-card/42 p-6 text-center">
                <SmartphoneIcon className="mx-auto size-8 text-muted-foreground" />
                <strong className="mt-3 block text-[13px] text-muted-foreground">
                  配对设备后再开启备份
                </strong>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  只有原生一机一凭据的设备才会出现在这里。
                </p>
              </section>
            )}

            <p className="flex items-start gap-1.5 px-1 text-[12px] leading-4 text-muted-foreground">
              <ShieldCheckIcon className="mt-0.5 size-3.5 shrink-0 text-core" />
              Echo 只保存自己的同步账本，不直接读写 Agent
              私有数据库。照片完成后会自动出现在照片库；移动端需使用本版本同步协议。
            </p>
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <section
              data-echo-theme="graphite"
              className="rounded-[22px] bg-gradient-to-br from-[#1b1f25] to-[#0c0e11] p-6 text-foreground shadow-[var(--echo-shadow-raised)]"
            >
              <div className="flex items-start gap-4">
                <span className="grid size-12 shrink-0 place-items-center rounded-[16px] bg-card/10">
                  <Globe2Icon className="size-6 text-core" />
                </span>
                <div className="min-w-0 flex-1">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[12px] font-semibold",
                      remoteConnected
                        ? "bg-core/20 text-core"
                        : remote?.configured
                          ? "bg-core/20 text-core"
                          : "bg-warning/20 text-warning",
                    )}
                  >
                    {remoteConnected
                      ? "私网已连接"
                      : remote?.configured
                        ? "正在连接"
                        : "尚未配置"}
                  </span>
                  <h2 className="mt-3 text-[18px] font-semibold">
                    {remoteConnected
                      ? "已可从个人私网访问 Echo"
                      : remote?.configured
                        ? "正在等待 Tailscale 完成授权"
                        : "当前只支持同一局域网"}
                  </h2>
                  <p className="mt-1 max-w-lg text-[12px] leading-5 text-white/55">
                    {remoteConnected
                      ? "Echo 桌面通过 Tailscale 的 WireGuard 私网和 HTTPS 提供访问，不开放公网匿名入口。"
                      : remote?.configured
                        ? "安全网关已经配置，但尚未取得可用的私网地址。请检查 Tailscale 授权和网络连接。"
                        : "Echo 还没有启用私有网络或云中继，因此外网下不会暴露这台设备，也不会把局域网连接误报成“远程访问”。"}
                  </p>
                  {remoteConnected && remote?.endpoint && (
                    <a
                      href={remote.endpoint}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-full bg-card px-4 text-[12px] font-semibold text-core transition hover:bg-core/10"
                    >
                      打开远程地址
                      <ExternalLinkIcon className="size-3.5" />
                    </a>
                  )}
                </div>
              </div>
            </section>
            <section className="grid gap-3 sm:grid-cols-2">
              <article className="rounded-[18px] bg-card/75 p-4 ring-1 ring-border">
                <span className="grid size-9 place-items-center rounded-xl bg-core/10 text-core">
                  <ShieldCheckIcon className="size-4.5" />
                </span>
                <strong className="mt-3 block text-[13px]">
                  {remoteConnected ? "远程网页已经具备" : "现在已经具备"}
                </strong>
                <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  {remoteConnected
                    ? "桌面、文件管理和照片页面可通过个人 Tailnet 加密访问；入口仍受 ECHO 登录、Origin 防护和管理员审批保护。"
                    : "管理员复核、短时邀请、一机一凭据、单设备撤销，以及每台设备的在线状态和能力上报。"}
                </p>
              </article>
              <article className="rounded-[18px] bg-card/75 p-4 ring-1 ring-border">
                <span className="grid size-9 place-items-center rounded-xl bg-core/10 text-core">
                  <RouterIcon className="size-4.5" />
                </span>
                <strong className="mt-3 block text-[13px]">
                  {remoteConnected ? "仍然保持边界" : "下一步还要补"}
                </strong>
                <p className="mt-1 text-[12px] leading-5 text-muted-foreground">
                  {remoteConnected
                    ? remote?.features.fileSync && remote.features.photoSync
                      ? "手机控制端口仍只在局域网开放；已授权设备可通过 Tailnet HTTPS 断点备份文件与照片。"
                      : "手机控制端口仍只在局域网开放；当前远程网关还未挂载设备备份接口。"
                    : "Tailscale 私网或受控中继、HTTPS、外网可达性检测，以及文件与照片的断点同步。"}
                </p>
              </article>
            </section>
            <p className="flex items-center gap-1.5 px-1 text-[12px] text-muted-foreground">
              <WifiIcon className="size-3.5" />
              {remoteConnected
                ? "远程桌面：WireGuard + HTTPS · 设备配对：局域网凭据认证"
                : `设备配对：${status?.transport.protocol ?? "websocket"} · 凭据认证 · ${status?.transport.encrypted ? "已加密" : "局域网未加密"}`}
            </p>
          </div>
        )}
        {directory.nearby
          .filter(
            (nearby) =>
              !status?.devices.some((device) => device.id === nearby.id),
          )
          .map((device) => (
            <p key={device.id} className="mx-4 rounded-xl border p-3 text-xs">
              {device.name} · 附近待配对 · {device.address}
              <br />
              创建配对邀请并在目标手机确认后连接。
            </p>
          ))}
        <DeviceTaskSection />
        <details className="m-4">
          <summary className="cursor-pointer text-sm">全部文件传输</summary>
          <PhoneTransferList />
        </details>
      </main>
    </SystemAppFrame>
  );
}
