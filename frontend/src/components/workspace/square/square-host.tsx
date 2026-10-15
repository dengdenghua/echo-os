/**
 * Host adapter for 广场: the only Square file that differs between ECHO AI and
 * ECHO OS. Everything else under components/workspace/square is shared
 * verbatim. ECHO OS calls the runtime proxy with fetch and the auth headers,
 * and uses its core progress line.
 */

import { ProgressLine } from "@/components/ui/progress-line";
import { authHeaders } from "@/core/auth/api";
import { getBackendBaseURL } from "@/core/config";

import {
  SquareRequestError,
  type SquareComments,
  type SquareFeed,
  type SquareFeedQuery,
  type SquareMarket,
  type SquareMarketKindKey,
  type SquareMarketSortKey,
  type SquareUserPage,
} from "./square-types";

async function getJson<T>(
  path: string,
  query: Record<string, string | number>,
  signal?: AbortSignal,
): Promise<T> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    params.append(key, String(value));
  }
  const search = params.toString();
  let response: Response;
  try {
    response = await fetch(
      `${getBackendBaseURL()}${path}${search ? `?${search}` : ""}`,
      { headers: authHeaders(), signal },
    );
  } catch (error) {
    throw new SquareRequestError(
      error instanceof Error ? error.message : String(error),
      0,
    );
  }
  if (!response.ok) {
    throw new SquareRequestError(
      `GET ${path} failed: ${response.status}`,
      response.status,
    );
  }
  return response.json();
}

export function fetchSquareFeed(
  query: SquareFeedQuery,
  signal?: AbortSignal,
): Promise<SquareFeed> {
  return getJson("/api/square/feed", { ...query }, signal);
}

export function fetchSquareComments(
  postId: string,
  signal?: AbortSignal,
): Promise<SquareComments> {
  return getJson(
    `/api/square/posts/${encodeURIComponent(postId)}/comments`,
    { limit: 100 },
    signal,
  );
}

export function fetchSquareUser(
  userId: string,
  signal?: AbortSignal,
): Promise<SquareUserPage> {
  return getJson(`/api/square/users/${encodeURIComponent(userId)}`, {}, signal);
}

export function fetchSquareMarket(
  kind: SquareMarketKindKey,
  sort: SquareMarketSortKey,
  signal?: AbortSignal,
): Promise<SquareMarket> {
  return getJson("/api/square/market", { kind, sort }, signal);
}

export function SquareProgressLine({ className }: { className?: string }) {
  return <ProgressLine decorative className={className} />;
}
