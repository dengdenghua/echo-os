import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/lib/utils";

import "./progress-line.css";

export const PROGRESS_LINE_DEFAULT_LABEL = "加载中";

export type ProgressLineProps = Omit<
  ComponentProps<"div">,
  "children" | "role"
> & {
  /** Accessible name. Pass `t.common.loading` where the call site has i18n. */
  label?: string;
  /**
   * Hide the line from assistive tech when a surrounding live region (for
   * example `PanelLoading`) already announces the loading state.
   */
  decorative?: boolean;
};

/**
 * The ECHO loading indicator: a thin 2px `core` segment sliding across a
 * faint `line` track. Indeterminate by design; it replaces spinners and
 * pulsing skeletons for route- and panel-level loading. Under
 * `prefers-reduced-motion: reduce` the segment stops and stays as a static
 * partial bar.
 */
export function ProgressLine({
  label = PROGRESS_LINE_DEFAULT_LABEL,
  decorative = false,
  className,
  ...props
}: ProgressLineProps) {
  return (
    <div
      data-slot="progress-line"
      {...(decorative
        ? { "aria-hidden": true }
        : { role: "progressbar", "aria-label": label })}
      className={cn(
        "relative h-0.5 w-full shrink-0 overflow-hidden bg-border-subtle",
        className,
      )}
      {...props}
    >
      <div
        data-slot="progress-line-bar"
        className="absolute inset-y-0 left-0 w-2/5 bg-core animate-[echo-progress-line_1.6s_var(--echo-ease)_infinite] motion-reduce:animate-none"
      />
    </div>
  );
}

export type PanelLoadingProps = Omit<ComponentProps<"div">, "role"> & {
  /** Accessible loading label, read out when no caption is shown. */
  label?: string;
  /** Optional muted caption shown under the line. */
  caption?: ReactNode;
  lineClassName?: string;
};

/**
 * Route / panel loading fallback: the progress line along the top edge of
 * the area, with an optional calm caption below it. Extra children (such as
 * a slow-loading retry action) render under the caption.
 */
export function PanelLoading({
  label = PROGRESS_LINE_DEFAULT_LABEL,
  caption,
  lineClassName,
  className,
  children,
  ...props
}: PanelLoadingProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-slot="panel-loading"
      className={cn("flex w-full flex-col", className)}
      {...props}
    >
      <ProgressLine decorative className={lineClassName} />
      {caption ? (
        <p
          data-slot="panel-loading-caption"
          className="px-4 pt-3 text-center text-sm text-muted-foreground"
        >
          {caption}
        </p>
      ) : (
        <span className="sr-only">{label}</span>
      )}
      {children}
    </div>
  );
}
