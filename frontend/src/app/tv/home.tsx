import { useState } from "react";
import { BookOpen, Film, Grid2X2, Monitor, Settings } from "lucide-react";
import "./home.css";

const apps = [
  {
    id: "echo",
    label: "Echo",
    description: "聊想法，查资料，把任务交给 Echo。",
  },
  {
    id: "library",
    label: "影视库",
    description: "属于你的影片，值得好好看。",
    icon: Film,
  },
  {
    id: "knowledge",
    label: "知识库",
    description: "答案，就在你的资料里。",
    icon: BookOpen,
  },
  {
    id: "apps",
    label: "应用",
    description: "常用工具与扩展，都在这里。",
    icon: Grid2X2,
  },
  {
    id: "computer",
    label: "Echo 的电脑",
    description: "同一台电脑，各自从容工作。",
    icon: Monitor,
  },
  {
    id: "settings",
    label: "设置",
    description: "你的大屏，你来设定。",
    icon: Settings,
  },
] as const;
export type TVHomeAction = (typeof apps)[number]["id"];

export function TVHome({
  onOpen,
  ready,
}: {
  onOpen: (app: TVHomeAction) => void;
  ready: boolean;
}) {
  const [selected, setSelected] = useState<TVHomeAction>("echo");
  const current = apps.find((item) => item.id === selected)!;
  return (
    <section
      className="tv-home"
      aria-label="大屏首页"
      data-selected-app={selected}
    >
      <div className="tv-top-shelf" aria-label={`${current.label}预览`}>
        <div className="tv-shelf-copy" key={selected}>
          <h1>
            {current.label === "Echo" && <img src="/images/echo.svg" alt="" />}
            <span>{current.label}</span>
          </h1>
          <p className="tv-shelf-description">{current.description}</p>
        </div>
      </div>
      <div className="tv-launcher" aria-label="常用应用">
        {apps.map((app) => {
          const AppIcon = "icon" in app ? app.icon : null;
          return (
            <button
              key={app.id}
              data-tv-focus
              data-tv-initial={app.id === "echo" || undefined}
              data-tv-home={app.id === "echo" || undefined}
              className={`tv-launcher-app tv-tone-${app.id}`}
              aria-label={app.id === "echo" ? "呼出 Echo" : app.label}
              onFocus={(event) => {
                setSelected(app.id);
                // Re-entering the Dock always reveals its Top Shelf, even when
                // a previous session scrolled to the Continue Watching rail.
                event.currentTarget
                  .closest<HTMLElement>(".echo-tv")
                  ?.scrollTo({ top: 0, behavior: "instant" });
              }}
              onClick={() => onOpen(app.id)}
            >
              <span className="tv-app-tile">
                {AppIcon ? (
                  <AppIcon />
                ) : (
                  <span className="tv-echo-logo">
                    <img src="/images/echo.svg" alt="" />
                    <b>Echo</b>
                  </span>
                )}
              </span>
              <span className="tv-app-name">{app.label}</span>
            </button>
          );
        })}
      </div>
      <div className="tv-home-status">
        <span className="tv-status-dot" data-ready={ready} />
        {ready ? "Echo 已就绪" : "Echo 暂不可用"}
      </div>
    </section>
  );
}
