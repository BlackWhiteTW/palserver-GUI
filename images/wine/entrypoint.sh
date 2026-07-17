#!/usr/bin/env bash
set -euo pipefail

APP_ID=2394010          # Palworld Dedicated Server
INSTALL_DIR="/palworld"
CONFIG_DST="$INSTALL_DIR/Pal/Saved/Config/WindowsServer/PalWorldSettings.ini"

# ── Xvfb (virtual framebuffer) ──────────────────────────────────────
rm -f /tmp/.X99-lock
Xvfb :99 -screen 0 1024x768x24 &
XVFB_PID=$!
trap 'kill $XVFB_PID 2>/dev/null || true' EXIT TERM INT
sleep 1

# ── Download / update Palworld (Windows depot) ──────────────────────
echo "[palserver-wine] installing/updating Palworld (app $APP_ID, Windows)..."
DepotDownloader -app "$APP_ID" -dir "$INSTALL_DIR" -os windows -osarch 64 -validate

# ── Apply agent-rendered settings ───────────────────────────────────
# docker: agent bind-mounts /data/config/PalWorldSettings.ini
# k8s: agent writes ini via execInPod to the Pod (PVC-backed)
CONFIG_SRC_DOCKER="/data/config/PalWorldSettings.ini"
if [ -f "$CONFIG_SRC_DOCKER" ] && [ "$(wc -c < "$CONFIG_SRC_DOCKER")" -gt 10 ]; then
  mkdir -p "$(dirname "$CONFIG_DST")"
  cp "$CONFIG_SRC_DOCKER" "$CONFIG_DST"
  echo "[palserver-wine] applied PalWorldSettings.ini from agent (docker)"
elif [ -f "$CONFIG_DST" ] && [ "$(wc -c < "$CONFIG_DST")" -gt 10 ]; then
  echo "[palserver-wine] PalWorldSettings.ini already in place (k8s PVC)"
else
  echo "[palserver-wine] no PalWorldSettings.ini — server will use defaults"
fi

# ── Launch ──────────────────────────────────────────────────────────
echo "[palserver-wine] starting PalServer via Wine..."
exec wine "$INSTALL_DIR/Pal/Binaries/Win64/PalServer-Win64-Shipping-Cmd.exe" "$@"
