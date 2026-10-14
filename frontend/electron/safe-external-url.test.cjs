const test = require("node:test");
const assert = require("node:assert/strict");
const {
  isSafeExternalUrl,
  isSameAppLocation,
  normalizeExternalUrl,
  safeOpenExternal,
} = require("./safe-external-url.cjs");

test("isSafeExternalUrl allows valid http, https, and mailto URLs", () => {
  assert.equal(isSafeExternalUrl("https://example.com"), true);
  assert.equal(
    isSafeExternalUrl("https://example.com/path?query=1#hash"),
    true,
  );
  assert.equal(isSafeExternalUrl("http://localhost:8080"), true);
  assert.equal(isSafeExternalUrl("mailto:support@echo.example"), true);
});

test("isSafeExternalUrl rejects dangerous protocols and malformed URLs", () => {
  assert.equal(
    isSafeExternalUrl("file:///C:/Windows/System32/calc.exe"),
    false,
  );
  assert.equal(isSafeExternalUrl("file:///etc/passwd"), false);
  assert.equal(isSafeExternalUrl("smb://attacker/share"), false);
  assert.equal(isSafeExternalUrl("javascript:alert(1)"), false);
  assert.equal(isSafeExternalUrl("data:text/html,evil"), false);
  assert.equal(isSafeExternalUrl("search-ms:query=test"), false);
  assert.equal(isSafeExternalUrl("ms-msdt:command"), false);
  assert.equal(isSafeExternalUrl("powershell.exe"), false);
  assert.equal(isSafeExternalUrl(""), false);
  assert.equal(isSafeExternalUrl(null), false);
  assert.equal(isSafeExternalUrl(undefined), false);
  assert.equal(isSafeExternalUrl(123), false);
});

test("safeOpenExternal invokes shell.openExternal only for safe URLs", async () => {
  const opened = [];
  const mockShell = {
    openExternal: async (target) => {
      opened.push(target);
      return true;
    },
  };

  await safeOpenExternal(mockShell, "https://github.com");
  assert.deepEqual(opened, ["https://github.com/"]);

  await safeOpenExternal(mockShell, "file:///etc/shadow");
  assert.deepEqual(opened, ["https://github.com/"]); // Not added!
});

test("safeOpenExternal hands the OS the parsed href, not the raw string", async () => {
  const opened = [];
  const mockShell = { openExternal: async (target) => opened.push(target) };

  // The WHATWG parser strips tabs and rewrites backslashes; the raw string
  // must never reach the OS handler in a form different from what was checked.
  await safeOpenExternal(mockShell, "ht\ttps://example.com/a");
  await safeOpenExternal(mockShell, "https:\\\\evil.example\\share");
  assert.deepEqual(opened, [
    "https://example.com/a",
    "https://evil.example/share",
  ]);
  assert.equal(normalizeExternalUrl("FILE:///etc/passwd"), null);
});

test("isSameAppLocation only accepts the renderer's own scheme and host", () => {
  const packaged = "echo-app://app/index.html";
  assert.equal(
    isSameAppLocation("echo-app://app/index.html#/desktop", packaged),
    true,
  );
  assert.equal(
    isSameAppLocation("echo-app://app/workspace?x=1", packaged),
    true,
  );
  assert.equal(
    isSameAppLocation("echo-app://evil/index.html", packaged),
    false,
  );
  assert.equal(isSameAppLocation("https://app/index.html", packaged), false);
  assert.equal(isSameAppLocation("file:///C:/app/index.html", packaged), false);

  const dev = "http://localhost:3000";
  assert.equal(isSameAppLocation("http://localhost:3000/desktop", dev), true);
  assert.equal(isSameAppLocation("http://127.0.0.1:3000/", dev), true);
  assert.equal(isSameAppLocation("http://127.0.0.1:3001/", dev), false);
  assert.equal(isSameAppLocation("http://attacker.example:3000/", dev), false);
  assert.equal(isSameAppLocation("https://localhost:3000/", dev), false);

  assert.equal(isSameAppLocation(undefined, dev), false);
  assert.equal(isSameAppLocation("http://localhost:3000/", null), false);
  assert.equal(isSameAppLocation("not a url", dev), false);
});
