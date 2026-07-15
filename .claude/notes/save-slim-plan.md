# 存檔瘦身(save-slim)實作計畫

依據:.claude/notes/savetools-integration.md(整合研究)、perf-research.md(效能研究)。
狀態:2026-07-15 計畫定稿,尚未實作。贊助者限定(feature id 建議 `save-slim`)。

## 架構決策:伺服器端(agent host)處理,不做玩家端

| | 伺服器端(agent) | 玩家端(瀏覽器) |
|---|---|---|
| 存檔位置 | 就在 agent 主機(native/docker host FS;k8s 有 kubectl tar 通道) | 要把數百 MB 世界檔下載→處理→回傳,Tailscale 遠端管理時更慢 |
| Python/Oodle | 凍結執行檔下載一次即可(平台可控:win/linux) | Pyodide 無法跑 palooz(原生 C++ binding,無 wasm build)→ **新版 PlM 存檔直接不支援,致命** |
| 配套 | 停服檢查/強制備份/贊助閘門/排程全部現成 | 全部要重做 |
| 結論 | **採用** | 不可行 |

## 上游現實(整合研究關鍵發現)

- 頂層 repo 是 MIT,但實際能解新版存檔的 `src/palsav`(palsav-flex)與 Oodle binding `palooz` 是 **GPL-3.0** → 比照 ooz-wasm 模式:**不隨包發行**,執行期從 GitHub Releases 下載 + SHA-256 驗證 + 子行程呼叫,授權隔離。
- cheahjs/palworld-save-tools(PyPI)已停更(2024-10)、不支援 PlM,**不要用**。
- palsav-flex 有乾淨 CLI/library(`palsav Level.sav --to-json` 等),但**清理邏輯(刪空公會/不活躍玩家)耦合在 PySide6 GUI 裡**,要自己 port(讀 JSON→過濾→寫回)。
- palooz 未發佈 wheel(本地路徑相依原生擴充)→ uv/embeddable python 路線等於要使用者有 C++ 工具鏈,不可行;**唯一可行:自家 CI 用 PyInstaller 凍結 palsav 成單一執行檔**(win/linux 兩平台),放 GitHub Releases。

## 分段交付(v1 唯讀,v2 才寫回)

**Stage 1 — 存檔健檢(唯讀,零壞檔風險)**
1. 新 repo 或本 repo 加 workflow:clone PalworldSaveTools → PyInstaller 凍結 `src/palsav` → release 資產 `palsav-win.exe`/`palsav-linux` + SHA256。
2. agent 新模組 `save-tools.ts`:比照 oodle.ts 的下載+驗證模式,子行程呼叫 palsav 把 Level.sav 轉 JSON(大檔→暫存檔,不進記憶體)。
3. 健檢分析(TS 端,讀 JSON):存檔組成大小、空公會數、離線 N 天玩家數、已搜刮容器殘留量、掉落物數。
4. UI:存檔分頁加「存檔健檢」卡(贊助者鎖 `save-slim`),顯示分析結果。
5. 驗證:Windows 實機用真實世界存檔跑(Mac 沒有可用存檔與 PalServer)。

**Stage 2 — 瘦身(寫回,高風險,健檢驗證後才做)**
6. port 清理邏輯(空公會/孤兒資料/容器殘留),寫回 GVAS→壓縮(palsav 走 zlib 寫回即可,遊戲吃)。
7. 流程強制:停服 → createBackup → 瘦身 → 健檢 diff 報告 → 使用者確認後才覆蓋。
8. Windows 實機:瘦身後存檔由遊戲實際載入驗證(至少三個不同世界)。

## 風險與注意

- 寫回類操作是全專案風險最高的功能:任何一步都要先備份、預設不覆蓋原檔。
- 凍結執行檔要跟上游更新:palsav-flex 更新頻繁(研究時前一天才 push),CI 用 pinned commit,升級走手動 bump。
- macOS agent(開發用)可不支援,UI 顯示「僅 Windows/Linux」。
