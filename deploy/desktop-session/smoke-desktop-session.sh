#!/usr/bin/env bash
# Isolated target-C integration smoke: Xvfb -> D-Bus -> KWin -> Echo -> native app.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
APP_DIR="$REPO_ROOT/frontend"
VERIFY_SCRIPT="$REPO_ROOT/deploy/desktop-session/verify-desktop-session.sh"
NATIVE_DRIVER="$REPO_ROOT/deploy/desktop-session/native-window-session-smoke.cjs"
KWIN_BRIDGE=/usr/lib/echo-os/echo-kwin-window-bridge
INPUT_METHOD=/usr/bin/fcitx5
CLIPBOARD_HOST=/usr/lib/echo-os/echo-clipboard-host
ACCESSIBILITY_BUS=/usr/libexec/at-spi-bus-launcher
ACCESSIBILITY_PROBE="$REPO_ROOT/deploy/desktop-session/echo-accessibility-smoke.py"
CORE_APPS_SESSION_SMOKE="$REPO_ROOT/deploy/core-apps/echo_core_apps_session_smoke.py"

for command_name in Xvfb xdpyinfo kwin_x11 wmctrl xprop xmessage dbus-run-session dbus-update-activation-environment gdbus node xclip stat timeout; do
  command -v "$command_name" >/dev/null 2>&1 || {
    echo "desktop smoke dependency missing: $command_name" >&2
    exit 1
  }
done
[[ -x "$KWIN_BRIDGE" && -x "$INPUT_METHOD" && -x "$CLIPBOARD_HOST" && \
   -x "$ACCESSIBILITY_BUS" && -x "$ACCESSIBILITY_PROBE" && \
   -x "$CORE_APPS_SESSION_SMOKE" ]] || {
  echo "desktop smoke bridge, input-method, clipboard or accessibility dependency is missing" >&2
  exit 1
}

# KWin needs a session bus. Re-enter exactly once so the test can also be run
# directly from a tty or CI container without an existing desktop session.
if [[ -z "${DBUS_SESSION_BUS_ADDRESS:-}" && "${ECHO_SMOKE_DBUS_SESSION:-0}" != "1" ]]; then
  export ECHO_SMOKE_DBUS_SESSION=1
  exec dbus-run-session -- "$0" "$@"
fi

PACKAGED_BIN="${ECHO_DESKTOP_EXECUTABLE:-}"
if [[ -z "$PACKAGED_BIN" ]]; then
  PACKAGED_BIN="$(
    find "$APP_DIR/release" -maxdepth 3 -type f -name echo-os-desktop \
      -perm -111 -print -quit 2>/dev/null || true
  )"
fi
[[ -n "$PACKAGED_BIN" && -x "$PACKAGED_BIN" ]] || {
  echo "packaged Echo Desktop executable not found; build electron-builder --linux dir first" >&2
  exit 1
}

if [[ -n "${ECHO_SMOKE_LOG_DIR:-}" ]]; then
  LOG_DIR="$ECHO_SMOKE_LOG_DIR"
  mkdir -p "$LOG_DIR"
  REMOVE_LOG_DIR=0
else
  LOG_DIR="$(mktemp -d)"
  REMOVE_LOG_DIR=1
fi

if [[ -z "${XDG_RUNTIME_DIR:-}" || ! -d "${XDG_RUNTIME_DIR:-}" ]]; then
  XDG_RUNTIME_DIR="$LOG_DIR/runtime"
  mkdir -p "$XDG_RUNTIME_DIR"
  chmod 0700 "$XDG_RUNTIME_DIR"
  export XDG_RUNTIME_DIR
fi
# GitHub job containers run as root with HOME=/github/home owned by the runner
# user; Firefox (the http core-app case) refuses to run as root in another
# user's home. Give the session a private home when HOME is not ours.
if [[ ! -O "${HOME:-/nonexistent}" ]]; then
  export HOME="$LOG_DIR/home"
  mkdir -p "$HOME"
  chmod 0700 "$HOME"
fi

cleanup() {
  local status="$1"
  trap - EXIT INT TERM
  for process_id in "${NATIVE_APP_PID:-}" "${ECHO_PID:-}" \
    "${CLIPBOARD_SOURCE_PID:-}" "${CLIPBOARD_HOST_PID:-}" \
    "${ACCESSIBILITY_BUS_PID:-}" "${READYZ_STUB_PID:-}" \
    "${INPUT_METHOD_PID:-}" "${KWIN_PID:-}" "${KWIN_BRIDGE_PID:-}" "${XVFB_PID:-}"; do
    [[ -n "$process_id" ]] && kill "$process_id" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  [[ -n "${NATIVE_APP_IPC_READY_FILE:-}" ]] && \
    rm -f -- "$NATIVE_APP_IPC_READY_FILE"
  if [[ "$status" -ne 0 ]]; then
    echo "Desktop session smoke failed. Logs:" >&2
    for log_file in "$LOG_DIR"/*.log; do
      [[ -f "$log_file" ]] || continue
      echo "--- ${log_file##*/}" >&2
      tail -120 "$log_file" >&2 || true
    done
  elif [[ "$REMOVE_LOG_DIR" -eq 1 ]]; then
    rm -rf -- "$LOG_DIR"
  fi
  exit "$status"
}
trap 'cleanup $?' EXIT INT TERM

# Let Xvfb choose an unused display rather than assuming :99 is free.
DISPLAY_FILE="$LOG_DIR/xvfb-display"
Xvfb -displayfd 3 -screen 0 1280x800x24 -nolisten tcp -noreset \
  3>"$DISPLAY_FILE" >"$LOG_DIR/xvfb.log" 2>&1 &
XVFB_PID=$!
for _attempt in $(seq 1 100); do
  [[ -s "$DISPLAY_FILE" ]] && break
  kill -0 "$XVFB_PID" 2>/dev/null || {
    echo "Xvfb exited before allocating a display" >&2
    exit 1
  }
  sleep 0.1
done
[[ -s "$DISPLAY_FILE" ]] || { echo "Xvfb did not allocate a display" >&2; exit 1; }
DISPLAY=":$(tr -d '\r\n' < "$DISPLAY_FILE")"
export DISPLAY
for _attempt in $(seq 1 100); do
  xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 && break
  sleep 0.1
done
xdpyinfo -display "$DISPLAY" >/dev/null 2>&1 || {
  echo "Xvfb display did not become ready: $DISPLAY" >&2
  exit 1
}
echo "✓ isolated X11 display ready: $DISPLAY"

export KWIN_COMPOSE=N
export LIBGL_ALWAYS_SOFTWARE=1
export QT_QPA_PLATFORM=xcb
export XDG_SESSION_TYPE=x11
export XDG_CURRENT_DESKTOP=Echo
export GTK_IM_MODULE=fcitx
export QT_IM_MODULE=fcitx
export XMODIFIERS=@im=fcitx
export SDL_IM_MODULE=fcitx
export QT_ACCESSIBILITY=1
KWIN_BRIDGE_SOCKET="$XDG_RUNTIME_DIR/echo-os/kwin-window-bridge.sock"
"$KWIN_BRIDGE" --socket "$KWIN_BRIDGE_SOCKET" \
  >"$LOG_DIR/kwin-bridge.log" 2>&1 &
KWIN_BRIDGE_PID=$!
for _attempt in $(seq 1 100); do
  [[ -S "$KWIN_BRIDGE_SOCKET" ]] && break
  kill -0 "$KWIN_BRIDGE_PID" 2>/dev/null || {
    echo "KWin bridge exited before opening its private socket" >&2
    exit 1
  }
  sleep 0.1
done
[[ -S "$KWIN_BRIDGE_SOCKET" ]] || {
  echo "KWin bridge socket did not become ready" >&2
  exit 1
}
kwin_x11 --replace >"$LOG_DIR/kwin.log" 2>&1 &
KWIN_PID=$!
for _attempt in $(seq 1 150); do
  if wmctrl -m 2>/dev/null | grep -qi kwin; then break; fi
  kill -0 "$KWIN_PID" 2>/dev/null || {
    echo "KWin exited before claiming the X11 display" >&2
    exit 1
  }
  sleep 0.1
done
wmctrl -m 2>/dev/null | grep -qi kwin || {
  echo "KWin did not claim the X11 display" >&2
  exit 1
}
echo "✓ KWin owns the isolated X11 session"
/usr/bin/dbus-update-activation-environment \
  DISPLAY XDG_SESSION_TYPE XDG_CURRENT_DESKTOP QT_QPA_PLATFORM
for _attempt in $(seq 1 100); do
  "$KWIN_BRIDGE" --socket "$KWIN_BRIDGE_SOCKET" --probe \
    >/dev/null 2>&1 && break
  sleep 0.1
done
"$KWIN_BRIDGE" --socket "$KWIN_BRIDGE_SOCKET" --probe >/dev/null
echo "✓ KWin script published compositor-owned UUID window state"

"$ACCESSIBILITY_BUS" --launch-immediately \
  >"$LOG_DIR/accessibility-bus-x11.log" 2>&1 &
ACCESSIBILITY_BUS_PID=$!
for _attempt in $(seq 1 100); do
  if gdbus call --session \
       --dest org.a11y.Bus \
       --object-path /org/a11y/bus \
       --method org.a11y.Bus.GetAddress >/dev/null 2>&1; then
    break
  fi
  kill -0 "$ACCESSIBILITY_BUS_PID" 2>/dev/null || {
    echo "AT-SPI bus exited before registering its X11 service" >&2
    exit 1
  }
  sleep 0.1
done
gdbus call --session \
  --dest org.a11y.Bus \
  --object-path /org/a11y/bus \
  --method org.a11y.Bus.GetAddress >/dev/null
echo "✓ AT-SPI registered the X11 accessibility bus"

"$INPUT_METHOD" --replace >"$LOG_DIR/fcitx5.log" 2>&1 &
INPUT_METHOD_PID=$!
for _attempt in $(seq 1 100); do
  if gdbus call --session \
       --dest org.freedesktop.DBus \
       --object-path /org/freedesktop/DBus \
       --method org.freedesktop.DBus.NameHasOwner org.fcitx.Fcitx5 \
       2>/dev/null | grep -q true; then
    break
  fi
  kill -0 "$INPUT_METHOD_PID" 2>/dev/null || {
    echo "Fcitx5 exited before registering its X11 session service" >&2
    exit 1
  }
  sleep 0.1
done
gdbus call --session \
  --dest org.freedesktop.DBus \
  --object-path /org/freedesktop/DBus \
  --method org.freedesktop.DBus.NameHasOwner org.fcitx.Fcitx5 |
  grep -q true
echo "✓ Fcitx5 registered the multilingual X11 input-method service"

CLIPBOARD_DATABASE="$XDG_RUNTIME_DIR/echo-os/clipboard/history3.sqlite"
"$CLIPBOARD_HOST" --session x11 --database "$CLIPBOARD_DATABASE" \
  >"$LOG_DIR/clipboard-x11.log" 2>&1 &
CLIPBOARD_HOST_PID=$!
for _attempt in $(seq 1 100); do
  if gdbus call --session \
       --dest org.freedesktop.DBus \
       --object-path /org/freedesktop/DBus \
       --method org.freedesktop.DBus.NameHasOwner org.kde.klipper \
       2>/dev/null | grep -q true; then
    break
  fi
  kill -0 "$CLIPBOARD_HOST_PID" 2>/dev/null || {
    echo "windowless Klipper host exited before registering on X11" >&2
    exit 1
  }
  sleep 0.1
done
gdbus call --session \
  --dest org.freedesktop.DBus \
  --object-path /org/freedesktop/DBus \
  --method org.freedesktop.DBus.NameHasOwner org.kde.klipper |
  grep -q true
[[ -f "$CLIPBOARD_DATABASE" && ! -L "$CLIPBOARD_DATABASE" && \
   "$(stat -c '%u:%a' "$CLIPBOARD_DATABASE")" == "$(id -u):600" ]] || {
  echo "Klipper did not create its private runtime-only database" >&2
  exit 1
}

CLIPBOARD_SENTINEL='echo-os-x11-clipboard-persistence-smoke'
# The source keeps serving until Klipper has captured the sentinel and is then
# terminated, like an application that copies and quits. (xclip -loops 1 cannot
# model this on X11: Qt's clipboard reader first asks for TARGETS, which uses up
# the single request before Klipper can fetch the text.) -quiet keeps xclip in
# the foreground; by default it forks, so $! would not be the selection owner.
printf '%s' "$CLIPBOARD_SENTINEL" | \
  xclip -quiet -selection clipboard -in \
    >"$LOG_DIR/clipboard-source-x11.log" 2>&1 &
CLIPBOARD_SOURCE_PID=$!
CLIPBOARD_CAPTURED=0
for _attempt in $(seq 1 100); do
  kill -0 "$CLIPBOARD_HOST_PID" 2>/dev/null || {
    echo "Klipper host exited while capturing the X11 clipboard" >&2
    exit 1
  }
  if [[ "$(gdbus call --session \
         --dest org.kde.klipper \
         --object-path /klipper \
         --method org.kde.klipper.klipper.getClipboardContents \
         2>/dev/null || true)" == "('$CLIPBOARD_SENTINEL',)" ]]; then
    CLIPBOARD_CAPTURED=1
    break
  fi
  sleep 0.1
done
[[ "$CLIPBOARD_CAPTURED" -eq 1 ]] || {
  echo "Klipper never captured the X11 clipboard from its source owner" >&2
  exit 1
}
unset CLIPBOARD_CAPTURED
# Klipper records the item text at once but writes the item's data file, which
# it re-offers once the owner quits, asynchronously through KIO. Quit the source
# only after that file exists, as a user would a moment after copying. Only the
# file's presence is checked, never its content.
CLIPBOARD_ITEM_DATA="${CLIPBOARD_DATABASE%/*}/data"
for _attempt in $(seq 1 100); do
  find "$CLIPBOARD_ITEM_DATA" -mindepth 2 -type f -size +0c 2>/dev/null | grep -q . && break
  sleep 0.1
done
find "$CLIPBOARD_ITEM_DATA" -mindepth 2 -type f -size +0c 2>/dev/null | grep -q . || {
  echo "Klipper never wrote the captured X11 item's data file" >&2
  exit 1
}
kill "$CLIPBOARD_SOURCE_PID"
wait "$CLIPBOARD_SOURCE_PID" 2>/dev/null || true
unset CLIPBOARD_SOURCE_PID
CLIPBOARD_VALUE=''
for _attempt in $(seq 1 100); do
  CLIPBOARD_VALUE="$(timeout 1s xclip -selection clipboard -out 2>/dev/null || true)"
  [[ "$CLIPBOARD_VALUE" == "$CLIPBOARD_SENTINEL" ]] && break
  kill -0 "$CLIPBOARD_HOST_PID" 2>/dev/null || break
  sleep 0.1
done
[[ "$CLIPBOARD_VALUE" == "$CLIPBOARD_SENTINEL" ]] || {
  echo "X11 clipboard disappeared after the source process exited" >&2
  exit 1
}
unset CLIPBOARD_VALUE
echo "✓ Klipper preserved the X11 clipboard after its source process exited without persistent-home storage"

# In smoke mode the shell reports "SMOKE OK" only once its backend answers
# /readyz (waitForSmokeBackendReady in frontend/electron/main.cjs). On a device
# the Agent service answers it; this smoke covers the shell and KWin, not the
# Agent, so a loopback responder stands in. Every other API path returns 404.
READYZ_PORT_FILE="$LOG_DIR/readyz-stub.port"
rm -f -- "$READYZ_PORT_FILE"
python3 -c '
import http.server, os, sys

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        ready = self.path.split("?", 1)[0] == "/readyz"
        body = b"{\"status\":\"ready\"}" if ready else b"{}"
        self.send_response(200 if ready else 404)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_args):
        pass

server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Handler)
with open(sys.argv[1] + ".tmp", "w", encoding="ascii") as stream:
    stream.write(str(server.server_address[1]))
os.replace(sys.argv[1] + ".tmp", sys.argv[1])
server.serve_forever()
' "$READYZ_PORT_FILE" >"$LOG_DIR/readyz-stub.log" 2>&1 &
READYZ_STUB_PID=$!
for _attempt in $(seq 1 50); do
  [[ -s "$READYZ_PORT_FILE" ]] && break
  sleep 0.1
done
[[ -s "$READYZ_PORT_FILE" ]] || {
  echo "loopback readiness responder did not start" >&2
  exit 1
}
export ECHO_BACKEND_URL="http://127.0.0.1:$(cat "$READYZ_PORT_FILE")"

NATIVE_APP_IPC_READY_FILE="$XDG_RUNTIME_DIR/echo-os/native-app-ipc-ready"
NATIVE_APP_IPC_BASELINE_IDS="$(
  wmctrl -l -x -p 2>/dev/null | \
    awk 'tolower($4) ~ /(^|[.])kcalc([.]|$)/ { print tolower($1) }'
)"
rm -f -- "$NATIVE_APP_IPC_READY_FILE"

ECHO_ARGUMENTS=(
  --class=echo-shell
  --ozone-platform=x11
  --force-renderer-accessibility
  --disable-gpu
)
if [[ "$(id -u)" -eq 0 ]]; then ECHO_ARGUMENTS+=(--no-sandbox); fi
ECHO_NATIVE_SHELL=1 \
ECHO_SHELL_MODE=desktop \
ECHO_SMOKE=1 \
ECHO_SMOKE_HOLD_MS=45000 \
ECHO_NATIVE_APP_SMOKE_ID=org.kde.kcalc \
ECHO_NATIVE_APP_IPC_READY_FILE="$NATIVE_APP_IPC_READY_FILE" \
"$PACKAGED_BIN" "${ECHO_ARGUMENTS[@]}" >"$LOG_DIR/echo-desktop.log" 2>&1 &
ECHO_PID=$!

# On X11, Electron sets WM_CLASS to the app name, which for the packaged shell
# is package.json "name" ("echo-frontend.echo-frontend"; electron-builder's
# build.productName does not reach the app), and ignores --class. The Liquid
# Glass background window shares that class and is excluded by its fixed title. The window maps
# on ready-to-show, which under software rendering on a CI runner can take far
# longer than on hardware.
for _attempt in $(seq 1 600); do
  ECHO_WINDOW_ID="$(
    wmctrl -lx 2>/dev/null | awk \
      'tolower($0) ~ /echo-shell|echo-os-desktop|echo-frontend/ && tolower($0) !~ /echo liquid glass background/ { print $1; exit }'
  )"
  [[ -n "$ECHO_WINDOW_ID" ]] && break
  kill -0 "$ECHO_PID" 2>/dev/null || {
    echo "packaged Echo Desktop exited before registering a KWin window" >&2
    exit 1
  }
  sleep 0.1
done
[[ -n "${ECHO_WINDOW_ID:-}" ]] || {
  echo "packaged Echo Desktop did not register a KWin window" >&2
  {
    echo "--- wmctrl -lx"
    wmctrl -lx 2>&1 || true
    echo "--- top-level X11 windows (id, map state, WM_CLASS, WM_NAME)"
    for window_id in $(xwininfo -root -children 2>/dev/null | awk '/^ +0x/ { print $1 }'); do
      window_class="$(xprop -id "$window_id" WM_CLASS 2>/dev/null || true)"
      [[ "$window_class" == *"="* ]] || continue
      echo "$window_id" \
        "$(xwininfo -id "$window_id" 2>/dev/null | awk -F: '/Map State/ { gsub(/ /, "", $2); print $2 }')" \
        "${window_class#*= }" "$(xprop -id "$window_id" WM_NAME 2>/dev/null | sed 's/^[^=]*= //')"
    done
  } >"$LOG_DIR/x11-windows.log" 2>&1
  exit 1
}
echo "✓ packaged Echo Desktop registered as $ECHO_WINDOW_ID"

"$VERIFY_SCRIPT" --runtime
for _attempt in $(seq 1 300); do
  grep -q "SMOKE OK:" "$LOG_DIR/echo-desktop.log" && break
  kill -0 "$ECHO_PID" 2>/dev/null || {
    echo "packaged Echo Desktop exited before its renderer finished loading" >&2
    exit 1
  }
  sleep 0.1
done
grep -q "SMOKE OK:" "$LOG_DIR/echo-desktop.log" || {
  echo "packaged Echo Desktop window exists but its renderer did not finish loading" >&2
  exit 1
}
echo "✓ packaged renderer finished loading"

for _attempt in $(seq 1 300); do
  [[ -f "$NATIVE_APP_IPC_READY_FILE" ]] && break
  kill -0 "$ECHO_PID" 2>/dev/null || {
    echo "packaged Echo Desktop exited before completing native-app IPC smoke" >&2
    exit 1
  }
  sleep 0.1
done
[[ -f "$NATIVE_APP_IPC_READY_FILE" && ! -L "$NATIVE_APP_IPC_READY_FILE" && \
   "$(stat -c '%u:%a' "$NATIVE_APP_IPC_READY_FILE")" == "$(id -u):600" && \
   "$(<"$NATIVE_APP_IPC_READY_FILE")" == \
     "app=org.kde.kcalc path=preload-ipc-gio result=zero-exit" ]] || {
  echo "packaged Echo Desktop did not publish its private native-app IPC result" >&2
  exit 1
}
grep -q '^ECHO_NATIVE_APP_IPC_ACCEPTED app=org.kde.kcalc path=preload-ipc-gio result=zero-exit$' \
  "$LOG_DIR/echo-desktop.log"

NATIVE_APP_IPC_WINDOW_ID=""
for _attempt in $(seq 1 300); do
  NATIVE_APP_IPC_WINDOW_ID="$(
    wmctrl -l -x -p 2>/dev/null | awk \
      -v baseline="$NATIVE_APP_IPC_BASELINE_IDS" '
        BEGIN {
          count = split(baseline, ids, "\n")
          for (i = 1; i <= count; i++) seen[tolower(ids[i])] = 1
        }
        tolower($4) ~ /(^|[.])kcalc([.]|$)/ &&
        $3 ~ /^[1-9][0-9]*$/ && !seen[tolower($1)] { print tolower($1) }
      '
  )"
  [[ "$(printf '%s\n' "$NATIVE_APP_IPC_WINDOW_ID" | sed '/^$/d' | wc -l)" -le 1 ]] || {
    echo "native-app IPC smoke opened multiple new KCalc windows" >&2
    exit 1
  }
  [[ -n "$NATIVE_APP_IPC_WINDOW_ID" ]] && break
  kill -0 "$ECHO_PID" 2>/dev/null || break
  sleep 0.1
done
[[ "$NATIVE_APP_IPC_WINDOW_ID" =~ ^0x[0-9a-f]+$ ]] || {
  echo "native-app IPC returned success without a new KCalc window" >&2
  exit 1
}
wmctrl -ic "$NATIVE_APP_IPC_WINDOW_ID"
for _attempt in $(seq 1 200); do
  wmctrl -l 2>/dev/null | awk '{ print tolower($1) }' | \
    grep -Fxq "$NATIVE_APP_IPC_WINDOW_ID" || break
  sleep 0.1
done
wmctrl -l 2>/dev/null | awk '{ print tolower($1) }' | \
  grep -Fxq "$NATIVE_APP_IPC_WINDOW_ID" && {
    echo "native-app IPC KCalc window did not close" >&2
    exit 1
  }
rm -f -- "$NATIVE_APP_IPC_READY_FILE"
echo "ECHO_NATIVE_APP_IPC_READY app=org.kde.kcalc path=preload-ipc-gio result=zero-exit cleanup=closed"

timeout 20s python3 "$ACCESSIBILITY_PROBE" \
  --root-pid "$ECHO_PID" \
  --required-name "ECHO OS 桌面" \
  --timeout-seconds 15 \
  >"$LOG_DIR/accessibility-tree-x11.log"
grep -q 'ECHO_ACCESSIBILITY_TREE_READY provider=at-spi2 application=echo' \
  "$LOG_DIR/accessibility-tree-x11.log"
echo "✓ packaged Echo Desktop exposed its fixed X11 AT-SPI marker"

if ! wait "$ECHO_PID"; then
  echo "packaged Echo Desktop smoke process exited unsuccessfully" >&2
  exit 1
fi
unset ECHO_PID

ECHO_CORE_APPS_SESSION_TEST=USE-EPHEMERAL-RUNTIME \
  timeout 360s "$CORE_APPS_SESSION_SMOKE" --session x11 \
    >"$LOG_DIR/core-apps-session-x11.log"
grep -q '^ECHO_CORE_APPS_SESSION_READY session=x11 cases=directory,http,text,pdf,image,archive,audio,terminal,calculator transports=xdg-open,gio-launch windows=native cleanup=closed fixtures=runtime-and-loopback-only$' \
  "$LOG_DIR/core-apps-session-x11.log"
echo "✓ XDG defaults and desktop launch opened nine real X11 core-application windows and closed them"

xmessage \
  -name echo-native-smoke \
  -title "Echo Native Bridge Smoke" \
  -buttons "Dismiss:0" \
  "Echo OS real native window lifecycle" \
  >"$LOG_DIR/native-app.log" 2>&1 &
NATIVE_APP_PID=$!
for _attempt in $(seq 1 100); do
  NATIVE_WINDOW_ID="$(
    wmctrl -l -x -p 2>/dev/null | awk \
      '/Echo Native Bridge Smoke/ { print $1; exit }'
  )"
  [[ -n "$NATIVE_WINDOW_ID" ]] && break
  kill -0 "$NATIVE_APP_PID" 2>/dev/null || {
    echo "native smoke application exited before creating a window" >&2
    exit 1
  }
  sleep 0.1
done
[[ -n "${NATIVE_WINDOW_ID:-}" ]] || {
  echo "native smoke window did not appear in KWin" >&2
  exit 1
}
echo "✓ native test application registered as $NATIVE_WINDOW_ID"

ECHO_SMOKE_NATIVE_WINDOW_ID="$NATIVE_WINDOW_ID" \
ECHO_SMOKE_SKIP_CLOSE=1 \
  node "$NATIVE_DRIVER"

KWIN_WINDOWS_JSON="$(
  "$KWIN_BRIDGE" --socket "$KWIN_BRIDGE_SOCKET" --request list
)"
KWIN_WINDOW_UUID="$(
  python3 -c '
import json
import sys

response = json.loads(sys.argv[1])
matches = [
    item["id"]
    for item in response.get("windows", [])
    if "Echo Native Bridge Smoke" in item.get("title", "")
]
if len(matches) != 1:
    raise SystemExit(f"expected one KWin UUID window, got {matches!r}")
print(matches[0])
' "$KWIN_WINDOWS_JSON"
)"
"$KWIN_BRIDGE" --socket "$KWIN_BRIDGE_SOCKET" --request close \
  --window-id "$KWIN_WINDOW_UUID" >/dev/null
wait "$NATIVE_APP_PID" || true
unset NATIVE_APP_PID
echo "✓ compositor-native KWin UUID provider closed the real window"

echo "Desktop session integration smoke OK"
