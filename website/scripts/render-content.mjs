#!/usr/bin/env node
/**
 * 產生官網首圖 public/assets/<lang>/content.png(zh/en/ja 一致的高解析版)。
 * 把 hero 合成大圖改寫成 HTML/CSS + 各語言截圖 + mascot,用 playwright 的 chromium
 * 以 2x 渲染再縮回 1672x941,三語一次重出。改文案/版面就編這支重跑:
 *   node scripts/render-content.mjs           # 全部語言
 *   node scripts/render-content.mjs zh        # 單一語言
 */
import { chromium } from "playwright";
import { writeFile, unlink, rename } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const pexec = promisify(execFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ASSETS = path.resolve(HERE, "../public/assets");
const W = 1672, H = 941, SCALE = 2;

const URL = "github.com/io-software-ai/palserver-gui";
const LANGS = {
  zh: {
    headline: '最簡單的<br><span class="blue">Palworld</span><br>伺服器管理工具',
    tagline: "輕鬆管理伺服器,從開服到備份,一切盡在掌握。",
    badges: ["免費開源", "跨平台支援", "繁體中文介面"],
    features: [
      ["伺服器管理", "一鍵開服 / 停止 / 重啟"],
      ["玩家管理", "查看玩家 / 踢人 / 封鎖"],
      ["效能調校", "優化設定 / 效能分析"],
      ["存檔備份", "自動備份 / 還原存檔"],
      ["模組管理", "安裝 / 更新 / 管理"],
    ],
    footer: "開源專案,歡迎 Star 支持!",
  },
  "zh-CN": {
    headline: '最简单的<br><span class="blue">Palworld</span><br>服务器管理工具',
    tagline: "轻松管理服务器,从开服到备份,一切尽在掌握。",
    badges: ["免费开源", "跨平台支持", "简体中文界面"],
    features: [
      ["服务器管理", "一键开服 / 停止 / 重启"],
      ["玩家管理", "查看玩家 / 踢人 / 封禁"],
      ["性能调校", "优化设置 / 性能分析"],
      ["存档备份", "自动备份 / 还原存档"],
      ["模组管理", "安装 / 更新 / 管理"],
    ],
    footer: "开源项目,欢迎 Star 支持!",
  },
  en: {
    headline: 'The Simplest<br><span class="blue">Palworld</span> Server<br>Management Tool',
    tagline: "Easily manage your server, from launching to backups — everything under control.",
    badges: ["Free & Open Source", "Cross-Platform", "English Interface"],
    features: [
      ["Server Management", "Launch / Stop / Restart"],
      ["Player Management", "View / Kick / Ban"],
      ["Performance Tuning", "Optimize / Analyze"],
      ["Save Backups", "Auto Backup / Restore"],
      ["Mod Management", "Install / Update / Manage"],
    ],
    footer: "Open source — star us on GitHub!",
  },
  ja: {
    headline: '最も簡単な<br><span class="blue">Palworld</span><br>サーバー管理ツール',
    tagline: "サーバーを簡単に管理。起動からバックアップまで、すべて思いのままに。",
    badges: ["無料・オープンソース", "クロスプラットフォーム", "日本語インターフェース"],
    features: [
      ["サーバー管理", "起動 / 停止 / 再起動"],
      ["プレイヤー管理", "確認 / キック / BAN"],
      ["パフォーマンス調整", "最適化 / 性能分析"],
      ["セーブバックアップ", "自動保存 / 復元"],
      ["Mod 管理", "導入 / 更新 / 管理"],
    ],
    footer: "オープンソース、GitHub でスター応援を!",
  },
};

// Feather 風格 stroke 圖示(與 App 的 react-icons/fi 同調)。
const ICON = {
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20 15 15 0 0 1 0-20"/>',
  server: '<rect x="2" y="3" width="20" height="8" rx="2"/><rect x="2" y="13" width="20" height="8" rx="2"/><path d="M6 7h.01M6 17h.01"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15l4-5 3 3 5-7"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  puzzle: '<path d="M9 3a2 2 0 0 1 4 0c0 1 1 1 2 1h3v3c0 1 0 2 1 2a2 2 0 0 1 0 4c-1 0-1 1-1 2v3h-3c-1 0-2 0-2 1a2 2 0 0 1-4 0c0-1-1-1-2-1H4v-3c0-1 0-2-1-2a2 2 0 0 1 0-4c1 0 1-1 1-2V5h3c1 0 2 0 2-1z"/>',
  github: '<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/>',
  star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
};
const svg = (name, size, w, color) =>
  '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="' +
  color + '" stroke-width="' + (w || 2) + '" stroke-linecap="round" stroke-linejoin="round">' +
  ICON[name] + "</svg>";

const FEAT_ICONS = ["server", "users", "chart", "save", "puzzle"];
const BADGE_ICONS = ["gift", "monitor", "globe"];

function buildHtml(lang) {
  const d = LANGS[lang];
  const badges = d.badges
    .map((b, i) => '<span class="badge">' + svg(BADGE_ICONS[i], 20, 2, "#2f7bf6") + "<span>" + b + "</span></span>")
    .join("");
  const feats = d.features
    .map(
      (f, i) =>
        '<div class="feat">' + svg(FEAT_ICONS[i], 26, 2.1, "#2f7bf6") +
        '<div><div class="ft">' + f[0] + '</div><div class="fd">' + f[1] + "</div></div></div>",
    )
    .join("");
  // 截圖拼貼:用該語言的實際截圖,略帶旋轉與陰影。
  const shot = (file, cls) => '<img class="card ' + cls + '" src="' + lang + "/" + file + '" />';
  return (
    "<!doctype html><html><head><meta charset='utf-8'><style>" +
    "*{margin:0;padding:0;box-sizing:border-box}" +
    "body{font-family:'PingFang TC','Hiragino Sans','Noto Sans CJK JP','Noto Sans TC',-apple-system,sans-serif}" +
    ".canvas{width:" + W + "px;height:" + H + "px;position:relative;overflow:hidden;" +
    "background:radial-gradient(120% 80% at 88% -8%,#dbe9ff 0%,#eef5ff 34%,#f5fbf8 68%);}" +
    ".blob{position:absolute;border-radius:50%;filter:blur(2px);opacity:.55}" +
    ".b1{width:520px;height:520px;right:-160px;top:-200px;background:radial-gradient(#cfe0ff,transparent 70%)}" +
    ".b2{width:360px;height:360px;right:280px;top:-160px;background:radial-gradient(#d7f0e6,transparent 70%)}" +
    ".brand{position:absolute;left:58px;top:46px;display:flex;align-items:center;gap:13px}" +
    ".brand img{width:44px;height:44px;border-radius:12px}" +
    ".brand b{font-size:27px;font-weight:800;color:#12233d;letter-spacing:.3px}" +
    ".badges{position:absolute;right:56px;top:50px;display:flex;gap:12px}" +
    ".badge{display:inline-flex;align-items:center;gap:8px;background:#fff;border:1.5px solid #e4ecf7;" +
    "border-radius:999px;padding:10px 17px;font-size:15px;font-weight:700;color:#25384f;box-shadow:0 4px 14px rgba(30,60,120,.08)}" +
    ".left{position:absolute;left:60px;top:170px;width:558px}" +
    ".headline{font-size:58px;line-height:1.12;font-weight:900;color:#12233d;letter-spacing:.2px}" +
    ".headline .blue{color:#2f7bf6}" +
    ".tagline{margin-top:24px;font-size:19px;line-height:1.55;color:#52627a;font-weight:600;max-width:452px}" +
    ".card{position:absolute;border-radius:16px;box-shadow:0 24px 60px rgba(23,49,96,.20),0 4px 14px rgba(23,49,96,.10);" +
    "border:1px solid rgba(255,255,255,.7);object-fit:cover;object-position:top left;background:#fff}" +
    ".c1{width:648px;height:384px;left:642px;top:150px;transform:rotate(-1deg);z-index:3}" +
    ".c2{width:524px;height:250px;left:44px;top:556px;transform:rotate(1.5deg);z-index:2}" +
    ".c3{width:560px;height:300px;right:34px;top:150px;transform:rotate(2deg);z-index:2}" +
    ".c4{width:560px;height:300px;right:70px;top:428px;transform:rotate(-1.5deg);z-index:4}" +
    ".mascot{position:absolute;left:952px;top:398px;width:196px;z-index:5;filter:drop-shadow(0 12px 18px rgba(30,50,90,.28))}" +
    ".features{position:absolute;left:58px;right:56px;bottom:72px;display:grid;grid-template-columns:repeat(5,1fr);gap:14px;z-index:6}" +
    ".feat{display:flex;align-items:center;gap:12px;background:rgba(255,255,255,.9);border:1.5px solid #e6eef9;" +
    "border-radius:15px;padding:15px 16px;box-shadow:0 6px 18px rgba(30,60,120,.07)}" +
    ".ft{font-size:16.5px;font-weight:800;color:#152a45}" +
    ".fd{font-size:12.5px;color:#6a7a90;font-weight:600;margin-top:3px}" +
    ".footer{position:absolute;left:60px;bottom:28px;display:flex;align-items:center;gap:14px;z-index:6}" +
    ".footer .txt{font-size:15px;font-weight:700;color:#25384f}" +
    ".footer .url{font-size:14px;font-weight:700;color:#2f7bf6;background:#fff;border:1.5px solid #d9e6fb;" +
    "border-radius:999px;padding:7px 15px}" +
    "</style></head><body>" +
    "<div class='canvas'>" +
    "<div class='blob b1'></div><div class='blob b2'></div>" +
    "<div class='brand'><img src='logo.png'><b>palserver GUI</b></div>" +
    "<div class='badges'>" + badges + "</div>" +
    "<div class='left'><div class='headline'>" + d.headline + "</div>" +
    "<div class='tagline'>" + d.tagline + "</div></div>" +
    // 只用有真正各語言版本的截圖(engine/mods/login/announcement 只有中文,避免混語言)。
    shot("dashboard.jpg", "c1") + shot("overview.jpg", "c2") + shot("world.jpg", "c3") +
    shot("performance.jpg", "c4") +
    "<img class='mascot' src='mascot.webp'>" +
    "<div class='features'>" + feats + "</div>" +
    "<div class='footer'>" + svg("github", 26, 1.8, "#152a45") +
    "<span class='txt'>" + d.footer + "</span>" +
    "<span class='url'>" + URL + "</span></div>" +
    "</div></body></html>"
  );
}

async function main() {
  const only = process.argv[2];
  const langs = only ? [only] : Object.keys(LANGS);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: SCALE });
  for (const lang of langs) {
    const tmp = path.join(ASSETS, "_render.html");
    await writeFile(tmp, buildHtml(lang));
    await page.goto("file://" + tmp);
    await page.waitForLoadState("networkidle");
    const big = path.join(ASSETS, lang, "_content@2x.png");
    await page.locator(".canvas").screenshot({ path: big });
    // 縮回 1672 寬(維持與原檔同尺寸、且銳利)。
    const out = path.join(ASSETS, lang, "content.png");
    await pexec("sips", ["-z", String(H), String(W), big, "--out", out]);
    await unlink(big);
    await unlink(tmp);
    console.log("wrote", lang + "/content.png");
  }
  await browser.close();
}
main();
