# palserver/wine — Palworld Windows binary running under Wine.
#
# Same bind-mount contract as palserver/vanilla (/data/saved + /data/config).
# Game files are fetched at container start via DepotDownloader with -os windows,
# keeping the image small and game updates image-free — same philosophy as vanilla.
#
# Wine + xvfb + VC++ runtime (vcrun2022) are baked in. WINEDLLOVERRIDES forces
# d3d9=native,builtin so PalDefender's d3d9.dll proxy loads correctly.
FROM debian:bookworm-slim

RUN dpkg --add-architecture i386 && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      wget curl unzip ca-certificates gnupg xvfb cabextract tini && \
    rm -rf /var/lib/apt/lists/*

# WineHQ stable
RUN wget -qO- https://dl.winehq.org/wine-builds/winehq.key | gpg --dearmor -o /usr/share/keyrings/winehq.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/winehq.gpg] https://dl.winehq.org/wine-builds/debian/ bookworm main" \
      > /etc/apt/sources.list.d/winehq.list && \
    apt-get update && \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --install-recommends winehq-stable && \
    rm -rf /var/lib/apt/lists/*

# winetricks (upstream master — Debian package is often outdated)
RUN curl -fsSL https://raw.githubusercontent.com/Winetricks/winetricks/master/src/winetricks \
      -o /usr/local/bin/winetricks && \
    chmod +x /usr/local/bin/winetricks

# DepotDownloader (self-contained .NET single-file binary)
ARG DEPOTDOWNLOADER_VERSION=3.4.0
RUN curl -fsSLO "https://github.com/SteamRE/DepotDownloader/releases/download/DepotDownloader_${DEPOTDOWNLOADER_VERSION}/DepotDownloader-linux-x64.zip" && \
    unzip DepotDownloader-linux-x64.zip -d /opt/depotdownloader && \
    chmod +x /opt/depotdownloader/DepotDownloader && \
    ln -s /opt/depotdownloader/DepotDownloader /usr/local/bin/DepotDownloader && \
    rm DepotDownloader-linux-x64.zip

# Wine environment
ENV WINEARCH=win64
ENV WINEDEBUG=-all
ENV WINEDLLOVERRIDES="mscoree,mshtml=;d3d9=n,b"
ENV DISPLAY=:99

# Pre-init Wine prefix + VC++ 2022 runtime (required by Palworld Windows binary).
# Done as root; the prefix is later copied into the palworld user's home.
ENV WINEPREFIX=/root/.wine
RUN Xvfb :99 -screen 0 1024x768x24 &>/tmp/xvfb.log && sleep 2 && \
    wineboot --init 2>&1 | tail -3 && \
    winetricks -q vcrun2022 2>&1 | tail -3 && \
    wineserver --kill && \
    rm -f /tmp/.X99-lock

# Non-root user (UID 1000, same as vanilla for bind-mount compatibility).
RUN id -u 1000 >/dev/null 2>&1 && usermod -l palworld -d /home/palworld -m "$(getent passwd 1000 | cut -d: -f1)" 2>/dev/null || \
    useradd -m -u 1000 palworld && \
    mkdir -p /home/palworld && \
    cp -r /root/.wine /home/palworld/.wine && \
    chown -R 1000:1000 /home/palworld

COPY entrypoint.sh /entrypoint.sh
RUN chmod 755 /entrypoint.sh

USER palworld
ENV HOME=/home/palworld
ENV WINEPREFIX=/home/palworld/.wine
WORKDIR /palworld

# /palworld  -> entire game install (PVC-backed, persists game + DLLs + config)
# /data/config -> agent-rendered PalWorldSettings.ini (docker bind-mount, read-only)
VOLUME ["/palworld"]

EXPOSE 8211/udp 8212/tcp

# tini remains PID 1 and reaps Wine/exec children created by kubectl exec.
# Without a subreaper, completed save-health processes accumulate as zombies
# because the Wine process itself does not wait for orphaned Linux children.
ENTRYPOINT ["/usr/bin/tini", "--", "/entrypoint.sh"]
