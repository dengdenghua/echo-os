const { test } = require("node:test");
const assert = require("node:assert/strict");
const { nativeEntryRoute } = require("./shell-entry.cjs");

test("TV session opens directly while ordinary desktops keep their existing entry", () => {
  assert.equal(
    nativeEntryRoute({ desktopSession: true, startSurface: "tv" }),
    "/tv",
  );
  assert.equal(
    nativeEntryRoute({ desktopSession: false, startSurface: "tv" }),
    "/tv",
  );
  assert.equal(nativeEntryRoute({ desktopSession: true }), "/desktop");
  assert.equal(nativeEntryRoute({ desktopSession: false }), "");
});
test("untrusted launch values cannot change the application origin or route", () => {
  for (const startSurface of [
    "https://example.org",
    "//example.org",
    "/tv",
    "tv#/browser",
    "javascript:alert(1)",
  ]) {
    assert.equal(
      nativeEntryRoute({ desktopSession: true, startSurface }),
      "/desktop",
    );
  }
});
