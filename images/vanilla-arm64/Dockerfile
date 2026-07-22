# palserver/vanilla-arm64 — native Linux Palworld dedicated server on ARM64 hosts.
# 官方只出 x86-64 伺服器執行檔,ARM64 主機(樹莓派/NanoPi/Ampere…)要靠
# FEX(x86-64→ARM64 動態轉譯器)執行;作法參考 nitrog0d/palworld-arm64。
# DepotDownloader 抓原生 arm64 版 —— 下載/驗證不吃轉譯,只有遊戲本體經 FEX 跑。
# 與 images/vanilla 同一套容器介面(/data/saved、/data/config、CMD 啟動參數),
# agent 的 docker 後端無需任何改動,建好後在建立實例時指定本鏡像即可。
FROM ubuntu:24.04

ARG DEPOTDOWNLOADER_VERSION=3.4.0
# FEX 依 CPU 世代出多種最佳化包:RK3588(Cortex-A76)/Ampere 皆 >= ARMv8.2;
# 更老的板子(樹莓派 4 之類 ARMv8.0)建置時帶 --build-arg FEX_VARIANT=armv8.0。
ARG FEX_VARIANT=armv8.2
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
      ca-certificates curl unzip xdg-user-dirs software-properties-common expect \
    && add-apt-repository -y ppa:fex-emu/fex \
    && apt-get install -y --no-install-recommends "fex-emu-${FEX_VARIANT}" \
    && rm -rf /var/lib/apt/lists/* \
    && curl -fsSL -o /tmp/dd.zip \
      "https://github.com/SteamRE/DepotDownloader/releases/download/DepotDownloader_${DEPOTDOWNLOADER_VERSION}/DepotDownloader-linux-arm64.zip" \
    && unzip /tmp/dd.zip -d /opt/depotdownloader \
    && chmod +x /opt/depotdownloader/DepotDownloader \
    && ln -s /opt/depotdownloader/DepotDownloader /usr/local/bin/DepotDownloader \
    && rm /tmp/dd.zip

# Base image ships an "ubuntu" user at UID 1000; rename it instead of
# fighting over the UID (kept at 1000 so Linux-host bind mounts map cleanly).
RUN usermod -l palworld -d /home/palworld -m ubuntu && groupmod -n palworld ubuntu
USER palworld
ENV HOME=/home/palworld USER=palworld
WORKDIR /home/palworld

# FEX 需要一份 x86-64 rootfs 當 guest 系統函式庫,建置期先抓好。
# -x 解成目錄而非掛 squashfs —— 容器內沒有 FUSE 可用;
# unbuffer 是因為 fetcher 的 isatty 判斷在無 tty 的 docker build 會出錯。
RUN unbuffer FEXRootFSFetcher -y -x

COPY --chmod=755 entrypoint.sh /entrypoint.sh

# /data/saved  -> Pal/Saved (world saves, agent bind-mounts this)
# /data/config -> agent-rendered PalWorldSettings.ini (read-only)
VOLUME ["/data/saved"]

EXPOSE 8211/udp 8212/tcp

ENTRYPOINT ["/entrypoint.sh"]
