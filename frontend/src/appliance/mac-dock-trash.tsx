import { type CSSProperties, memo, useId } from "react";
import { cn } from "@/lib/utils";

export interface MacDockTrashProps {
  isFull?: boolean;
  itemCount?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Echo 回收篮：直接立在 Dock 上的磨砂玻璃篮子。
 *
 * 原创造型：胶囊形篮盖、略收窄的桶身和横向的回声波纹（呼应 Echo 的涟漪
 * 母题），满时篮口露出两张纸。线条和玻璃都取 currentColor（ink），所以
 * 石墨 Dock 上是雪白篮子，雪白 Dock 上是石墨篮子。渐变 id 由 useId 生成，
 * 避免与页面上其他 SVG 冲突。
 */
export const MacDockTrash = memo(function MacDockTrash({
  isFull = false,
  itemCount = 0,
  className,
  style,
}: MacDockTrashProps) {
  const full = isFull || itemCount > 0;
  const body = useId();
  const rim = useId();

  return (
    <div
      className={cn("mac-dock-trash", className)}
      style={style}
      data-dock-trash
      data-state={full ? "full" : "empty"}
      aria-label={full ? `废纸篓 (${itemCount} 项)` : "废纸篓"}
    >
      <svg
        viewBox="0 0 54 54"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-full overflow-visible text-foreground transition-transform duration-200 select-none"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={body} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.3" />
            <stop offset="0.55" stopColor="currentColor" stopOpacity="0.1" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.18" />
          </linearGradient>
          <linearGradient id={rim} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.95" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.78" />
          </linearGradient>
        </defs>

        {/* 落地阴影 */}
        <ellipse
          cx="27"
          cy="47.6"
          rx="12"
          ry="2.2"
          fill="currentColor"
          opacity="0.14"
        />

        {full && (
          <g className="mac-trash-contents">
            <rect
              x="17.5"
              y="4.5"
              width="11"
              height="10"
              rx="1.6"
              fill="currentColor"
              fillOpacity="0.9"
              transform="rotate(-13 23 9.5)"
            />
            <rect
              x="26.5"
              y="5.5"
              width="10"
              height="9"
              rx="1.6"
              fill="var(--echo-core)"
              fillOpacity="0.9"
              transform="rotate(11 31.5 10)"
            />
          </g>
        )}

        {/* 桶身 */}
        <path
          d="M15.2 16.5h23.6l-2.2 26.2a3.6 3.6 0 0 1-3.6 3.3H21a3.6 3.6 0 0 1-3.6-3.3Z"
          fill={`url(#${body})`}
          stroke="currentColor"
          strokeOpacity="0.82"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
        {/* 横向回声波纹 */}
        {[24.5, 30.5, 36.5].map((y, index) => (
          <path
            key={y}
            d={`M${17.2 + index * 0.5} ${y}q${9.8 - index * 0.5} 2.6 ${19.6 - index} 0`}
            stroke="currentColor"
            strokeOpacity={0.5 - index * 0.1}
            strokeWidth="1.2"
            strokeLinecap="round"
          />
        ))}

        {/* 篮盖与提手 */}
        <rect
          x="22.5"
          y="9.2"
          width="9"
          height="3.6"
          rx="1.8"
          fill={`url(#${rim})`}
        />
        <rect
          x="12.5"
          y="12.2"
          width="29"
          height="4.8"
          rx="2.4"
          fill={`url(#${rim})`}
          stroke="currentColor"
          strokeOpacity="0.3"
          strokeWidth="0.6"
        />
      </svg>

      {/* 有内容时显示数量 */}
      {itemCount > 0 && (
        <span
          className="absolute -top-1 -right-1 grid min-w-4 h-4 place-items-center rounded-full border border-border bg-foreground px-1 text-[10px] font-semibold leading-none text-background shadow-sm pointer-events-none"
          aria-hidden="true"
        >
          {Math.min(itemCount, 99)}
        </span>
      )}
    </div>
  );
});
