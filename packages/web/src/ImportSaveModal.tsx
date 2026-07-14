import { useState } from "react";
import { FiAlertTriangle, FiArrowRight, FiDownload, FiSearch, FiX } from "react-icons/fi";
import type { ExternalWorldCandidate } from "@palserver/shared";
import type { AgentClient } from "./api";
import { t, useI18n } from "./i18n";
import { Overlay } from "./ui";
import { btn, btnGhost, card, inputCls } from "./ui";

/** 匯入來源類型 — 只影響引導文字,實際掃描/匯入邏輯三者相同
 *  (磁碟上都是「含 Level.sav 的世界資料夾」,見 docs/MIGRATION.md)。 */
type SourceKind = "dedicated" | "v1" | "coop";

const SOURCE_OPTIONS: { kind: SourceKind; label: string; hint: string }[] = [
  {
    kind: "dedicated",
    label: "其他專用伺服器",
    hint: "到舊伺服器的 Pal/Saved/SaveGames/0/ 找到世界資料夾(一串英數字 GUID),把它(或其任一上層目錄)的完整路徑貼到下面。",
  },
  {
    kind: "v1",
    label: "舊版 1.0 GUI",
    hint: "在 v1 介面按「開啟伺服器資料夾」,把那個伺服器目錄的路徑貼到下面。小提示:v1 伺服器在同一台機器時,也可以改用「建立伺服器」時填「既有伺服器路徑」直接原地收編,連搬都不用搬。",
  },
  {
    kind: "coop",
    label: "本機共玩存檔",
    hint: "本機(四人邀請碼)存檔在 %LOCALAPPDATA%\\Pal\\Saved\\SaveGames\\<SteamID>\\ 底下。注意:主機玩家的角色需要用社群工具 palworld-host-save-fix 轉換,否則進伺服器會被要求重建角色(帕魯與建築不受影響)。",
  },
];

/** 第一步:選出要匯入的世界。選好後交給 CreateDialog(建立伺服器 + 匯入)接手。 */
export function ImportSaveModal({
  client,
  onClose,
  onPicked,
}: {
  client: AgentClient;
  onClose: () => void;
  /** 使用者選定世界後呼叫 — App 會接著開「建立伺服器」對話框完成後續。 */
  onPicked: (world: ExternalWorldCandidate) => void;
}) {
  useI18n();
  const [kind, setKind] = useState<SourceKind>("dedicated");
  const [sourcePath, setSourcePath] = useState("");
  const [worlds, setWorlds] = useState<ExternalWorldCandidate[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickedWorld = worlds?.find((w) => w.path === picked) ?? null;

  const scan = async () => {
    setBusy(true);
    setError(null);
    setWorlds(null);
    setPicked(null);
    try {
      const r = await client.inspectImportSave(sourcePath.trim());
      setWorlds(r.worlds);
      if (r.worlds.length === 1) setPicked(r.worlds[0].path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const hint = SOURCE_OPTIONS.find((o) => o.kind === kind)?.hint ?? "";

  return (
    <Overlay onClose={onClose}>
      <div
        className={`${card} flex max-h-[86vh] w-160 max-w-full flex-col gap-3 overflow-auto`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-lg font-extrabold">
            <FiDownload className="size-5 text-pal" /> {t("匯入存檔")}
          </h2>
          <button className="text-ink-muted transition hover:text-ink" onClick={onClose} aria-label={t("關閉")}>
            <FiX className="size-5" />
          </button>
        </div>

        <p className="text-[13px] text-ink-muted">{t("選擇舊存檔,下一步會建立一台新伺服器並把它帶進去。")}</p>

        {/* 來源類型 */}
        <div className="flex flex-wrap gap-2">
          {SOURCE_OPTIONS.map((o) => (
            <button
              key={o.kind}
              type="button"
              className={`rounded-cute border-2 px-3 py-1.5 text-[13px] font-bold transition ${
                kind === o.kind ? "border-pal bg-pal/10 text-pal" : "border-line text-ink-muted hover:border-ink-muted"
              }`}
              onClick={() => setKind(o.kind)}
            >
              {t(o.label)}
            </button>
          ))}
        </div>
        <p className="text-[13px] leading-relaxed text-ink-muted">{t(hint)}</p>

        {/* 來源路徑 + 掃描 */}
        <div className="flex gap-2">
          <input
            className={`${inputCls} flex-1`}
            placeholder={t("貼上存檔所在的資料夾路徑(在跑 agent 的那台機器上)")}
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && sourcePath.trim()) void scan();
            }}
          />
          <button className={`${btnGhost} inline-flex items-center gap-1.5`} onClick={scan} disabled={busy || !sourcePath.trim()}>
            <FiSearch className="size-4" /> {busy ? t("掃描中…") : t("掃描")}
          </button>
        </div>

        {error && <p className="text-[13px] font-bold text-berry">{error}</p>}

        {/* 掃描結果 */}
        {worlds !== null && worlds.length === 0 && (
          <p className="text-[13px] text-ink-muted">
            {t("這個路徑下沒有找到世界存檔(含 Level.sav 的資料夾)。確認路徑指向存檔資料夾或其上層目錄。")}
          </p>
        )}
        {worlds !== null && worlds.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {worlds.map((w) => (
              <label
                key={w.path}
                className={`flex cursor-pointer items-center gap-3 rounded-cute border-2 px-3 py-2 transition ${
                  picked === w.path ? "border-pal bg-pal/5" : "border-line hover:border-ink-muted"
                }`}
              >
                <input type="radio" name="world" checked={picked === w.path} onChange={() => setPicked(w.path)} />
                <span className="flex-1">
                  <span className="block font-mono text-[13px] font-bold">{w.guid}</span>
                  <span className="block text-xs text-ink-muted">
                    {w.sizeMB} MB · {t("{n} 位玩家", { n: w.players })} · {new Date(w.lastModified).toLocaleString()}
                  </span>
                </span>
                {w.coopHost && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs font-bold text-amber-600">
                    <FiAlertTriangle className="size-3" /> {t("需修正主機角色")}
                  </span>
                )}
              </label>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          <button
            className={`${btn} inline-flex items-center gap-1.5`}
            onClick={() => pickedWorld && onPicked(pickedWorld)}
            disabled={!pickedWorld}
            data-testid="import-next"
          >
            {t("下一步:設定伺服器")} <FiArrowRight className="size-4" />
          </button>
          <button className={btnGhost} onClick={onClose}>
            {t("取消")}
          </button>
        </div>
      </div>
    </Overlay>
  );
}
