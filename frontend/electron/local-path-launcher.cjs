"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { runLauncher } = require("./system-shell.cjs");

/** Launch local documents without waiting for a blocking default editor. */
async function openLocalPath(
  target,
  {
    platform = process.platform,
    openPath,
    stat = fs.stat,
    launch = runLauncher,
  } = {},
) {
  try {
    if (platform !== "linux") {
      const error = await openPath(target);
      return error ? { ok: false, error } : { ok: true };
    }
    if (
      typeof target !== "string" ||
      !path.posix.isAbsolute(target) ||
      target.includes("\0")
    ) {
      return { ok: false, error: "请选择有效的本机绝对路径" };
    }
    const item = await stat(target);
    if (!item.isFile() && !item.isDirectory()) {
      return { ok: false, error: "只能打开本机文件或文件夹" };
    }
    // Electron's Linux shell.openPath can wait synchronously for xdg-open.
    // Editors such as Kate use --block, freezing the whole desktop until the
    // document closes. GIO acknowledges dispatch independently of the editor;
    // runLauncher uses asynchronous spawn and no inherited output pipes.
    return await new Promise((resolve) => {
      launch(
        "/usr/bin/gio",
        ["open", target],
        { timeout: 10000, windowsHide: true },
        (error) => {
          resolve(
            error
              ? {
                  ok: false,
                  error: "无法启动默认应用，请检查文件关联或系统打开服务",
                }
              : { ok: true },
          );
        },
      );
    });
  } catch (error) {
    return {
      ok: false,
      error:
        error?.code === "ENOENT"
          ? "本机文件或打开服务不存在"
          : "无法打开本机文件",
    };
  }
}

module.exports = { openLocalPath };
