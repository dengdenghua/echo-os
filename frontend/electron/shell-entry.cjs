"use strict";

// Keep launch targets finite: environment configuration cannot inject an
// external origin into a renderer carrying the native preload bridge.
function nativeEntryRoute({ desktopSession, startSurface }) {
  if (startSurface === "tv") return "/tv";
  return desktopSession ? "/desktop" : "";
}
module.exports = { nativeEntryRoute };
