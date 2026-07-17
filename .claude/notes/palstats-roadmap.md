# 帕魯數值頁（pal-stats）＋ PalSchema 加強路線圖

> 2026-07-17 盤點。現況：編輯器管 DT_PalMonsterParameter 的 10 個欄位（Hp/近戰/遠程/防禦/支援/製作速度/捕獲率/步行/奔跑/騎乘衝刺），變體 normal/Boss_/GYM_，寫入 PalSchema 子 mod `PalServerGUI/raw/pal-stats.json`，重啟生效。
> 依據：packages/shared/src/pal-stats-options.ts、packages/agent/src/palschema.ts、packages/web/src/PalStatsTab.tsx、.claude/notes/palschema-reference.md、palschema-datatable-fields.md。

## A. 資料正確性 / 安全（優先做，成本低價值高）

1. **原版數值 placeholder**（本次實作）：input 空值時顯示該物種原版值。附帶價值：使用者知道「改多大才合理」。
2. **row 名大小寫自動校正**：datamine 證實 Boss 前綴大小寫不一致（`Boss_Anubis` vs `BOSS_BlackGriffon`）。palRowName 寫死 `Boss_` → 部分帕魯的首領版實際上改不到（PalSchema 靜默不套用）。有了 defaults 資料（含全部實際 row 名）就能自動選對大小寫、並把不存在的變體按鈕禁用。
3. **變體存在性提示**：GYM_ 只有塔主帕魯有；選了不存在的 row 給黃色警告而不是靜默寫入。
4. **PalSchema 更新按鈕**：marker 已記版本（`.palserver-palschema.json`），UI 只有安裝/移除，沒有「更新到最新版」。遊戲改版後 PalSchema 常要跟著更新，這是剛需。
5. **改版後健康檢查**：偵測 UE4SS/PalSchema 與遊戲版本相容性問題（啟動 log 掃 UE4SS 崩潰特徵），在模組/數值頁提示「改版後 mod 可能失效」。

## B. 編輯體驗

6. **原版→新值對比**：「已修改的帕魯」清單顯示 `原版 120 → 240 (+100%)`，不只新值。
7. **相對倍率輸入**：輸入框旁快捷 ×0.5 / ×2 / ×5（以原版值為基準），或直接輸入倍率套到該欄。
8. **批次調整**：勾選多隻（或「全部已修改」）套同一倍率；進階：全服物種一鍵 HP×N（寫入所有 290 列，PalSchema 檔案結構支援）。
9. **難度預設檔**：像世界設定 presets 一樣給「休閒（帕魯更強）/ 硬核（野怪更強）/ 原版」一鍵套用（改一組精選 row：常見騎乘/首領）。
10. **已修改清單搜尋/排序**：修改多了之後需要（依名稱/變體/修改欄位數）。
11. **匯出/匯入**：把 pal-stats.json 匯出成分享檔、匯入別人的數值包（本質是複製 raw json，成本低；注意匯入前驗白名單）。

## C. 功能擴張（PalSchema 能力還很多沒用到）

12. **工作適性編輯**：`WorkSuitability_*` 全 13 鍵已高信度驗證（官方範例逐字證實其一）。「讓馴鹿會採礦 Lv3」是社群熱門需求，UI 就是 0–5 的 stepper × 13。
13. **更多數值欄位**：Support 已有；可加 `TransportSpeed`/`SlowWalkSpeed`（搬運/慢走）、`Rarity`（影響孵蛋/圖鑑顯示）、`Nocturnal`（夜行）、`Edible`。屬性 `ElementType1/2`（字串枚舉）能做「改屬性」玩法。
14. **更多變體**：`RAID_`/`PREDATOR_`/`SUMMON_` 前綴（paldb 佐證、未 dump 驗證）— 突襲/掠食者/召喚版獨立調整。
15. **掉落物編輯**：官方範例有 `chikipi_drops.jsonc` → 掉落表可改（哪張表、鍵名需再 dump 驗證）。「首領掉寶 ×3」吸引力大。
16. **好友度成長欄位**：`Friendship_HP` 等鍵名在官方範例出現過（paldb 引用），可做「牽絆加成」編輯。
17. **人類/商人數值**：DT 裡有 humans（我們 game-data 已嵌 humans.json 名單），PalSchema raw 一樣打得到（表名需驗）。

## D. 底層 / 維運

18. **defaults 資料進 game-data 維護流程**：`pal-stats-defaults.json` 由 fetch script 生成、遊戲改版時跟其他 game-data 一起重抓（docs/game-data-maintenance.md 加一節）。
19. **寫入前自動備份 mod json**：現在只在安裝 PalSchema 時備份世界；pal-stats.json 本身壞了影響小（刪掉即復原），列低優先。
20. **伺服器端 auto-reload 驗證**：PalSchema 文件說改 json 可熱重載（單機語境）；若專用伺服器也支援，儲存後可免重啟。需 Windows 實機驗證一次，成立的話把「重啟生效」文案改成「已熱套用（部分內容仍建議重啟）」。

## 建議落地順序

第一批（正確性）：1 placeholder ＋ 2 大小寫校正 ＋ 3 變體存在性（同一份 defaults 資料餵三件事）→ 本次
第二批（體驗）：6 對比顯示、4 更新按鈕、7 倍率快捷
第三批（擴張）：12 工作適性（資料已驗證，性價比最高）、9 難度預設檔、11 匯出匯入
之後再評估：8 批次、13-17（需逐項 dump 驗證鍵名）、20 熱重載
