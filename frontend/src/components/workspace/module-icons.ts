import {
  BookOpenIcon,
  CandlestickChartIcon,
  CompassIcon,
  DatabaseIcon,
  DnaIcon,
  PaletteIcon,
  RssIcon,
  SquareKanbanIcon,
  type LucideIcon,
} from "lucide-react";

import type { WorkbenchBuiltinIcon } from "@/core/workbench/apps";

// One glyph per workbench app on the AI browser's start page and desktop,
// matching the ECHO OS desktop (文档库 is the database glyph there too). ECHO AI
// keeps the same map under the same name for the browser it shares with us.
export const WORKBENCH_APP_ICONS = {
  database: DatabaseIcon,
  projects: SquareKanbanIcon,
  trading: CandlestickChartIcon,
  design: PaletteIcon,
  narrative: BookOpenIcon,
  evolution: DnaIcon,
  intelligence: RssIcon,
  community: CompassIcon,
} satisfies Record<WorkbenchBuiltinIcon, LucideIcon>;
