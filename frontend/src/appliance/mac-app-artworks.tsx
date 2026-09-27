import { type ReactNode, memo } from "react";
import { EchoMark } from "@/components/brand/echo-mark";

/**
 * Authentic macOS-fidelity vector artworks for Echo OS system apps.
 * Replaces generic flat wireframe line-art with layered, multi-colored,
 * depth-aware objects following macOS Big Sur / Sonoma design language.
 */

// 1. Finder: The iconic split-tone smiling face
export const FinderArtwork = memo(function FinderArtwork() {
  return (
    <svg viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg" className="mac-app-icon-art">
      <defs>
        <linearGradient id="finderLeftFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7dd3fc" />
          <stop offset="100%" stopColor="#38bdf8" />
        </linearGradient>
        <linearGradient id="finderRightFace" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="100%" stopColor="#1d4ed8" />
        </linearGradient>
        <filter id="finderFaceShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#0284c7" floodOpacity="0.4" />
        </filter>
      </defs>

      {/* Face Shield Base with Drop Shadow */}
      <g filter="url(#finderFaceShadow)">
        {/* Left half face (Light sky blue) */}
        <path
          d="M 12,12 C 12,9.8 13.8,8 16,8 L 27,8 L 27,46 L 16,46 C 13.8,46 12,44.2 12,42 Z"
          fill="url(#finderLeftFace)"
        />
        {/* Right half face (Deep royal blue) */}
        <path
          d="M 27,8 L 38,8 C 40.2,8 42,9.8 42,12 L 42,42 C 42,44.2 40.2,46 38,46 L 27,46 Z"
          fill="url(#finderRightFace)"
        />
        {/* Organic curved center seam */}
        <path
          d="M 27,8 C 29,18 24.5,28 27.5,46"
          stroke="#0f172a"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </g>

      {/* Left Eye */}
      <ellipse cx="19.5" cy="22" rx="2.5" ry="3" fill="#0f172a" />
      <circle cx="18.6" cy="21" r="0.9" fill="#ffffff" />

      {/* Right Eye */}
      <ellipse cx="34.5" cy="22" rx="2.5" ry="3" fill="#0f172a" />
      <circle cx="33.6" cy="21" r="0.9" fill="#ffffff" />

      {/* Friendly Laughing Smile */}
      <path
        d="M 17,31.5 C 20.5,38 33.5,38 37,31.5"
        stroke="#0f172a"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* Soft lip depth highlight */}
      <path
        d="M 19,33 C 22,38.5 32,38.5 35,33"
        stroke="rgba(255, 255, 255, 0.45)"
        strokeWidth="0.8"
        strokeLinecap="round"
      />
    </svg>
  );
});

// 2. Launchpad: The silver rocket blasting into the stars
export const LaunchpadArtwork = memo(function LaunchpadArtwork() {
  return (
    <svg viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg" className="mac-app-icon-art">
      <defs>
        <linearGradient id="rocketBody" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="45%" stopColor="#f1f5f9" />
          <stop offset="100%" stopColor="#94a3b8" />
        </linearGradient>
        <linearGradient id="flameCore" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fef08a" />
          <stop offset="60%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#ef4444" />
        </linearGradient>
      </defs>

      {/* Twinkling background stars */}
      <circle cx="13" cy="14" r="1" fill="#ffffff" opacity="0.8" />
      <circle cx="41" cy="16" r="0.8" fill="#ffffff" opacity="0.6" />
      <circle cx="15" cy="38" r="0.9" fill="#fef08a" opacity="0.75" />
      <circle cx="43" cy="36" r="1.2" fill="#ffffff" opacity="0.85" />

      {/* Rocket Assembly Angled 45 deg */}
      <g transform="translate(27, 27) rotate(-45) translate(-27, -27)">
        {/* Exhaust flame tail */}
        <path
          d="M 23,38 C 21,43 27,49 27,51 C 27,49 33,43 31,38 Z"
          fill="url(#flameCore)"
          filter="drop-shadow(0 0 4px #f97316)"
        />
        <path
          d="M 25,38 C 24,41 27,45 27,45 C 27,41 30,41 29,38 Z"
          fill="#ffffff"
          opacity="0.9"
        />

        {/* Left and Right Stabilizer Fins */}
        <path d="M 21,32 L 15,37 L 21,37 Z" fill="#e11d48" />
        <path d="M 33,32 L 39,37 L 33,37 Z" fill="#be123c" />

        {/* Thruster Nozzle */}
        <rect x="23.5" y="36.5" width="7" height="2" rx="0.5" fill="#475569" />

        {/* Fuselage Rocket Body */}
        <path
          d="M 21,36 C 21,24 23,12 27,8 C 31,12 33,24 33,36 Z"
          fill="url(#rocketBody)"
          stroke="rgba(255, 255, 255, 0.6)"
          strokeWidth="0.8"
        />

        {/* Red Nose Cone */}
        <path
          d="M 23.5,14 C 25,10 27,8 27,8 C 27,8 29,10 30.5,14 Z"
          fill="#e11d48"
        />

        {/* Center Glass Porthole */}
        <circle cx="27" cy="22" r="4.2" fill="#64748b" />
        <circle cx="27" cy="22" r="3.2" fill="#38bdf8" />
        <circle cx="26" cy="21" r="1.2" fill="#ffffff" opacity="0.85" />
      </g>
    </svg>
  );
});

// 3. App Store / Hub: The architectural drafting tools forming 'A'
export const AppStoreArtwork = memo(function AppStoreArtwork() {
  return (
    <svg viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg" className="mac-app-icon-art">
      <defs>
        <filter id="appStoreShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.8" floodColor="#0f172a" floodOpacity="0.32" />
        </filter>
        <linearGradient id="metalTool" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e2e8f0" />
        </linearGradient>
      </defs>

      <g filter="url(#appStoreShadow)">
        {/* Left leg: Ruler */}
        <path
          d="M 15,40 L 26,13 C 26.5,11.8 28.5,11.8 29,13 L 40,40"
          stroke="url(#metalTool)"
          strokeWidth="4.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Ruler measurement tick marks */}
        <line x1="18.5" y1="32" x2="21" y2="33" stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
        <line x1="21.5" y1="25" x2="24" y2="26" stroke="#64748b" strokeWidth="1" strokeLinecap="round" />

        {/* Crossbar: Drafting pencil / brush */}
        <line
          x1="13"
          y1="32"
          x2="41"
          y2="32"
          stroke="url(#metalTool)"
          strokeWidth="4.8"
          strokeLinecap="round"
        />
        {/* Central precision pencil band */}
        <line x1="25" y1="32" x2="29" y2="32" stroke="#3b82f6" strokeWidth="4.8" strokeLinecap="round" />
      </g>
    </svg>
  );
});

// 4. Safari / Browser: The nautical maritime compass with angled magnetic needle
export const BrowserArtwork = memo(function BrowserArtwork() {
  return (
    <svg viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg" className="mac-app-icon-art">
      <defs>
        <radialGradient id="compassDial" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#2563eb" />
          <stop offset="75%" stopColor="#1d4ed8" />
          <stop offset="100%" stopColor="#0f172a" />
        </radialGradient>
        <filter id="needleShadow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="1.5" dy="2.5" stdDeviation="1.8" floodColor="#020617" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* Outer titanium compass dial bezel */}
      <circle cx="27" cy="27" r="22.5" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.2" />
      {/* Inner oceanic blue face */}
      <circle cx="27" cy="27" r="20" fill="url(#compassDial)" />

      {/* Compass rose tick marks */}
      {/* Cardinal marks (N, E, S, W) */}
      <line x1="27" y1="9" x2="27" y2="12.5" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="27" y1="41.5" x2="27" y2="45" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="9" y1="27" x2="12.5" y2="27" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
      <line x1="41.5" y1="27" x2="45" y2="27" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />

      {/* Intercardinal tick marks */}
      <line x1="14.3" y1="14.3" x2="16.8" y2="16.8" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="39.7" y1="14.3" x2="37.2" y2="16.8" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="14.3" y1="39.7" x2="16.8" y2="37.2" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" strokeLinecap="round" />
      <line x1="39.7" y1="39.7" x2="37.2" y2="37.2" stroke="rgba(255,255,255,0.7)" strokeWidth="1.2" strokeLinecap="round" />

      {/* Angled 45 deg Magnetic Compass Needle */}
      <g filter="url(#needleShadow)">
        {/* Red North Half (Top-Right) */}
        <polygon points="27,27 24.8,24.8 38,16 29.2,29.2" fill="#ef4444" />
        <polygon points="27,27 29.2,29.2 38,16" fill="#dc2626" />

        {/* White South Half (Bottom-Left) */}
        <polygon points="27,27 29.2,29.2 16,38 24.8,24.8" fill="#f8fafc" />
        <polygon points="27,27 24.8,24.8 16,38" fill="#cbd5e1" />

        {/* Central metallic brass pivot pin */}
        <circle cx="27" cy="27" r="2.8" fill="#ffffff" />
        <circle cx="27" cy="27" r="1.8" fill="#f59e0b" />
        <circle cx="26.4" cy="26.4" r="0.7" fill="#ffffff" />
      </g>
    </svg>
  );
});

// 5. Photos: The signature blooming rainbow petal pinwheel
export const PhotosArtwork = memo(function PhotosArtwork() {
  const petals = [
    { fill: "#facc15", angle: 0 },   // Yellow
    { fill: "#fb923c", angle: 45 },  // Orange
    { fill: "#ef4444", angle: 90 },  // Coral/Red
    { fill: "#ec4899", angle: 135 }, // Magenta
    { fill: "#a855f7", angle: 180 }, // Violet
    { fill: "#3b82f6", angle: 225 }, // Royal Blue
    { fill: "#06b6d4", angle: 270 }, // Cyan
    { fill: "#84cc16", angle: 315 }, // Lime
  ];

  return (
    <svg viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg" className="mac-app-icon-art">
      <defs>
        <filter id="petalGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="1.5" stdDeviation="1.2" floodColor="#000000" floodOpacity="0.18" />
        </filter>
      </defs>

      <g transform="translate(27, 27)" filter="url(#petalGlow)">
        {petals.map(({ fill, angle }, index) => (
          <g key={index} transform={`rotate(${angle})`}>
            {/* Teardrop Petal radiating outward */}
            <path
              d="M 0,0 C 4.5,-6 8.5,-12 8.5,-16.5 C 8.5,-21 4.5,-24 0,-24 C -4.5,-24 -8.5,-21 -8.5,-16.5 C -8.5,-12 -4.5,-6 0,0 Z"
              fill={fill}
              opacity="0.88"
              style={{ mixBlendMode: "multiply" }}
            />
          </g>
        ))}
        {/* Soft center optical fusion */}
        <circle cx="0" cy="0" r="3.5" fill="#ffffff" opacity="0.9" />
      </g>
    </svg>
  );
});

// 6. Phone Mirror: The sleek titanium glass smartphone
export const PhoneMirrorArtwork = memo(function PhoneMirrorArtwork() {
  return (
    <svg viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg" className="mac-app-icon-art">
      <defs>
        <linearGradient id="phoneScreen" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#065f46" />
          <stop offset="50%" stopColor="#0f766e" />
          <stop offset="100%" stopColor="#064e3b" />
        </linearGradient>
        <filter id="phoneShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#064e3b" floodOpacity="0.45" />
        </filter>
      </defs>

      <g filter="url(#phoneShadow)">
        {/* Titanium Chassis Outer Frame */}
        <rect
          x="16"
          y="8"
          width="22"
          height="38"
          rx="5.5"
          fill="#0f172a"
          stroke="#94a3b8"
          strokeWidth="1.2"
        />

        {/* OLED Display Screen */}
        <rect
          x="17.2"
          y="9.2"
          width="19.6"
          height="35.6"
          rx="4.5"
          fill="url(#phoneScreen)"
        />

        {/* Dynamic Island Pill */}
        <rect x="23" y="11" width="8" height="2.2" rx="1.1" fill="#000000" />

        {/* Bottom Home Indicator Bar */}
        <line x1="23.5" y1="42.5" x2="30.5" y2="42.5" stroke="#ffffff" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />

        {/* Mirror Signal Projection Rays */}
        <path
          d="M 12,18 C 9,23 9,31 12,36"
          stroke="#ffffff"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.75"
        />
        <path
          d="M 42,18 C 45,23 45,31 42,36"
          stroke="#ffffff"
          strokeWidth="1.4"
          strokeLinecap="round"
          opacity="0.75"
        />
      </g>
    </svg>
  );
});

// 7. Storage Center / NAS: Apple-style server drive enclosure
export const StorageCenterArtwork = memo(function StorageCenterArtwork() {
  return (
    <svg viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg" className="mac-app-icon-art">
      <defs>
        <linearGradient id="nasCase" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="100%" stopColor="#cbd5e1" />
        </linearGradient>
        <filter id="nasShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.35" />
        </filter>
      </defs>

      <g filter="url(#nasShadow)">
        {/* Server Tower Chassis */}
        <rect
          x="12"
          y="10"
          width="30"
          height="34"
          rx="4"
          fill="url(#nasCase)"
          stroke="#94a3b8"
          strokeWidth="1.2"
        />

        {/* Drive Bay 1 (Top) */}
        <rect x="15" y="14" width="24" height="9" rx="2" fill="#334155" />
        <rect x="17" y="16.5" width="13" height="4" rx="1" fill="#475569" />
        {/* Drive 1 Status LED: Power Green */}
        <circle cx="34" cy="18.5" r="1.5" fill="#22c55e" filter="drop-shadow(0 0 2px #22c55e)" />

        {/* Drive Bay 2 (Bottom) */}
        <rect x="15" y="26" width="24" height="9" rx="2" fill="#334155" />
        <rect x="17" y="28.5" width="13" height="4" rx="1" fill="#475569" />
        {/* Drive 2 Status LED: Activity Blue */}
        <circle cx="34" cy="30.5" r="1.5" fill="#38bdf8" filter="drop-shadow(0 0 2px #38bdf8)" />

        {/* Front Ventilation Grille */}
        <line x1="16" y1="38" x2="38" y2="38" stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
        <line x1="16" y1="40.5" x2="38" y2="40.5" stroke="#64748b" strokeWidth="1" strokeLinecap="round" />
      </g>
    </svg>
  );
});

// 8. Tasks: Reminders clipboard notebook with colored category badges
export const TasksArtwork = memo(function TasksArtwork() {
  return (
    <svg viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg" className="mac-app-icon-art">
      <defs>
        <filter id="taskDocShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" floodColor="#312e81" floodOpacity="0.3" />
        </filter>
      </defs>

      <g filter="url(#taskDocShadow)">
        {/* Clean white document notepad base */}
        <rect
          x="12"
          y="8"
          width="30"
          height="38"
          rx="4"
          fill="#ffffff"
          stroke="#cbd5e1"
          strokeWidth="0.8"
        />

        {/* Task Item 1: Orange Bullet (Checked) */}
        <circle cx="18" cy="16" r="3" fill="#f97316" />
        <path d="M 16.5,16 L 17.5,17.2 L 19.5,15" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="24" y1="16" x2="36" y2="16" stroke="#475569" strokeWidth="2.2" strokeLinecap="round" />

        {/* Task Item 2: Sky Blue Bullet (Checked) */}
        <circle cx="18" cy="26" r="3" fill="#0ea5e9" />
        <path d="M 16.5,26 L 17.5,27.2 L 19.5,25" stroke="#ffffff" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="24" y1="26" x2="34" y2="26" stroke="#475569" strokeWidth="2.2" strokeLinecap="round" />

        {/* Task Item 3: Emerald Bullet (Pending) */}
        <circle cx="18" cy="36" r="3" fill="#10b981" />
        <line x1="24" y1="36" x2="31" y2="36" stroke="#94a3b8" strokeWidth="2.2" strokeLinecap="round" />
      </g>
    </svg>
  );
});

// 9. Activity Monitor: Oscilloscope CRT monitor with glowing ECG heartbeat pulse
export const ActivityMonitorArtwork = memo(function ActivityMonitorArtwork() {
  return (
    <svg viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg" className="mac-app-icon-art">
      <defs>
        <linearGradient id="crtGlass" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#090d16" />
        </linearGradient>
        <filter id="ecgGlow" x="-30%" y="-30%" width="160%" height="160%">
          <feDropShadow dx="0" dy="0" stdDeviation="2.5" floodColor="#22c55e" floodOpacity="0.85" />
          <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor="#16a34a" floodOpacity="0.45" />
        </filter>
      </defs>

      {/* Dark Oscilloscope Screen Bezel */}
      <rect
        x="10"
        y="11"
        width="34"
        height="32"
        rx="5"
        fill="url(#crtGlass)"
        stroke="#475569"
        strokeWidth="1.2"
      />

      {/* Faint coordinate grid lines */}
      <line x1="11" y1="27" x2="43" y2="27" stroke="#166534" strokeWidth="0.8" opacity="0.4" />
      <line x1="27" y1="12" x2="27" y2="42" stroke="#166534" strokeWidth="0.8" opacity="0.4" />
      <line x1="19" y1="12" x2="19" y2="42" stroke="#166534" strokeWidth="0.5" opacity="0.25" strokeDasharray="1 2" />
      <line x1="35" y1="12" x2="35" y2="42" stroke="#166534" strokeWidth="0.5" opacity="0.25" strokeDasharray="1 2" />

      {/* Glowing Neon Green Electrocardiogram (ECG) Heartbeat Wave */}
      <path
        d="M 11,27 L 18,27 L 21,21 L 24,35 L 28,14 L 32,38 L 35,23 L 38,27 L 43,27"
        stroke="#4ade80"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#ecgGlow)"
      />

      {/* Leading Pulse Beacon Spark */}
      <circle cx="28" cy="14" r="2.2" fill="#ffffff" filter="drop-shadow(0 0 3px #4ade80)" />
    </svg>
  );
});

// 10. Settings: Precision machined mechanical gears with metallic bevels
export const SettingsArtwork = memo(function SettingsArtwork() {
  return (
    <svg viewBox="0 0 54 54" fill="none" xmlns="http://www.w3.org/2000/svg" className="mac-app-icon-art">
      <defs>
        <radialGradient id="gearMetal" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#f8fafc" />
          <stop offset="60%" stopColor="#cbd5e1" />
          <stop offset="100%" stopColor="#64748b" />
        </radialGradient>
        <radialGradient id="gearSmallMetal" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#e2e8f0" />
          <stop offset="60%" stopColor="#94a3b8" />
          <stop offset="100%" stopColor="#475569" />
        </radialGradient>
        <filter id="gearShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2.5" stdDeviation="2" floodColor="#0f172a" floodOpacity="0.4" />
        </filter>
      </defs>

      <g filter="url(#gearShadow)">
        {/* Secondary Upper-Right Small Gear */}
        <g transform="translate(35, 19)">
          <circle cx="0" cy="0" r="10" fill="url(#gearSmallMetal)" stroke="#94a3b8" strokeWidth="0.8" />
          {/* Small gear teeth */}
          {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
            <rect
              key={angle}
              x="-2"
              y="-12.5"
              width="4"
              height="3"
              rx="0.6"
              fill="#94a3b8"
              transform={`rotate(${angle})`}
            />
          ))}
          {/* Axle hole */}
          <circle cx="0" cy="0" r="3.5" fill="#334155" />
        </g>

        {/* Primary Large Central Gear */}
        <g transform="translate(23, 31)">
          {/* Large gear teeth */}
          {[0, 36, 72, 108, 144, 180, 216, 252, 288, 324].map((angle) => (
            <rect
              key={angle}
              x="-3"
              y="-18.5"
              width="6"
              height="4.5"
              rx="0.8"
              fill="#cbd5e1"
              transform={`rotate(${angle})`}
            />
          ))}
          {/* Gear body disk */}
          <circle cx="0" cy="0" r="15" fill="url(#gearMetal)" stroke="#ffffff" strokeWidth="1" />
          {/* Machined concentric groove */}
          <circle cx="0" cy="0" r="11" fill="none" stroke="#94a3b8" strokeWidth="0.8" strokeDasharray="3 1.5" />
          {/* Central hub axle */}
          <circle cx="0" cy="0" r="5" fill="#1e293b" />
          <circle cx="0" cy="0" r="2.5" fill="#64748b" />
        </g>
      </g>
    </svg>
  );
});

/**
 * Main dispatcher mapping application identities to rich macOS-fidelity artworks.
 */
export function getMacAppArtwork(appId?: string): ReactNode {
  if (!appId) return null;

  switch (appId) {
    case "system:finder":
    case "system:files":
      return <FinderArtwork />;
    case "system:launchpad":
      return <LaunchpadArtwork />;
    case "system:app-store":
    case "echo:/hub":
    case "echo:/workspace/store":
      return <AppStoreArtwork />;
    case "echo:/browser":
      return <BrowserArtwork />;
    case "echo:/photos":
      return <PhotosArtwork />;
    case "echo:/phone-mirror":
    case "echo:/device-link":
      return <PhoneMirrorArtwork />;
    case "echo:/storage-center":
    case "echo:/workspace/storage":
      return <StorageCenterArtwork />;
    case "system:tasks":
      return <TasksArtwork />;
    case "system:activity-monitor":
    case "echo:/workspace/observability":
      return <ActivityMonitorArtwork />;
    case "system:settings":
    case "echo:/workspace":
      return <SettingsArtwork />;
    case "echo:/workspace/realtime/new":
      return <EchoMark tone="light" className="mac-app-icon-art mac-shell-icon-art" />;
    default:
      return null;
  }
}
