import { useEffect, useMemo, useState } from "react";
import { FiStar, FiLock, FiExternalLink } from "react-icons/fi";
import { GiEggClutch } from "react-icons/gi";
import type { CustomPalInput, KnownPlayer } from "@palserver/shared";
import type { AgentClient } from "./api";
import { t, useI18n } from "./i18n";
import { btn, card, errorCls, inputCls } from "./ui";

/** 逗號/空白分隔 -> 去空白陣列。 */
const splitIds = (s: string) =>
  s
    .split(/[,\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);

/** 數字輸入:空字串 -> undefined(交給 PalDefender 預設)。 */
function numOrUndef(v: string): number | undefined {
  if (v.trim() === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * 自訂帕魯(贊助者先行版 custom-pal):填詞條 / 體質 / 星星 / 靈魂 → PalDefender givepal_j。
 * 未解鎖時顯示「贊助者限定」提示;沒裝 PalDefender / 非原生時後端會擋。
 */
export function CustomPalCard({ client, instanceId }: { client: AgentClient; instanceId: string }) {
  useI18n();
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [players, setPlayers] = useState<KnownPlayer[]>([]);

  const [userId, setUserId] = useState("");
  const [palId, setPalId] = useState("");
  const [nickname, setNickname] = useState("");
  const [gender, setGender] = useState<"" | "None" | "Male" | "Female">("");
  const [level, setLevel] = useState("");
  const [stars, setStars] = useState("");
  const [passives, setPassives] = useState("");
  const [skills, setSkills] = useState("");
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

  const canSubmit = useMemo(() => userId.trim() !== "" && palId.trim() !== "" && !busy, [userId, palId, busy]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    setResult(null);
    const input: CustomPalInput = {
      userId: userId.trim(),
      palId: palId.trim(),
      ...(nickname.trim() ? { nickname: nickname.trim() } : {}),
      ...(gender ? { gender } : {}),
      ...(numOrUndef(level) != null ? { level: numOrUndef(level) } : {}),
      ...(numOrUndef(stars) != null ? { condensedPals: numOrUndef(stars) } : {}),
      ...(splitIds(passives).length ? { passives: splitIds(passives).slice(0, 8) } : {}),
      ...(splitIds(skills).length ? { activeSkills: splitIds(skills).slice(0, 3) } : {}),
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

  if (entitled === null) return null;

  const header = (
    <h3 className="inline-flex items-center gap-2 text-sm font-extrabold">
      <GiEggClutch className="size-4 text-pal" /> {t("自訂帕魯")}
      <span className="inline-flex items-center gap-1 rounded-full bg-pal/10 px-2 py-0.5 text-xs font-bold text-pal">
        <FiStar className="size-3" /> {t("贊助者")}
      </span>
    </h3>
  );

  if (!entitled) {
    return (
      <div className={`${card} flex flex-col gap-2`}>
        {header}
        <p className="inline-flex items-center gap-2 text-xs text-ink-muted">
          <FiLock className="size-3.5" />
          {t("這是贊助者先行版功能。到「設定 → 贊助者識別碼」輸入識別碼即可解鎖。")}
        </p>
      </div>
    );
  }

  const numField = (label: string, value: string, onChange: (v: string) => void, max: number) => (
    <label className="flex flex-col gap-1 text-xs font-bold text-ink-muted">
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
    <div className={`${card} flex flex-col gap-3`}>
      {header}
      <p className="text-xs text-ink-muted">
        {t("透過 PalDefender 發一隻客製帕魯給玩家。留空的欄位會用預設。ID 可在")}{" "}
        <a className="text-pal" href="https://paldb.cc" target="_blank" rel="noreferrer">
          paldb.cc <FiExternalLink className="inline size-3" />
        </a>{" "}
        {t("查。")}
      </p>

      <div className="grid gap-2 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs font-bold text-ink-muted">
          {t("目標玩家")}
          {players.length > 0 ? (
            <select className={inputCls} value={userId} onChange={(e) => setUserId(e.target.value)}>
              <option value="">{t("選擇玩家…")}</option>
              {players.map((p) => (
                <option key={p.userId} value={p.userId}>
                  {p.name || p.accountName || p.userId} {p.online ? "· ●" : ""}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={inputCls}
              value={userId}
              placeholder="steam_7650..."
              onChange={(e) => setUserId(e.target.value)}
            />
          )}
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-ink-muted">
          {t("帕魯 ID")}
          <input className={inputCls} value={palId} placeholder="Anubis" onChange={(e) => setPalId(e.target.value)} />
        </label>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        <label className="flex flex-col gap-1 text-xs font-bold text-ink-muted sm:col-span-2">
          {t("暱稱")}
          <input className={inputCls} value={nickname} onChange={(e) => setNickname(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold text-ink-muted">
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

      <label className="flex flex-col gap-1 text-xs font-bold text-ink-muted">
        {t("詞條 / 被動(ID,逗號分隔,最多 8)")}
        <input className={inputCls} value={passives} placeholder="Legend, CraftSpeed_up3" onChange={(e) => setPassives(e.target.value)} />
      </label>
      <label className="flex flex-col gap-1 text-xs font-bold text-ink-muted">
        {t("主動技(ID,逗號分隔,最多 3)")}
        <input className={inputCls} value={skills} placeholder="SandTornado, RockLance" onChange={(e) => setSkills(e.target.value)} />
      </label>

      <div>
        <p className="mb-1 text-xs font-bold text-ink-muted">{t("體質 / IV(0–255)")}</p>
        <div className="grid gap-2 sm:grid-cols-4">
          {numField(t("血量"), iv.health, (v) => setIv({ ...iv, health: v }), 255)}
          {numField(t("近攻"), iv.attackMelee, (v) => setIv({ ...iv, attackMelee: v }), 255)}
          {numField(t("遠攻"), iv.attackShot, (v) => setIv({ ...iv, attackShot: v }), 255)}
          {numField(t("防禦"), iv.defense, (v) => setIv({ ...iv, defense: v }), 255)}
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
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

      {error && <p className={errorCls}>{error}</p>}
      {result && (
        <p className="rounded-xl bg-grass/10 px-3 py-2 font-mono text-xs text-grass">{result}</p>
      )}

      <button className={`${btn} inline-flex w-fit items-center gap-1.5`} onClick={submit} disabled={!canSubmit}>
        <GiEggClutch className="size-4" /> {busy ? t("發送中…") : t("給予帕魯")}
      </button>
    </div>
  );
}
