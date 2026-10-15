import { useEffect, useMemo, useState } from "react";
import {
  ArchiveIcon,
  AudioLinesIcon,
  DatabaseIcon,
  FileTextIcon,
  FilmIcon,
  FolderIcon,
  FoldersIcon,
  HardDriveIcon,
  ImageIcon,
  Loader2Icon,
  PackageIcon,
  RefreshCwIcon,
  ShieldCheckIcon,
  Trash2Icon,
  TriangleAlertIcon,
  UploadCloudIcon,
} from "lucide-react";

import {
  fetchStorageUsage,
  formatSize,
  type StorageUsage,
} from "@/appliance/files";
import { BtrfsRaid1Panel } from "@/appliance/btrfs-raid1-panel";
import { DiskIdlePanel } from "@/appliance/disk-idle-panel";
import { Ext4VolumePanel } from "@/appliance/ext4-volume-panel";
import { OmvSharingPanel } from "@/appliance/omv-sharing-panel";
import { MdRaid1Panel } from "@/appliance/mdraid1-panel";
import { MdRaid1RepairPanel } from "@/appliance/mdraid1-repair-panel";
import { NasBackupPanel } from "@/appliance/nas-backup-panel";
import { OmvStorageHealth } from "@/appliance/omv-storage-health";
import { NutDeviceConfigPanel } from "@/appliance/nut-device-config-panel";
import { SmartSchedulePanel } from "@/appliance/smart-schedule-panel";
import { UpsPanel } from "@/appliance/ups-panel";
import { ZfsMirrorPanel } from "@/appliance/zfs-mirror-panel";
import {
  SystemAppFrame,
  SystemAppLightsSpacer,
  useInSystemAppWindow,
  SystemAppTrafficLights,
} from "@/appliance/system-app-window";
import { cn } from "@/lib/utils";

type StorageCenterSection = "overview" | "health" | "pools" | "sharing";
type StorageHealthSection = "status" | "backup" | "maintenance";
type StoragePoolTechnology = "btrfs" | "mdraid-ext4" | "zfs";

// Capacity series: the core tone leads, the rest step down in lightness (not hue),
// so the bar stays on-brand and the categories remain distinguishable without colour.
const CATEGORY_META = {
  photos: { label: "照片", icon: ImageIcon, color: "bg-core" },
  videos: { label: "视频", icon: FilmIcon, color: "bg-foreground/85" },
  audio: { label: "音频", icon: AudioLinesIcon, color: "bg-foreground/65" },
  documents: { label: "文档", icon: FileTextIcon, color: "bg-foreground/45" },
  archives: { label: "归档", icon: ArchiveIcon, color: "bg-foreground/30" },
  other: { label: "其他", icon: PackageIcon, color: "bg-foreground/15" },
} as const;

function percent(value: number, total: number) {
  return total > 0 ? Math.max(0, Math.min(100, (value / total) * 100)) : 0;
}

function count(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

const STORAGE_POOL_TECHNOLOGIES: Array<{
  id: StoragePoolTechnology;
  label: string;
  description: string;
}> = [
  {
    id: "btrfs",
    label: "Btrfs RAID1",
    description: "双盘一体化卷，支持校验和、换盘与 scrub",
  },
  {
    id: "mdraid-ext4",
    label: "RAID1 + EXT4",
    description: "兼容 Linux 工具链，先创建阵列再挂载数据卷",
  },
  {
    id: "zfs",
    label: "ZFS 镜像",
    description: "镜像存储池与数据集",
  },
];

const STORAGE_HEALTH_SECTIONS: Array<{
  id: StorageHealthSection;
  label: string;
  description: string;
}> = [
  {
    id: "status",
    label: "磁盘状态",
    description: "设备、卷、阵列与 SMART 健康",
  },
  {
    id: "backup",
    label: "数据备份",
    description: "异机 NAS 备份与恢复就绪度",
  },
  {
    id: "maintenance",
    label: "维护与电源",
    description: "休眠、自检计划和 UPS 保护",
  },
];

function StorageHealthWorkspace() {
  const [healthSection, setHealthSection] =
    useState<StorageHealthSection>("status");
  const selected = STORAGE_HEALTH_SECTIONS.find(
    (item) => item.id === healthSection,
  )!;

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 px-7 py-4 backdrop-blur-xl">
        <div
          role="tablist"
          aria-label="存储健康与保护"
          className="grid grid-cols-3 gap-2"
        >
          {STORAGE_HEALTH_SECTIONS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={healthSection === item.id}
              aria-controls="storage-health-section-panel"
              onClick={() => setHealthSection(item.id)}
              className={cn(
                "rounded-xl px-3 py-2.5 text-left transition",
                healthSection === item.id
                  ? "bg-card text-core shadow-sm ring-1 ring-core/30"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
              )}
            >
              <strong className="block text-xs font-semibold">
                {item.label}
              </strong>
              <span className="mt-0.5 block text-[12px] leading-4 opacity-75">
                {item.description}
              </span>
            </button>
          ))}
        </div>
      </div>
      <div
        id="storage-health-section-panel"
        role="tabpanel"
        aria-label={selected.label}
        className="mx-auto w-full max-w-[980px] px-7 py-7"
      >
        {healthSection === "status" ? (
          <OmvStorageHealth />
        ) : healthSection === "backup" ? (
          <NasBackupPanel />
        ) : (
          <>
            <DiskIdlePanel />
            <SmartSchedulePanel />
            <NutDeviceConfigPanel />
            <UpsPanel />
          </>
        )}
      </div>
    </div>
  );
}

function StoragePoolsWorkspace() {
  const [technology, setTechnology] = useState<StoragePoolTechnology>("btrfs");
  const selected = STORAGE_POOL_TECHNOLOGIES.find(
    (item) => item.id === technology,
  )!;

  return (
    <div>
      <div className="sticky top-0 z-10 border-b border-border bg-background/90 px-7 py-4 backdrop-blur-xl">
        <div
          role="tablist"
          aria-label="存储池技术"
          className="grid grid-cols-3 gap-2"
        >
          {STORAGE_POOL_TECHNOLOGIES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={technology === item.id}
              aria-controls="storage-pool-technology-panel"
              onClick={() => setTechnology(item.id)}
              className={cn(
                "rounded-xl px-3 py-2.5 text-left transition",
                technology === item.id
                  ? "bg-card text-core shadow-sm ring-1 ring-core/30"
                  : "text-muted-foreground hover:bg-card/70 hover:text-foreground",
              )}
            >
              <strong className="block text-xs font-semibold">
                {item.label}
              </strong>
              <span className="mt-0.5 block text-[12px] leading-4 opacity-75">
                {item.description}
              </span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[12px] text-muted-foreground">
          当前查看：{selected.label}。不同方案不会同时执行或混用磁盘。
        </p>
      </div>
      <div
        id="storage-pool-technology-panel"
        role="tabpanel"
        aria-label={selected.label}
      >
        {technology === "btrfs" ? (
          <BtrfsRaid1Panel />
        ) : technology === "mdraid-ext4" ? (
          <>
            <MdRaid1Panel />
            <MdRaid1RepairPanel />
            <Ext4VolumePanel />
          </>
        ) : (
          <ZfsMirrorPanel />
        )}
      </div>
    </div>
  );
}

export function StorageOverview({ onOpenFiles }: { onOpenFiles?: () => void }) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = (fresh = false) => {
    setLoading(true);
    setError(null);
    fetchStorageUsage(fresh)
      .then(setUsage)
      .catch((reason) => {
        setUsage(null);
        setError(reason instanceof Error ? reason.message : "无法读取存储容量");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => refresh(), []);

  const categories = useMemo(
    () => (usage?.categories ?? []).filter((category) => category.bytes > 0),
    [usage],
  );
  // Space the volume uses outside the NAS library and its trash (system,
  // apps, other data); without it the bar looked empty on a full disk.
  const otherUsedBytes = usage
    ? Math.max(
        0,
        usage.disk.usedBytes -
          categories.reduce((sum, category) => sum + category.bytes, 0) -
          usage.trash.bytes,
      )
    : 0;
  const capacityKnown =
    usage != null &&
    Number.isFinite(usage.disk.totalBytes) &&
    usage.disk.totalBytes > 0 &&
    Number.isFinite(usage.disk.usedPercent) &&
    usage.disk.usedPercent >= 0 &&
    usage.disk.usedPercent <= 100;
  const capacityState = !capacityKnown
    ? "unknown"
    : usage.disk.usedPercent >= 95
      ? "critical"
      : usage.disk.usedPercent >= 90
        ? "warning"
        : "healthy";
  const largestFolderBytes = usage?.topFolders[0]?.bytes ?? 0;

  return (
    <div className="mx-auto w-full max-w-[980px] px-7 py-7">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-[25px] font-semibold tracking-tight text-foreground">
            存储概览
          </h1>
          <p className="mt-1 text-[12px] text-muted-foreground">
            本机容量、内容分布、回收站与上传预留，一处看清
          </p>
        </div>
        <button
          type="button"
          onClick={() => refresh(true)}
          disabled={loading}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-card/78 px-3.5 text-[12px] font-semibold text-muted-foreground shadow-sm ring-1 ring-border transition hover:bg-card disabled:opacity-50"
        >
          <RefreshCwIcon
            className={cn("size-3.5", loading && "animate-spin")}
          />
          重新分析
        </button>
      </header>

      {error && (
        <div
          role="alert"
          className="mt-5 rounded-2xl bg-breach/10 px-4 py-3 text-xs text-breach ring-1 ring-breach/30"
        >
          {error}
        </div>
      )}

      {loading && !usage ? (
        <div className="grid min-h-72 place-items-center text-muted-foreground">
          <span className="flex items-center gap-2 text-sm">
            <Loader2Icon className="size-5 animate-spin" /> 正在分析本机存储…
          </span>
        </div>
      ) : usage ? (
        <>
          <section
            data-echo-theme="graphite"
            className="mt-5 overflow-hidden rounded-[22px] bg-gradient-to-br from-[#1b1f25] to-[#0c0e11] p-5 text-foreground shadow-[0_20px_50px_rgba(15,23,42,.22)]"
          >
            <div className="flex flex-wrap items-start justify-between gap-5">
              <div>
                <span className="text-[12px] font-medium text-white/55">
                  当前 NAS 数据卷
                </span>
                <div className="mt-1 text-[30px] font-semibold tracking-tight">
                  {capacityKnown
                    ? formatSize(usage.disk.totalBytes)
                    : "总容量尚未确认"}
                </div>
                <p className="mt-1 text-[12px] text-white/55">
                  {capacityKnown
                    ? `可用 ${formatSize(usage.disk.freeBytes)}`
                    : "请检查卷挂载状态后重新分析"}{" "}
                  · 文件库占用 {formatSize(usage.library.logicalBytes)}
                </p>
              </div>
              <div
                className={cn(
                  "flex items-center gap-2 rounded-full px-3 py-1.5 text-[12px] font-semibold",
                  capacityState === "critical"
                    ? "bg-breach/18 text-breach"
                    : capacityState === "warning"
                      ? "bg-warning/20 text-warning"
                      : capacityState === "healthy"
                        ? "bg-core/20 text-core"
                        : "bg-card/10 text-white/70",
                )}
              >
                {capacityState === "healthy" ? (
                  <ShieldCheckIcon className="size-4" />
                ) : (
                  <TriangleAlertIcon className="size-4" />
                )}
                {capacityKnown
                  ? `已使用 ${usage.disk.usedPercent}%`
                  : "容量状态未知"}
              </div>
            </div>
            <div
              data-testid="storage-capacity-bar"
              className="mt-5 flex h-3 overflow-hidden rounded-full bg-foreground/10"
            >
              {categories.map((category) => {
                const meta = CATEGORY_META[category.id];
                return (
                  <span
                    key={category.id}
                    className={meta.color}
                    style={{
                      width: `${percent(category.bytes, usage.disk.totalBytes)}%`,
                      minWidth: category.bytes > 0 ? 3 : 0,
                    }}
                    title={`${meta.label} ${formatSize(category.bytes)}`}
                  />
                );
              })}
              {usage.trash.bytes > 0 && (
                <span
                  className="bg-slate-300/75"
                  style={{
                    width: `${percent(usage.trash.bytes, usage.disk.totalBytes)}%`,
                    minWidth: 3,
                  }}
                  title={`回收站 ${formatSize(usage.trash.bytes)}`}
                />
              )}
              {otherUsedBytes > 0 && (
                <span
                  data-segment="other-used"
                  className="bg-foreground/25"
                  style={{
                    width: `${percent(otherUsedBytes, usage.disk.totalBytes)}%`,
                    minWidth: 3,
                  }}
                  title={`文件库以外的占用 ${formatSize(otherUsedBytes)}`}
                />
              )}
            </div>
            <div className="mt-2 flex justify-between text-[12px] text-white/45">
              <span>已用 {formatSize(usage.disk.usedBytes)}</span>
              <span>
                上传可用 {formatSize(usage.disk.availableForUploadsBytes)}
              </span>
            </div>
          </section>

          <section className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            {categories.map((category) => {
              const meta = CATEGORY_META[category.id];
              const Icon = meta.icon;
              return (
                <article
                  key={category.id}
                  className="rounded-[18px] bg-card/76 p-4 shadow-[0_8px_28px_rgba(51,65,85,.07)] ring-1 ring-border"
                >
                  <span
                    className={cn(
                      "grid size-9 place-items-center rounded-xl text-white shadow-sm",
                      meta.color,
                    )}
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <strong className="mt-3 block text-[16px] text-foreground">
                    {formatSize(category.bytes)}
                  </strong>
                  <span className="mt-0.5 block text-[12px] text-muted-foreground">
                    {meta.label} · {count(category.files)} 个文件
                  </span>
                </article>
              );
            })}
            {categories.length === 0 && (
              <p className="col-span-full rounded-[18px] bg-card/70 p-5 text-sm text-muted-foreground">
                文件库还是空的，可以从文件管理器上传内容。
              </p>
            )}
          </section>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.35fr_.9fr]">
            <section className="rounded-[20px] bg-card/78 p-5 shadow-[0_10px_30px_rgba(51,65,85,.07)] ring-1 ring-border">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-[14px] font-semibold text-foreground">
                    占用最多的文件夹
                  </h2>
                  <p className="mt-0.5 text-[12px] text-muted-foreground">
                    仅统计 NAS 文件库，不读取文件内容
                  </p>
                </div>
                {onOpenFiles && (
                  <button
                    type="button"
                    onClick={onOpenFiles}
                    className="rounded-full bg-core/10 px-3 py-1.5 text-[12px] font-semibold text-core transition hover:bg-core/10"
                  >
                    管理文件
                  </button>
                )}
              </div>
              <div className="mt-4 space-y-3">
                {usage.topFolders.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    暂无顶层文件夹数据
                  </p>
                ) : (
                  usage.topFolders.slice(0, 7).map((folder) => (
                    <div key={folder.name}>
                      <div className="flex items-center justify-between gap-3 text-[12px]">
                        <span className="flex min-w-0 items-center gap-1.5 font-medium text-foreground">
                          <FolderIcon className="size-3.5 shrink-0 text-core" />
                          <span className="truncate">{folder.name}</span>
                        </span>
                        <span className="shrink-0 text-muted-foreground">
                          {formatSize(folder.bytes)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-core"
                          style={{
                            width: `${percent(folder.bytes, largestFolderBytes)}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="space-y-3">
              <article className="rounded-[18px] bg-card/78 p-4 shadow-[0_10px_28px_rgba(51,65,85,.06)] ring-1 ring-border">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-muted text-muted-foreground">
                    <Trash2Icon className="size-4" />
                  </span>
                  <div>
                    <strong className="block text-[13px] text-foreground">
                      回收站 {formatSize(usage.trash.bytes)}
                    </strong>
                    <span className="text-[12px] text-muted-foreground">
                      {count(usage.trash.files)}{" "}
                      个文件，可在文件管理器恢复或清空
                    </span>
                  </div>
                </div>
              </article>
              <article className="rounded-[18px] bg-card/78 p-4 shadow-[0_10px_28px_rgba(51,65,85,.06)] ring-1 ring-border">
                <div className="flex items-center gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-core/10 text-core">
                    <UploadCloudIcon className="size-4" />
                  </span>
                  <div>
                    <strong className="block text-[13px] text-foreground">
                      {usage.uploads.active > 0
                        ? `${usage.uploads.active} 个上传任务保留空间`
                        : "当前没有上传预留"}
                    </strong>
                    <span className="text-[12px] text-muted-foreground">
                      已预留 {formatSize(usage.uploads.reservedBytes)}
                      ，不会与新上传争抢容量
                    </span>
                  </div>
                </div>
              </article>
              {usage.quotas.map((quota) => (
                <article
                  key={quota.path}
                  className="rounded-[18px] bg-card/78 p-4 shadow-[0_10px_28px_rgba(51,65,85,.06)] ring-1 ring-border"
                >
                  <div className="flex items-center justify-between gap-3 text-[12px]">
                    <strong className="truncate text-foreground">
                      {quota.path === "." ? "文件库" : quota.path} 配额
                    </strong>
                    <span className="text-muted-foreground">
                      {quota.estimated ? "估算 " : ""}
                      {Math.round(
                        percent(
                          quota.usedBytes + quota.reservedBytes,
                          quota.limitBytes,
                        ),
                      )}
                      %
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${percent(quota.usedBytes + quota.reservedBytes, quota.limitBytes)}%`,
                      }}
                    />
                  </div>
                </article>
              ))}
            </section>
          </div>

          {(usage.library.truncated || usage.library.skippedLinks > 0) && (
            <p className="mt-4 rounded-xl bg-warning/10 px-4 py-3 text-[12px] leading-5 text-warning">
              {usage.library.truncated
                ? `文件超过 ${count(usage.library.maxEntries)} 项，本次展示为安全上限内的估算。`
                : ""}
              {usage.library.skippedLinks > 0
                ? ` 已跳过 ${count(usage.library.skippedLinks)} 个符号链接，不会读取 NAS 根目录之外的内容。`
                : ""}
            </p>
          )}
        </>
      ) : null}
    </div>
  );
}

export function StorageCenterPanel({
  open,
  onClose,
  onOpenFiles,
}: {
  open: boolean;
  onClose: () => void;
  onOpenFiles?: () => void;
}) {
  const inWindow = useInSystemAppWindow();
  const [section, setSection] = useState<StorageCenterSection>("overview");

  useEffect(() => {
    // 窗口形态下 Esc 不关闭整个应用，与其他桌面窗口一致。
    if (!open || inWindow) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inWindow, onClose, open]);

  if (!open) return null;

  const sections = [
    { id: "overview" as const, label: "容量概览", icon: HardDriveIcon },
    { id: "health" as const, label: "健康与保护", icon: ShieldCheckIcon },
    { id: "pools" as const, label: "存储池", icon: DatabaseIcon },
    { id: "sharing" as const, label: "共享与用户", icon: FoldersIcon },
  ];

  return (
    <SystemAppFrame
      label="存储中心"
      onClose={onClose}
      overlayClassName="fixed inset-0 z-[89] flex items-center justify-center bg-slate-950/18 p-4 backdrop-blur-[2px]"
      className="relative flex h-[min(780px,calc(100vh-56px))] w-[min(1120px,calc(100vw-28px))] overflow-hidden rounded-[24px] border border-border bg-background/94 text-foreground shadow-[0_34px_100px_rgba(15,23,42,.34)] backdrop-blur-3xl"
      windowClassName="relative flex size-full overflow-hidden bg-background text-foreground"
    >
      <aside className="w-[210px] shrink-0 border-r border-border bg-card/52 p-4 backdrop-blur-2xl">
        <div className="flex items-center gap-2 px-1">
          {inWindow ? (
            <SystemAppLightsSpacer />
          ) : (
            <SystemAppTrafficLights
              closeLabel="关闭存储中心"
              onClose={onClose}
            />
          )}
        </div>
        <div className="mt-7 px-2">
          <span className="grid size-12 place-items-center rounded-[15px] bg-gradient-to-br from-[#1b1f25] to-[#0c0e11] text-[#eef1f4] shadow-lg shadow-black/25">
            <HardDriveIcon className="size-6" />
          </span>
          <h1 className="mt-3 text-[18px] font-semibold tracking-tight">
            存储中心
          </h1>
          <p className="mt-1 text-[12px] leading-4 text-muted-foreground">
            容量、磁盘与家庭共享
          </p>
        </div>
        <nav className="mt-7 space-y-1" aria-label="存储中心导航">
          {sections.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={cn(
                  "flex h-10 w-full items-center gap-2.5 rounded-xl px-3 text-left text-[12px] font-semibold transition",
                  section === item.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-muted-foreground hover:bg-card/82 hover:text-foreground",
                )}
              >
                <Icon className="size-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto hidden" />
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_85%_0%,rgba(125,211,252,.16),transparent_38%)]">
        {section === "overview" ? (
          <StorageOverview onOpenFiles={onOpenFiles} />
        ) : section === "health" ? (
          <StorageHealthWorkspace />
        ) : section === "pools" ? (
          <StoragePoolsWorkspace />
        ) : (
          <div className="mx-auto w-full max-w-[980px] px-7 py-7">
            <OmvSharingPanel />
          </div>
        )}
      </main>
    </SystemAppFrame>
  );
}
