import { useEffect, useState } from "react";
import { FiChevronDown } from "react-icons/fi";

/**
 * i18n:中(zh-TW,原文)/ 英 / 日。
 *
 * 設計:程式碼裡的字串一律寫中文原文,t() 拿原文當 key 查字典;en/ja 字典是
 * public/i18n/{en,ja}.json 的「中文 → 譯文」對照表,查不到就顯示中文原文,
 * 所以漏翻不會壞版面。插值用 {名稱} 佔位,例:t("第 {n} 天", { n })。
 *
 * 字典載入比照 promoConfig 三層:
 *  1. localStorage 快取(上次抓到的遠端版)先上,離線也有最新已知譯文;
 *  2. 同源 bundled 檔(/i18n/xx.json)墊底;
 *  3. 背景抓 GitHub raw(source of truth),抓到有變就更新快取 + 重繪 ——
 *     翻譯檔改了不用重新出版,使用者下次載入就拿到。
 */

export type Lang = "zh" | "en" | "ja";

export const LANG_LABELS: Record<Lang, string> = {
  zh: "中文",
  en: "English",
  ja: "日本語",
};

const KEY = "palserver.lang";
const DICT_CACHE_PREFIX = "palserver.i18n.";
const LOCAL_BASE = "/i18n/";
const REMOTE_BASE =
  "https://raw.githubusercontent.com/Wadoekeani/palserver-gui/main/packages/web/public/i18n/";

type Dict = Record<string, string>;

function detectLang(): Lang {
  try {
    const stored = localStorage.getItem(KEY);
    if (stored === "zh" || stored === "en" || stored === "ja") return stored;
  } catch {
    /* ignore */
  }
  const nav = (navigator.language || "").toLowerCase();
  if (nav.startsWith("zh")) return "zh";
  if (nav.startsWith("ja")) return "ja";
  return "en";
}

let lang: Lang = detectLang();
const dicts: Partial<Record<Lang, Dict>> = {};
const loaded = new Set<Lang>(); // 這個 session 已經跑過載入流程的語言
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

function readDictCache(l: Lang): Dict | null {
  try {
    return JSON.parse(localStorage.getItem(DICT_CACHE_PREFIX + l) ?? "null");
  } catch {
    return null;
  }
}

async function loadDict(l: Lang): Promise<void> {
  if (l === "zh" || loaded.has(l)) return;
  loaded.add(l);
  const cached = readDictCache(l);
  if (cached) {
    dicts[l] = cached;
    notify();
  }
  // bundled 墊底(沒有快取才需要,有快取時快取一定不比 bundled 舊)
  if (!cached) {
    try {
      const res = await fetch(`${LOCAL_BASE}${l}.json`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        dicts[l] = (await res.json()) as Dict;
        notify();
      }
    } catch {
      /* 沒有 bundled 檔就先用原文 */
    }
  }
  // 遠端(GitHub)為準,抓到有變才更新
  try {
    const res = await fetch(`${REMOTE_BASE}${l}.json`, {
      cache: "no-cache",
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) {
      const remote = (await res.json()) as Dict;
      if (JSON.stringify(remote) !== JSON.stringify(dicts[l] ?? null)) {
        dicts[l] = remote;
        try {
          localStorage.setItem(DICT_CACHE_PREFIX + l, JSON.stringify(remote));
        } catch {
          /* 存不進去就下次再抓 */
        }
        notify();
      }
    }
  } catch {
    /* 離線就用現有的 */
  }
}

export function getLang(): Lang {
  return lang;
}

export function setLang(next: Lang): void {
  if (next === lang) return;
  lang = next;
  try {
    localStorage.setItem(KEY, next);
  } catch {
    /* 無痕模式等存不進去就只作用當次 */
  }
  document.documentElement.lang = next === "zh" ? "zh-TW" : next;
  void loadDict(next);
  notify();
}

/** 翻譯:原文(中文)→ 目前語言;插值 {k} 以 params[k] 代入。 */
export function t(source: string, params?: Record<string, string | number>): string {
  let out = (lang !== "zh" && dicts[lang]?.[source]) || source;
  if (params) {
    for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(String(v));
  }
  return out;
}

/** React 入口:訂閱語言/字典變化,回傳 t 與目前語言。 */
export function useI18n(): { lang: Lang; setLang: (l: Lang) => void; t: typeof t } {
  const [, bump] = useState(0);
  useEffect(() => {
    const l = () => bump((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return { lang, setLang, t };
}

/** 啟動:套 <html lang> 並預載目前語言的字典(main.tsx 掛載前呼叫)。 */
export function initI18n(): void {
  document.documentElement.lang = lang === "zh" ? "zh-TW" : lang;
  void loadDict(lang);
}

/** header 上的語言下拉選單(樣式比照 ghost 按鈕)。原生箭頭位置各瀏覽器
 * 不一,改用 appearance-none + 自繪箭頭,右側留出舒服的間距。 */
export function LangSelect() {
  const { lang: current, setLang: set } = useI18n();
  return (
    <span className="relative inline-flex">
      <select
        className="appearance-none rounded-full border-2 border-line bg-card-soft py-2 pr-10 pl-4 text-sm font-extrabold text-ink outline-none transition hover:border-pal"
        value={current}
        onChange={(e) => set(e.target.value as Lang)}
        aria-label="Language"
      >
        {(Object.keys(LANG_LABELS) as Lang[]).map((l) => (
          <option key={l} value={l}>
            {LANG_LABELS[l]}
          </option>
        ))}
      </select>
      <FiChevronDown className="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-ink-muted" />
    </span>
  );
}
