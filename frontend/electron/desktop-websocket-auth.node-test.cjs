const { test } = require("node:test");
const assert = require("node:assert/strict");
const { installDesktopWebSocketAuth } = require("./desktop-websocket-auth.cjs");

function fixture() {
  let listener,
    reads = 0;
  const contents = {
    id: 7,
    mainFrame: { url: "echo-app://app/#/desktop" },
    isDestroyed: () => false,
  };
  const cookies = [
    { name: "echo_session", value: "test-session", httpOnly: true },
    { name: "unrelated", value: "do-not-forward", httpOnly: true },
  ];
  installDesktopWebSocketAuth({
    backendBaseURL: "http://127.0.0.1:8000",
    getContents: () => contents,
    session: {
      webRequest: {
        onBeforeSendHeaders: (_filter, fn) => {
          listener = fn;
        },
      },
      cookies: {
        get: async () => {
          reads++;
          return cookies;
        },
      },
    },
  });
  const details = {
    url: "ws://127.0.0.1:8000/api/realtime",
    resourceType: "webSocket",
    webContentsId: 7,
    frame: contents.mainFrame,
    requestHeaders: { Origin: "echo-app://app" },
  };
  return {
    details,
    contents,
    cookies,
    reads: () => reads,
    run: (patch = {}) =>
      new Promise((resolve) => listener({ ...details, ...patch }, resolve)),
  };
}

test("restores a cookie-only native session without exposing unrelated cookies", async () => {
  const f = fixture();
  assert.equal(
    (await f.run()).requestHeaders.Authorization,
    "Bearer test-session",
  );
  f.cookies[0].value = "rotated";
  assert.equal((await f.run()).requestHeaders.Authorization, "Bearer rotated");
  f.cookies.length = 0;
  assert.equal((await f.run()).requestHeaders.Authorization, undefined);
  assert.equal(f.reads(), 3);
});

test("does not attach credentials to other hosts, ports, frames, origins or routes", async () => {
  for (const patch of [
    { url: "ws://evil.example/api/realtime" },
    { url: "ws://127.0.0.1:8001/api/realtime" },
    { url: "ws://127.0.0.1:8000/untrusted" },
    { url: "ws://user@127.0.0.1:8000/api/realtime" },
    { webContentsId: 8 },
    { frame: { url: "echo-app://app/" } },
    { requestHeaders: { Origin: "https://evil.example" } },
    { resourceType: "xhr" },
  ]) {
    const f = fixture();
    assert.equal((await f.run(patch)).requestHeaders.Authorization, undefined);
    assert.equal(f.reads(), 0);
  }
});

test("navigation during cookie lookup cancels the credential-bearing upgrade", async () => {
  const f = fixture();
  const pending = f.run();
  f.contents.mainFrame.url = "https://evil.example/";
  assert.equal((await pending).cancel, true);
});

test("only trusted upgrades normalize Origin and preserve explicit authorization", async () => {
  const f = fixture();
  const trusted = await f.run({
    requestHeaders: {
      origin: "echo-app://app",
      authorization: "Bearer explicit",
    },
  });
  assert.equal(trusted.requestHeaders.origin, undefined);
  assert.equal(trusted.requestHeaders.authorization, "Bearer explicit");
  assert.equal(trusted.requestHeaders.Authorization, undefined);
  const untrusted = await f.run({
    requestHeaders: { Origin: "https://example.com" },
  });
  assert.equal(untrusted.requestHeaders.Origin, "https://example.com");
});
