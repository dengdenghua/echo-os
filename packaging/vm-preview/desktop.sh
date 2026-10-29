#!/usr/bin/env bash
set -euo pipefail
# The preview uses a 2D virtual GPU; keep Chromium on the software renderer.
args=(--disable-gpu --disable-gpu-compositing)
if [[ "${ECHO_PREVIEW_DEBUG_PORT:-}" =~ ^[0-9]{4,5}$ ]]; then
  args+=(--remote-debugging-address=127.0.0.1 "--remote-debugging-port=$ECHO_PREVIEW_DEBUG_PORT")
fi
exec /opt/echo-os/frontend/release/linux-unpacked/echo-os-desktop "${args[@]}" "$@"
