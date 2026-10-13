import {
  defineConfig,
  devices,
  type ReporterDescription,
} from "@playwright/test";
import { randomBytes } from "node:crypto";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendPort = process.env.FRONTEND_PORT || "13000";
const backendPort = process.env.GATEWAY_PORT || "18000";
const backendHost = process.env.GATEWAY_HOST || "127.0.0.1";
const backendBase = `http://${backendHost}:${backendPort}`;
const frontendOrigins = [
  `http://localhost:${frontendPort}`,
  `http://127.0.0.1:${frontendPort}`,
];
const configDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(configDir, "..");
const rawE2eStateRoot =
  process.env.ECHO_E2E_STATE_ROOT || "test-results/full-stack-state";
const e2eStateRoot = isAbsolute(rawE2eStateRoot)
  ? resolve(rawE2eStateRoot)
  : resolve(repoRoot, rawE2eStateRoot);
const e2eDataDir = join(e2eStateRoot, "data");
const pythonBin =
  process.env.PYTHON ||
  (process.platform === "win32"
    ? ".\\.venv\\Scripts\\python.exe"
    : "./.venv/bin/python");
const reuseServers = process.env.ECHO_E2E_REUSE_SERVER === "1";
// The lane signs in through the appliance lock screen like a device owner. A
// fresh state root gets a fresh owner password generated for this run only; it
// is never a real credential. Playwright loads this config in the runner first
// and the workers inherit the runner's environment, so every process sees the
// same value. A reused server must be given the password it was started with.
if (!process.env.ECHO_E2E_OWNER_PASSWORD && !reuseServers) {
  process.env.ECHO_E2E_OWNER_PASSWORD = `e2e-owner-${randomBytes(18).toString("base64url")}`;
}
const ownerPassword = process.env.ECHO_E2E_OWNER_PASSWORD || "";
const jsonReportPath = process.env.ECHO_E2E_JSON_REPORT;
const reporter: ReporterDescription | ReporterDescription[] = jsonReportPath
  ? [["list"], ["json", { outputFile: jsonReportPath }]]
  : process.env.CI
    ? "github"
    : "list";
const defaultTestMatch = [
  "full-stack-smoke.spec.ts",
  "workbench.spec.ts",
  "desktop-apps.spec.ts",
  "regression.spec.ts",
  "desktop-layout.spec.ts",
];
const testMatch =
  process.env.ECHO_E2E_TEST_MATCH?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean) || defaultTestMatch;
// Keep environment injection out of the shell command. The previous
// `KEY=value command` form worked on POSIX only, so Windows could not start
// the full-stack lane at all. Playwright passes this map to both child
// processes without invoking a shell-specific assignment syntax.
const backendProcessEnv: NodeJS.ProcessEnv = {
  ...process.env,
  ECHO_FF_REGENERATION_ENABLED: "0",
  ECHO_FF_CAMOUFLAGE_ENABLED: "0",
  ECHO_FF_UI_AMBIENT_SUGGESTIONS: "0",
  GATEWAY_PORT: backendPort,
  ECHO_INTERNAL_GATEWAY_BASE_URL: backendBase,
  ECHO_HOME: e2eStateRoot,
  ECHO_DATA_DIR: e2eDataDir,
  ECHO_NAS_ROOT: join(e2eDataDir, "nas"),
  // Keep the Codex control lease outside the developer account so an
  // unrelated desktop worker cannot make the offline lane nondeterministic.
  ECHO_CODEX_STATE_DIR: join(e2eStateRoot, "codex"),
  // Appliance mode, exactly as the NAS image boots it: the entrypoint
  // provisions the owner from this password and enables local auth.
  ECHO_ADMIN_PASSWORD: ownerPassword,
  ECHO_APPLIANCE_TRUSTED_ORIGINS: frontendOrigins.join(","),
};
// The Vite all-in-one launcher's passwordless login must never leak into the
// lane that proves the lock screen; the backend only learns the owner password
// through ECHO_ADMIN_PASSWORD, which the entrypoint consumes and removes.
delete backendProcessEnv.ECHO_APPLIANCE_DEV_PASSWORDLESS;
delete backendProcessEnv.ECHO_E2E_OWNER_PASSWORD;

const resolvedTestResultsRoot = resolve(repoRoot, "test-results");
const e2eStateRootRelative = relative(resolvedTestResultsRoot, e2eStateRoot);
const e2eStateRootIsDisposable =
  e2eStateRootRelative &&
  !e2eStateRootRelative.startsWith("..") &&
  e2eStateRootRelative !== ".." &&
  e2eStateRootRelative !== ".";

if (!reuseServers && !e2eStateRootIsDisposable) {
  throw new Error(
    [
      "ECHO_E2E_STATE_ROOT must resolve under repo test-results when",
      "ECHO_E2E_REUSE_SERVER is not enabled.",
      `resolved state root: ${e2eStateRoot}`,
    ].join(" "),
  );
}

// Playwright loads its config in both the runner and worker processes. State
// cleanup must therefore happen in the single backend web-server command, not
// as a module side effect here; otherwise a worker can delete SQLite's parent
// directory after the backend has already opened.
const prepareStateCommand = reuseServers
  ? ""
  : "node frontend/e2e/prepare-full-stack-state.mjs && ";

/**
 * Full-stack Playwright configuration.
 *
 * Unlike the default config, this starts both halves of the local app:
 * the FastAPI backend through the appliance entrypoint (lock screen, owner
 * account, appliance extension) with the deterministic offline e2e config,
 * then Vite with its /api proxy pointed at that backend. This catches the
 * common failure mode where the frontend is reachable but the backend is
 * stale or absent, and it drives the product a device owner actually uses.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter,
  timeout: 45_000,

  use: {
    // The SPA moves loopback visits to the canonical localhost origin, where
    // its session cookie lives; start there so API helpers share the cookie.
    baseURL: `http://localhost:${frontendPort}`,
    // A device owner's ECHO OS speaks Chinese. The desktop shell is
    // Chinese-only, and the workbench follows the browser locale.
    locale: "zh-CN",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },

  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], locale: "zh-CN" },
    },
  ],

  webServer: [
    {
      command: `${prepareStateCommand}${pythonBin} scripts/e2e_appliance_backend.py --config config.e2e.yaml --host ${backendHost} --port ${backendPort}`,
      url: `${backendBase}/readyz`,
      cwd: repoRoot,
      env: backendProcessEnv,
      reuseExistingServer: reuseServers,
      timeout: 120_000,
    },
    {
      command: `pnpm exec vite --host 0.0.0.0 --port ${frontendPort} --strictPort`,
      url: `http://127.0.0.1:${frontendPort}`,
      reuseExistingServer: reuseServers,
      env: {
        ...process.env,
        GATEWAY_PORT: backendPort,
        ECHO_INTERNAL_GATEWAY_BASE_URL: backendBase,
      },
      timeout: 90_000,
    },
  ],
});
