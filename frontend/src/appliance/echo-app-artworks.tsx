import { memo, useId, type ReactNode } from "react";

import { EchoMark } from "@/components/brand/echo-mark";

/**
 * Echo 系统应用图标。
 *
 * 原创的单色图形，配合 Echo Signal Glass 底座使用：底座给颜色和光学质感，
 * 图形只用 currentColor 和不透明度分层，所以同一个图形在深色、浅色和渐变
 * 底座上都成立。统一 54×54 网格、圆角端点；"点 + 环"的回声涟漪是品牌母题
 * （文件、设备连接、任务进度环都在用它）。镂空用 mask，id 由 useId 生成，
 * 同一图标在 Dock、启动台和桌面上同时出现也不会冲突。
 */

function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 54 54"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="mac-app-icon-art echo-app-glyph"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** 文件：前后两层文件夹，正面镂空出回声涟漪。 */
export const FilesArtwork = memo(function FilesArtwork() {
  const mask = useId();
  return (
    <Glyph>
      <defs>
        <mask id={mask}>
          <rect width="54" height="54" fill="#fff" />
          <circle cx="27" cy="31.5" r="2.4" fill="#000" />
          <circle
            cx="27"
            cy="31.5"
            r="6.3"
            fill="none"
            stroke="#000"
            strokeWidth="2"
          />
        </mask>
      </defs>
      <path
        d="M10 17.5a4.5 4.5 0 0 1 4.5-4.5h8.2a3 3 0 0 1 2.3 1.08L27.6 17H39.5a4.5 4.5 0 0 1 4.5 4.5V24H10z"
        fill="currentColor"
        fillOpacity="0.55"
      />
      <rect
        x="10"
        y="20.5"
        width="34"
        height="21"
        rx="4.5"
        fill="currentColor"
        mask={`url(#${mask})`}
      />
    </Glyph>
  );
});

/** 应用库：九宫格，中心是回声点。 */
export const AppLibraryArtwork = memo(function AppLibraryArtwork() {
  const cells = [10.5, 22.5, 34.5];
  return (
    <Glyph>
      {cells.flatMap((y) =>
        cells.map((x) =>
          x === 22.5 && y === 22.5 ? null : (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="9"
              height="9"
              rx="2.6"
              fill="currentColor"
              fillOpacity="0.62"
            />
          ),
        ),
      )}
      <circle cx="27" cy="27" r="5.2" fill="currentColor" />
    </Glyph>
  );
});

/** Echo Hub：三面不同明度的模块方块，表示"可安装的能力"。 */
export const HubArtwork = memo(function HubArtwork() {
  return (
    <Glyph>
      <path d="M27 9.5 43 18.5 27 27.5 11 18.5Z" fill="currentColor" />
      <path
        d="M11 21.2 25.6 29.4V45.5L11 37.3Z"
        fill="currentColor"
        fillOpacity="0.6"
      />
      <path
        d="M43 21.2 28.4 29.4V45.5L43 37.3Z"
        fill="currentColor"
        fillOpacity="0.8"
      />
    </Glyph>
  );
});

/** AI 浏览器：地球经纬线，外加一颗绕行的光点。 */
export const BrowserArtwork = memo(function BrowserArtwork() {
  return (
    <Glyph>
      <circle
        cx="27"
        cy="27.5"
        r="14.5"
        stroke="currentColor"
        strokeWidth="3.2"
      />
      <ellipse
        cx="27"
        cy="27.5"
        rx="6.2"
        ry="14.5"
        stroke="currentColor"
        strokeOpacity="0.62"
        strokeWidth="2.4"
      />
      <path
        d="M12.5 27.5h29"
        stroke="currentColor"
        strokeOpacity="0.62"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <circle cx="41.8" cy="12.3" r="3.6" fill="currentColor" />
    </Glyph>
  );
});

/** 照片：叠放的两张相片，正面镂空出山与太阳。 */
export const PhotosArtwork = memo(function PhotosArtwork() {
  const mask = useId();
  return (
    <Glyph>
      <defs>
        <mask id={mask}>
          <rect width="54" height="54" fill="#fff" />
          <circle cx="33.5" cy="23.5" r="3.4" fill="#000" />
          <path
            d="M13.5 39.5 22.5 28l6.5 8 3.5-4 6 7.5Z"
            fill="#000"
            strokeLinejoin="round"
          />
        </mask>
      </defs>
      <rect
        x="14"
        y="9.5"
        width="31"
        height="26"
        rx="5"
        fill="currentColor"
        fillOpacity="0.45"
      />
      <rect
        x="9.5"
        y="15"
        width="33"
        height="28.5"
        rx="5.5"
        fill="currentColor"
        mask={`url(#${mask})`}
      />
    </Glyph>
  );
});

/** 设备连接 / 手机镜像：手机向外发出两道回声波。 */
export const DeviceLinkArtwork = memo(function DeviceLinkArtwork() {
  const mask = useId();
  return (
    <Glyph>
      <defs>
        <mask id={mask}>
          <rect width="54" height="54" fill="#fff" />
          <rect x="14.8" y="13" width="14.4" height="24.5" rx="2" fill="#000" />
        </mask>
      </defs>
      <rect
        x="11.5"
        y="8.5"
        width="21"
        height="37"
        rx="5.5"
        fill="currentColor"
        mask={`url(#${mask})`}
      />
      <circle cx="22" cy="41.2" r="1.6" fill="currentColor" />
      <path
        d="M37 21.5a8 8 0 0 1 0 11"
        stroke="currentColor"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
      <path
        d="M41.5 17.2a14 14 0 0 1 0 19.6"
        stroke="currentColor"
        strokeOpacity="0.55"
        strokeWidth="2.8"
        strokeLinecap="round"
      />
    </Glyph>
  );
});

/** 存储：三块叠放的硬盘，各带一盏指示灯。 */
export const StorageArtwork = memo(function StorageArtwork() {
  const mask = useId();
  const rows = [
    { y: 11, opacity: 1 },
    { y: 22.5, opacity: 0.8 },
    { y: 34, opacity: 0.62 },
  ];
  return (
    <Glyph>
      <defs>
        <mask id={mask}>
          <rect width="54" height="54" fill="#fff" />
          {rows.map(({ y }) => (
            <g key={y}>
              <circle cx="37.5" cy={y + 4.5} r="1.8" fill="#000" />
              <rect
                x="15.5"
                y={y + 3.6}
                width="10"
                height="1.8"
                rx="0.9"
                fill="#000"
              />
            </g>
          ))}
        </mask>
      </defs>
      <g mask={`url(#${mask})`}>
        {rows.map(({ y, opacity }) => (
          <rect
            key={y}
            x="11"
            y={y}
            width="32"
            height="9"
            rx="3"
            fill="currentColor"
            fillOpacity={opacity}
          />
        ))}
      </g>
    </Glyph>
  );
});

/** 任务空间：进度环加对勾，与 Dock 任务轨的进度环同一语言。 */
export const TasksArtwork = memo(function TasksArtwork() {
  return (
    <Glyph>
      <circle
        cx="27"
        cy="27"
        r="15"
        stroke="currentColor"
        strokeOpacity="0.32"
        strokeWidth="4"
      />
      <circle
        cx="27"
        cy="27"
        r="15"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        pathLength={100}
        strokeDasharray="70 100"
        transform="rotate(-90 27 27)"
      />
      <path
        d="M20.5 27.5l4.3 4.3 8.7-9.6"
        stroke="currentColor"
        strokeWidth="3.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Glyph>
  );
});

/** 活动监视器 / 终端日志：一段心跳脉冲。 */
export const ActivityArtwork = memo(function ActivityArtwork() {
  return (
    <Glyph>
      <path
        d="M8.5 29.5H17l3.8-9.5 6.2 17 4.6-12.5 2.9 5H43"
        stroke="currentColor"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="45.5" cy="29.5" r="2.6" fill="currentColor" />
    </Glyph>
  );
});

/** 系统设置：三根调节滑杆。 */
export const SettingsArtwork = memo(function SettingsArtwork() {
  const sliders = [
    { y: 17, knob: 35 },
    { y: 27, knob: 19 },
    { y: 37, knob: 30 },
  ];
  return (
    <Glyph>
      {sliders.map(({ y, knob }) => (
        <g key={y}>
          <path
            d={`M11 ${y}h32`}
            stroke="currentColor"
            strokeOpacity="0.45"
            strokeWidth="3"
            strokeLinecap="round"
          />
          <circle cx={knob} cy={y} r="4.6" fill="currentColor" />
        </g>
      ))}
    </Glyph>
  );
});

/** 按应用身份返回图标图形；未知应用返回 null，由调用方回退到线性图标。 */
export function getEchoAppArtwork(appId?: string): ReactNode {
  if (!appId) return null;

  switch (appId) {
    case "system:finder":
    case "system:files":
      return <FilesArtwork />;
    case "system:launchpad":
      return <AppLibraryArtwork />;
    case "system:app-store":
    case "echo:/hub":
    case "echo:/workspace/store":
      return <HubArtwork />;
    case "echo:/browser":
      return <BrowserArtwork />;
    case "echo:/photos":
      return <PhotosArtwork />;
    case "echo:/phone-mirror":
    case "echo:/device-link":
      return <DeviceLinkArtwork />;
    case "echo:/storage-center":
    case "echo:/workspace/storage":
      return <StorageArtwork />;
    case "system:tasks":
      return <TasksArtwork />;
    case "system:activity-monitor":
    case "echo:/workspace/observability":
      return <ActivityArtwork />;
    case "system:settings":
    case "echo:/workspace":
      return <SettingsArtwork />;
    case "echo:/workspace/realtime/new":
      return (
        <EchoMark
          tone="light"
          className="mac-app-icon-art mac-shell-icon-art"
        />
      );
    default:
      return null;
  }
}
