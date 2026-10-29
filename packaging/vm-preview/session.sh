#!/usr/bin/env bash
set -euo pipefail
export XDG_SESSION_TYPE=x11
export XDG_CURRENT_DESKTOP=Echo:KDE
export GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx
export ECHO_OS_DIR=/opt/echo-os ECHO_BACKEND_URL=http://127.0.0.1:8000
export ECHO_DESKTOP_EXECUTABLE=/opt/echo-os/packaging/vm-preview/desktop.sh
export DBUS_SESSION_BUS_ADDRESS="unix:path=${XDG_RUNTIME_DIR:-/run/user/$(id -u)}/bus"
systemctl --user start dbus.socket
systemctl --user import-environment DISPLAY XAUTHORITY DBUS_SESSION_BUS_ADDRESS XDG_SESSION_TYPE XDG_CURRENT_DESKTOP
systemctl --user restart echo-preview-agent.service
backend_ready=0
for _ in $(seq 1 90); do
  if curl -fsS --max-time 1 http://127.0.0.1:8000/livez >/dev/null; then backend_ready=1; break; fi
  sleep 1
done
if [[ "$backend_ready" != 1 ]]; then
  echo 'Echo preview Agent did not become healthy; inspect journalctl --user -u echo-preview-agent.service' >&2
  exit 1
fi
exec /opt/echo-os/deploy/desktop-session/echo-desktop-session.sh
