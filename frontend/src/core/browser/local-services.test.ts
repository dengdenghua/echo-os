import { afterEach, describe, expect, it, vi } from "vitest";

import {
  LOCAL_SERVICE_SCAN_REUSE_MS,
  detectLocalServicesShared,
  isLocalPreviewUrl,
  localPreviewPort,
} from "./local-services";

describe("shared local service scan", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reuses a recent automatic scan and probes again on refresh", async () => {
    const fetchMock = vi.fn((url: string) =>
      url.startsWith("http://localhost:5173/")
        ? Promise.resolve(new Response(null, { status: 200 }))
        : Promise.reject(new TypeError("Failed to fetch")),
    );
    vi.stubGlobal("fetch", fetchMock);
    // A port set no other test uses, so the module-level cache starts cold.
    const excludePorts = [65001];
    const start = 1_000_000;

    const first = await detectLocalServicesShared({ excludePorts, now: start });
    const probes = fetchMock.mock.calls.length;
    expect(probes).toBeGreaterThan(1);
    expect(first.map((service) => service.port)).toEqual([5173]);

    // Opening the start page again within the window does not probe.
    await expect(
      detectLocalServicesShared({ excludePorts, now: start + 1_000 }),
    ).resolves.toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(probes);

    // The refresh button, or a later open, probes again.
    await detectLocalServicesShared({ excludePorts, force: true, now: start });
    expect(fetchMock).toHaveBeenCalledTimes(probes * 2);
    await detectLocalServicesShared({
      excludePorts,
      now: start + LOCAL_SERVICE_SCAN_REUSE_MS,
    });
    expect(fetchMock).toHaveBeenCalledTimes(probes * 3);
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
