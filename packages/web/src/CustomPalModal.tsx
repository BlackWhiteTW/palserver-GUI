import { useEffect, useMemo, useState } from "react";
import { FiStar, FiLock, FiX, FiExternalLink } from "react-icons/fi";
import { GiEggClutch } from "react-icons/gi";
import type { CustomPalInput, KnownPlayer } from "@palserver/shared";
import type { AgentClient } from "./api";
import { EntityPicker } from "./EntityPicker";
import { MultiPicker } from "./MultiPicker";
import { PlayerPicker } from "./PlayerPicker";
import { useGameData, palIconUrl, itemIconUrl, type GameEntity } from "./gameData";
import { t, useI18n } from "./i18n";
import { Overlay, btn, card, errorCls, inputCls } from "./ui";

/** 主動技元素配色(沒對到的就用中性灰)。 */
const ELEMENT_COLOR: Record<string, string> = {
  Normal: "#b8b8b8",
  Fire: "#ef6a6a",
  Water: "#5aa9e6",
  Electricity: "#e8c34a",
  Grass: "#6fbf73",
  Dark: "#8a6fbf",
  Dragon: "#a06fbf",
  Ground: "#c08a5a",
  Ice: "#6fd0d6",
};

/** chip / 選單列前面的小標:主動技=元素色點,詞條=等級徽章。 */
const skillMeta = (e: GameEntity) => (
  <span
    className="size-2.5 shrink-0 rounded-full"
    style={{ background: ELEMENT_COLOR[e.element ?? "Normal"] ?? "#b8b8b8" }}
    title={e.element}
  />
);
const passiveMeta = (e: GameEntity) => {
  if (e.rank == null) return null;
  const bad = e.rank < 0;
  return (
    <span
      className={`shrink-0 rounded px-1 text-[10px] font-bold ${bad ? "bg-berry/15 text-berry" : "bg-grass/15 text-grass"}`}
    >
      {bad ? e.rank : `+${e.rank}`}
    </span>
  );
};

/** 數字輸入:空字串 -> undefined(交給 PalDefender 預設)。 */
function numOrUndef(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 自訂帕魯彈窗(贊助者先行版 custom-pal):詞條 / 體質 / 星星 / 靈魂 → PalDefender givepal_j。
 * 未解鎖時整個表單照樣顯示,但變灰、不可操作(右側不讓使用),並提示去設定頁輸入識別碼。
 */
export function CustomPalModal({
  client,
  instanceId,
  mode,
  onClose,
}: {
  client: AgentClient;
  instanceId: string;
  /** pal = givepal_j(給玩家);egg = giveegg_j(給帕魯蛋)。由開啟的那條指令決定。 */
  mode: "pal" | "egg";
  onClose: () => void;
}) {
  useI18n();
  const gameData = useGameData();
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [players, setPlayers] = useState<KnownPlayer[]>([]);

  const [userId, setUserId] = useState("");
  const [eggId, setEggId] = useState("");
  const [palId, setPalId] = useState("");
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<"" | "None" | "Male" | "Female">("");
  const [level, setLevel] = useState("");
  const [stars, setStars] = useState("");
  const [passives, setPassives] = useState<string[]>([]);
  const [skills, setSkills] = useState<string[]>([]);
  const [iv, setIv] = useState({ health: "", attackMelee: "", attackShot: "", defense: "" });
  const [souls, setSouls] = useState({ health: "", attack: "", defense: "", craftSpeed: "" });

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    client
      .license()
      .then((l) => setEntitled(l.features.includes("custom-pal")))
      .catch(() => setEntitled(false));
    client.knownPlayers(instanceId).then(setPlayers).catch(() => setPlayers([]));
  }, [client, instanceId]);

  const locked = entitled === false;
  const canSubmit = useMemo(
    () =>
      !locked &&
      palId.trim() !== "" &&
      userId.trim() !== "" &&
      (mode !== "egg" || eggId.trim() !== "") &&
      !busy,
    [locked, mode, eggId, userId, palId, busy],
  );

  const submit = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const input: CustomPalInput = {
      mode,
      palId: palId.trim(),
      userId: userId.trim(),
      ...(mode === "egg" ? { eggId: eggId.trim() } : {}),
      ...(nickname.trim() ? { nickname: nickname.trim() } : {}),
      ...(gender ? { gender } : {}),
      ...(numOrUndef(level) != null ? { level: numOrUndef(level) } : {}),
      ...(numOrUndef(stars) != null ? { condensedPals: numOrUndef(stars) } : {}),
      ...(passives.length ? { passives: passives.slice(0, 8) } : {}),
      ...(skills.length ? { activeSkills: skills.slice(0, 3) } : {}),
      ivs: {
        health: numOrUndef(iv.health),
        attackMelee: numOrUndef(iv.attackMelee),
        attackShot: numOrUndef(iv.attackShot),
        defense: numOrUndef(iv.defense),
      },
      souls: {
        health: numOrUndef(souls.health),
        attack: numOrUndef(souls.attack),
        defense: numOrUndef(souls.defense),
        craftSpeed: numOrUndef(souls.craftSpeed),
      },
    };
    try {
      const r = await client.giveCustomPal(instanceId, input);
      setResult(r.output || t("已送出"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const numField = (label: string, value: string, onChange: (v: string) => void, max: number) => (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-ink-muted">
      {label}
      <input
        className={inputCls}
        type="number"
        min={0}
        max={max}
        value={value}
        placeholder="—"
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );

  return (
    <Overlay onClose={onClose}>
      <div
        className={`${card} flex max-h-[86vh] w-160 max-w-full flex-col gap-3 overflow-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-lg font-extrabold">
            <GiEggClutch className="size-5 text-sky-500" />{" "}
            {mode === "egg" ? t("自訂帕魯蛋") : t("自訂帕魯")}
            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/10 px-2 py-0.5 text-xs font-bold text-sky-500">
              <FiStar className="size-3" /> {t("贊助者")}
            </span>
          </h2>
          <button className="text-ink-muted transition hover:text-ink" onClick={onClose} aria-label={t("關閉")}>
            <FiX className="size-5" />
          </button>
        </div>

        {locked && (
          <div className="inline-flex items-center gap-2 rounded-cute border-2 border-sun/40 bg-sun/10 px-3 py-2 text-xs font-bold text-sun">
            <FiLock className="size-4 shrink-0" />
            {t("這是贊助者先行版功能。到「設定 → 贊助者識別碼」輸入識別碼即可使用。")}
          </div>
        )}

        <p className="text-xs text-ink-muted">
          {t("透過 PalDefender 發一隻客製帕魯給玩家。留空的欄位會用預設。ID 可在")}{" "}
          <a className="text-pal" href="https://paldb.cc" target="_blank" rel="noreferrer">
            paldb.cc <FiExternalLink className="inline size-3" />
          </a>{" "}
          {t("查。")}
        </p>

        {/* 表單:未解鎖時整組變灰、不可操作 */}
        <div className={locked ? "pointer-events-none flex flex-col gap-3 opacity-55" : "flex flex-col gap-3"}>
          <div className="grid gap-2 sm:grid-cols-2">
            {/* 兩種模式都要指定玩家(egg 走 REST /give/paleggs/{userId})。 */}
            <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-ink-muted">
              {t("目標玩家")}
              <PlayerPicker roster={players} value={userId} onChange={setUserId} />
            </label>
            {mode === "egg" && (
              <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-ink-muted">
                {t("蛋 ID")}
                {gameData ? (
                  <EntityPicker
                    catalog={gameData.items}
                    iconUrl={itemIconUrl}
                    value={eggId}
                    onChange={setEggId}
                    placeholder={t("搜尋蛋名稱或輸入 ID…")}
                  />
                ) : (
                  <input
                    className={inputCls}
                    value={eggId}
                    placeholder="PalEgg_Ice_01"
                    onChange={(e) => setEggId(e.target.value)}
                  />
                )}
              </label>
            )}
            <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-ink-muted">
              {t("帕魯")}
              {gameData ? (
                <EntityPicker
                  catalog={gameData.pals}
                  iconUrl={palIconUrl}
                  value={palId}
                  onChange={setPalId}
                  placeholder={t("搜尋帕魯名稱或輸入 ID…")}
                />
              ) : (
                <input className={inputCls} value={palId} placeholder="Anubis" onChange={(e) => setPalId(e.target.value)} />
              )}
            </label>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-ink-muted sm:col-span-2">
              {t("暱稱")}
              <input className={inputCls} value={nickname} onChange={(e) => setNickname(e.target.value)} />
            </label>
            <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-ink-muted">
              {t("性別")}
              <select className={inputCls} value={gender} onChange={(e) => setGender(e.target.value as typeof gender)}>
                <option value="">{t("預設")}</option>
                <option value="None">None</option>
                <option value="Male">{t("公")}</option>
                <option value="Female">{t("母")}</option>
              </select>
            </label>
            {numField(t("等級"), level, setLevel, 100)}
          </div>

          <div className="flex min-w-0 flex-col gap-1 text-xs font-bold text-ink-muted">
            {t("詞條 / 被動(最多 8)")}
            <MultiPicker
              catalog={gameData?.passives ?? []}
              value={passives}
              onChange={setPassives}
              max={8}
              placeholder={t("搜尋詞條名稱或輸入 ID…")}
              renderMeta={passiveMeta}
            />
          </div>
          <div className="flex min-w-0 flex-col gap-1 text-xs font-bold text-ink-muted">
            {t("主動技(最多 3)")}
            <MultiPicker
              catalog={gameData?.activeSkills ?? []}
              value={skills}
              onChange={setSkills}
              max={3}
              placeholder={t("搜尋主動技名稱或輸入 ID…")}
              renderMeta={skillMeta}
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-bold text-ink-muted">{t("體質 / IV(0–255)")}</p>
            <div className="grid gap-2 sm:grid-cols-4">
              {numField(t("血量"), iv.health, (v) => setIv({ ...iv, health: v }), 255)}
              {numField(t("近攻"), iv.attackMelee, (v) => setIv({ ...iv, attackMelee: v }), 255)}
              {numField(t("遠攻"), iv.attackShot, (v) => setIv({ ...iv, attackShot: v }), 255)}
              {numField(t("防禦"), iv.defense, (v) => setIv({ ...iv, defense: v }), 255)}
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-4">
            {numField(t("星星 / 濃縮(0–4)"), stars, setStars, 4)}
          </div>

          <div>
            <p className="mb-1 text-xs font-bold text-ink-muted">{t("靈魂強化(0–20)")}</p>
            <div className="grid gap-2 sm:grid-cols-4">
              {numField(t("血量"), souls.health, (v) => setSouls({ ...souls, health: v }), 20)}
              {numField(t("攻擊"), souls.attack, (v) => setSouls({ ...souls, attack: v }), 20)}
              {numField(t("防禦"), souls.defense, (v) => setSouls({ ...souls, defense: v }), 20)}
              {numField(t("製作速度"), souls.craftSpeed, (v) => setSouls({ ...souls, craftSpeed: v }), 20)}
            </div>
          </div>
        </div>

        {error && <p className={errorCls}>{error}</p>}
        {result && <p className="rounded-xl bg-grass/10 px-3 py-2 font-mono text-xs text-grass">{result}</p>}

        <button
          className={`${btn} inline-flex w-fit shrink-0 items-center gap-1.5`}
          onClick={submit}
          disabled={!canSubmit}
        >
          <GiEggClutch className="size-4" />{" "}
          {busy ? t("發送中…") : mode === "egg" ? t("給予帕魯蛋") : t("給予帕魯")}
        </button>
      </div>
    </Overlay>
  );
}
