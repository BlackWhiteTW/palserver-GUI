# 下一版 release 草稿(尚未發布)

v2.2.1 已發布(2026-07-15:存檔深度整合大版本 —— 玩家/公會完整檔案(離線可查)、
存檔健檢、重灌伺服器、共玩存檔自動修復、世界設定 ini 同步、首頁進階顯示、
人類 NPC/研究目錄。完整清單見該版 RELEASE_NOTES 或 git log v2.1.1..v2.2.1)。
發版流程:bump 四個 package.json → 四語 RELEASE_NOTES → chore(release) commit → tag → push --tags。

## Features(自 v2.2.1 起)
- fix(console): 給予道具/帕魯下拉搜尋支援簡中(zhCN)與日文(ja)名稱比對(5b034ba)

## 待確認 / 需實機驗證(v2.1.1 遺留)
- 礦物圖層與公會成員定位:實機視覺確認(圓點密度/顏色分辨度、flyTo 縮放層級)。
- stats worker 已搬到新帳號(stats.iosoftware.ai);舊帳號 workers.dev 是轉發 proxy,不要刪。

## 待確認 / 需實機驗證(v2.1.0 遺留)
- Windows 實機:host-save-fix 修復後的存檔由遊戲實際載入(位元組級已與參考工具一致)、
  匯入存檔的 Windows 路徑輸入、DepotDownloader 真實輸出的進度解析、SEA 打包下的
  ooz-wasm 載入(oodle.ts 的 Function 轉換路徑)。
- 原生日誌擷取、不彈黑窗、日誌翻譯、世界設定 reconcile —— 皆需在 Windows 實機確認。
- 離線玩家詳情:實機上 /player 仍失敗,確認可用前不要在 notes 宣傳。
