import { useRef, useState } from "react";
import {
  BookOpen,
  ChevronRight,
  Monitor,
  Puzzle,
  Settings,
  Sparkles,
  Volume2,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { readDesktopWallpaperUrl } from "@/appliance/use-desktop-appearance";
import { useTVDialogFocus } from "./use-tv-focus";
import { TVModelSettings } from "./model-settings";
import { TVLibrarySettings } from "./library-settings";
import { TVPluginSettings } from "./plugin-settings";
import {
  readTVPreferences,
  saveTVPreferences,
  TV_WALLPAPERS,
  DEFAULT_TV_WALLPAPER,
} from "@/core/tv/preferences";
import { useTVAction, TVConfirm } from "./settings-shared";

export type TVSettingsSection =
  | "general"
  | "models"
  | "sources"
  | "plugins"
  | "device";
const sections = [
  {
    id: "general",
    label: "画面与操作",
    icon: Monitor,
    description: "让每一眼，都更合你意。",
  },
  {
    id: "models",
    label: "模型与账号",
    icon: Sparkles,
    description: "连接你喜欢的智能。",
  },
  {
    id: "sources",
    label: "资料来源",
    icon: BookOpen,
    description: "让你的资料，成为答案。",
  },
  {
    id: "plugins",
    label: "插件",
    icon: Puzzle,
    description: "扩展大屏的更多可能。",
  },
  {
    id: "device",
    label: "声音与设备",
    icon: Volume2,
    description: "声音、显示，一切恰到好处。",
  },
] as const;

function TVDeviceSettings() {
  const action = useTVAction();
  const [confirm, setConfirm] = useState<{
    text: string;
    run: () => Promise<unknown>;
  } | null>(null);
  const controls = useQuery({
    queryKey: ["tv-native-controls"],
    queryFn: async () => {
      if (!window.echo?.systemControls)
        throw new Error("当前环境不支持设备控制");
      return window.echo.systemControls.getState();
    },
    retry: false,
  });
  const info = useQuery({
    queryKey: ["tv-native-info"],
    queryFn: async () => {
      if (!window.echo?.desktop) throw new Error("当前环境不支持设备信息");
      return window.echo.desktop.getSystemInfo();
    },
    retry: false,
  });
  const version = useQuery({
    queryKey: ["tv-native-version"],
    queryFn: async () => window.echo?.app.getVersion() ?? "网页版",
    retry: false,
  });
  const apply = async (
    work: () => Promise<{ ok: boolean; error?: string }>,
  ) => {
    const r = await work();
    if (!r.ok) throw new Error(r.error || "设备操作失败");
    await controls.refetch();
  };
  return (
    <section>
      <h3>声音与设备</h3>
      <p>
        Echo OS {version.data} · {info.data?.platform ?? "Linux"}
      </p>
      {info.data?.ok && (
        <p>
          {info.data.cpu?.cores} 核 · 内存{" "}
          {Math.round(info.data.memory?.percent ?? 0)}% · 运行{" "}
          {Math.floor((info.data.uptime ?? 0) / 60)} 分钟
        </p>
      )}
      {controls.isError && (
        <p role="alert">
          设备控制暂不可用
          <button data-tv-focus onClick={() => void controls.refetch()}>
            重试
          </button>
        </p>
      )}
      <div className="tv-settings-row">
        <span>
          系统音量
          <small>
            {controls.data?.audio.available
              ? `${controls.data.audio.volume ?? 0}%`
              : "此设备没有可控制的音量"}
          </small>
        </span>
        <button
          data-tv-focus
          disabled={action.busy || !controls.data?.audio.available}
          onClick={() =>
            void action.run(
              () =>
                apply(() =>
                  window.echo!.systemControls!.setAudioVolume(
                    Math.max(0, (controls.data!.audio.volume ?? 0) - 10),
                  ),
                ),
              "音量已调整",
            )
          }
        >
          音量减小
        </button>
        <button
          data-tv-focus
          disabled={action.busy || !controls.data?.audio.available}
          onClick={() =>
            void action.run(
              () =>
                apply(() =>
                  window.echo!.systemControls!.setAudioVolume(
                    Math.min(100, (controls.data!.audio.volume ?? 0) + 10),
                  ),
                ),
              "音量已调整",
            )
          }
        >
          音量增大
        </button>
      </div>
      <div className="tv-settings-row">
        <span>
          显示亮度
          <small>
            {controls.data?.display.available
              ? `${controls.data.display.brightness}%`
              : "此显示设备不支持亮度调节"}
          </small>
        </span>
        {[-10, 10].map((delta) => (
          <button
            key={delta}
            data-tv-focus
            disabled={action.busy || !controls.data?.display.available}
            onClick={() =>
              void action.run(
                () =>
                  apply(() =>
                    window.echo!.systemControls!.setDisplayBrightness(
                      Math.max(
                        0,
                        Math.min(
                          100,
                          (controls.data!.display.brightness ?? 50) + delta,
                        ),
                      ),
                    ),
                  ),
                "亮度已调整",
              )
            }
          >
            {delta < 0 ? "降低亮度" : "提高亮度"}
          </button>
        ))}
      </div>
      <div className="tv-actions">
        <button
          data-tv-focus
          disabled={action.busy || !controls.data?.wifi.available}
          onClick={() =>
            setConfirm({
              text: `将${controls.data!.wifi.enabled ? "关闭" : "开启"} Wi-Fi。关闭会中断正在使用该网络的连接。`,
              run: () =>
                apply(() =>
                  window.echo!.systemControls!.setWifiEnabled(
                    !controls.data!.wifi.enabled,
                  ),
                ),
            })
          }
        >
          Wi-Fi {controls.data?.wifi.enabled ? "开" : "关"}
        </button>
        <button
          data-tv-focus
          disabled={action.busy || !controls.data?.bluetooth.available}
          onClick={() =>
            setConfirm({
              text: `将${controls.data!.bluetooth.enabled ? "关闭" : "开启"}蓝牙。关闭后蓝牙遥控器和音频设备会断开。`,
              run: () =>
                apply(() =>
                  window.echo!.systemControls!.setBluetoothEnabled(
                    !controls.data!.bluetooth.enabled,
                  ),
                ),
            })
          }
        >
          蓝牙 {controls.data?.bluetooth.enabled ? "开" : "关"}
        </button>
        <button
          data-tv-focus
          onClick={() => void Promise.all([controls.refetch(), info.refetch()])}
        >
          刷新设备状态
        </button>
      </div>
      {action.feedback}
      {confirm && (
        <TVConfirm
          title="确认设备变更"
          busy={action.busy}
          onCancel={() => setConfirm(null)}
          onConfirm={() =>
            void action.run(async () => {
              await confirm.run();
              setConfirm(null);
            }, "设备设置已更新")
          }
        >
          {confirm.text}
        </TVConfirm>
      )}
    </section>
  );
}

export function TVSettings({
  onClose,
  initialSection = "general",
  direct = false,
}: {
  onClose: () => void;
  initialSection?: TVSettingsSection;
  direct?: boolean;
}) {
  const root = useRef<HTMLDivElement>(null);
  useTVDialogFocus(root);
  const [section, setSection] = useState<TVSettingsSection>(initialSection),
    [preferences, setPreferences] = useState(readTVPreferences);
  const [overview, setOverview] = useState(
    initialSection === "general" && !direct,
  );
  const selected = sections.find((s) => s.id === section)!;
  const SectionIcon = overview ? Settings : selected.icon;
  const openSection = (id: TVSettingsSection) => {
    setSection(id);
    setOverview(false);
    requestAnimationFrame(() =>
      root.current
        ?.querySelector<HTMLElement>(".tv-settings-content [data-tv-focus]")
        ?.focus(),
    );
  };
  const back = () => {
    if (overview || direct) onClose();
    else {
      setOverview(true);
      requestAnimationFrame(() =>
        root.current
          ?.querySelector<HTMLElement>(`[data-section="${section}"]`)
          ?.focus(),
      );
    }
  };
  const action = useTVAction();
  return (
    <div className="tv-dialog-backdrop">
      <section
        ref={root}
        data-tv-dialog
        role="dialog"
        aria-modal="true"
        aria-label="娱乐模式设置"
        className="tv-settings"
        data-overview={overview}
      >
        <header className="tv-panel-header">
          <button data-tv-focus data-tv-back onClick={back}>
            {overview || direct ? "返回娱乐模式" : "返回设置"}
          </button>
        </header>
        <div className="tv-settings-layout">
          <div className="tv-settings-intro">
            <span className="tv-settings-symbol">
              <SectionIcon />
            </span>
            <h2>{overview ? "设置" : selected.label}</h2>
            <p>{overview ? "Echo OS" : selected.description}</p>
          </div>
          <nav aria-label="设置分类" hidden={!overview}>
            {sections.map((s) => (
              <button
                data-tv-focus
                data-section={s.id}
                key={s.id}
                onClick={() => openSection(s.id)}
              >
                <s.icon />
                <span>{s.label}</span>
                <ChevronRight />
              </button>
            ))}
          </nav>
          <div className="tv-settings-content" key={section} hidden={overview}>
            {section === "general" && (
              <section>
                <h3>画面与操作</h3>
                <h4>壁纸</h4>
                <div className="tv-wallpaper-picker" aria-label="选择壁纸">
                  {TV_WALLPAPERS.map((wallpaper) => (
                    <button
                      key={wallpaper.id}
                      data-tv-focus
                      aria-pressed={
                        (preferences.wallpaper ?? DEFAULT_TV_WALLPAPER) ===
                        wallpaper.id
                      }
                      onClick={() =>
                        void action.run(async () => {
                          const next = {
                            ...preferences,
                            wallpaper: wallpaper.id,
                          };
                          saveTVPreferences(next);
                          setPreferences(next);
                        })
                      }
                    >
                      <img
                        src={wallpaper.image ?? readDesktopWallpaperUrl()}
                        alt=""
                      />
                      <span>{wallpaper.label}</span>
                    </button>
                  ))}
                </div>
                <p className="tv-muted">
                  方向键移动，确认键打开，返回键返回上一层。输入框按确认键可打开屏幕键盘。
                </p>
                <div className="tv-settings-list">
                  <button
                    data-tv-focus
                    aria-pressed={preferences.largeText}
                    onClick={() =>
                      void action.run(async () => {
                        const next = {
                          ...preferences,
                          largeText: !preferences.largeText,
                        };
                        saveTVPreferences(next);
                        setPreferences(next);
                      })
                    }
                  >
                    大号文字：{preferences.largeText ? "开" : "关"}
                  </button>
                  <button
                    data-tv-focus
                    aria-pressed={preferences.reduceMotion}
                    onClick={() =>
                      void action.run(async () => {
                        const next = {
                          ...preferences,
                          reduceMotion: !preferences.reduceMotion,
                        };
                        saveTVPreferences(next);
                        setPreferences(next);
                      })
                    }
                  >
                    减少动效：{preferences.reduceMotion ? "开" : "关"}
                  </button>
                </div>
                {action.feedback}
                <p className="tv-muted">
                  屏幕键盘支持英文、数字、符号及离线逐字拼音；也可直接使用系统中文输入法。
                </p>
              </section>
            )}
            {section === "models" && <TVModelSettings />}
            {section === "sources" && <TVLibrarySettings />}
            {section === "plugins" && <TVPluginSettings />}
            {section === "device" && <TVDeviceSettings />}
          </div>
        </div>
      </section>
    </div>
  );
}
