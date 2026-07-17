import type { WorldSettings } from "./index.js";

/**
 * 玩法預設檔(建立伺服器精靈的「玩法」步驟用)。
 * 仿 ENGINE_PRESETS 範式:label/description 給人看,values 直接併進建立時的 settings;
 * 建立後一切仍可在「世界設定」逐項微調,preset 只是起跑點,不是鎖定。
 * 原文 zh-TW(i18n 慣例:程式碼寫繁中原文,字典檔對照其他語言)。
 */
export interface WorldPreset {
  id: "official" | "casual" | "hardcore";
  label: string;
  /** 一句話說明(顯示在選項卡上) */
  description: string;
  /** 給新手看的重點變化(顯示為小標籤;official 為空) */
  highlights: string[];
  values: Partial<WorldSettings>;
}

export const WORLD_PRESETS: WorldPreset[] = [
  {
    id: "official",
    label: "官方標準",
    description: "與官方伺服器相同的原汁原味體驗,拿不定主意選這個就對了。",
    highlights: [],
    values: {},
  },
  {
    id: "casual",
    label: "輕鬆休閒",
    description: "適合新手與時間不多的島主:成長更快、素材更多、死亡不掉裝備。",
    highlights: ["經驗 2 倍", "掉落 2 倍", "捕捉更容易", "孵蛋更快", "死亡只掉道具"],
    values: {
      ExpRate: 2,
      PalCaptureRate: 1.5,
      CollectionDropRate: 2,
      EnemyDropItemRate: 2,
      PalEggDefaultHatchingTime: 24,
      DeathPenalty: "Item",
    },
  },
  {
    id: "hardcore",
    label: "硬核挑戰",
    description: "給想要刺激的老手:成長更慢、敵人更痛、死亡掉光全部家當。",
    highlights: ["經驗 0.7 倍", "受到傷害 1.5 倍", "帕魯更多", "死亡全掉落"],
    values: {
      ExpRate: 0.7,
      PlayerDamageRateDefense: 1.5,
      PalSpawnNumRate: 1.2,
      DeathPenalty: "All",
    },
  },
];
