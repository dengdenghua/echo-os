import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Custom font-size and tracking names (globals.css @theme) must be registered;
// otherwise tailwind-merge reads text-micro as a colour and drops it whenever a
// component also supplies text-muted-foreground.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ["micro", "mini", "caption", "2xs", "3xs"],
      tracking: ["caps", "eyebrow"],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Shared class for external links (underline by default). */
export const externalLinkClass =
  "text-primary underline underline-offset-2 hover:no-underline";
/** Link style without underline by default (e.g. for streaming/loading). */
export const externalLinkClassNoUnderline = "text-primary hover:underline";
