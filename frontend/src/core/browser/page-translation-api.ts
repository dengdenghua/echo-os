import { jsonAuthHeaders } from "@/core/auth/api";
import { getBackendBaseURL } from "@/core/config";

import type {
  PageTranslationResult,
  PageTranslationSegment,
  PageTranslationTarget,
} from "./page-translator";

export interface PageTranslateResponse {
  translations: PageTranslationResult[];
  model?: string | null;
  cached?: number;
}

/**
 * POST /api/browser/translate. ECHO OS has no typed request helper, so this
 * posts directly and surfaces the server's `detail` as the error message.
 * The ECHO OS runtime does not serve this route yet; translation stays hidden
 * there because the shell has no isolated-world executor either.
 */
export async function postTranslate(body: {
  target: PageTranslationTarget;
  segments: PageTranslationSegment[];
  model: string | null;
}): Promise<PageTranslateResponse> {
  const response = await fetch(`${getBackendBaseURL()}/api/browser/translate`, {
    method: "POST",
    credentials: "include",
    headers: jsonAuthHeaders(),
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as {
      detail?: unknown;
    } | null;
    const detail = typeof data?.detail === "string" ? data.detail : "";
    throw new Error(detail || response.statusText || `HTTP ${response.status}`);
  }
  return (await response.json()) as PageTranslateResponse;
}
