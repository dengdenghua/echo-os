import { type CSSProperties, memo } from "react";
import { cn } from "@/lib/utils";

export interface MacDockTrashProps {
  isFull?: boolean;
  itemCount?: number;
  className?: string;
  style?: CSSProperties;
}

/**
 * Authentic macOS-fidelity freestanding glass/acrylic wastebasket Dock icon.
 * Unlike standard applications, the macOS Trash Can does NOT have a squircle
 * background container; it rests directly on the Dock glass shelf with realistic
 * fluted acrylic ribs, metallic aluminum rims, and dynamic empty/full states.
 */
export const MacDockTrash = memo(function MacDockTrash({
  isFull = false,
  itemCount = 0,
  className,
  style,
}: MacDockTrashProps) {
  const full = isFull || itemCount > 0;

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
        className="size-full overflow-visible transition-transform duration-200 select-none"
      >
        <defs>
          {/* Base contact shadow blur */}
          <filter id="macTrashBaseBlur" x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>

          {/* Brushed aluminum metallic gradient for top rim & base */}
          <linearGradient id="macTrashMetalRim" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#8c97a8" />
            <stop offset="18%" stopColor="#e2e8f0" />
            <stop offset="42%" stopColor="#cbd5e1" />
            <stop offset="68%" stopColor="#ffffff" />
            <stop offset="85%" stopColor="#cbd5e1" />
            <stop offset="100%" stopColor="#64748b" />
          </linearGradient>

          {/* Inner cavity depth gradient */}
          <radialGradient
            id="macTrashCavity"
            cx="50%"
            cy="50%"
            r="50%"
            fx="50%"
            fy="35%"
          >
            <stop offset="0%" stopColor="rgba(30, 41, 59, 0.65)" />
            <stop offset="80%" stopColor="rgba(15, 23, 42, 0.92)" />
            <stop offset="100%" stopColor="rgba(2, 6, 23, 0.98)" />
          </radialGradient>

          {/* Semi-transparent frosted glass body gradient */}
          <linearGradient id="macTrashGlassBody" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.50)" />
            <stop offset="25%" stopColor="rgba(224, 238, 255, 0.20)" />
            <stop offset="65%" stopColor="rgba(195, 220, 245, 0.12)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.42)" />
          </linearGradient>

          {/* Acrylic highlight streak gradient */}
          <linearGradient id="macTrashSpecular" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="rgba(255, 255, 255, 0.75)" />
            <stop offset="45%" stopColor="rgba(255, 255, 255, 0.35)" />
            <stop offset="100%" stopColor="rgba(255, 255, 255, 0.05)" />
          </linearGradient>

          {/* Crumpled paper shading gradients */}
          <linearGradient id="macTrashPaper1" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="100%" stopColor="#cbd5e1" />
          </linearGradient>

          <linearGradient id="macTrashPaper2" x1="1" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f8fafc" />
            <stop offset="60%" stopColor="#e2e8f0" />
            <stop offset="100%" stopColor="#94a3b8" />
          </linearGradient>

          <linearGradient id="macTrashPaperAccent" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#fef3c7" />
            <stop offset="100%" stopColor="#fde68a" />
          </linearGradient>
        </defs>

        {/* 1. Base contact shadow onto dock glass floor */}
        <ellipse
          cx="27"
          cy="48"
          rx="15"
          ry="3"
          fill="rgba(0, 0, 0, 0.38)"
          filter="url(#macTrashBaseBlur)"
        />

        {/* 2. Interior cavity behind papers / ribs */}
        <ellipse cx="27" cy="13.5" rx="18" ry="5.2" fill="url(#macTrashCavity)" />

        {/* 3. Paper contents inside basket (rendered when full) */}
        {full && (
          <g className="mac-trash-contents transition-all duration-300">
            {/* Lower paper heap inside basket (visible through glass) */}
            <path
              d="M 16,16 L 24,19 L 29,15 L 37,18 L 34,31 L 21,32 Z"
              fill="rgba(241, 245, 249, 0.42)"
            />
            <path
              d="M 23,20 L 31,18 L 33,28 L 22,29 Z"
              fill="rgba(203, 213, 225, 0.45)"
            />

            {/* Crumpled Document 1: Folded document sheet sticking out top left */}
            <path
              d="M 19,4 L 30,7 L 27,15 L 16,13 Z"
              fill="url(#macTrashPaper1)"
              stroke="rgba(148, 163, 184, 0.5)"
              strokeWidth="0.6"
              filter="drop-shadow(0 2px 3px rgba(0,0,0,0.22))"
            />
            {/* Subtle text lines on folded sheet */}
            <line
              x1="20"
              y1="7.5"
              x2="26"
              y2="9.2"
              stroke="#64748b"
              strokeWidth="0.8"
              strokeLinecap="round"
              opacity="0.6"
            />
            <line
              x1="19"
              y1="10"
              x2="25"
              y2="11.7"
              stroke="#64748b"
              strokeWidth="0.8"
              strokeLinecap="round"
              opacity="0.5"
            />

            {/* Crumpled Document 2: Faceted paper ball in top center/right */}
            <path
              d="M 27,8 L 36,6 L 40,12 L 34,16 L 26,14 Z"
              fill="url(#macTrashPaper2)"
              stroke="rgba(148, 163, 184, 0.6)"
              strokeWidth="0.6"
              filter="drop-shadow(0 2px 4px rgba(0,0,0,0.26))"
            />
            <path
              d="M 31,9 L 36,6 L 35,13 Z"
              fill="#ffffff"
              opacity="0.7"
            />
            <path
              d="M 35,13 L 40,12 L 34,16 Z"
              fill="#94a3b8"
              opacity="0.55"
            />

            {/* Crumpled Document 3: Small warm memo note folded on left */}
            <path
              d="M 12,9 L 19,7 L 21,13 L 14,14.5 Z"
              fill="url(#macTrashPaperAccent)"
              stroke="rgba(217, 119, 6, 0.35)"
              strokeWidth="0.5"
              filter="drop-shadow(0 1px 2px rgba(0,0,0,0.2))"
            />
          </g>
        )}

        {/* 4. Translucent Tapered Frosted Glass Cylinder Body */}
        <path
          d="M 8.8,13.5 L 13.2,44 C 13.2,46.4 19.2,48 27,48 C 34.8,48 40.8,46.4 40.8,44 L 45.2,13.5"
          fill="url(#macTrashGlassBody)"
          stroke="rgba(255, 255, 255, 0.65)"
          strokeWidth="0.8"
        />

        {/* 5. Fine Vertical Acrylic Ribs / Flutes (giving iconic macOS 3D glass texture) */}
        {/* Rib 1 */}
        <line
          x1="13.2"
          y1="15.8"
          x2="16.5"
          y2="44.6"
          stroke="rgba(15, 23, 42, 0.18)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <line
          x1="13.9"
          y1="15.8"
          x2="17.2"
          y2="44.6"
          stroke="rgba(255, 255, 255, 0.62)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />

        {/* Rib 2 */}
        <line
          x1="17.4"
          y1="17.2"
          x2="19.8"
          y2="45.9"
          stroke="rgba(15, 23, 42, 0.16)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <line
          x1="18.1"
          y1="17.2"
          x2="20.5"
          y2="45.9"
          stroke="rgba(255, 255, 255, 0.70)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />

        {/* Rib 3 */}
        <line
          x1="22.1"
          y1="18.1"
          x2="23.4"
          y2="46.7"
          stroke="rgba(15, 23, 42, 0.15)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <line
          x1="22.8"
          y1="18.1"
          x2="24.1"
          y2="46.7"
          stroke="rgba(255, 255, 255, 0.72)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />

        {/* Rib 4 (Center vertical flute) */}
        <line
          x1="26.5"
          y1="18.5"
          x2="26.5"
          y2="47.1"
          stroke="rgba(15, 23, 42, 0.14)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <line
          x1="27.3"
          y1="18.5"
          x2="27.3"
          y2="47.1"
          stroke="rgba(255, 255, 255, 0.80)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />

        {/* Rib 5 */}
        <line
          x1="31.2"
          y1="18.1"
          x2="29.9"
          y2="46.7"
          stroke="rgba(15, 23, 42, 0.15)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <line
          x1="31.9"
          y1="18.1"
          x2="30.6"
          y2="46.7"
          stroke="rgba(255, 255, 255, 0.72)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />

        {/* Rib 6 */}
        <line
          x1="35.9"
          y1="17.2"
          x2="33.5"
          y2="45.9"
          stroke="rgba(15, 23, 42, 0.16)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <line
          x1="36.6"
          y1="17.2"
          x2="34.2"
          y2="45.9"
          stroke="rgba(255, 255, 255, 0.70)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />

        {/* Rib 7 */}
        <line
          x1="40.1"
          y1="15.8"
          x2="36.8"
          y2="44.6"
          stroke="rgba(15, 23, 42, 0.18)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />
        <line
          x1="40.8"
          y1="15.8"
          x2="37.5"
          y2="44.6"
          stroke="rgba(255, 255, 255, 0.62)"
          strokeWidth="1.1"
          strokeLinecap="round"
        />

        {/* 6. Curved specular glass highlight down front-left wall */}
        <path
          d="M 11.2,14.5 Q 13.5,29 15.5,43"
          stroke="url(#macTrashSpecular)"
          strokeWidth="1.6"
          strokeLinecap="round"
        />

        {/* 7. Aluminum base rim */}
        <ellipse
          cx="27"
          cy="44"
          rx="13.8"
          ry="3.8"
          fill="none"
          stroke="url(#macTrashMetalRim)"
          strokeWidth="1.8"
        />

        {/* 8. Top Metallic Rim & Lip (Front edge highlight) */}
        <ellipse
          cx="27"
          cy="13.5"
          rx="18.2"
          ry="5.3"
          fill="none"
          stroke="url(#macTrashMetalRim)"
          strokeWidth="2.2"
        />
        <ellipse
          cx="27"
          cy="13.5"
          rx="17.4"
          ry="4.7"
          fill="none"
          stroke="rgba(255, 255, 255, 0.85)"
          strokeWidth="0.8"
        />
      </svg>

      {/* Subtle item count badge when items exist */}
      {itemCount > 0 && (
        <span
          className="absolute -top-1 -right-1 grid min-w-4 h-4 place-items-center rounded-full border border-white/80 bg-slate-700/90 px-1 text-[9px] font-semibold leading-none text-white shadow-sm backdrop-blur-sm pointer-events-none"
          aria-hidden="true"
        >
          {Math.min(itemCount, 99)}
        </span>
      )}
    </div>
  );
});
