export const locales = ['zh', 'zh-CN', 'en', 'ja'] as const;
export type Locale = (typeof locales)[number];

/** 預設語言:網站以繁中為主。「/」會依瀏覽器語言導向對應語系。 */
export const defaultLocale: Locale = 'zh';

export function isLocale(x: string): x is Locale {
  return (locales as readonly string[]).includes(x);
}

/** <html lang> 用的 BCP-47 標記。 */
export const htmlLang: Record<Locale, string> = { zh: 'zh-Hant', 'zh-CN': 'zh-Hans', en: 'en', ja: 'ja' };

/** Open Graph 的 locale。 */
export const ogLocale: Record<Locale, string> = { zh: 'zh_TW', 'zh-CN': 'zh_CN', en: 'en_US', ja: 'ja_JP' };

/** 語言切換器顯示的名稱。 */
export const localeName: Record<Locale, string> = { zh: '中文', 'zh-CN': '简体中文', en: 'English', ja: '日本語' };

/** hreflang alternates:各語系網址 + x-default。 */
export const alternateLanguages: Record<string, string> = {
  'zh-Hant': '/zh/',
  'zh-Hans': '/zh-CN/',
  en: '/en/',
  ja: '/ja/',
  'x-default': '/',
};
