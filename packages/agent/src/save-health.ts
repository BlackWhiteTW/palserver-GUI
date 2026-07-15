import fs from "node:fs";
import type { Readable } from "node:stream";
import { parserStream } from "stream-json";
import type { Token } from "stream-json/parser.js";
import type { SaveHealthCounts, SaveHealthPlayerRow } from "@palserver/shared";

/**
 * Level.sav JSON(palsav convert --to-json 的輸出)串流分析器。
 *
 * 大型世界的 JSON 可能有數 GB,V8 的字串上限與記憶體都吃不下 JSON.parse ——
 * 所以走 token 級串流:自維護 path stack,只在「單一元素」(一個公會、一個容器)
 * 的粒度累積臨時狀態,任何 Section 都不整棵組回記憶體。
 *
 * 欄位路徑依據上游 palsav(pin 2c8c65c)的 diag.py 與 rawdata/group.py,
 * 詳見 .claude/notes/save-slim-impl.md 第 1 節。
 */

export interface LevelJsonAnalysis {
  counts: SaveHealthCounts;
  inactivePlayers: SaveHealthPlayerRow[];
  emptyGuildNames: string[];
}

/** FDateTime ticks(100ns,自 0001-01-01)→ Unix epoch 的偏移。 */
const EPOCH_TICKS = 621_355_968_000_000_000;
const TICKS_PER_DAY = 864_000_000_000;
/** 換算出的離線天數超出這個範圍就視為時鐘基準不符,回報 null(不硬湊)。 */
const MAX_PLAUSIBLE_DAYS = 3650;

const INACTIVE_DAYS = 30;
const MAX_INACTIVE_ROWS = 100;
const MAX_EMPTY_GUILD_NAMES = 50;

const GUILD_TYPE = "EPalGroupType::Guild";

type Section =
  | "CharacterSaveParameterMap"
  | "GroupSaveDataMap"
  | "ItemContainerSaveData"
  | "CharacterContainerSaveData"
  | "MapObjectSaveData"
  | "DynamicItemSaveData";

const SECTIONS = new Set<string>([
  "CharacterSaveParameterMap",
  "GroupSaveDataMap",
  "ItemContainerSaveData",
  "CharacterContainerSaveData",
  "MapObjectSaveData",
  "DynamicItemSaveData",
]);

interface RosterEntry {
  uid?: string;
  name?: string;
  ticks?: number;
}

/** 正在掃描中的單一 Section 元素(同一時間最多一個,JSON 是線性的)。 */
interface ElementCtx {
  section: Section;
  /** 元素物件展開當下的 path 深度,用來配對它的 endObject 與計算相對路徑。 */
  depth: number;
  isPlayer?: boolean;
  groupType?: string;
  guildName?: string;
  roster?: Map<number, RosterEntry>;
  slotNum?: number;
  hasItem?: boolean;
  mapObjectId?: string;
}

class Analyzer {
  private readonly path: (string | number)[] = [];
  private readonly containers: ("obj" | "arr")[] = [];
  private readonly arrIndex: number[] = [];
  private pendingKey: string | null = null;
  private elem: ElementCtx | null = null;

  readonly counts: SaveHealthCounts = {
    players: 0,
    playersInactive30d: 0,
    pals: 0,
    guilds: 0,
    guildsEmpty: 0,
    itemContainers: 0,
    itemContainersEmpty: 0,
    itemSlots: 0,
    charContainers: 0,
    mapObjects: 0,
    dropItems: 0,
    dynamicItems: 0,
  };
  readonly emptyGuildNames: string[] = [];
  /** uid → 名冊資料(跨公會取最近一次上線)。 */
  readonly playersSeen = new Map<string, { name: string; guildName: string; ticks: number }>();
  private charEntries = 0;

  /** 值開始:把自己在容器裡的位置(key 或 array index)推進 path。 */
  private beginValue(): void {
    const top = this.containers[this.containers.length - 1];
    if (top === "obj") {
      this.path.push(this.pendingKey ?? "");
      this.pendingKey = null;
    } else if (top === "arr") {
      this.path.push(this.arrIndex[this.arrIndex.length - 1]++);
    }
    // 根值:path 不推東西
  }

  private endValue(): void {
    if (this.containers.length > 0 || this.path.length > 0) this.path.pop();
  }

  token(t: Token): void {
    switch (t.name) {
      case "keyValue":
        this.pendingKey = t.value;
        break;
      case "startObject":
        this.beginValue();
        this.maybeStartElement();
        this.containers.push("obj");
        break;
      case "endObject":
        this.containers.pop();
        this.maybeEndElement();
        this.endValue();
        break;
      case "startArray":
        this.beginValue();
        this.containers.push("arr");
        this.arrIndex.push(0);
        break;
      case "endArray":
        this.containers.pop();
        this.arrIndex.pop();
        this.endValue();
        break;
      case "stringValue":
      case "numberValue":
      case "trueValue":
      case "falseValue":
      case "nullValue":
        this.beginValue();
        this.scalar(t);
        this.endValue();
        break;
      default:
        break; // stringChunk 等串流 token 已用 streamValues:false 關掉
    }
  }

  /** Section 元素形狀:properties.worldSaveData.value.<S>.value[i](Map 型)
   *  或 properties.worldSaveData.value.<S>.value.values[i](Array 型)。
   *  兩種都註冊,實際只會出現其中一種。 */
  private maybeStartElement(): void {
    const p = this.path;
    const isWorldPrefix =
      p[0] === "properties" && p[1] === "worldSaveData" && p[2] === "value" && p[4] === "value";
    if (!isWorldPrefix || typeof p[3] !== "string" || !SECTIONS.has(p[3])) return;
    const mapShape = p.length === 6 && typeof p[5] === "number";
    const arrShape = p.length === 7 && p[5] === "values" && typeof p[6] === "number";
    if (!mapShape && !arrShape) return;
    this.elem = { section: p[3] as Section, depth: p.length };
  }

  private maybeEndElement(): void {
    const e = this.elem;
    if (!e || this.path.length !== e.depth) return;
    this.elem = null;
    const c = this.counts;
    switch (e.section) {
      case "CharacterSaveParameterMap":
        this.charEntries += 1;
        if (e.isPlayer) c.players += 1;
        c.pals = this.charEntries - c.players;
        break;
      case "GroupSaveDataMap": {
        if (e.groupType !== GUILD_TYPE) break;
        c.guilds += 1;
        const roster = e.roster ? [...e.roster.values()] : [];
        if (roster.length === 0) {
          c.guildsEmpty += 1;
          if (this.emptyGuildNames.length < MAX_EMPTY_GUILD_NAMES) {
            this.emptyGuildNames.push(e.guildName || "(未命名公會)");
          }
          break;
        }
        for (const m of roster) {
          if (!m.uid) continue;
          const prev = this.playersSeen.get(m.uid);
          const ticks = m.ticks ?? 0;
          if (!prev || ticks > prev.ticks) {
            this.playersSeen.set(m.uid, {
              name: m.name || prev?.name || "?",
              guildName: e.guildName || "?",
              ticks,
            });
          }
        }
        break;
      }
      case "ItemContainerSaveData":
        c.itemContainers += 1;
        c.itemSlots += e.slotNum ?? 0;
        if (!e.hasItem) c.itemContainersEmpty += 1;
        break;
      case "CharacterContainerSaveData":
        c.charContainers += 1;
        break;
      case "MapObjectSaveData":
        c.mapObjects += 1;
        if (e.mapObjectId && /dropitem/i.test(e.mapObjectId)) c.dropItems += 1;
        break;
      case "DynamicItemSaveData":
        c.dynamicItems += 1;
        break;
    }
  }

  private scalar(t: Token & { value?: unknown }): void {
    const e = this.elem;
    if (!e) return;
    const rel = this.path.slice(e.depth);
    const last = rel[rel.length - 1];
    const prev = rel[rel.length - 2];
    switch (e.section) {
      case "CharacterSaveParameterMap":
        if (prev === "IsPlayer" && last === "value" && t.name === "trueValue") e.isPlayer = true;
        break;
      case "GroupSaveDataMap": {
        if (last === "group_type" && t.name === "stringValue") {
          e.groupType = t.value as string;
          break;
        }
        if (last === "guild_name" && t.name === "stringValue") {
          e.guildName = t.value as string;
          break;
        }
        const i = rel.lastIndexOf("players");
        if (i >= 0 && typeof rel[i + 1] === "number") {
          e.roster ??= new Map();
          const idx = rel[i + 1] as number;
          const entry = e.roster.get(idx) ?? {};
          if (last === "player_uid" && t.name === "stringValue") entry.uid = t.value as string;
          else if (last === "player_name" && t.name === "stringValue") entry.name = t.value as string;
          else if (last === "last_online_real_time" && t.name === "numberValue") {
            entry.ticks = Number(t.value);
          }
          // 無關欄位也 set:roster 的元素數 = 名冊人數,欄位缺漏不影響計數
          e.roster.set(idx, entry);
        }
        break;
      }
      case "ItemContainerSaveData":
        if (prev === "SlotNum" && last === "value" && t.name === "numberValue") {
          e.slotNum = Number(t.value);
        } else if (last === "static_id" && t.name === "stringValue") {
          const v = t.value as string;
          if (v && v !== "None") e.hasItem = true;
        }
        break;
      case "MapObjectSaveData":
        if (prev === "MapObjectId" && last === "value" && t.name === "stringValue") {
          e.mapObjectId ??= t.value as string;
        }
        break;
      default:
        break;
    }
  }

  /** 串流讀完後,把名冊換算成離線天數並排序。 */
  finish(levelSavMtimeMs: number): LevelJsonAnalysis {
    const nowTicks = levelSavMtimeMs * 10_000 + EPOCH_TICKS;
    const rows: SaveHealthPlayerRow[] = [];
    for (const [uid, p] of this.playersSeen) {
      let days: number | null = null;
      if (p.ticks > 0) {
        const d = (nowTicks - p.ticks) / TICKS_PER_DAY;
        if (d >= 0 && d <= MAX_PLAUSIBLE_DAYS) days = Math.floor(d);
      }
      if (days !== null && days >= INACTIVE_DAYS) {
        rows.push({ name: p.name, uid, lastOnlineDaysAgo: days, guildName: p.guildName });
      }
    }
    rows.sort((a, b) => (b.lastOnlineDaysAgo ?? 0) - (a.lastOnlineDaysAgo ?? 0));
    this.counts.playersInactive30d = rows.length;
    return {
      counts: this.counts,
      inactivePlayers: rows.slice(0, MAX_INACTIVE_ROWS),
      emptyGuildNames: this.emptyGuildNames,
    };
  }
}

/** 從任意 Readable(JSON 文字)分析 — 測試用這個入口餵合成資料。 */
export function analyzeLevelJsonStream(
  source: Readable,
  levelSavMtimeMs: number,
): Promise<LevelJsonAnalysis> {
  return new Promise((resolve, reject) => {
    const analyzer = new Analyzer();
    const parser = parserStream({ packValues: true, streamValues: false });
    parser.on("data", (t: Token) => analyzer.token(t));
    parser.on("end", () => resolve(analyzer.finish(levelSavMtimeMs)));
    parser.on("error", (err: Error) => reject(new Error(`存檔 JSON 解析失敗:${err.message}`)));
    source.on("error", (err: NodeJS.ErrnoException) => reject(err));
    source.pipe(parser);
  });
}

/** 從檔案分析,回報讀取進度(0-100)。 */
export async function analyzeLevelJsonFile(
  jsonPath: string,
  levelSavMtimeMs: number,
  onProgress?: (pct: number) => void,
): Promise<LevelJsonAnalysis> {
  const total = fs.statSync(jsonPath).size;
  let seen = 0;
  const stream = fs.createReadStream(jsonPath);
  if (onProgress && total > 0) {
    stream.on("data", (chunk) => {
      seen += chunk.length;
      onProgress(Math.min(99, Math.round((seen / total) * 100)));
    });
  }
  return analyzeLevelJsonStream(stream, levelSavMtimeMs);
}
