import { useCallback, useEffect, useRef, useState } from "react";
import { FiImage, FiRefreshCw, FiRepeat, FiX } from "react-icons/fi";
import { MAP_BOUND, savToMap, type LiveStatus, type RestPlayer } from "@palserver/shared";
import type { AgentClient } from "./api";
import { btn, btnGhost, card, errorCls, inputCls } from "./ui";

/**
 * Live player map. The world map image is a Pocketpair asset, so we don't
 * ship one — the user supplies their own (URL or uploaded file, kept in
 * localStorage) and we overlay players on the game's [-1000, 1000] map square.
 * Without a background image the grid alone still places players correctly.
 */
const BG_KEY = "palserver.mapBackground";
const FLIP_KEY = "palserver.mapFlipY";
const SIZE = 2 * MAP_BOUND; // svg viewBox is the map square itself

export function MapTab({ client, instanceId }: { client: AgentClient; instanceId: string }) {
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [background, setBackground] = useState(() => localStorage.getItem(BG_KEY) ?? "");
  const [flipY, setFlipY] = useState(() => localStorage.getItem(FLIP_KEY) === "1");
  const [urlDraft, setUrlDraft] = useState("");
  const [hovered, setHovered] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setLive(await client.live(instanceId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [client, instanceId]);

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const saveBackground = (value: string) => {
    setBackground(value);
    if (value) localStorage.setItem(BG_KEY, value);
    else localStorage.removeItem(BG_KEY);
  };

  const uploadBackground = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => saveBackground(String(reader.result));
    reader.readAsDataURL(file);
  };

  const toggleFlip = () => {
    const next = !flipY;
    setFlipY(next);
    localStorage.setItem(FLIP_KEY, next ? "1" : "0");
  };

  if (!live) return <p className="text-ink-muted">{error ?? "載入中…"}</p>;
  if (!live.available) {
    return (
      <div className="rounded-(--radius-cute) border-2 border-dashed border-line px-6 py-12 text-center text-ink-muted">
        <p className="font-bold">無法連線到伺服器的 REST API</p>
        <p className="mt-1 text-[13px]">{live.reason}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {error && <p className={errorCls}>{error}</p>}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[13px] font-bold text-ink-muted">
          在線玩家 {live.players.length} 人{background ? "" : " · 尚未設定地圖底圖"}
        </p>
        <div className="flex flex-wrap gap-2">
          <button className={btnGhost} onClick={refresh} aria-label="重新整理">
            <FiRefreshCw className="size-4" />
          </button>
          <button
            className={`${btnGhost} inline-flex items-center gap-1.5`}
            onClick={toggleFlip}
            title="若玩家位置南北顛倒,按此翻轉"
          >
            <FiRepeat className="size-4" /> 翻轉 Y 軸
          </button>
          <button
            className={`${btnGhost} inline-flex items-center gap-1.5`}
            onClick={() => fileRef.current?.click()}
          >
            <FiImage className="size-4" /> 上傳底圖
          </button>
          {background && (
            <button
              className={`${btnGhost} inline-flex items-center gap-1.5 text-berry hover:border-berry`}
              onClick={() => saveBackground("")}
            >
              <FiX className="size-4" /> 移除底圖
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => uploadBackground(e.target.files?.[0])}
          />
        </div>
      </div>

      {!background && (
        <div className={`${card} flex flex-wrap items-center gap-2`}>
          <p className="min-w-52 flex-1 text-[13px] text-ink-muted">
            貼上地圖圖片網址,或用「上傳底圖」選擇你自己的世界地圖截圖(圖片需為整張方形世界地圖)。
          </p>
          <input
            className={`${inputCls} min-w-52 flex-1`}
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://…/palworld-map.png"
          />
          <button className={btn} onClick={() => saveBackground(urlDraft.trim())} disabled={!urlDraft.trim()}>
            套用
          </button>
        </div>
      )}

      <div className={`${card} overflow-hidden p-2`}>
        <svg
          viewBox={`${-MAP_BOUND} ${-MAP_BOUND} ${SIZE} ${SIZE}`}
          className="aspect-square w-full rounded-xl bg-card-soft"
        >
          {background && (
            <image
              href={background}
              x={-MAP_BOUND}
              y={-MAP_BOUND}
              width={SIZE}
              height={SIZE}
              preserveAspectRatio="none"
            />
          )}
          <Grid />
          {live.players.map((player) => (
            <PlayerMarker
              key={player.userId}
              player={player}
              flipY={flipY}
              hovered={hovered === player.userId}
              onHover={setHovered}
            />
          ))}
        </svg>
      </div>

      <p className="text-[13px] text-ink-muted">
        座標為遊戲內地圖座標(範圍 ±{MAP_BOUND})。若玩家位置南北相反,按「翻轉 Y 軸」。
      </p>
    </div>
  );
}

function Grid() {
  const lines = [];
  for (let v = -MAP_BOUND; v <= MAP_BOUND; v += 250) {
    const major = v === 0;
    lines.push(
      <line
        key={`h${v}`}
        x1={-MAP_BOUND}
        y1={v}
        x2={MAP_BOUND}
        y2={v}
        stroke="currentColor"
        strokeWidth={major ? 3 : 1}
        opacity={major ? 0.35 : 0.15}
      />,
      <line
        key={`v${v}`}
        x1={v}
        y1={-MAP_BOUND}
        x2={v}
        y2={MAP_BOUND}
        stroke="currentColor"
        strokeWidth={major ? 3 : 1}
        opacity={major ? 0.35 : 0.15}
      />,
    );
  }
  return <g className="text-ink-muted">{lines}</g>;
}

function PlayerMarker({
  player,
  flipY,
  hovered,
  onHover,
}: {
  player: RestPlayer;
  flipY: boolean;
  hovered: boolean;
  onHover: (id: string | null) => void;
}) {
  const map = savToMap(player.location_x, player.location_y);
  const y = flipY ? -map.y : map.y;
  return (
    <g
      transform={`translate(${map.x} ${y})`}
      onMouseEnter={() => onHover(player.userId)}
      onMouseLeave={() => onHover(null)}
      className="cursor-pointer"
    >
      <circle r={hovered ? 26 : 18} className="fill-pal" stroke="white" strokeWidth={6} />
      <text
        y={-38}
        textAnchor="middle"
        className="fill-ink"
        style={{ fontSize: 44, fontWeight: 800, paintOrder: "stroke" }}
        stroke="white"
        strokeWidth={10}
      >
        {player.name}
      </text>
      {hovered && (
        <text
          y={62}
          textAnchor="middle"
          className="fill-ink-muted"
          style={{ fontSize: 34, fontWeight: 700, paintOrder: "stroke" }}
          stroke="white"
          strokeWidth={8}
        >
          {Math.round(map.x)}, {Math.round(map.y)} · Lv.{player.level}
        </text>
      )}
    </g>
  );
}
