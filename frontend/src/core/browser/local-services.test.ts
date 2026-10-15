import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LOCAL_SERVICES_ENDPOINT,
  LOCAL_SERVICE_SCAN_REUSE_MS,
  detectLocalServices,
  detectLocalServicesShared,
  isLocalPreviewUrl,
  isRemoteWebSession,
  localPreviewPort,
} from "./local-services";

function deviceScan(services: unknown[], status = 200) {
  return vi.fn((url: string) =>
    url === LOCAL_SERVICES_ENDPOINT
      ? Promise.resolve(
          new Response(JSON.stringify({ services }), {
            status,
            headers: { "Content-Type": "application/json" },
          }),
        )
      : Promise.reject(new TypeError(`unexpected fetch ${url}`)),
  );
}

describe("shared local service scan", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reuses a recent automatic scan and asks the device again on refresh", async () => {
    const fetchMock = deviceScan([
      { port: 5173, name: "Vite", type: "frontend" },
    ]);
    vi.stubGlobal("fetch", fetchMock);
    // A port set no other test uses, so the module-level cache starts cold.
    const excludePorts = [65001];
    const start = 1_000_000;

    const first = await detectLocalServicesShared({ excludePorts, now: start });
    // One request to the device, never a fetch of the ports themselves.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first.map((service) => service.port)).toEqual([5173]);

    // Opening the start page again within the window does not ask again.
    await expect(
      detectLocalServicesShared({ excludePorts, now: start + 1_000 }),
    ).resolves.toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // The refresh button, or a later open, asks again.
    await detectLocalServicesShared({ excludePorts, force: true, now: start });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await detectLocalServicesShared({
      excludePorts,
      now: start + LOCAL_SERVICE_SCAN_REUSE_MS,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});

describe("device-side local service scan", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists what the device found, minus the page's own port", async () => {
    vi.stubGlobal(
      "fetch",
      deviceScan([
        { port: 8000, name: "FastAPI / Django", type: "backend" },
        { port: 5173, name: "Vite", type: "frontend" },
        { port: 3000, name: "React / Next.js", type: "frontend" },
        { port: 70000, name: "Out of range", type: "other" },
        { port: 8080, name: "Unknown kind", type: "database" },
      ]),
    );

    await expect(
      detectLocalServices({ excludePorts: [3000] }),
    ).resolves.toEqual([
      {
        port: 5173,
        name: "Vite",
        type: "frontend",
        url: "http://localhost:5173",
      },
      {
        port: 8000,
        name: "FastAPI / Django",
        type: "backend",
        url: "http://localhost:8000",
      },
    ]);
  });

  it("shows nothing when the device refuses or cannot answer", async () => {
    vi.stubGlobal("fetch", deviceScan([], 403));
    await expect(detectLocalServices()).resolves.toEqual([]);

    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(detectLocalServices()).resolves.toEqual([]);
  });

  it("does not scan from a desktop opened on another machine", () => {
    expect(
      isRemoteWebSession({ protocol: "http:", hostname: "192.168.1.20" }),
    ).toBe(true);
    expect(
      isRemoteWebSession({ protocol: "https:", hostname: "nas.local" }),
    ).toBe(true);
    expect(
      isRemoteWebSession({ protocol: "http:", hostname: "127.0.0.1" }),
    ).toBe(false);
    expect(
      isRemoteWebSession({ protocol: "http:", hostname: "localhost" }),
    ).toBe(false);
    // The packaged desktop uses its own scheme and reaches the device API.
    expect(isRemoteWebSession({ protocol: "echo-app:", hostname: "app" })).toBe(
      false,
    );
  });
});

describe("local service preview routing", () => {
  it("recognizes loopback pages independently of their development port", () => {
    expect(isLocalPreviewUrl("http://localhost:5173/app")).toBe(true);
    expect(isLocalPreviewUrl("http://127.0.0.1:3001")).toBe(true);
    expect(isLocalPreviewUrl("http://[::1]:8080")).toBe(true);
  });

  it("keeps normal web pages in browser mode", () => {
    expect(isLocalPreviewUrl("https://example.com")).toBe(false);
    expect(isLocalPreviewUrl("echo://home")).toBe(false);
    expect(isLocalPreviewUrl("not-a-url")).toBe(false);
  });

  it("exposes a compact port label for the preview toolbar", () => {
    expect(localPreviewPort("http://localhost:5173/app")).toBe("5173");
    expect(localPreviewPort("http://localhost/app")).toBe("80");
  });
});
