"use strict";

const {
  DESKTOP_APP_ORIGIN,
  isDesktopAppURL,
  normalizeLoopbackBackendBaseURL,
} = require("./desktop-protocol.cjs");

const SESSION_COOKIES = new Set(["echo_session", "octopus_session"]);

// HttpOnly SameSite=Lax cookies are not sent on cross-scheme WebSocket
// upgrades from echo-app://app. Keep them in the main process and bridge only
// the trusted main frame to its fixed loopback control plane.
function installDesktopWebSocketAuth({ session, backendBaseURL, getContents }) {
  const backend = normalizeLoopbackBackendBaseURL(backendBaseURL);
  const socketOrigin = backend.replace(/^http/, "ws");
  session.webRequest.onBeforeSendHeaders(
    { urls: [`${socketOrigin}/api/*`] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      const header = (name) =>
        Object.entries(headers).find(
          ([key]) => key.toLowerCase() === name,
        )?.[1];
      const contents = getContents();
      let target;
      try {
        target = new URL(details.url);
        if (
          details.resourceType !== "webSocket" ||
          !contents ||
          contents.isDestroyed() ||
          details.webContentsId !== contents.id ||
          details.frame !== contents.mainFrame ||
          !isDesktopAppURL(details.frame.url) ||
          header("origin") !== DESKTOP_APP_ORIGIN ||
          target.origin !== socketOrigin ||
          target.username ||
          target.password ||
          !target.pathname.startsWith("/api/")
        ) {
          callback({ requestHeaders: headers });
          return;
        }
      } catch {
        callback({ requestHeaders: headers });
        return;
      }
      // Resolve anew for every connection so logout and cookie rotation take
      // effect immediately. Never persist or expose this value to the renderer.
      session.cookies.get({ url: `${backend}${target.pathname}` }).then(
        (cookies) => {
          // Navigation can race the asynchronous cookie lookup.
          if (
            contents.isDestroyed() ||
            details.frame !== contents.mainFrame ||
            !isDesktopAppURL(details.frame.url)
          ) {
            callback({ cancel: true });
            return;
          }
          const authCookies = cookies.filter(
            (cookie) => cookie.httpOnly && SESSION_COOKIES.has(cookie.name),
          );
          const cookie =
            authCookies.find((item) => item.name === "echo_session") ||
            authCookies[0];
          // Chromium applies its cookie policy again after webRequest, so use
          // the gateway's existing bearer transport, not a Cookie override.
          // Explicit renderer bearer credentials retain precedence.
          if (cookie && !header("authorization")) {
            headers.Authorization = `Bearer ${cookie.value}`;
          }
          // Match the native HTTP proxy: the fixed loopback transport is
          // initiated by the main process after validating the app origin.
          // Never forward the non-HTTP echo-app origin to the backend guard.
          for (const key of Object.keys(headers)) {
            if (key.toLowerCase() === "origin") delete headers[key];
          }
          callback({ requestHeaders: headers });
        },
        () => callback({ cancel: true }),
      );
    },
  );
}

module.exports = { installDesktopWebSocketAuth };
