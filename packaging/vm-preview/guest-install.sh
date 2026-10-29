#!/usr/bin/env bash
# Development VM only. Never run this against an existing host installation.
set -euo pipefail
[[ -f /etc/echo-preview-allowed ]] || { echo 'Missing preview VM authorization marker'; exit 1; }
. /etc/os-release
[[ "$ID" == debian && "$VERSION_ID" == 13 ]] || { echo 'Debian 13 required'; exit 1; }
case "$(systemd-detect-virt)" in qemu|kvm) ;; *) echo 'A dedicated QEMU VM is required'; exit 1 ;; esac
exec > >(tee -a /var/log/echo-preview-install.log) 2>&1
export DEBIAN_FRONTEND=noninteractive
if [[ -f /root/echo-preview-proxy.env ]]; then
  set -a
  . /root/echo-preview-proxy.env
  set +a
fi
apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl python3 python3-venv python3-dev python3-tk build-essential unzip libglib2.0-bin \
  xserver-xorg-core xserver-xorg-video-all xserver-xorg-input-all xinit \
  x11-utils x11-xserver-utils xss-lock xsecurelock kwin-x11 wmctrl xdotool \
  sddm sddm-theme-breeze dbus-x11 dbus-user-session libkscreenlocker6 libkf6config-bin \
  fcitx5 fcitx5-chinese-addons fcitx5-frontend-gtk3 fcitx5-frontend-gtk4 \
  fcitx5-frontend-qt5 fcitx5-frontend-qt6 fonts-noto-cjk fonts-noto-color-emoji \
  plasma-workspace libqt6sql6-sqlite python3-pyqt6.qtqml xclip \
  at-spi2-core python3-pyatspi python3-dbus python3-gi \
  polkitd polkit-kde-agent-1 powerdevil upower power-profiles-daemon \
  pipewire pipewire-pulse wireplumber alsa-utils pulseaudio-utils \
  libgtk-3-0t64 libnss3 libasound2t64 libgbm1 libdrm2 libxss1 libxtst6 \
  libxrandr2 libxcomposite1 libxdamage1 libatk-bridge2.0-0t64 \
  libatspi2.0-0t64 libcups2t64 mesa-utils libgl1-mesa-dri \
  dolphin konsole kate kcalc xdg-utils desktop-file-utils

for group in audio video input render; do
  if getent group "$group" >/dev/null; then usermod -aG "$group" echo; fi
done

mkdir -p /var/cache/echo-preview /opt/echo-os /usr/lib/echo-os
cd /var/cache/echo-preview
# The manifest digest is supplied by the private NoCloud seed. Each public
# payload is verified before unpacking, even though this is a local VM bridge.
curl -fsS --retry 5 http://10.0.2.2:18083/manifest.json -o manifest.json
python3 - <<'PY'
import hashlib, json, pathlib, urllib.request
expected = pathlib.Path('/etc/echo-preview-allowed').read_text().strip()
raw = pathlib.Path('manifest.json').read_bytes()
assert hashlib.sha256(raw).hexdigest() == expected, 'Unexpected preview manifest'
manifest = json.loads(raw)
for name, digest in manifest['payloads'].items():
    assert pathlib.PurePath(name).name == name and name not in ('.', '..')
    path = pathlib.Path(name)
    if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != digest:
        urllib.request.urlretrieve('http://10.0.2.2:18083/' + name, path)
    assert hashlib.sha256(path.read_bytes()).hexdigest() == digest, 'Payload checksum mismatch'
PY
tar -xzf source.tar.gz -C /opt/echo-os --no-same-owner
mkdir -p /opt/echo-os/codex
tar -xzf codex-linux.tar.gz -C /opt/echo-os/codex --no-same-owner
/opt/echo-os/codex/bin/codex --version
mkdir -p /opt/echo-os/frontend/release/linux-unpacked
unzip -oq electron-linux.zip -d /opt/echo-os/frontend/release/linux-unpacked
desktop=/opt/echo-os/frontend/release/linux-unpacked
mv -f "$desktop/electron" "$desktop/echo-os-desktop"
install -m 0644 app.asar "$desktop/resources/app.asar"
install -m 0644 /opt/echo-os/packaging/image/native-shell-profile.json "$desktop/resources/native-shell-profile.json"
mkdir -p "$desktop/resources/liquid-glass"
install -m 0644 /opt/echo-os/frontend/public/echo/wallpaper-echo.jpg "$desktop/resources/liquid-glass/wallpaper-echo.jpg"
chmod 0755 "$desktop/echo-os-desktop"
chown root:root "$desktop/chrome-sandbox"
chmod 4755 "$desktop/chrome-sandbox"
python3 -m venv /opt/echo-os/.venv
/opt/echo-os/.venv/bin/pip install --require-hashes -r requirements.lock
/opt/echo-os/.venv/bin/pip install --no-deps echo_os-0.3.0-py3-none-any.whl

for helper in echo-session-lock echo-screen-locker echo-kwin-window-bridge \
  echo-notification-service echo-clipboard-host echo-accessibility-smoke.py; do
  install -m 0755 "/opt/echo-os/deploy/desktop-session/$helper" "/usr/lib/echo-os/$helper"
done
install -m 0644 /opt/echo-os/deploy/desktop-session/echo_notification_store.py /usr/lib/echo-os/
install -m 0644 /opt/echo-os/deploy/desktop-session/echo-lock.pam /etc/pam.d/echo-lock
install -d /usr/share/kwin/scripts/org.echoos.windowbridge
cp -a /opt/echo-os/deploy/desktop-session/kwin-window-bridge/. /usr/share/kwin/scripts/org.echoos.windowbridge/
chmod 0755 /opt/echo-os/deploy/desktop-session/echo-desktop-session.sh /opt/echo-os/packaging/vm-preview/session.sh /opt/echo-os/packaging/vm-preview/desktop.sh
install -d -o echo -g echo -m 0700 /home/echo/.local /home/echo/.local/share \
  /home/echo/.local/share/echo-preview /home/echo/.config /home/echo/.config/systemd \
  /home/echo/.config/systemd/user
install -d -o echo -g echo -m 0700 /home/echo/.config/fcitx5
install -o echo -g echo -m 0600 /opt/echo-os/packaging/vm-preview/fcitx5-profile \
  /home/echo/.config/fcitx5/profile

/opt/echo-os/.venv/bin/python - <<'PY'
import json, os, pathlib, yaml
creds = json.loads(pathlib.Path('/root/echo-preview-credentials.json').read_text())
os.environ.update(ECHO_DATA_DIR='/home/echo/.local/share/echo-preview', ECHO_ADMIN_PASSWORD=creds['password'])
from appliance.auth import load_or_bootstrap_auth
auth, _ = load_or_bootstrap_auth()
config = yaml.safe_load(pathlib.Path('/opt/echo-os/packaging/desktop/config.desktop.yaml').read_text())
config['name'] = 'echo-os-development-preview'
config['local_auth'] = auth.model_dump(mode='json')
config['oct']['enabled'] = False
config['oct']['jwt_secret'] = config['local_auth']['jwt_secret']
config['tentacle'] = {'enabled': False}
path = pathlib.Path('/home/echo/.local/share/echo-preview/config.yaml')
path.write_text(yaml.safe_dump(config, allow_unicode=True))
path.chmod(0o600)
PY
install -m 0644 /opt/echo-os/packaging/vm-preview/echo-preview-agent.service /home/echo/.config/systemd/user/
chown -R echo:echo /home/echo/.local/share/echo-preview /home/echo/.config/systemd
install -d /usr/share/xsessions /etc/sddm.conf.d
cat > /usr/share/xsessions/echo-preview.desktop <<'EOF'
[Desktop Entry]
Name=Echo OS Development Preview
Comment=Debian 13 + Echo OS, development and integration only
Exec=/opt/echo-os/packaging/vm-preview/session.sh
Type=Application
DesktopNames=Echo;KDE
EOF
cat > /etc/sddm.conf.d/echo-preview.conf <<'EOF'
[General]
DisplayServer=x11
[Autologin]
User=echo
Session=echo-preview.desktop
Relogin=false
EOF
cat > /etc/issue <<'EOF'
Echo OS Development Preview - Debian 13
Development VM: production disk encryption, A/B recovery and Secure Boot are not enabled.
EOF
cat > /etc/echo-preview-build.json <<EOF
{"profile":"development-preview","manifest_sha256":"$(cat /etc/echo-preview-allowed)","production_image":false}
EOF
touch /etc/cloud/cloud-init.disabled
rm -f /root/echo-preview-credentials.json
python3 - <<'PY'
from pathlib import Path
path = Path('/etc/os-release')
lines = [line for line in path.read_text().splitlines() if not line.startswith(('NAME=', 'PRETTY_NAME=', 'VARIANT=', 'VARIANT_ID='))]
lines += ['NAME="Echo OS Development Preview"', 'PRETTY_NAME="Echo OS Development Preview (Debian 13)"', 'VARIANT="Development Preview"', 'VARIANT_ID=echo-os-preview']
path.write_text('\n'.join(lines) + '\n')
PY
systemctl enable sddm
systemctl start power-profiles-daemon upower
systemctl set-default graphical.target
systemctl restart sddm
echo 'ECHO_PREVIEW_INSTALL_COMPLETE: desktop boot and remote input still require acceptance testing.'
