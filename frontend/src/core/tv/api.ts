import { authHeaders } from "@/core/auth/api";
import { getBackendBaseURL } from "@/core/config";

export async function tvRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${getBackendBaseURL()}${path}`, {
    method,
    signal: signal ?? AbortSignal.timeout(30000),
    headers: {
      ...authHeaders(),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      typeof data?.detail === "string"
        ? data.detail
        : `操作失败（${response.status}），请重试`,
    );
  return data as T;
}
