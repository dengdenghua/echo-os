import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const pageSource = readFileSync(
  join(process.cwd(), "src/app/workspace/realtime/[thread_id]/page.tsx"),
  "utf8",
);

function sourceBetween(start: string, end: string): string {
  const startIndex = pageSource.indexOf(start);
  expect(startIndex).toBeGreaterThanOrEqual(0);
  const endIndex = pageSource.indexOf(end, startIndex + start.length);
  expect(endIndex).toBeGreaterThan(startIndex);
  return pageSource.slice(startIndex, endIndex);
}

describe("first-turn thread-scoped reads", () => {
  it("keeps reads paused when the echoed first message ends the draft", () => {
    // Golden path 2026-10: the echoed user message ended the draft before
    // onStart, so outputs?area=final|deploy hit a thread the server records
    // only when the first turn settles (two 404s per failed first task).
    const fallback = sourceBetween(
      "if (isNewThread && hasEstablishedMessage) {",
      "setIsNewThread(false);",
    );
    expect(fallback).toContain("if (thread.isLoading) {");
    expect(fallback).toContain("localStartedThreadIdRef.current = threadId;");
    expect(fallback).toContain("onLocalThreadStart(threadId);");
  });

  it("releases the reads once that first turn stops loading", () => {
    const release = sourceBetween(
      "if (thread.isLoading || fallbackStartedThreadIdRef.current === null) return;",
      "}, [onLocalThreadStart, thread.isLoading]);",
    );
    expect(release).toContain("onLocalThreadStart(null);");
    expect(release).toContain("fallbackStartedThreadIdRef.current = null;");
  });

  it("gates outputs, cowork, collab and project lookups on the same flag", () => {
    expect(pageSource).toContain(
      "!chatState.isNewThread && locallyStartedThreadId !== chatState.threadId",
    );
    expect(pageSource).toContain("fetchEnabled={threadQueryable}");
    expect(pageSource).toContain("artifactFetchEnabled={threadQueryable}");
    expect(pageSource).toContain(
      "useCoworkGroup(threadQueryable ? threadId : null)",
    );
  });
});
