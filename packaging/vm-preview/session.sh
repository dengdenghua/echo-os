#!/usr/bin/env bash
set -euo pipefail
export XDG_SESSION_TYPE=x11
export XDG_CURRENT_DESKTOP=Echo:KDE
export GTK_IM_MODULE=fcitx QT_IM_MODULE=fcitx XMODIFIERS=@im=fcitx
export ECHO_OS_DIR=/opt/echo-os ECHO_BACKEND_URL=http://127.0.0.1:8000
systemctl --user import-environment DISPLAY XAUTHORITY DBUS_SESSION_BUS_ADDRESS XDG_SESSION_TYPE XDG_CURRENT_DESKTOP
systemctl --user restart echo-preview-agent.service
for _ in $(seq 1 90); do
  if curl -fsS --max-time 1 http://127.0.0.1:8000/livez >/dev/null; then break; fi
  sleep 1
done
exec /opt/echo-os/deploy/desktop-session/echo-desktop-session.sh
