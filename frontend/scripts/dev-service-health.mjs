import http from "node:http";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { devSettings, probeOwnedService } from "./dev-instance.mjs";

export function devPorts(
  env = process.env,
  root = fileURLToPath(new URL("../..", import.meta.url)),
) {
  const { backend, frontend } = devSettings(root, "os", env).ports;
  return { backend, frontend };
}

// Only inspect local services; no cookies, environment proxies or redirects.
function readJson(port, path, timeoutMs) {
  return new Promise((resolve, reject) => {
    const request = http.get(
      { host: "127.0.0.1", port, path, agent: false },
      (response) => {
        if (response.statusCode !== 200) {
          response.resume();
          reject(new Error(`${path}: HTTP ${response.statusCode}`));
          return;
        }
        let body = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
          if (body.length > 65536)
            request.destroy(new Error(`${path}: response too large`));
        });
        response.on("error", reject);
        response.on("end", () => {
          try {
            resolve(JSON.parse(body));
          } catch {
            reject(new Error(`${path}: invalid JSON`));
          }
        });
      },
    );
    const timer = setTimeout(
      () => request.destroy(new Error(`${path}: timeout`)),
      timeoutMs,
    );
    request.on("close", () => clearTimeout(timer));
    request.on("error", reject);
  });
}

export async function probeDevService(
  port,
  { timeoutMs = 2000, identity, frontend = false } = {},
) {
  try {
    if (identity) {
      const owned = await probeOwnedService(port, identity, {
        frontend,
        timeoutMs,
      });
      if (!owned.ready) throw new Error(owned.error);
    }
    const [health, auth] = await Promise.all([
      readJson(port, "/api/health", timeoutMs),
      readJson(port, "/api/appliance/auth/status", timeoutMs),
    ]);
    if (
      health?.status !== "ok" ||
      health?.runtime?.name !== "echo-agent-runtime"
    )
      throw new Error("Echo runtime is not healthy");
    if (
      typeof auth?.authRequired !== "boolean" ||
      typeof auth?.authenticated !== "boolean" ||
      ![null, "member", "operator"].includes(auth?.role)
    )
      throw new Error("Device session response is invalid");
    // Do not copy arbitrary health payloads, account data or credentials into logs.
    return {
      ready: true,
      restartRequired: health.lifecycle?.restartRequired === true,
    };
  } catch (error) {
    return { ready: false, error: error.code || error.message };
  }
}

export async function waitForDevService(
  port,
  {
    timeoutMs = 120000,
    intervalMs = 1000,
    signal,
    identity,
    frontend = false,
  } = {},
) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    signal?.throwIfAborted();
    last = await probeDevService(port, {
      timeoutMs: Math.min(2000, deadline - Date.now()),
      identity,
      frontend,
    });
    signal?.throwIfAborted();
    if (last.ready) {
      if (last.restartRequired)
        throw new Error(`Echo on port ${port}: source changes require restart`);
      return last;
    }
    await delay(
      Math.min(intervalMs, Math.max(1, deadline - Date.now())),
      undefined,
      { signal },
    );
  }
  throw new Error(
    `Echo on port ${port} did not become ready: ${last?.error || "source changes require restart"}`,
  );
}

export function assertPortFree(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", () =>
      reject(
        new Error(
          `Port ${port} is occupied; stop its existing service first. No process was killed.`,
        ),
      ),
    );
    server.listen(port, "127.0.0.1", () => server.close(resolve));
  });
}
