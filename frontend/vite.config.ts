/// <reference types="vitest" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import path from "path";
import fs from "fs";
import { devSettings, devInstancePlugin } from "./scripts/dev-instance.mjs";

const devInstance = devSettings(
  fileURLToPath(new URL("..", import.meta.url)),
  "os",
);

import {
  rejectDefeatedCodeSplitting,
  rejectOversizedJavaScriptChunk,
} from "./scripts/build-warning-policy.mjs";
import {
  manualChunks as sharedManualChunks,
  packageNameFromNodeModule,
} from "./scripts/chunk-policy.mjs";

const MAX_JS_CHUNK_KIB = 900;

// The jsdom suite contains a few long lived, interaction-heavy appliance
// fixtures. Letting Vitest fan out to every host core makes those fixtures
// compete for timers and event-loop capacity, which turns otherwise isolated
// tests into order-sensitive timeouts. Keep a conservative default while
// allowing a CI/reference machine to tune it explicitly.
const configuredTestWorkers = Number.parseInt(
  process.env.ECHO_VITEST_MAX_WORKERS || "4",
  10,
);
const testMaxWorkers = Number.isFinite(configuredTestWorkers)
  ? Math.max(1, configuredTestWorkers)
  : 4;

const require = createRequire(import.meta.url);
const vitePackage = require("vite/package.json");

const gatewayTarget =
  process.env.ECHO_INTERNAL_GATEWAY_BASE_URL ||
  `http://127.0.0.1:${devInstance.ports.backend}`;

// While the dev backend is down or still booting, answer like the appliance's
// nginx does (deploy/provision/base/echo-nginx.conf: 502/504 -> 503
// appliance_starting with Retry-After). The desktop then shows
// "系统服务正在启动" and reconnects by itself instead of a dead-end
// "暂时无法连接系统服务" followed by the lock screen.
function answerBackendStarting(proxy: any) {
  proxy.on("error", (_err: unknown, _req: unknown, res: any) => {
    if (!res || typeof res.writeHead !== "function" || res.headersSent) return;
    res.writeHead(503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Retry-After": "3",
    });
    res.end(
      JSON.stringify({
        detail: {
          code: "appliance_starting",
          message: "ECHO OS 正在启动，请稍后重试",
        },
      }),
    );
  });
}

const proxyConfig = {
  "/api/files/stream": {
    target: gatewayTarget,
    configure: answerBackendStarting,
    // Keep the browser's same-origin Host so the appliance trust middleware
    // can validate the request against the visible Echo OS origin.
    changeOrigin: false,
    secure: false,
    timeout: 0,
    proxyTimeout: 0,
    on: {
      proxyReq: (proxyReq: any) => {
        proxyReq.setHeader("Connection", "keep-alive");
        proxyReq.setHeader("Cache-Control", "no-cache");
      },
    },
  },
  "/api/preview/stream": {
    target: gatewayTarget,
    configure: answerBackendStarting,
    changeOrigin: false,
    secure: false,
    timeout: 0,
    proxyTimeout: 0,
    on: {
      proxyReq: (proxyReq: any) => {
        proxyReq.setHeader("Connection", "keep-alive");
        proxyReq.setHeader("Cache-Control", "no-cache");
      },
    },
  },
  "/api": {
    target: gatewayTarget,
    configure: answerBackendStarting,
    changeOrigin: false,
    secure: false,
    timeout: 0,
    proxyTimeout: 0,
    ws: true,
    on: {
      proxyReq: (proxyReq: any, req: any, _res: any) => {
        if (req.headers.accept?.includes("text/event-stream")) {
          proxyReq.setHeader("Connection", "keep-alive");
          proxyReq.setHeader("Cache-Control", "no-cache");
        }
      },
      proxyRes: (proxyRes: any, req: any, _res: any) => {
        if (
          req.headers.accept?.includes("text/event-stream") ||
          (proxyRes.headers["content-type"] || "").includes("text/event-stream")
        ) {
          proxyRes.headers["cache-control"] = "no-cache";
          proxyRes.headers["x-accel-buffering"] = "no";
        }
      },
      error: (_err: any, _req: any, res: any) => {
        if (!res.headersSent) {
          res.writeHead(502, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "proxy_error" }));
        }
      },
    },
  },
  "/v1": {
    target: gatewayTarget,
    changeOrigin: true,
    ws: true,
  },
  "/.well-known": {
    target: gatewayTarget,
    changeOrigin: true,
  },
  "/.a2a": {
    target: gatewayTarget,
    changeOrigin: true,
  },
};

function buildTracePlugin() {
  const tracePath = path.resolve("vite-transform-trace.log");
  return {
    name: "echo-build-trace",
    buildStart() {
      fs.writeFileSync(tracePath, "");
    },
    transform(_code: string, id: string) {
      fs.appendFileSync(tracePath, `${id}\n`);
      return null;
    },
  };
}

function chunkSizeGatePlugin() {
  return {
    name: "echo-chunk-size-gate",
    generateBundle(_options: unknown, bundle: Record<string, any>) {
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        rejectOversizedJavaScriptChunk(
          output.fileName,
          Buffer.byteLength(output.code, "utf8"),
          MAX_JS_CHUNK_KIB,
        );
      }
    },
  };
}

export default defineConfig({
  base: "./",
  define: {
    __VITE_VERSION__: JSON.stringify(vitePackage.version),
    // About this device shows the release it was built from.
    __ECHO_OS_VERSION__: JSON.stringify(require("./package.json").version),
  },
  plugins: [
    devInstancePlugin("os"),
    ...(process.env.ECHO_BUILD_TRACE === "1" ? [buildTracePlugin()] : []),
    chunkSizeGatePlugin(),
    react(),
  ],
  resolve: {
    dedupe: [
      "react",
      "react-dom",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@tanstack/react-query",
    ],
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "motion/react": fileURLToPath(
        new URL("./src/lib/motion-shim.tsx", import.meta.url),
      ),
      "mermaid-real": fileURLToPath(
        new URL(
          "./node_modules/mermaid/dist/mermaid.core.mjs",
          import.meta.url,
        ),
      ),
      // ``mermaid`` is aliased to a local shim because the upstream
      // package ships a large ESM bundle with worker-based parsing
      // we don't need in the workspace UI. ``resolve.alias`` covers
      // both dev and build; no pre-resolve plugin required.
      mermaid: fileURLToPath(
        new URL("./src/lib/mermaid-shim.ts", import.meta.url),
      ),
    },
  },
  server: {
    port: devInstance.ports.frontend,
    host: "0.0.0.0",
    proxy: proxyConfig,
  },
  preview: {
    port: devInstance.ports.frontend,
    host: "0.0.0.0",
    proxy: proxyConfig,
  },
  build: {
    outDir: "dist",
    sourcemap: process.env.ECHO_SOURCEMAP === "1" ? "hidden" : false,
    reportCompressedSize: true,
    // Heavy editors/diagram engines stay lazy and package-split below. Keep
    // this as a real regression gate: raising it can silently collapse those
    // dynamic boundaries back into multi-megabyte parse units.
    chunkSizeWarningLimit: MAX_JS_CHUNK_KIB,
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        rejectDefeatedCodeSplitting(warning.code, warning.message);
        defaultHandler(warning);
      },
      output: {
        manualChunks(id) {
          const sharedChunk = sharedManualChunks(id);
          if (sharedChunk) return sharedChunk;
          const normalized = id.replace(/\\/g, "/");
          const pkg = packageNameFromNodeModule(id);
          if (normalized.includes("node_modules/@xyflow/")) {
            return "xyflow";
          }
          return pkg === "katex" ? "katex" : undefined;
        },
      },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // Electron tests execute with Node's test runner (and some require
    // native-only globals), so running a bare `vitest` command must not try to
    // collect them as jsdom suites. Keep the exclusion here as the source of
    // truth instead of relying on every package script to repeat it.
    exclude: [
      "node_modules/**",
      "dist/**",
      "e2e/**",
      "electron/**/*.test.cjs",
      "electron/**/*.node-test.cjs",
      "scripts/**/*.test.mjs",
    ],
    maxWorkers: testMaxWorkers,
  },
});
