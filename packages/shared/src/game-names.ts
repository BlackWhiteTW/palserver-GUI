import { BOSS_NAME_POINTS, PAL_NAMES } from "./game-names.generated.js";
import { bossStateMapCoord, BOSS_MATCH_MAP_RADIUS } from "./boss-respawn.js";

/** bot / 事件通知的顯示語言。zh-TW = 繁中、zh-CN = 簡中。 */
export type BotLang = "en" | "ja" | "zh-TW" | "zh-CN";

export const BOT_LANGS: { value: BotLang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "ja", label: "日本語" },
  { value: "zh-TW", label: "繁體中文" },
  { value: "zh-CN", label: "简体中文" },
];

export const DEFAULT_BOT_LANG: BotLang = "en";

export function isBotLang(v: unknown): v is BotLang {
  return v === "en" || v === "ja" || v === "zh-TW" || v === "zh-CN";
}

/** 把遊戲 log 給的怕魯顯示名 / id 在地化成指定語言;查不到就原樣回傳(不同伺服器語言的 log 仍能顯示)。 */
export function localizePalName(raw: string, lang: BotLang): string {
  return PAL_NAMES[raw.trim().toLowerCase()]?.[lang] ?? raw;
}

/**
 * 用頭目 spawner 的世界座標配對可讀頭目名(比照地圖:世界座標→地圖座標→半徑內最近點)。
 * 找不到(未收錄 / 半徑外)回 null,呼叫端自行 fallback。
 */
export function localizeBossName(worldX: number, worldY: number, lang: BotLang): string | null {
  const c = bossStateMapCoord({ x: worldX, y: worldY });
  let best: { d: number; name: string } | null = null;
  for (const p of BOSS_NAME_POINTS) {
    const d = Math.hypot(p.x - c.x, p.y - c.y);
    if (d <= BOSS_MATCH_MAP_RADIUS && (!best || d < best.d)) best = { d, name: p.names[lang] };
  }
  return best?.name ?? null;
}
