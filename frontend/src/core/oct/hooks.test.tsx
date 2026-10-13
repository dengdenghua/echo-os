import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useOctLink } from "./hooks";

vi.mock("@/providers/AuthProvider", () => ({
  useAuth: () => ({ user: { user_id: "admin" } }),
}));

function json(status: number, body: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function wrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  };
}

function octCalls(fetchMock: ReturnType<typeof vi.fn>) {
  return fetchMock.mock.calls.filter(([url]) =>
    String(url).includes("/api/account/oct"),
  );
}

describe("useOctLink", () => {
  let client: QueryClient;

  beforeEach(() => {
    client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: Infinity } },
    });
  });

  afterEach(() => {
    client.clear();
    vi.unstubAllGlobals();
  });

  it("never calls the account routes when the backend has no oct gateway", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      String(input).includes("/api/auth/providers")
        ? json(200, { providers: [{ id: "local" }] })
        : json(404, { detail: "Not Found" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useOctLink(), {
      wrapper: wrapper(client),
    });

    await waitFor(() =>
      expect(
        client.getQueryData(["account", "oct", "available"]),
      ).toBeDefined(),
    );
    expect(result.current.data).toBeUndefined();
    expect(octCalls(fetchMock)).toHaveLength(0);
  });

  it("stops polling once the gateway reports no linked account", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) =>
      String(input).includes("/api/auth/providers")
        ? json(200, { providers: [{ id: "oct" }] })
        : json(404, { detail: "no oct account linked" }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result } = renderHook(() => useOctLink(), {
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.isFetched).toBe(true));
    expect(result.current.data).toBeNull();
    expect(octCalls(fetchMock)).toHaveLength(1);

    const query = client
      .getQueryCache()
      .findAll({ queryKey: ["account", "oct", "link"] })[0];
    const options = query?.options as {
      refetchInterval?: (q: unknown) => number | false;
    };
    expect(options.refetchInterval?.(query)).toBe(false);
  });
});
