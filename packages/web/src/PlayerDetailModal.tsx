import { useEffect, useState } from "react";
import { FiX, FiPackage, FiZap } from "react-icons/fi";
import { GiShield } from "react-icons/gi";
import type { PlayerDetail } from "@palserver/shared";
import type { AgentClient } from "./api";
import { useGameData, displayName, palIconUrl, itemIconUrl, type GameData } from "./gameData";
import { maskSteamId } from "./SteamId";
import { t, useI18n } from "./i18n";
import { Overlay, card, btnGhost, errorCls } from "./ui";

/** Full detail for one player — pals and inventory — via PalDefender's REST
 * API. Shows a clear prompt when that API isn't available. */
export function PlayerDetailModal({
  client,
  instanceId,
  identifier,
  displayLabel,
  onClose,
}: {
  client: AgentClient;
  instanceId: string;
  identifier: string;
  displayLabel: string;
  onClose: () => void;
}) {
  useI18n();
  const gameData = useGameData();
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client
      .playerDetail(instanceId, identifier)
      .then(setDetail)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [client, instanceId, identifier]);

  return (
    <Overlay onClose={onClose}>
      <div
        className={`${card} flex max-h-[85vh] w-[720px] max-w-full flex-col gap-4 overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-extrabold">{displayLabel}</h2>
          <button className={btnGhost} onClick={onClose}>
            <FiX className="inline size-4" /> {t("關閉")}
          </button>
        </div>

        {error && <p className={errorCls}>{error}</p>}
        {!detail && !error && <p className="text-ink-muted">{t("載入中…")}</p>}

        {detail && !detail.available && (
          <div className="rounded-(--radius-cute) border-2 border-dashed border-line px-6 py-10 text-center text-ink-muted">
            <GiShield className="mx-auto mb-2 size-11" />
            <p className="font-bold">{t("無法讀取玩家細節")}</p>
            <p className="mt-1 text-[13px]">{detail.reason}</p>
            <p className="mt-2 text-xs">
              {t("玩家細節需要安裝 PalDefender 並啟用其 REST API。PalDefender 1.8.0 以上連離線玩家也能查詢。")}
            </p>
          </div>
        )}

        {detail?.available && <DetailBody detail={detail} gameData={gameData} />}
      </div>
    </Overlay>
  );
}

function DetailBody({ detail, gameData }: { detail: PlayerDetail; gameData: GameData | null }) {
  const team = detail.pals.filter((p) => p.location === "team");
  const palbox = detail.pals.filter((p) => p.location === "palbox");
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
        <Info label={t("名稱")} value={detail.name || "—"} />
        <Info label={t("公會")} value={detail.guildName || t("無")} />
        <Info label="UserId" value={detail.userId ? maskSteamId(detail.userId) : "—"} />
        <Info label={t("隊伍帕魯")} value={String(detail.teamCount)} />
        <Info label={t("帕魯箱")} value={String(detail.palboxCount)} />
      </div>

      {team.length > 0 && <PalGroup title={t("隊伍")} pals={team} gameData={gameData} />}
      {palbox.length > 0 && <PalGroup title={t("帕魯箱")} pals={palbox} gameData={gameData} />}
      {detail.pals.length === 0 && (
        <p className="text-[13px] text-ink-muted">{t("沒有讀取到帕魯資料。")}</p>
      )}

      <ItemList items={detail.items} gameData={gameData} />
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-ink-muted">{label}</p>
      <p className="font-bold break-all">{value}</p>
    </div>
  );
}

function PalGroup({
  title,
  pals,
  gameData,
}: {
  title: string;
  pals: PlayerDetail["pals"];
  gameData: GameData | null;
}) {
  return (
    <div>
      <h3 className="mb-2 inline-flex items-center gap-1.5 text-sm font-extrabold text-ink-muted">
        <FiZap className="size-4 text-pal" /> {title}({pals.length})
      </h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {pals.map((p) => {
          const entity = gameData?.palById.get(p.palId);
          return (
            <div key={p.instanceId} className="flex items-center gap-2 rounded-xl border-2 border-line p-2">
              {entity?.icon ? (
                <img src={palIconUrl(entity.icon)} alt="" className="size-9 shrink-0" />
              ) : (
                <span className="size-9 shrink-0 rounded bg-card-soft" />
              )}
              <div className="min-w-0">
                <p className="truncate text-[13px] font-bold">
                  {p.nickname || (entity ? displayName(entity) : p.palId)}
                  {p.shiny && <span className="ml-1 text-amber-500">✦</span>}
                </p>
                <p className="text-xs text-ink-muted">Lv.{p.level}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ItemList({
  items,
  gameData,
}: {
  items: PlayerDetail["items"];
  gameData: GameData | null;
}) {
  if (items.length === 0) {
    return <p className="text-[13px] text-ink-muted">{t("沒有讀取到背包資料。")}</p>;
  }
  // Merge same item across containers for a cleaner overview.
  const merged = new Map<string, number>();
  for (const s of items) merged.set(s.itemId, (merged.get(s.itemId) ?? 0) + s.count);
  const rows = [...merged.entries()].sort((a, b) => b[1] - a[1]);

  return (
    <div>
      <h3 className="mb-2 inline-flex items-center gap-1.5 text-sm font-extrabold text-ink-muted">
        <FiPackage className="size-4 text-pal" /> {t("背包({n} 種)", { n: rows.length })}
      </h3>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
        {rows.map(([itemId, count]) => {
          const entity = gameData?.itemById.get(itemId);
          return (
            <div key={itemId} className="flex items-center gap-2 rounded-xl border-2 border-line p-2">
              {entity?.icon ? (
                <img src={itemIconUrl(entity.icon)} alt="" className="size-8 shrink-0" />
              ) : (
                <span className="size-8 shrink-0 rounded bg-card-soft" />
              )}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold">
                  {entity ? displayName(entity) : itemId}
                </p>
              </div>
              <span className="shrink-0 text-sm font-extrabold text-pal">×{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
