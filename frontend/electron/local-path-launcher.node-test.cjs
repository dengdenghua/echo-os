const { test } = require("node:test");
const assert = require("node:assert/strict");
const { openLocalPath } = require("./local-path-launcher.cjs");
const regular = async () => ({ isFile: () => true, isDirectory: () => false });

test("Linux dispatch uses GIO with literal Chinese/space/shell-metacharacter path", async () => {
  const target = "/home/echo/中文 空格/$(touch unintended).md";
  let called = false;
  const result = await openLocalPath(target, {
    platform: "linux",
    stat: regular,
    openPath: () => {
      throw Error("blocking Electron API must not run");
    },
    launch: (command, args, options, done) => {
      called = true;
      assert.equal(command, "/usr/bin/gio");
      assert.deepEqual(args, ["open", target]);
      assert.equal(options.timeout, 10000);
      setImmediate(() => done(null));
    },
  });
  assert.ok(called);
  assert.deepEqual(result, { ok: true });
});

test("Linux rejects URLs, option-like paths, relative paths and NUL before spawning", async () => {
  for (const target of [
    "https://example.com",
    "--help",
    "relative.md",
    "/tmp/a\0b",
    null,
  ]) {
    const result = await openLocalPath(target, {
      platform: "linux",
      stat: () => {
        throw Error("must not stat");
      },
      launch: () => {
        throw Error("must not spawn");
      },
    });
    assert.equal(result.ok, false);
  }
});

test("missing files and non-file objects fail without launching", async () => {
  const missing = await openLocalPath("/missing", {
    platform: "linux",
    stat: async () => {
      throw Object.assign(Error(), { code: "ENOENT" });
    },
  });
  assert.equal(missing.ok, false);
  const special = await openLocalPath("/dev/socket", {
    platform: "linux",
    stat: async () => ({ isFile: () => false, isDirectory: () => false }),
    launch: () => {
      throw Error("must not spawn");
    },
  });
  assert.equal(special.ok, false);
});

test("GIO dispatch failures are returned instead of claiming launch success", async () => {
  const result = await openLocalPath("/tmp/document.md", {
    platform: "linux",
    stat: regular,
    launch: (_c, _a, _o, done) => done(Error("exit 2")),
  });
  assert.equal(result.ok, false);
});

test("Windows and macOS preserve Electron native open behavior", async () => {
  for (const platform of ["win32", "darwin"]) {
    assert.deepEqual(
      await openLocalPath("native-file", {
        platform,
        openPath: async (p) => {
          assert.equal(p, "native-file");
          return "";
        },
      }),
      { ok: true },
    );
    assert.deepEqual(
      await openLocalPath("native-file", {
        platform,
        openPath: async () => "native error",
      }),
      { ok: false, error: "native error" },
    );
  }
});
