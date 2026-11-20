import { useState } from "react";
import {
  BookOpen,
  Clapperboard,
  FilePlay,
  FolderOpen,
  Puzzle,
  Search,
  Volume2,
  Wallpaper,
  LayoutGrid,
  Monitor,
  Settings,
} from "lucide-react";
import "./tile-art.css";

const symbols = {
  echo: null,
  library: Clapperboard,
  knowledge: BookOpen,
  apps: LayoutGrid,
  computer: Monitor,
  settings: Settings,
  search: Search,
  file: FilePlay,
  wallpaper: Wallpaper,
  device: Volume2,
  sources: FolderOpen,
  plugins: Puzzle,
};

export function TVTileArt({ app }: { app: keyof typeof symbols }) {
  const [failed, setFailed] = useState(false);
  const Symbol = symbols[app];
  return (
    <span
      className="tv-tile-art"
      data-art-unavailable={failed || undefined}
      aria-hidden="true"
    >
      <img
        className="tv-tile-object"
        src={`/tv/tile-art/${app}.webp`}
        alt=""
        draggable={false}
        onError={() => setFailed(true)}
      />
      {Symbol ? (
        <Symbol className="tv-art-outline" focusable="false" />
      ) : (
        <span className="tv-art-outline tv-art-brand" />
      )}
    </span>
  );
}
