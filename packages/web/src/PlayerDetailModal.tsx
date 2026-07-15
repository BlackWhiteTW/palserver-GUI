import { useCallback, useEffect, useState } from "react";
import { FiX, FiCpu, FiLock, FiPackage, FiRefreshCw, FiSave, FiTrendingUp, FiZap, FiShield } from "react-icons/fi";
import { GiShield } from "react-icons/gi";
import {
  hasFeature,
  type PlayerDetail,
  type PdRestStatus,
  type SavePalRow,
  type SavePlayerProfile,
} from "@palserver/shared";
import type { AgentClient } from "./api";
import { useGameData, displayName, palIconUrl, itemIconUrl, type GameData } from "./gameData";
import { maskSteamId } from "./SteamId";
import { t, useI18n } from "./i18n";
import { Overlay, card, btn, btnGhost, errorCls } from "./ui";

/** Full detail for one player — pals and inventory — via PalDefender's REST
 * API. Shows a clear prompt when that API isn't available. Player actions live
 * in the list rows (PlayerActionsMenu), not here. */
export function PlayerDetailModal({
  client,
  instanceId,
  identifier,
  displayLabel,
  onClose,
  onGoToPalDefender,
}: {
  client: AgentClient;
  instanceId: string;
  identifier: string;
  displayLabel: string;
  onClose: () => void;
  /** Jump to the PalDefender tab so the user can enable REST + set a token. */
  onGoToPalDefender?: () => void;
}) {
  useI18n();
  const gameData = useGameData();
  const [detail, setDetail] = useState<PlayerDetail | null>(null);
  const [rest, setRest] = useState<PdRestStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client
      .playerDetail(instanceId, identifier)
      .then((d) => {
        setDetail(d);
        // 查不到就順手抓 REST 狀態,判斷原因是「沒啟用 / 沒 token」還是伺服器沒開。
        if (!d.available) client.palDefenderRest(instanceId).then(setRest).catch(() => {});
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        client.palDefenderRest(instanceId).then(setRest).catch(() => {});
      });
  }, [client, instanceId, identifier]);

  // PalDefender 有裝、但 REST 還沒「啟用 + 有 token」→ 引導使用者去 PalDefender 分頁設定。
  const needsRestSetup = !!rest?.installed && !(rest.enabled && rest.hasToken);

  return (
    <Overlay onClose={onClose}>
      <div
        className={`${card} flex max-h-[85vh] w-[720px] max-w-full flex-col gap-4 overflow-y-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="truncate text-lg font-extrabold">{displayLabel}</h2>
          <button className={btnGhost} onClick={onClose}>
            <FiX className="inline size-4" /> {t("關閉")}
          </button>
        </div>

        {error && <p className={errorCls}>{error}</p>}
        {!detail && !error && <p className="text-ink-muted">{t("載入中…")}</p>}

        {detail && !detail.available && (
          <div className="rounded-(--radius-cute) border-2 border-dashed border-line px-6 py-8 text-center text-ink-muted">
            <GiShield className="mx-auto mb-2 size-11" />
            <p className="font-bold">{t("無法讀取玩家細節")}</p>
            <p className="mt-1 text-[13px]">{detail.reason}</p>

            {needsRestSetup ? (
              <div className="mt-4 flex flex-col items-center gap-3">
                <p className="text-[13px]">
                  {t("玩家細節需要 PalDefender 的 REST API。請到 PalDefender 分頁啟用 REST API 並建立存取權杖。")}
                </p>
                <p className="text-xs text-sun">
                  {t("啟用或變更後,需要重啟伺服器一次才會生效。")}
                </p>
                {onGoToPalDefender && (
                  <button
                    className={`${btn} inline-flex items-center gap-1.5`}
                    onClick={() => {
                      onClose();
                      onGoToPalDefender();
                    }}
                  >
                    <FiShield className="size-4" /> {t("前往 PalDefender 設定")}
                  </button>
                )}
              </div>
            ) : rest && !rest.installed ? (
              <p className="mt-2 text-xs">
                {t("玩家細節需要安裝 PalDefender 並啟用其 REST API。PalDefender 1.8.0 以上連離線玩家也能查詢。")}
              </p>
            ) : null}
          </div>
        )}

        {detail?.available && <DetailBody detail={detail} gameData={gameData} />}

        <SaveSnapshotSection
          client={client}
          instanceId={instanceId}
          playerUid={detail?.available ? detail.playerUid : null}
          playerName={displayLabel}
          gameData={gameData}
        />
      </div>
    </Overlay>
  );
}

/** 存檔快照區塊:不依賴 PalDefender,由 save-tools 掃描 Level.sav 產出。
 *  資料是「上次掃描時」的狀態,按「從存檔刷新」重掃(開服中也可以,分析
 *  的是最近一次落盤的內容)。贊助者功能(save-slim)。 */
function SaveSnapshotSection({
  client,
  instanceId,
  playerUid,
  playerName,
  gameData,
}: {
  client: AgentClient;
  instanceId: string;
  /** PalDefender REST 給的 uid(可能拿不到,fallback 用名稱比對) */
  playerUid: string | null;
  playerName: string;
  gameData: GameData | null;
}) {
  useI18n();
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [worldGuid, setWorldGuid] = useState<string | null>(null);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [profile, setProfile] = useState<SavePlayerProfile | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [scanPhase, setScanPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    client
      .license()
      .then((l) => setEntitled(hasFeature("save-slim", l)))
      .catch(() => setEntitled(false));
  }, [client, instanceId]);

  const norm = (s: string) => s.replace(/-/g, "").toLowerCase();

  const load = useCallback(async () => {
    try {
      const summary = await client.playersSnapshot(instanceId);
      setWorldGuid(summary.worldGuid);
      setGeneratedAt(summary.generatedAt);
      if (!summary.generatedAt) return; // 還沒掃描過
      const match =
        (playerUid && summary.players.find((p) => norm(p.uid) === norm(playerUid))) ||
        summary.players.find((p) => p.name === playerName);
      if (!match) {
        setProfile(null);
        setNotFound(true);
        return;
      }
      setNotFound(false);
      const { profile: full } = await client.playerSnapshotProfile(instanceId, summary.worldGuid, match.uid);
      setProfile(full);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [client, instanceId, playerUid, playerName]);

  useEffect(() => {
    if (entitled) void load();
  }, [entitled, load]);

  const refresh = async () => {
    if (!worldGuid) return;
    setError(null);
    try {
      await client.startSaveHealth(instanceId, worldGuid);
      setScanPhase("convert");
      // 輪詢到掃描結束,再重讀快照
      await new Promise<void>((resolve) => {
        const timer = setInterval(async () => {
          try {
            const s = await client.saveHealth(instanceId, worldGuid);
            setScanPhase(s.phase === "idle" ? null : s.phase);
            if (s.phase === "idle") {
              clearInterval(timer);
              if (s.error) setError(s.error);
              resolve();
            }
          } catch {
            /* 暫時性網路錯誤:下一輪再試 */
          }
        }, 2000);
      });
      await load();
    } catch (err) {
      setScanPhase(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  if (entitled === null) return null;

  return (
    <div className="border-t-2 border-line pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="inline-flex items-center gap-1.5 text-sm font-extrabold text-ink-muted">
          <FiSave className="size-4 text-pal" /> {t("存檔資料")}
          {generatedAt && (
            <span className="text-xs font-normal">
              {t("(掃描於 {when})", { when: new Date(generatedAt).toLocaleString() })}
            </span>
          )}
        </h3>
        {entitled && (
          <button
            className={`${btnGhost} inline-flex items-center gap-1.5`}
            onClick={() => void refresh()}
            disabled={!!scanPhase || !worldGuid}
          >
            <FiRefreshCw className={`size-3.5 ${scanPhase ? "animate-spin" : ""}`} />
            {scanPhase ? t("掃描存檔中…(依存檔大小可能需要幾分鐘)") : t("從存檔刷新")}
          </button>
        )}
      </div>

      {!entitled && (
        <div className="mt-2 inline-flex items-center gap-2 rounded-cute border-2 border-sun/40 bg-sun/10 px-3 py-2 text-xs font-bold text-sun">
          <FiLock className="size-4 shrink-0" />
          {t("這是贊助者先行版功能。到「設定 → 贊助者識別碼」輸入識別碼即可使用。")}
        </div>
      )}

      {entitled && (
        <>
          {error && <p className={`${errorCls} mt-2`}>{error}</p>}
          {!generatedAt && !scanPhase && (
            <p className="mt-2 text-[13px] text-ink-muted">
              {t("尚未掃描過存檔。點「從存檔刷新」建立快照:不依賴 PalDefender,離線玩家也查得到,並包含個體值與詞條。")}
            </p>
          )}
          {generatedAt && notFound && (
            <p className="mt-2 text-[13px] text-ink-muted">
              {t("快照裡找不到這位玩家(名稱或 UID 對不上)。掃描一次最新存檔試試。")}
            </p>
          )}
          {profile && (
            <div className="mt-3 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                <Info label={t("等級")} value={profile.level !== null ? `Lv.${profile.level}` : "—"} />
                <Info label={t("經驗值")} value={profile.exp?.toLocaleString() ?? "—"} />
                <Info label={t("公會")} value={profile.guildName || t("無")} />
                <Info
                  label={t("最後上線")}
                  value={
                    profile.lastOnlineDaysAgo === null
                      ? "—"
                      : profile.lastOnlineDaysAgo === 0
                        ? t("今天")
                        : t("{n} 天前", { n: profile.lastOnlineDaysAgo })
                  }
                />
              </div>
              <SavePalGrid pals={profile.pals} total={profile.palCount} gameData={gameData} />
            </div>
          )}
        </>
      )}
    </div>
  );
}

const SHOWN_PALS = 60;

function SavePalGrid({ pals, total, gameData }: { pals: SavePalRow[]; total: number; gameData: GameData | null }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? pals : pals.slice(0, SHOWN_PALS);
  return (
    <div>
      <h3 className="mb-2 inline-flex items-center gap-1.5 text-sm font-extrabold text-ink-muted">
        <FiZap className="size-4 text-pal" /> {t("名下帕魯")}({total})
      </h3>
      {total === 0 && <p className="text-[13px] text-ink-muted">{t("這位玩家名下沒有帕魯。")}</p>}
      <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-2">
        {shown.map((p, i) => {
          const speciesId = p.characterId.replace(/^BOSS_/i, "");
          const entity = gameData?.palById.get(p.characterId) ?? gameData?.palById.get(speciesId);
          return (
            <div key={`${p.characterId}-${i}`} className="rounded-xl border-2 border-line p-2">
              <div className="flex items-center gap-2">
                {entity?.icon ? (
                  <img src={palIconUrl(entity.icon)} alt="" className="size-9 shrink-0" />
                ) : (
                  <span className="size-9 shrink-0 rounded bg-card-soft" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-bold">
                    {p.nickname || (entity ? displayName(entity) : p.characterId)}
                    {p.isLucky && <span className="ml-1 text-amber-500">✦</span>}
                    {p.isBoss && (
                      <span className="ml-1 rounded bg-berry/15 px-1 text-[10px] font-extrabold text-berry">
                        {t("頭目")}
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {p.level !== null ? `Lv.${p.level}` : "—"}
                    {p.gender === "female" ? " ♀" : p.gender === "male" ? " ♂" : ""}
                    {p.rank > 1 && ` ★${p.rank - 1}`}
                  </p>
                </div>
              </div>
              {(p.talentHp !== null || p.passives.length > 0) && (
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {p.talentHp !== null && (
                    <span
                      className="rounded bg-card-soft px-1 py-0.5 text-[10px] font-bold text-ink-muted"
                      title={t("個體值:血量 / 攻擊 / 防禦(0-100)")}
                    >
                      IV {p.talentHp}/{p.talentShot ?? "?"}/{p.talentDefense ?? "?"}
                    </span>
                  )}
                  {p.passives.map((id) => {
                    const meta = gameData?.passiveById.get(id);
                    const bad = (meta?.rank ?? 0) < 0;
                    return (
                      <span
                        key={id}
                        className={`rounded px-1 py-0.5 text-[10px] font-bold ${
                          bad ? "bg-berry/10 text-berry" : "bg-grass/10 text-grass"
                        }`}
                      >
                        {meta ? displayName(meta) : id}
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {pals.length > SHOWN_PALS && !showAll && (
        <button className={`${btnGhost} mt-2`} onClick={() => setShowAll(true)}>
          {t("顯示全部 {n} 隻", { n: pals.length })}
        </button>
      )}
    </div>
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
        {detail.progression && <Info label={t("等級")} value={`Lv.${detail.progression.level}`} />}
        <Info label={t("隊伍帕魯")} value={String(detail.teamCount)} />
        <Info label={t("帕魯箱")} value={String(detail.palboxCount)} />
      </div>

      {detail.progression && <Progression prog={detail.progression} />}
      {detail.techs && (
        <div>
          <h3 className="mb-1 inline-flex items-center gap-1.5 text-sm font-extrabold text-ink-muted">
            <FiCpu className="size-4 text-pal" /> {t("已解鎖科技")}
          </h3>
          <p className="text-[13px]">
            {t("{n} / {total} 項", { n: detail.techs.unlockedCount, total: detail.techs.totalCount })}
          </p>
        </div>
      )}

      {team.length > 0 && <PalGroup title={t("隊伍")} pals={team} gameData={gameData} />}
      {palbox.length > 0 && <PalGroup title={t("帕魯箱")} pals={palbox} gameData={gameData} />}
      {detail.pals.length === 0 &&
        (detail.palsUnavailable ? (
          <p className="rounded-xl bg-sun/10 px-3 py-2 text-[13px] font-bold text-sun">
            {t("PalDefender 目前只支援讀取「線上」玩家的帕魯與背包;這位玩家離線中,請在他上線時再查看。")}
          </p>
        ) : (
          <p className="text-[13px] text-ink-muted">{t("沒有讀取到帕魯資料。")}</p>
        ))}

      <ItemList items={detail.items} gameData={gameData} unavailable={!!detail.itemsUnavailable} />
    </div>
  );
}

/** 進度概要:等級/經驗、科技點、頭目、捕捉(PalDefender /progression)。 */
function Progression({ prog }: { prog: NonNullable<PlayerDetail["progression"]> }) {
  const rows: [string, string][] = [
    [t("經驗值"), prog.exp.toLocaleString()],
    [t("未分配狀態點"), String(prog.unusedStatusPoints)],
    [t("科技點數"), String(prog.technologyPoints)],
    [t("古代科技點數"), String(prog.ancientTechnologyPoints)],
    [t("擊敗頭目"), String(prog.bossesDefeated)],
    [t("捕捉帕魯種類"), String(prog.palsCaptured)],
  ];
  return (
    <div>
      <h3 className="mb-2 inline-flex items-center gap-1.5 text-sm font-extrabold text-ink-muted">
        <FiTrendingUp className="size-4 text-pal" /> {t("進度")}
      </h3>
      <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
        {rows.map(([k, v]) => (
          <Info key={k} label={k} value={v} />
        ))}
      </div>
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
  unavailable,
}: {
  items: PlayerDetail["items"];
  gameData: GameData | null;
  unavailable?: boolean;
}) {
  if (items.length === 0) {
    return (
      <p className="text-[13px] text-ink-muted">
        {unavailable ? t("離線玩家的背包資料無法讀取(同上)。") : t("沒有讀取到背包資料。")}
      </p>
    );
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
