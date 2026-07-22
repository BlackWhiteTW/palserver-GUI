#!/usr/bin/env bash
set -euo pipefail

APP_ID=2394010          # Palworld Dedicated Server
SDK_APP_ID=1007         # Steamworks SDK Redist (provides steamclient.so)
INSTALL_DIR="$HOME/palworld"
SAVED_DIR="/data/saved"
CONFIG_SRC="/data/config/PalWorldSettings.ini"
CONFIG_DST="$INSTALL_DIR/Pal/Saved/Config/LinuxServer/PalWorldSettings.ini"

# The server dlopens ~/.steam/sdk64/steamclient.so at runtime; fetch it once
# from the Steamworks SDK redist depot.
if [ ! -f "$HOME/.steam/sdk64/steamclient.so" ]; then
  echo "[palserver] fetching steamclient.so (app $SDK_APP_ID)..."
  DepotDownloader -app "$SDK_APP_ID" -dir "$HOME/sdk" -os linux -osarch 64
  mkdir -p "$HOME/.steam/sdk64"
  cp "$HOME/sdk/linux64/steamclient.so" "$HOME/.steam/sdk64/steamclient.so"
fi

echo "[palserver] installing/updating Palworld dedicated server (app $APP_ID)..."
DepotDownloader -app "$APP_ID" -dir "$INSTALL_DIR" -os linux -osarch 64 -validate

# Persist Pal/Saved (worlds, players, generated config) on the mounted volume.
mkdir -p "$SAVED_DIR"
if [ -d "$INSTALL_DIR/Pal/Saved" ] && [ ! -L "$INSTALL_DIR/Pal/Saved" ]; then
  cp -rn "$INSTALL_DIR/Pal/Saved/." "$SAVED_DIR/" || true
  rm -rf "$INSTALL_DIR/Pal/Saved"
fi
mkdir -p "$INSTALL_DIR/Pal"
ln -sfn "$SAVED_DIR" "$INSTALL_DIR/Pal/Saved"

# Apply the agent-rendered settings, if provided.
if [ -f "$CONFIG_SRC" ]; then
  mkdir -p "$(dirname "$CONFIG_DST")"
  cp "$CONFIG_SRC" "$CONFIG_DST"
  echo "[palserver] applied PalWorldSettings.ini from agent"
fi

echo "[palserver] starting PalServer (via FEX x86-64 emulation)..."
chmod +x "$INSTALL_DIR/PalServer.sh" "$INSTALL_DIR"/Pal/Binaries/Linux/* 2>/dev/null || true
# FEXBash 讓整個啟動腳本跑在 FEX 的 guest 環境裡,腳本 exec 的 x86-64 伺服器
# 執行檔才轉譯得動。啟動參數(-port= 等)不含空白,以 $* 併成一條指令字串是安全的。
exec FEXBash "$INSTALL_DIR/PalServer.sh -publiclobby $*"
