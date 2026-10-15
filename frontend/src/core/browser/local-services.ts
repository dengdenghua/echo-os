import { authHeaders } from "@/core/auth/api";

export interface DetectedLocalService {
  port: number;
  name: string;
  type: "frontend" | "backend" | "other";
  url: string;
}

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Distinguish a local app preview from an ordinary web page without relying
 * on a particular development port. */
export function isLocalPreviewUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      LOOPBACK_HOSTS.has(url.hostname)
    );
  } catch {
    return false;
  }
}

export function localPreviewPort(value: string): string {
  try {
    const url = new URL(value);
    return url.port || (url.protocol === "https:" ? "443" : "80");
  } catch {
    return "";
  }
}

/** The device probes a fixed list of development ports on its own loopback
 * interface (`appliance/local_services.py`). A page cannot fetch a closed port
 * without the browser logging a refused connection, so it asks the device. */
export const LOCAL_SERVICES_ENDPOINT = "/api/appliance/local-services";

const SERVICE_TYPES = new Set<DetectedLocalService["type"]>([
  "frontend",
  "backend",
  "other",
]);

/** A desktop opened from another machine: the device's loopback services are
 * not reachable at that viewer's `localhost`, so there is nothing to list. */
export function isRemoteWebSession(
  location: Pick<Location, "protocol" | "hostname"> = window.location,
): boolean {
  return (
    (location.protocol === "http:" || location.protocol === "https:") &&
    !LOOPBACK_HOSTS.has(location.hostname)
  );
}

function parseLocalServices(
  body: unknown,
  excluded: ReadonlySet<number>,
): DetectedLocalService[] {
  const services =
    body && typeof body === "object"
      ? (body as { services?: unknown }).services
      : undefined;
  if (!Array.isArray(services)) return [];
  const results: DetectedLocalService[] = [];
  for (const entry of services as unknown[]) {
    if (!entry || typeof entry !== "object") continue;
    const { port, name, type } = entry as Record<string, unknown>;
    if (
      typeof port !== "number" ||
      !Number.isInteger(port) ||
      port < 1 ||
      port > 65535 ||
      excluded.has(port) ||
      typeof name !== "string" ||
      !SERVICE_TYPES.has(type as DetectedLocalService["type"])
    ) {
      continue;
    }
    results.push({
      port,
      name,
      type: type as DetectedLocalService["type"],
      url: `http://localhost:${port}`,
    });
  }
  return results;
}

export async function detectLocalServices({
  excludePorts = [],
  timeoutMs = 5000,
}: {
  excludePorts?: readonly number[];
  timeoutMs?: number;
} = {}): Promise<DetectedLocalService[]> {
  if (isRemoteWebSession()) return [];
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  let results: DetectedLocalService[] = [];
  try {
    const response = await fetch(LOCAL_SERVICES_ENDPOINT, {
      headers: { Accept: "application/json", ...authHeaders() },
      cache: "no-store",
      signal: controller.signal,
    });
    // Signed out, not the device operator, or no device API: nothing to list.
    if (response.ok) {
      results = parseLocalServices(
        await response.json(),
        new Set(excludePorts),
      );
    }
  } catch {
    // The device did not answer in time; show no local services.
  } finally {
    window.clearTimeout(timeout);
  }
  return results.sort((left, right) => {
    if (left.type === right.type) return left.port - right.port;
    if (left.type === "frontend") return -1;
    if (right.type === "frontend") return 1;
    return left.port - right.port;
  });
}

/** How long an automatic scan reuses the previous result. */
export const LOCAL_SERVICE_SCAN_REUSE_MS = 60_000;

let recentScan: {
  key: string;
  at: number;
  result: Promise<DetectedLocalService[]>;
} | null = null;

/**
 * The AI browser start page scans on each open and each return to its tab.
 * Automatic scans share one in-flight or recent (one minute) result; `force`
 * (the refresh button) always asks the device again.
 */
export function detectLocalServicesShared({
  excludePorts = [],
  force = false,
  now = Date.now(),
}: {
  excludePorts?: readonly number[];
  force?: boolean;
  now?: number;
} = {}): Promise<DetectedLocalService[]> {
  const key = [...excludePorts].sort((a, b) => a - b).join(",");
  if (
    !force &&
    recentScan?.key === key &&
    now - recentScan.at < LOCAL_SERVICE_SCAN_REUSE_MS
  ) {
    return recentScan.result;
  }
  const result = detectLocalServices({ excludePorts });
  const entry = { key, at: now, result };
  recentScan = entry;
  result.catch(() => {
    if (recentScan === entry) recentScan = null;
  });
  return result;
}
