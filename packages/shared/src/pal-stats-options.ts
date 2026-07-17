/**
 * 帕魯物種數值編輯器(贊助者先行版 pal-stats):透過 PalSchema 的 raw DataTable
 * patch 修改 `DT_PalMonsterParameter` 的物種基礎數值。
 *
 * 欄位鍵名以實際 uasset dump 交叉驗證(見 .claude/notes/palschema-datatable-fields.md),
 * 唯一陷阱:捕獲率倍率的原始鍵是 `CaptureRateCorrect`(不是 `CaptureRate`)。
 *
 * 這裡是唯一真相來源 —— zod 驗證、agent 的 raw JSON 白名單、web 表單都由這張表推導。
 */

export const PAL_STATS_TABLE = "DT_PalMonsterParameter";

export type PalStatType = "int" | "float";
export type PalStatCategory = "combat" | "utility" | "movement" | "work";

export interface PalStatMeta {
  /** DataTable 欄位的**確切鍵名**(大小寫敏感)。 */
  key: string;
  type: PalStatType;
  label: string;
  min: number;
  max: number;
  step?: number;
  hint?: string;
  category: PalStatCategory;
}

/** key = 我們對外用的識別名(=DataTable 欄位鍵名,保持一致以免多一層對照)。 */
export const PAL_STAT_OPTIONS = {
  Hp: { key: "Hp", type: "int", min: 1, max: 1_000_000, category: "combat", label: "生命 (HP)",
    hint: "物種基礎生命值。首領版(Boss_)是獨立資料列,可單獨調整。" },
  MeleeAttack: { key: "MeleeAttack", type: "int", min: 1, max: 100_000, category: "combat", label: "近戰攻擊" },
  ShotAttack: { key: "ShotAttack", type: "int", min: 1, max: 100_000, category: "combat", label: "遠程攻擊" },
  Defense: { key: "Defense", type: "int", min: 1, max: 100_000, category: "combat", label: "防禦" },
  Support: { key: "Support", type: "int", min: 1, max: 100_000, category: "combat", label: "支援" },
  CraftSpeed: { key: "CraftSpeed", type: "int", min: 0, max: 100_000, category: "utility", label: "製作速度" },
  CaptureRateCorrect: { key: "CaptureRateCorrect", type: "float", min: 0, max: 20, step: 0.05,
    category: "utility", label: "捕獲率倍率",
    hint: "倍率(一般 0.1~1.0),越低越難捕捉。首領通常較低。" },
  WalkSpeed: { key: "WalkSpeed", type: "int", min: 0, max: 10_000, category: "movement", label: "步行速度" },
  RunSpeed: { key: "RunSpeed", type: "int", min: 0, max: 10_000, category: "movement", label: "奔跑速度" },
  RideSprintSpeed: { key: "RideSprintSpeed", type: "int", min: 0, max: 10_000, category: "movement", label: "騎乘衝刺速度" },
  // 工作適性:0 = 不會做;遊戲改版後部分帕魯可到 Lv6,上限給寬到 10。
  // 鍵名全數經 uasset dump 驗證(.claude/notes/palschema-datatable-fields.md)。
  WorkSuitability_EmitFlame: { key: "WorkSuitability_EmitFlame", type: "int", min: 0, max: 10, category: "work", label: "生火" },
  WorkSuitability_Watering: { key: "WorkSuitability_Watering", type: "int", min: 0, max: 10, category: "work", label: "澆水" },
  WorkSuitability_Seeding: { key: "WorkSuitability_Seeding", type: "int", min: 0, max: 10, category: "work", label: "播種" },
  WorkSuitability_GenerateElectricity: { key: "WorkSuitability_GenerateElectricity", type: "int", min: 0, max: 10, category: "work", label: "發電" },
  WorkSuitability_Handcraft: { key: "WorkSuitability_Handcraft", type: "int", min: 0, max: 10, category: "work", label: "手工" },
  WorkSuitability_Collection: { key: "WorkSuitability_Collection", type: "int", min: 0, max: 10, category: "work", label: "採集" },
  WorkSuitability_Deforest: { key: "WorkSuitability_Deforest", type: "int", min: 0, max: 10, category: "work", label: "伐木" },
  WorkSuitability_Mining: { key: "WorkSuitability_Mining", type: "int", min: 0, max: 10, category: "work", label: "採礦" },
  WorkSuitability_OilExtraction: { key: "WorkSuitability_OilExtraction", type: "int", min: 0, max: 10, category: "work", label: "採油",
    hint: "paldb 未顯示此欄位,原版值多為 0;是否實際生效請以遊戲內為準。" },
  WorkSuitability_ProduceMedicine: { key: "WorkSuitability_ProduceMedicine", type: "int", min: 0, max: 10, category: "work", label: "製藥" },
  WorkSuitability_Cool: { key: "WorkSuitability_Cool", type: "int", min: 0, max: 10, category: "work", label: "冷卻" },
  WorkSuitability_Transport: { key: "WorkSuitability_Transport", type: "int", min: 0, max: 10, category: "work", label: "搬運" },
  WorkSuitability_MonsterFarm: { key: "WorkSuitability_MonsterFarm", type: "int", min: 0, max: 10, category: "work", label: "牧場" },
} as const satisfies Record<string, PalStatMeta>;

export type PalStatKey = keyof typeof PAL_STAT_OPTIONS;
export type PalStatValues = Partial<Record<PalStatKey, number>>;

export const PAL_STAT_KEYS = Object.keys(PAL_STAT_OPTIONS) as PalStatKey[];

export const PAL_STAT_CATEGORY_LABELS: Record<PalStatCategory, string> = {
  combat: "戰鬥",
  utility: "工具 / 捕獲",
  movement: "移動",
  work: "工作適性",
};

/**
 * 物種變體 = DataTable 裡的獨立資料列。row 名 = 前綴 + 帕魯內部 id(pals.json 的 id,
 * 如 Anubis / FlameBuffalo)。首領(Boss_)是獨立列,編輯它不會動到普通版。
 * 註:Boss_ 的大小寫在不同帕魯上不一致(Boss_ / BOSS_),此處採較常見的 Boss_;
 * 寫錯 row 名在 PalSchema 只是無效(不套用),不會損壞存檔。
 */
export const PAL_ROW_VARIANTS = [
  { id: "normal", label: "普通", prefix: "" },
  { id: "boss", label: "首領 / Alpha", prefix: "Boss_" },
  { id: "gym", label: "高塔首領", prefix: "GYM_" },
] as const;

export type PalRowVariantId = (typeof PAL_ROW_VARIANTS)[number]["id"];

/** 組出 DataTable 的 row 名。palId 需為 pals.json 的 id(內部物種代碼)。 */
export function palRowName(palId: string, variant: PalRowVariantId): string {
  const v = PAL_ROW_VARIANTS.find((x) => x.id === variant) ?? PAL_ROW_VARIANTS[0];
  return v.prefix + palId;
}

/* ── agent ↔ web API 型別 ── */

/** PalSchema(含其相依 UE4SS)的安裝狀態。 */
export interface PalSchemaStatus {
  /** false 時 reason 說明(非 native、伺服器未安裝…)。 */
  supported: boolean;
  reason?: string;
  /** PalSchema 所需的 UE4SS(Okaetsu experimental-palworld 版)是否在位。 */
  ue4ss: boolean;
  /** PalSchema 本體是否已安裝。 */
  installed: boolean;
  /** 我們安裝時記錄的版本(release tag);未由本 GUI 安裝時為 null。 */
  version: string | null;
  /** PalSchema 的 enableAutoReload 是否已開(開了 → 運行中改數值即熱重載)。
   *  舊版 agent 沒有此欄位。 */
  autoReload?: boolean;
}

/** 我們的 PalSchema mod 目前管理的一列數值。 */
export interface PalStatsRow {
  /** DataTable row 名,如 Anubis / Boss_Anubis。 */
  row: string;
  values: PalStatValues;
}

/** GET /pal-stats 回應:安裝狀態 + 目前已寫入的各列數值。 */
export interface PalStatsStatus {
  supported: boolean;
  reason?: string;
  schema: PalSchemaStatus;
  rows: PalStatsRow[];
}
