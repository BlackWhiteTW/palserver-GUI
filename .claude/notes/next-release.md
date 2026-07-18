# 下一版 release 草稿(尚未發布)

## 頭目重生時間(贊助 feature `boss-respawn`,2026-07-18)
- feat:新分頁「頭目重生」——安裝純伺服器端 UE4SS Lua 模組 `PalserverBossReporter`,每 15s 輪詢頭目 spawner 死活,寫 `Pal/Saved/palserver-boss-state.json`;agent 讀檔、web 拿 `bosses.json` 全 90 隻野外頭目做座標一對一配對,顯示死活 / 重生倒數(預設 60 分,實測到連續一輪後改用實測值)。玩家端不需安裝。安裝流程照 PalStatsTab(gating→ModInstallCard→清單),缺 UE4SS 自動裝標準版。
- 對抗式審查已修 8 項:①座標配對改一對一 greedy(避免 Lyleen/Lyleen Noct 等 <60 單位鄰居誤配)②uninstall 一併刪狀態檔(防重裝復活舊時間)③實測重生間隔加觀測連續性守衛(卸載空窗不灌水)④風險警告登記進 DISMISSIBLE_WARNINGS(可從設定恢復)⑤bosses.json 載入前不顯示 counts 摘要 ⑥loadPrevState 逐物件解析、相容舊格式 ⑦三態還原 null≠已擊殺。
- **待實機驗證(Windows 測試機 + 真玩家)**:UE4SS 安裝路徑實效、模組回報實際落檔、真玩家打頭目的活→死→活轉變、座標配對命中率(mapdata vs 實際 spawner 偏差)。目前僅 mock 三態(鎖定/未裝/已裝)playwright 截圖 + 純函式單元測試(shared 15 + agent 70 全過)。
- 可調參數:`BOSS_MATCH_MAP_RADIUS=60`(配對半徑)、`DEFAULT_BOSS_RESPAWN_SECONDS=3600`、`CONTINUITY_SEC=45`(Lua 連續性門檻)。地城頭目(DungeonSaveData)日後可另做。

v2.5.0 已發布(2026-07-19:兩個贊助者新功能 —— 公開地圖(服主一鍵把伺服器地圖公開成全網唯讀連結、
細項隱私設定、viewer 對齊管理員地圖呈現+官網品牌外框+四語、部署到 stats worker + Zeabur /map)、
配種計算(PalCalc,PR#43 UCKETX,存檔掃全服帕魯算最短配種路線);pals.json 補屋久島 12 物種;
分頁顯示修正(反作弊 tab、新分頁預設隱藏);官網下載按鈕依平台直連+更新日誌頁。
**頭目重生時間已 commit 但用 SHOW_BOSS_RESPAWN=false 隱藏,本版不對外開放**(見下方,待 Windows 驗證))。

v2.4.1 已發布(2026-07-18:玩家頁改 WebSocket 推播 PR#39(LilaS-tw,含審查後 4 修:新鮮 rec/刪除收攤/輪詢兜底/錯誤字串化);反作弊插件 tab 消失修復(PalDefender 已安裝→分頁預設顯示))。

v2.4.0 已發布(2026-07-18:新手開服重設計/邀請朋友三選一/分頁拖曳+管理面板/
帕魯數值大升級(原版值+工作適性+熱重載)/模組停用不刪檔+新版偵測/出事說人話/
自動備份+開機自啟+立即停止/Wine+K8s(PR#36)/配置健檢;修更新後 404、CPU 亂跳。
隱藏功能:快速傳送全開(SHOW_FAST_TRAVEL_UNLOCK=false,待 Windows 驗證)。
Windows 待驗:PalDefender 停用實效、PalSchema 資料夾停用實效、熱重載 dedicated 實效、
開機自啟 Run key、立即停止實測)。

v2.3.0 已發布(2026-07-16:排行榜/伺服器大事/圖鑑完成度/世界樹地圖+三圖層/
每日多時刻重啟(贊助 daily-restart)/BOSS 帕魯/簡中完整在地化;修排程重啟停擺、
存檔掃描等級/IV(ByteProperty+重複實體+預設值)、REST 埠 1:1+跨協定撞埠。
docker 既有實例需 stop→remove→start 一次)。
v2.2.6 已發布(2026-07-15:彙整 2.2.4–2.2.6 更新失敗修復包,notes 涵蓋 DD 自我修復/清場/診斷尾段/停止時清場)。v2.2.4 同日(DD 損毀自我修復)。v2.2.3 同日(立即更新常駐)。v2.2.2 同日(hotfix:重灌 EPERM/名稱埠同步/簡中搜尋)。v2.2.1 同日發布(存檔深度整合大版本 —— 玩家/公會完整檔案(離線可查)、
存檔健檢、重灌伺服器、共玩存檔自動修復、世界設定 ini 同步、首頁進階顯示、
人類 NPC/研究目錄。完整清單見該版 RELEASE_NOTES 或 git log v2.1.1..v2.2.1)。
發版流程:bump 四個 package.json → 四語 RELEASE_NOTES → chore(release) commit → tag → push --tags。

## Features(自 v2.2.6 起)
- **排行榜分頁**(贊助 feature `leaderboard`):等級/財富/圖鑑收集/最強帕魯/公會五榜+
  「與上次掃描相比」變化報告;資料來自健檢掃描統計歷史(save-stats-history.json,每世界 60 筆)。
- **圖鑑收集完成度**(玩家詳情,沿用 save-slim 鎖):玩家 .sav RecordData 的
  PaldeckUnlockFlag ∪ PalCaptureCount,完成度進度條。
  **待實機驗證**:Windows 真實存檔掃一次,確認圖鑑數/榜單數字合理(mac 無法掃)。
- 自動重啟遊戲內倒數公告 i18n(儲存重啟設定時以介面語言存模板)。
- PR #32(BlackWhiteTW):遺物指令 RelicType 參數、自訂帕魯濃縮計算、UE4SS 測試版下載、等級上限、地圖 Z 軸與多國語系修正。
- PR #29(teps3105,closes #26):REST 埠 1:1 映射(docker 不再用 ephemeral port)、
  建立/複製實例自動分配 REST 埠、世界設定 PUT 補 REST/RCON 撞埠檢查、
  native 改設定即時寫回 ini。**升級注意:既有 docker 實例要 stop→remove→start 一次**。
- PR #18(UCKETX,fixes #31):簡中全面校對(442 條 UI 字串+目錄譯名升級為人工欄位 "zh-CN")、
  下拉搜尋支援簡中名稱、MIGRATION.zh-CN.md。合併時已整合 main 的日文搜尋/六目錄/永久贊助文案;
  抓取腳本改為不覆寫人工 "zh-CN" 欄位。

## 待確認 / 需實機驗證(v2.1.1 遺留)
- 礦物圖層與公會成員定位:實機視覺確認(圓點密度/顏色分辨度、flyTo 縮放層級)。
- stats worker 已搬到新帳號(stats.iosoftware.ai);舊帳號 workers.dev 是轉發 proxy,不要刪。

## 待確認 / 需實機驗證(v2.1.0 遺留)
- Windows 實機:host-save-fix 修復後的存檔由遊戲實際載入(位元組級已與參考工具一致)、
  匯入存檔的 Windows 路徑輸入、DepotDownloader 真實輸出的進度解析、SEA 打包下的
  ooz-wasm 載入(oodle.ts 的 Function 轉換路徑)。
- 原生日誌擷取、不彈黑窗、日誌翻譯、世界設定 reconcile —— 皆需在 Windows 實機確認。
- 離線玩家詳情:實機上 /player 仍失敗,確認可用前不要在 notes 宣傳。
