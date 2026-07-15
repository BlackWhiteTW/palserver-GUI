# Handoff(2026-07-15,更新:存檔健檢 Stage 1 已實作)

## 存檔健檢(save-slim Stage 1)— 本次新增

- 實作規格:.claude/notes/save-slim-impl.md(含已查證的上游事實與 JSON 欄位路徑)。
- 已交付:palsav-tools.yml workflow、agent save-tools.ts/save-health.ts(+單元測試 3/3)、
  GET/POST /api/instances/:id/saves/health、web HealthCard(贊助鎖 save-slim)、三語 i18n。
- **接下來必做(依序)**:
  1. GitHub Actions 手動跑一次 `palsav-tools` workflow(預設 inputs 即可)→ 確認兩平台 build 綠、
     release `palsav-tools-v1` 有 palsav-win-x64.exe / palsav-linux-x64 / SHA256SUMS.txt。
     首跑風險點:Windows MSVC 編 palooz(workflow 已 patch GCC 旗標,理論上過)。
  2. Windows 測試機(Tailscale)真實世界存檔端到端:開始健檢 → 報告出現。
     **優先確認「離線天數」數字合理**(last_online_real_time ticks 時鐘基準是未實測假設,
     分析器對超出 0-3650 天的值回 null;若全是 null 或天數明顯錯,改 save-health.ts 的 EPOCH 換算)。
  3. mac dev 順眼確認卡片顯示「不支援」訊息而非壞掉。
- Stage 2(清理/寫回)未動,計畫在 .claude/notes/save-slim-plan.md。

## 本 session 完成(全部已 push)

- 授權伺服器搬遷收尾:secrets 已重設並驗證;端點 stats.iosoftware.ai,舊 workers.dev 是舊帳號上的轉發 proxy(見專案 memory `stats-worker-deployed`)。
- v2.1.1 已發版(release CI 全綠、8 資產)。
- 首頁進階顯示(贊助者,feature id `dashboard-stats`):總覽加總板塊 + 卡片六項資訊(佔位符對齊),玩家名單已移除、第六格為影格時間。
- 贊助功能改永久收費:features.ts 去除 until 機制;README×4 與 website 文案同步改。
- 地圖:礦物圖層(ores.json,scripts/fetch-map-ores.mjs 可重跑)、公會詳情帕魯頭像+在線成員點擊 flyTo。
- 效能三連(commit b818d6c):指令台「清理」分類(clearinv/deletepals/killnearestbase + hint 機制)、世界設定 8 鍵建議值提示(OptionMeta.hint)、mods 在 Linux/macOS 原生模式明講 UE4SS/PalDefender 僅 Windows。
- 研究筆記:.claude/notes/perf-research.md(效能六面向)、savetools-integration.md(Python 工具整合)、save-slim-plan.md(存檔瘦身計畫)。

## 下一步(新 session 建議從這裡接)

**存檔瘦身 Stage 1(唯讀健檢)** — 計畫在 .claude/notes/save-slim-plan.md,照做即可:
1. CI 凍結 palsav(GPL 隔離,比照 ooz-wasm 下載模式)。
2. agent save-tools.ts(參考 packages/agent/src/oodle.ts 的下載+SHA256 模式)。
3. 健檢卡 UI(贊助者鎖 `save-slim`,feature 記得加進 packages/shared/src/features.ts)。
4. 驗證要 Windows 實機真存檔(Mac 無法;使用者測試機走 Tailscale,見 memory)。

## 未完事項/注意

- 進階顯示、礦物圖層、公會定位、清理分類、設定提示:皆未實機視覺驗證(build/tsc 過了),使用者下次開 dev 順眼確認。
- v2.1.1 之後累積的未發版功能都記在 commit log;發版流程見 .claude/notes/next-release.md。
- BMC webhook 後台網址仍指舊 workers.dev(經 proxy 可用,不急)。
