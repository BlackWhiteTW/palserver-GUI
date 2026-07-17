# 建立伺服器端到端流程參考(2026-07-17 Explore 產出,新手精靈重設計依據)

1. 建立表單 = CreateDialog modal(App.tsx:520-796):name/backend/serverDir/gamePort/maxPlayers/serverPassword/dockerImage/k8s 三欄;flavor 寫死 "vanilla"(App.tsx:574);匯入存檔用 pendingImport 複用同一 modal;成功只 refresh 不跳頁。
2. flavor:native 完全無效、docker 選 IMAGES[flavor](images/modded 不存在)、k8s 無用;首頁「原味/強化」chip 看 enhancements(native 檔案系統偵測 PalDefender.dll/UE4SS.dll,routes.ts:160-161)。
3. 安裝時序:POST /instances 只寫 store;按「啟動」才觸發下載(native.ts:788-844 慢路徑背景跑 DepotDownloader,不 await);進度在 agent 記憶體 Map(installing/installProgress/installErrors,native.ts:522-548);首頁與詳情各 5 秒輪詢。
4. 模組:installComponent(mods.ts:251-276)要求 native+win32+win64Dir 存在+伺服器停止(routes.ts:861-876 409),無排隊;GitHub Releases 下載,marker .palserver-mods.json。
5. 世界設定:建立只帶 ServerPlayerMaxNum/ServerPassword,其餘 WorldSettingsSchema 預設;OptionMeta(options.ts:30-35,hint/soft);preset 只有 ENGINE_PRESETS(engine-options.ts:152-200,label/description/values+套用確認),WorldSettings 無 preset——新玩法預設檔仿這個範式。
6. 無 onboarding;說明慣例=彩色說明框(App.tsx:772-783)與 OptionRow 的 meta.hint(SettingsEditor.tsx:191-210);i18n 繁中原文當 key。
