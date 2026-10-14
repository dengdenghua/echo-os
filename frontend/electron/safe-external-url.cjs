/**
 * Safe external URL validator for desktop shell.
 * Only HTTP(S) and mailto: schemes are permitted.
 * Dangerous schemes like file:, smb:, javascript:, ms-msdt: etc. are rejected.
 */
const ALLOWED_EXTERNAL_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);

/**
 * Parse ``rawUrl`` and return its canonical href when it uses an allowed
 * scheme, otherwise ``null``. Callers must hand the returned href (not the raw
 * string) to the OS: the WHATWG parser strips tabs/newlines and rewrites
 * backslashes, so validating the parsed form but opening the raw one would let
 * ``"ht\ttps://…"`` or ``"https:\\\\host\\share"`` reach the OS handler as a
 * different string than the one that was checked.
 */
function normalizeExternalUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") {
    return null;
  }
  try {
    const parsed = new URL(rawUrl);
    return ALLOWED_EXTERNAL_PROTOCOLS.has(parsed.protocol.toLowerCase())
      ? parsed.href
      : null;
  } catch {
    return null;
  }
}

function isSafeExternalUrl(rawUrl) {
  return normalizeExternalUrl(rawUrl) !== null;
}

function safeOpenExternal(shell, rawUrl) {
  const href = normalizeExternalUrl(rawUrl);
  if (href === null) {
    console.warn(`[echo] blocked dangerous or invalid external URL: ${rawUrl}`);
    return Promise.resolve();
  }
  return shell.openExternal(href);
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * True when ``targetUrl`` stays on the renderer's own app location
 * (same scheme + host[:port]). Compares protocol and host rather than
 * ``URL.origin`` because custom app schemes report an opaque ``"null"``
 * origin, which would make every custom-scheme URL look identical.
 * Loopback spellings are interchangeable (same port) because the dev
 * renderer canonicalises 127.0.0.1 -> localhost on load.
 */
function isSameAppLocation(targetUrl, appUrl) {
  if (!targetUrl || !appUrl) return false;
  try {
    const target = new URL(targetUrl);
    const app = new URL(appUrl);
    if (target.protocol !== app.protocol) return false;
    if (target.host === app.host) return true;
    return (
      target.port === app.port &&
      LOOPBACK_HOSTNAMES.has(target.hostname) &&
      LOOPBACK_HOSTNAMES.has(app.hostname)
    );
  } catch {
    return false;
  }
}

module.exports = {
  ALLOWED_EXTERNAL_PROTOCOLS,
  isSafeExternalUrl,
  isSameAppLocation,
  normalizeExternalUrl,
  safeOpenExternal,
};
