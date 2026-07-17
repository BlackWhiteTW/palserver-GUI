import { useCallback, useEffect, useRef, useState } from "react";
import { FiTerminal, FiPlay, FiSearch, FiTrash2, FiStar, FiMapPin } from "react-icons/fi";
import { GiShield } from "react-icons/gi";
import {
  COMMAND_CATEGORY_LABELS,
  RELIC_TYPES,
  RELIC_TYPE_LABELS,
  buildCommand,
  type CommandArg,
  type CommandSpec,
  type KnownPlayer,
  type RconCommandsResponse,
} from "@palserver/shared";
import type { AgentClient } from "./api";
import { maskSteamIdsInText } from "./SteamId";
import { EntityPicker } from "./EntityPicker";
import { PlayerPicker } from "./PlayerPicker";
import { CustomPalModal } from "./CustomPalModal";
import { GiveItemsModal } from "./GiveItemsModal";
import { TeleportModal } from "./TeleportModal";
import { MapPickModal } from "./MapPickModal";
import { SHOW_SPONSOR_FEATURES } from "./flags";
import { useGameData, itemIconUrl, palIconUrl, technologyIconUrl, type GameData } from "./gameData";
import { t, useI18n } from "./i18n";
import { btn, btnGhost, card, errorCls, inputCls, labelCls } from "./ui";

interface LogEntry {
  command: string;
  output: string;
  failed: boolean;
}

/** 座標參數:可自由輸入 x y (z),也可「在地圖描點」用世界地圖選一個點填入。 */
function CoordField({
  arg,
  value,
  onChange,
}: {
  arg: CommandArg;
  value: string;
  onChange: (value: string) => void;
}) {
  useI18n();
  const [showMap, setShowMap] = useState(false);
  return (
    <label className={`${labelCls} min-w-0`}>
      {t(arg.label)}
      {!arg.required && <span className="font-normal">{t("(選填)")}</span>}
      <div className="flex items-center gap-2">
        <input
          className={`${inputCls} min-w-0 flex-1`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={arg.placeholder}
        />
        <button
          type="button"
          className={`${btnGhost} inline-flex shrink-0 items-center gap-1.5`}
          onClick={() => setShowMap(true)}
        >
          <FiMapPin className="size-4" /> {t("地圖描點")}
        </button>
      </div>
      {showMap && (
        <MapPickModal
          onClose={() => setShowMap(false)}
          onPick={(coords) => {
            onChange(coords);
            setShowMap(false);
          }}
        />
      )}
    </label>
  );
}

/** A command argument. `userid` arguments get a picker listing online players
 * and everyone the agent has seen before — commands like /unban target
 * players who are by definition not connected. Free text still works for
 * anyone the agent has never recorded.
 */
function ArgField({
  arg,
  roster,
  gameData,
  value,
  onChange,
}: {
  arg: CommandArg;
  roster: KnownPlayer[];
  gameData: GameData | null;
  value: string;
  onChange: (value: string) => void;
}) {
  useI18n();
  const isPlayerArg = !!arg.player || arg.name === "userid";

  // 座標參數:文字欄 + 「地圖描點」按鈕(自帶狀態,獨立成元件避免條件 hook)。
  if (arg.coord) return <CoordField arg={arg} value={value} onChange={onChange} />;

  // Item/Egg/Tech ids get an icon search picker backed by the catalogs.
  // eggid 只列帕魯蛋;techid 使用玩家科技目錄;itemid 才是全物品目錄。
  if ((arg.name === "itemid" || arg.name === "eggid" || arg.name === "techid") && gameData) {
    const isEgg = arg.name === "eggid";
    const isTech = arg.name === "techid";
    return (
      <label className={`${labelCls} min-w-0`}>
        {t(arg.label)}
        {!arg.required && <span className="font-normal">{t("(選填)")}</span>}
        <EntityPicker
          catalog={isEgg ? gameData.eggs : isTech ? gameData.technologies : gameData.items}
          iconUrl={isTech ? technologyIconUrl : itemIconUrl}
          value={value}
          onChange={onChange}
          placeholder={
            isEgg
              ? t("搜尋蛋名稱或輸入 ID…")
              : isTech
                ? t("搜尋科技名稱或輸入 ID…")
                : t("搜尋道具名稱或輸入 ID…")
          }
        />
      </label>
    );
  }
  if (arg.name === "palid" && gameData) {
    // BOSS(頭目)變體 = CharacterID 加 BOSS_ 前綴。勾選時只改「送出的值」,
    // EntityPicker 仍以基礎 id 顯示/搜尋(值本身就是狀態,不需要另外的 state)。
    const boss = value.startsWith("BOSS_");
    const bare = boss ? value.slice("BOSS_".length) : value;
    return (
      <div className="flex min-w-0 flex-col gap-1.5">
        <label className={`${labelCls} min-w-0`}>
          {t(arg.label)}
          {!arg.required && <span className="font-normal">{t("(選填)")}</span>}
          <EntityPicker
            catalog={gameData.pals}
            iconUrl={palIconUrl}
            value={bare}
            onChange={(v) => onChange(v && boss ? `BOSS_${v}` : v)}
            placeholder={t("搜尋帕魯名稱或輸入 ID…")}
          />
        </label>
        <label
          className={`inline-flex w-fit items-center gap-1.5 text-xs font-bold text-ink-muted ${
            bare ? "cursor-pointer" : "cursor-not-allowed opacity-50"
          }`}
        >
          <input
            type="checkbox"
            className="size-4 accent-pal"
            checked={boss}
            disabled={!bare}
            onChange={(e) => onChange(e.target.checked ? `BOSS_${bare}` : bare)}
          />
          {t("BOSS(頭目)版本")}
        </label>
      </div>
    );
  }

  // 遺物類型參數:下拉選單,選項來自 RELIC_TYPES。
  if (arg.relicType) {
    return (
      <label className={`${labelCls} min-w-0`}>
        {t(arg.label)}
        {!arg.required && <span className="font-normal">{t("(選填)")}</span>}
        <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">{t("選擇雕像類型…")}</option>
          {RELIC_TYPES.map((rt) => (
            <option key={rt} value={rt}>{t(RELIC_TYPE_LABELS[rt])}</option>
          ))}
        </select>
      </label>
    );
  }

  // Player args use the shared picker (name-only; never shows the SteamId).
  if (isPlayerArg) {
    return (
      <label className={`${labelCls} min-w-0`}>
        {t(arg.label)}
        {!arg.required && <span className="font-normal">{t("(選填)")}</span>}
        <PlayerPicker roster={roster} value={value} onChange={onChange} placeholder={arg.placeholder} />
      </label>
    );
  }

  return (
    <label className={`${labelCls} min-w-0`}>
      {t(arg.label)}
      {!arg.required && <span className="font-normal">{t("(選填)")}</span>}
      <input
        className={inputCls}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={arg.placeholder}
      />
    </label>
  );
}

export function ConsoleTab({
  client,
  instanceId,
  initialCommandName,
  initialValues,
}: {
  client: AgentClient;
  instanceId: string;
  /** 開啟時預選的指令名稱(例如從玩家詳情「玩家操作」跳來,預選 give / givepal)。 */
  initialCommandName?: string;
  /** 對應的預填參數(例如 { userid: "steam_..." })。 */
  initialValues?: Record<string, string>;
}) {
  useI18n();
  const [catalog, setCatalog] = useState<RconCommandsResponse | null>(null);
  const [selected, setSelected] = useState<CommandSpec | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [raw, setRaw] = useState("");
  const [log, setLog] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customPalMode, setCustomPalMode] = useState<null | "pal" | "egg">(null);
  const [showGiveItems, setShowGiveItems] = useState(false);
  const [showTeleport, setShowTeleport] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [roster, setRoster] = useState<KnownPlayer[]>([]);
  const gameData = useGameData();

  const load = useCallback(async () => {
    try {
      setCatalog(await client.rconCommands(instanceId));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [client, instanceId]);

  useEffect(() => {
    void load();
  }, [load]);

  // 若帶了預選指令(從玩家詳情跳來),指令目錄載入後套用一次:選好指令、預填參數。
  const presetApplied = useRef(false);
  useEffect(() => {
    if (presetApplied.current || !catalog?.available || !initialCommandName) return;
    const cmd = catalog.commands.find((c) => c.name === initialCommandName);
    if (cmd) {
      presetApplied.current = true;
      setSelected(cmd);
      if (initialValues) setValues(initialValues);
    }
  }, [catalog, initialCommandName, initialValues]);

  // The agent's roster (online + previously seen) feeds the UserId pickers.
  useEffect(() => {
    const poll = () =>
      client
        .knownPlayers(instanceId)
        .then(setRoster)
        .catch(() => setRoster([]));
    void poll();
    const timer = setInterval(poll, 15000);
    return () => clearInterval(timer);
  }, [client, instanceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [log]);

  // 選了指令 / 改了參數,就把組好的指令帶進「唯一」的輸入列(仍可手動改)。
  useEffect(() => {
    if (selected) setRaw(buildCommand(selected, values));
  }, [selected, values]);

  const run = async (command: string) => {
    setBusy(true);
    setError(null);
    try {
      // pgbroadcast 不走 RCON，改走 REST API 以支援中文
      if (command.startsWith("pgbroadcast ")) {
        const message = command.slice("pgbroadcast ".length);
        await client.announce(instanceId, message);
        setLog((prev) => [...prev.slice(-99), { command: message, output: t("已發送"), failed: false }]);
      } else {
        const res = await client.rconExec(instanceId, command);
        setLog((prev) => [...prev.slice(-99), { command, output: res.output || t("(無輸出)"), failed: false }]);
      }
    } catch (err) {
      let message = err instanceof Error ? err.message : String(err);
      // pgbroadcast 走 REST API，連不上時給具體提示
      if (
        command.startsWith("pgbroadcast ") &&
        (message.includes("ECONNREFUSED") ||
          message.includes("fetch failed") ||
          message.includes("Connection refused") ||
          message.includes("NetworkError"))
      ) {
        message = t("廣播失敗：請確認伺服器已啟用 REST API（預設埠 8212）");
      }
      setLog((prev) => [...prev.slice(-99), { command, output: message, failed: true }]);
    } finally {
      setBusy(false);
    }
  };

  // 唯一輸入列的送出:有選指令就先驗必填 / 危險確認,再執行輸入列裡的內容。
  const submitRaw = async (e: React.FormEvent) => {
    e.preventDefault();
    const command = raw.trim();
    if (!command) return;
    if (selected) {
      const missing = selected.args.filter((a) => a.required && !values[a.name]?.trim());
      if (missing.length > 0) {
        setError(t("缺少必填參數:{list}", { list: missing.map((a) => t(a.label)).join("、") }));
        return;
      }
      if (
        selected.dangerous &&
        !confirm(t("「{label}」是不可復原的操作。\n\n確定要執行 {command} 嗎?", { label: t(selected.label), command }))
      ) {
        return;
      }
    }
    await run(command);
  };

  if (!catalog)
    return (
      <div className="grid min-h-0 flex-1 place-items-center text-ink-muted">{error ?? t("載入中…")}</div>
    );

  if (!catalog.available) {
    return (
      <div className="grid min-h-0 flex-1 place-items-center px-6 text-center text-ink-muted">
        <div>
          <FiTerminal className="mx-auto mb-2 size-11" />
          <p className="font-bold">{t("RCON 無法使用")}</p>
          <p className="mt-1 text-[13px]">{catalog.reason}</p>
        </div>
      </div>
    );
  }

  const query = filter.trim().toLowerCase();
  const visible = catalog.commands.filter(
    (c) => !query || c.name.toLowerCase().includes(query) || c.label.includes(filter.trim()),
  );
  const grouped = new Map<string, CommandSpec[]>();
  for (const cmd of visible) {
    const key = t(COMMAND_CATEGORY_LABELS[cmd.category]);
    grouped.set(key, [...(grouped.get(key) ?? []), cmd]);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {error && <p className={`shrink-0 ${errorCls}`}>{error}</p>}

      <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="font-bold text-ink-muted">
          {t("{n} 個可用指令", { n: catalog.commands.length })}
        </span>
        {catalog.paldefender ? (
          <span className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-grass/40 bg-grass/15 px-2 py-0.5 font-bold text-grass">
            <GiShield className="size-3" /> {t("PalDefender 指令已啟用")}
          </span>
        ) : (
          <span className="text-ink-muted">{t("安裝 PalDefender 可解鎖更多指令")}</span>
        )}
      </div>

      <div className="grid min-h-0 flex-1 gap-3 sm:grid-cols-[220px_minmax(0,1fr)]">
        {/* 指令選單:搜尋 + 分類清單,自己捲動 */}
        <div className="flex min-h-0 flex-col gap-2 rounded-cute border-2 border-line p-2 max-sm:max-h-52">
          <div className="relative shrink-0">
            <FiSearch className="absolute top-2.5 left-3 size-4 text-ink-muted" />
            <input
              className={`${inputCls} w-full pl-9`}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder={t("搜尋指令…")}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {/* 贊助者專屬指令:混在清單裡跟其他分類一樣捲動,星星+title 標示。
                未公布前用 SHOW_SPONSOR_FEATURES 整組隱藏;點了跳彈窗,未解鎖時表單不可用。 */}
            {SHOW_SPONSOR_FEATURES && catalog.paldefender && (
              <div>
                <p className="mt-2 mb-1 px-1 text-xs font-extrabold text-ink-muted">{t("贊助者專屬")}</p>
                <div className="flex flex-col">
                  {([
                    { cmd: "givepal_j", desc: "自訂帕魯(詞條 / 體質 / 星星)", onClick: () => setCustomPalMode("pal" as const) },
                    { cmd: "giveegg_j", desc: "自訂帕魯蛋(詞條 / 體質 / 星星)", onClick: () => setCustomPalMode("egg" as const) },
                    { cmd: "giveitems", desc: "批量給予道具(選單 + 數量)", onClick: () => setShowGiveItems(true) },
                    { cmd: "tp", desc: "傳送玩家(玩家 / 地圖座標)", onClick: () => setShowTeleport(true) },
                  ] as const).map((x) => (
                    <button
                      key={x.cmd}
                      type="button"
                      className="rounded-lg px-2 py-1.5 text-left text-[13px] transition hover:bg-card-soft"
                      onClick={x.onClick}
                      title={t("贊助者專屬")}
                    >
                      <span className="inline-flex items-center gap-1 font-mono text-pal">
                        {x.cmd} <FiStar className="size-3" />
                      </span>
                      <span className="block text-xs text-ink-muted">{t(x.desc)}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {[...grouped.entries()].map(([category, cmds]) => (
              <div key={category}>
                <p className="mt-2 mb-1 px-1 text-xs font-extrabold text-ink-muted">{category}</p>
                <div className="flex flex-col">
                  {cmds.map((cmd) => (
                    <button
                      key={`${cmd.source}-${cmd.name}`}
                      className={`rounded-lg px-2 py-1.5 text-left text-[13px] transition hover:bg-card-soft ${
                        selected?.name === cmd.name ? "bg-card-soft font-extrabold text-pal" : ""
                      }`}
                      onClick={() => {
                        setSelected(cmd);
                        setValues({});
                        setError(null);
                      }}
                    >
                      <span className="font-mono">{cmd.name}</span>
                      {cmd.dangerous && <span className="ml-1.5 text-berry">{t("危險")}</span>}
                      <span className="block text-xs text-ink-muted">{t(cmd.label)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {visible.length === 0 && (
              <p className="px-1 text-[13px] text-ink-muted">{t("找不到符合的指令。")}</p>
            )}
          </div>
        </div>

        {/* 工作區:選定指令的參數 + 唯一輸入列 + 輸出(有內容才出現) */}
        <div className="flex min-h-0 flex-col gap-3">

          {selected && selected.args.length > 0 && (
            <div className="flex shrink-0 flex-col gap-3 rounded-cute border-2 border-line p-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="font-mono text-sm font-extrabold">{selected.name}</h3>
                <span className="rounded-full bg-card-soft px-2 py-0.5 text-xs text-ink-muted">
                  {selected.source === "builtin" ? t("內建") : "PalDefender"}
                </span>
                <p className="w-full text-[13px] text-ink-muted">{t(selected.label)}</p>
                {selected.hint && (
                  <p className="w-full text-xs text-ink-muted">{t(selected.hint)}</p>
                )}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {selected.args.map((arg) => (
                  <ArgField
                    key={arg.name}
                    arg={arg}
                    roster={roster}
                    gameData={gameData}
                    value={values[arg.name] ?? ""}
                    onChange={(value) => setValues((v) => ({ ...v, [arg.name]: value }))}
                  />
                ))}
              </div>
            </div>
          )}

          {/* 唯一的指令輸入列:選了指令會自動帶入,也可自己打 */}
          <form
            className="flex shrink-0 items-center gap-2 rounded-cute border-2 border-line px-3 py-2"
            onSubmit={submitRaw}
          >
            <FiTerminal className="size-4 shrink-0 text-ink-muted" />
            <input
              className="min-w-0 flex-1 bg-transparent font-mono text-sm outline-none"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              placeholder={t("輸入 RCON 指令,例如 ShowPlayers")}
            />
            <button
              className={`${btn} btn-sm inline-flex shrink-0 items-center gap-1.5`}
              disabled={busy || !raw.trim()}
            >
              <FiPlay className="size-3.5" /> {busy ? t("執行中…") : t("執行")}
            </button>
          </form>

          {/* 輸出:有跑過指令才顯示,撐滿剩餘高度 */}
          {log.length > 0 && (
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <div className="flex shrink-0 items-center justify-between">
                <h3 className="text-xs font-extrabold text-ink-muted">{t("輸出")}</h3>
                <button
                  className="text-ink-muted transition hover:text-berry"
                  onClick={() => setLog([])}
                  aria-label={t("清除輸出")}
                >
                  <FiTrash2 className="size-4" />
                </button>
              </div>
              <pre className="min-h-24 flex-1 overflow-auto rounded-xl bg-[#1c1927] p-3 font-mono text-xs whitespace-pre-wrap break-all text-[#cfd6df]">
                {log.map((entry, i) => (
                  <span key={i}>
                    <span className="text-[#7ec8f0]">&gt; {maskSteamIdsInText(entry.command)}</span>
                    {"\n"}
                    <span className={entry.failed ? "text-[#ef6a6a]" : undefined}>
                      {maskSteamIdsInText(entry.output)}
                    </span>
                    {"\n\n"}
                  </span>
                ))}
                <div ref={bottomRef} />
              </pre>
            </div>
          )}
        </div>
      </div>

      {customPalMode && (
        <CustomPalModal
          client={client}
          instanceId={instanceId}
          mode={customPalMode}
          onClose={() => setCustomPalMode(null)}
        />
      )}
      {showGiveItems && (
        <GiveItemsModal client={client} instanceId={instanceId} onClose={() => setShowGiveItems(false)} />
      )}
      {showTeleport && (
        <TeleportModal client={client} instanceId={instanceId} onClose={() => setShowTeleport(false)} />
      )}
    </div>
  );
}
