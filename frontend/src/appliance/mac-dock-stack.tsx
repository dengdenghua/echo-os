import { memo } from "react";
import { cn } from "@/lib/utils";

/**
 * Authentic macOS-fidelity Downloads / Stacks icon for the right partition of the Dock.
 * Displays a styled macOS translucent blue folder with white content and downward action badge.
 */
export const MacDockDownloadsStack = memo(function MacDockDownloadsStack({
  className,
}: {
  className?: string;
}) {
  return (
    <div
      className={cn("mac-dock-stack-folder", className)}
      aria-label="下载"
      data-dock-stack
    >
      <svg
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="size-full overflow-visible select-none"
      >
        <defs>
          {/* Back folder gradient */}
          <linearGradient id="macStackBack" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#0284c7" />
          </linearGradient>

          {/* Front folder gradient */}
          <linearGradient id="macStackFront" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" />
            <stop offset="100%" stopColor="#2563eb" />
          </linearGradient>

          {/* Shadow blur */}
          <filter id="macStackGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000000" floodOpacity="0.28" />
          </filter>
        </defs>

        {/* Back folder flap */}
        <path
          d="M 6,14 C 6,11.8 7.8,10 10,10 L 19,10 C 20.6,10 22.1,10.9 22.9,12.3 L 24.5,15 L 38,15 C 40.2,15 42,16.8 42,19 L 42,36 C 42,38.2 40.2,40 38,40 L 10,40 C 7.8,40 6,38.2 6,36 Z"
          fill="url(#macStackBack)"
          filter="url(#macStackGlow)"
        />

        {/* Peek document sheets inside */}
        <rect
          x="12"
          y="12"
          width="24"
          height="14"
          rx="2"
          fill="#f8fafc"
          opacity="0.92"
        />
        <line x1="15" y1="15" x2="23" y2="15" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" />
        <line x1="15" y1="18" x2="27" y2="18" stroke="#cbd5e1" strokeWidth="1.2" strokeLinecap="round" />

        {/* Front folder flap */}
        <path
          d="M 5,20 C 5,18.5 6.2,17.2 7.7,17.1 L 40.3,17.1 C 41.8,17.2 43,18.5 43,20 L 41.5,37 C 41.3,38.7 39.9,40 38.2,40 L 9.8,40 C 8.1,40 6.7,38.7 6.5,37 Z"
          fill="url(#macStackFront)"
          stroke="rgba(255, 255, 255, 0.45)"
          strokeWidth="0.8"
        />

        {/* Circular Downward Arrow Badge */}
        <circle cx="24" cy="28.5" r="7" fill="#ffffff" filter="drop-shadow(0 1px 3px rgba(0,0,0,0.22))" />
        <path
          d="M 24,24.5 L 24,31 M 21,28.5 L 24,31.5 L 27,28.5"
          stroke="#1d4ed8"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
});
