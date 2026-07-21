import { useEffect, useRef, useState } from "react";
import { FiMapPin, FiX } from "react-icons/fi";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { t, useI18n } from "./i18n";
import { buildBossMarker, buildLandmarkMarker, loadMapLayers, MAP_IMAGE, IMAGE_BOUNDS } from "./mapLayers";
import { Overlay, btn, btnGhost, card } from "./ui";

/**
 * 地圖描點選座標:點地圖放圖釘,回傳 PalDefender tp / spawn 指令用的「地圖小座標」
 * 字串「X Y [Z]」(Z 由伺服器自動找地面)。tp 吃的就是地圖座標(-1000~1000),
 * 而 Leaflet CRS.Simple 的 latlng 本身即 [mapY(北), mapX(東)],所以 X=lng、Y=lat,
 * 不需再換算世界座標。與線上地圖共用同一套座標系。
 */
export function MapPickModal({
  onPick,
  onClose,
}: {
  onPick: (coords: string) => void;
  onClose: () => void;
}) {
  const { lang } = useI18n();
  const elRef = useRef<HTMLDivElement>(null);
  const markerRef = useRef<L.CircleMarker | null>(null);
  const [world, setWorld] = useState<{ x: number; y: number } | null>(null);
  const [z, setZ] = useState("");

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;
    const map = L.map(el, {
      crs: L.CRS.Simple,
      attributionControl: false,
      zoomSnap: 0.25,
      maxZoom: 4,
    });
    el.style.background = "transparent";
    L.imageOverlay(MAP_IMAGE, IMAGE_BOUNDS).addTo(map);
    map.setMaxBounds(IMAGE_BOUNDS.pad(0.3));
    map.setView(IMAGE_BOUNDS.getCenter(), -2);

    // 頭目/地標圖示(跟線上地圖同一份資料與樣式,見 mapLayers.ts);只要圖示與位置,
    // 不含存活/重生狀態(選傳送座標不需要那個資訊,也省一次額外的狀態拉取)。
    let cancelled = false;
    void loadMapLayers().then(({ landmarks, bosses }) => {
      if (cancelled) return;
      for (const lm of landmarks) buildLandmarkMarker(lm, lang)?.addTo(map);
      for (const b of bosses) buildBossMarker(b, lang).addTo(map);
    });

    const onClick = (e: L.LeafletMouseEvent) => {
      // Leaflet latlng = [lat=mapY(北), lng=mapX(東)];tp 吃地圖座標 X Y = mapX mapY。
      setWorld({ x: Math.round(e.latlng.lng), y: Math.round(e.latlng.lat) });
      if (markerRef.current) markerRef.current.setLatLng(e.latlng);
      else {
        markerRef.current = L.circleMarker(e.latlng, {
          radius: 8,
          color: "#ffffff",
          weight: 2,
          fillColor: "#3fa7e0",
          fillOpacity: 0.95,
        }).addTo(map);
      }
    };
    map.on("click", onClick);

    // 容器高度可能一開始是 0(版面尚未定),量到實際尺寸再 fit 一次。
    let fitted = false;
    const ro = new ResizeObserver(() => {
      map.invalidateSize();
      if (map.getSize().y === 0) return;
      map.setMinZoom(map.getBoundsZoom(IMAGE_BOUNDS) - 1);
      if (!fitted) {
        map.fitBounds(IMAGE_BOUNDS);
        fitted = true;
      }
    });
    ro.observe(el);

    return () => {
      cancelled = true;
      ro.disconnect();
      map.off("click", onClick);
      map.remove();
      markerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- lang 變動不重建整個地圖,圖示語言用掛載時的值即可(跟 TeleportModal 開啟時的介面語言一致)。
  }, []);

  return (
    <Overlay onClose={onClose}>
      <div
        className={`${card} flex h-[80vh] w-205 max-w-full flex-col gap-3`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-lg font-extrabold">
            <FiMapPin className="size-5 text-pal" /> {t("在地圖上選座標")}
          </h2>
          <button className={btnGhost} onClick={onClose} aria-label={t("關閉")}>
            <FiX className="size-4" />
          </button>
        </div>
        <p className="shrink-0 text-xs text-ink-muted">
          {t("點地圖任一處放置圖釘,選好按「使用此座標」。Z 留空則由伺服器自動找地面高度。")}
        </p>
        <div ref={elRef} className="min-h-0 flex-1 overflow-hidden rounded-cute border-2 border-line" />
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3 font-mono text-sm text-ink-muted">
            <span>{world ? `X ${world.x}` : t("X —")}</span>
            <span>{world ? `Y ${world.y}` : t("Y —")}</span>
            <label className="flex items-center gap-1">
              <span>Z</span>
              <input
                className="w-20 rounded-md border border-line bg-card-soft px-2 py-0.5 font-mono text-sm outline-none transition focus:border-pal"
                type="number"
                value={z}
                placeholder={t("自動")}
                onChange={(e) => setZ(e.target.value)}
              />
            </label>
          </div>
          <button
            className={`${btn} inline-flex items-center gap-1.5`}
            disabled={!world}
            onClick={() => {
              if (!world) return;
              const zPart = z.trim() ? ` ${z.trim()}` : "";
              onPick(`${world.x} ${world.y}${zPart}`);
            }}
          >
            <FiMapPin className="size-4" /> {t("使用此座標")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
