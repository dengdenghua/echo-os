import { afterEach, describe, expect, it, vi } from "vitest";

import {
  completeOwnerSetup,
  fetchOwnerSetupStatus,
  normalizeSetupCode,
  OwnerSetupError,
  ownerPasswordChecks,
  ownerPasswordProblem,
} from "./owner-setup";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("owner password rule", () => {
  // Same cases as tests/appliance/test_owner_setup.py.
  it.each([
    ["Short-1a", "至少需要 12 个字符"],
    ["alllowercaseletters", "至少三类"],
    ["ALLUPPER12345678", "至少三类"],
    ["Aa1!Aa1!Aa1!Aa1!", "重复的字符太多"],
    ["Aa1-" + "x".repeat(80), "72 字节"],
  ])("rejects %s", (password, message) => {
    expect(ownerPasswordProblem(password)).toContain(message);
  });

  it.each([
    "Harbor-Light-2147",
    "harbor light 2147",
    "记忆不灭文明回响Echo2147",
    "WHITE-HARBOR-2147",
  ])("accepts %s", (password) => {
    expect(ownerPasswordProblem(password)).toBeNull();
    expect(ownerPasswordChecks(password).every((check) => check.met)).toBe(
      true,
    );
  });

  it("normalizes a typed setup code", () => {
    expect(normalizeSetupCode(" abcd-2345 ")).toBe("ABCD2345");
  });
});

describe("owner setup API", () => {
  it("reads the setup status without credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ownerSetupRequired: true,
          reachable: true,
          username: "admin",
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchOwnerSetupStatus()).resolves.toEqual({
      ownerSetupRequired: true,
      reachable: true,
      username: "admin",
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/appliance/setup/status", {
      cache: "no-store",
    });
  });

  it("treats an older device without the endpoint as already set up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response("", { status: 404 })),
    );
    await expect(fetchOwnerSetupStatus()).resolves.toBeNull();
  });

  it.each([
    [403, "invalid_setup_code", "设置码不正确"],
    [429, "setup_code_rotated", "设备控制台中已显示新的设置码"],
    [409, "owner_already_set", "已经设置了所有者"],
    [403, "setup_requires_local_network", "局域网"],
    [403, "cross-origin request rejected", "请直接在设备的局域网地址上打开"],
    [422, "password_too_simple", "至少三类"],
  ])("maps %i %s to Chinese copy", async (status, detail, message) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ detail }), { status }),
        ),
    );
    const error = await completeOwnerSetup("abcd-2345", "x").catch(
      (reason: unknown) => reason,
    );
    expect(error).toBeInstanceOf(OwnerSetupError);
    expect((error as OwnerSetupError).message).toContain(message);
  });

  it("sends the normalized code and the password", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ success: true })));
    vi.stubGlobal("fetch", fetchMock);

    await completeOwnerSetup("abcd-2345", "Harbor-Light-2147");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/appliance/setup/owner");
    expect(JSON.parse(String(init.body))).toEqual({
      setupCode: "ABCD2345",
      password: "Harbor-Light-2147",
    });
  });
});
