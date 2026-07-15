# Palworld 專用伺服器效能最佳化研究(2026-07,對應 1.0 版)

研究日期:2026-07-15。目標版本:Palworld 1.0(2026-07-10 正式上線,脫離 Early Access)。
證據強度標記:**[官方明載]** docs.palworldgame.com / 遊戲內建;**[多來源一致]** 3+ 獨立來源(主機商/社群)說法一致但無官方文件或硬數據;**[單一來源]**/**[迷因]** 未證實或疑似 cargo cult。

---

## 0. 本次研究最重要的發現(先講結論)

**官方文件已在 1.0 版推翻舊社群智慧**:docs.palworldgame.com/settings-and-operation/arguments/(v1.0.0)原文:

> `-useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS`:**"In v1.0 and later, leaving this parameter unset may improve performance."**

也就是說,長年被主機商/社群奉為圭臬的三個「多執行緒」啟動參數,官方現在建議**在 1.0+ 不要加**。但同一頁面下方的「範例」區塊卻沒同步更新,仍寫著 `PalServer.exe -port=8000 -useperfthreads -NoAsyncLoadingThread -UseMultithreadForDS`——官方文件本身自相矛盾,尚未完全校對。建議產品面:GUI 若有「一鍵套用效能啟動參數」功能,1.0+ 預設**不要**加這三個 flag,並在說明文字註記官方措辭反轉。
來源:https://docs.palworldgame.com/settings-and-operation/arguments/ 【官方明載,已用 curl 取得原始文字驗證】

---

## 1. 啟動參數(startup flags)

| 參數 | 效果 | 證據強度 | 1.0 現況 |
|---|---|---|---|
| `-useperfthreads` `-NoAsyncLoadingThread` `-UseMultithreadForDS` | 舊版(0.x)號稱改善多執行緒效能 | 官方明載 | **1.0+ 建議不設,官方說設了反而可能更差**(見上) |
| `-NumberOfWorkerThreadsServer=X` | 設定 worker 執行緒數,需搭配上述多執行緒參數一起用 | 官方明載但語意含糊("Need to use with improve multi-threaded CPU performance arguments") | 若不設上面三個 flag,這個參數是否還有效未在文件說明,存疑 |
| `-port=` `-players=` `-publiclobby` `-publicip=` `-publicport=` `-logformat=` | 一般設定,非效能 | 官方明載 | 有效但非效能項 |
| `-USEALLAVAILABLECORES` | 通用 Unreal Engine flag,號稱讓 UE 排程器用滿所有核心 | **單一來源**(社群/主機商部落格),非 Pocketpair 文件收錄 | 未證實對 Palworld 有效 |
| `-malloc=system` | 改用系統 libc malloc 取代 UE 內建分配器,號稱減少長時間運作的記憶體碎片化 | **單一來源**,非官方收錄 | 未證實;理論上合理但無實測數據 |
| `-high` | 提高 OS 排程優先權 | 單一來源(Windows 專屬技巧) | 未證實有意義差異 |

結論:**唯一可信的官方指引是「1.0 起不要加那三個多執行緒 flag」**。其餘社群瘋傳的 UE 通用參數(`-USEALLAVAILABLECORES`、`-malloc=system`、`-high`)都查無官方或硬數據佐證,屬社群偏方等級,產品不建議預設套用,最多列為「進階/實驗性」選項並註明未證實。

來源:
- https://docs.palworldgame.com/settings-and-operation/arguments/(官方)
- https://docs.wasabihosting.com/games/palworld/server-optimization
- https://github.com/thijsvanloef/palworld-server-docker(`ENABLE_PERF_THREADING_ARGS`/`WORKER_THREADS_SERVER` env,對應上述 flag,含 deprecated 的 `MULTITHREADING`)

---

## 2. Engine.ini 調校

官方文件**完全沒有** Engine.ini 效能調校章節——這整塊都是社群/主機商自行整理,證據等級普遍偏低,且**明顯混雜了「客戶端渲染設定」與「伺服器根本用不到的設定」**,需要特別小心篩選:

| 設定 | 說法 | 評估 |
|---|---|---|
| `NetServerMaxTickRate=60~120` | 提高伺服器對客戶端的同步更新速率,號稱減少 rubber-banding | **多來源一致**,方向合理(這是 UE `IpNetDriver` 的標準網路同步參數,和 Source/UE 系列遊戲的 tickrate 概念一致);但一份社群 gist 提出「950 / 玩家數 = 穩定 tickrate」的經驗公式,屬**單一來源、無實測方法論**,不可當硬指標 |
| `MaxClientRate` / `MaxInternetClientRate` | 調高頻寬上限,避免伺服器主動限速 | **多來源一致**,邏輯正確(避免預設值在高頻寬環境下人為卡頻寬),但缺乏對照實測數據 |
| `gc.MaxObjectsNotConsideredByGC` `gc.SizeOfPermanentObjectPool` `gc.TimeBetweenPurgingPendingKillObjects` `gc.FlushStreamingOnGC` | 號稱調 GC 行為改善記憶體 | **[疑似迷因]**——只在單一主機商部落格(Nodecraft)出現,沒有第二來源佐證,且部分設為激進值(如 `SizeOfPermanentObjectPool=0`)在一般 UE 專案反而可能增加 GC 頻率、傷 CPU。無法驗證是否真對 Palworld headless server 有效 |
| `r.Streaming.PoolSize` `r.Shadow.MaxResolution` `bUseFixedFrameRate` `bSmoothFrameRate` | 號稱限制/穩定 FPS、控制材質串流記憶體 | **[迷因/不適用]**——這些是 UE **渲染執行緒**設定。專用伺服器(dedicated server)以 `-nullrhi` 等價模式跑,不渲染畫面,`r.Shadow.MaxResolution`(陰影解析度)這類設定對 headless server **理論上不應有任何效果**。這一整段疑似是把「玩家端優化教學」複製貼上到「伺服器優化教學」,建議產品面完全不採用 |
| `TaskGraph.NumThreads=0` `ThreadedPhysicsWorker=True` | 號稱自動偵測核心數多執行緒/物理多執行緒 | **單一來源**,未見於官方或第二方確認,存疑 |

結論:Engine.ini 這塊**唯二有把握推薦的是 tickrate 與頻寬相關的網路參數**(方向正確、多來源一致,但沒有嚴謹 benchmark);GC 與渲染類設定證據薄弱到接近迷因,尤其渲染設定對 headless 伺服器很可能是無效複製貼上,不建議寫進產品指南或預設值。

來源:
- https://nodecraft.com/support/games/palworld/best-palworld-server-settings-for-performance-and-less-lag
- https://gist.github.com/blackjack4494/628748503c182f5cae04ddacd1e453fa
- https://docs.wasabihosting.com/games/palworld/server-optimization

---

## 3. PalWorldSettings.ini 效能相關鍵值

**重要方法論註記**:docs.palworldgame.com 的「Configuration parameters」頁(1.0.0 版)"Performances" 分類**只列了 7 個鍵**(`BaseCampMaxNum`、`BaseCampMaxNumInGuild`、`BaseCampWorkerMaxNum`、`ItemContainerForceMarkDirtyInterval`、`MaxBuildingLimitNum`、`PhysicsActiveDropItemMaxNum`、`ServerReplicatePawnCullDistance`),**沒有列出** `AutoSaveSpan`、`DropItemMaxNum`、`MaxGuildsPerFrame`、`PlayerDataPalStorageUpdateCheckTickInterval`、`bActiveUNKO` 等鍵。經與本專案 `packages/shared/src/options.ts` 交叉核對,這些鍵**確實存在於實際的 DefaultPalWorldSettings.ini**——官方文件的參數表本身**不完整**(Palworld 文件站長年有此問題),不是這些鍵被移除。以下以「官方文件 + 專案既有 schema + 社群」三方交叉:

| 鍵 | 效果 | 建議值/預設 | 證據強度 |
|---|---|---|---|
| `BaseCampWorkerMaxNum` | 每個據點怕魯工作上限;**官方文件明寫**"Increasing this value raises processing load" | 預設 15,重載伺服器社群建議降到 10 | **官方明載**方向 + 多來源一致的數值建議 |
| `BaseCampMaxNumInGuild` | 每公會據點數上限,官方明寫增加會提高處理負載 | 預設 4(max 10) | 官方明載 |
| `ItemContainerForceMarkDirtyInterval` | 容器 UI 開啟時強制重新同步的間隔(秒) | 專案預設 1 | 官方文件有列(僅說明用途,無效能建議數值);社群建議：非熱門大型倉庫伺服器不需要動 |
| `ServerReplicatePawnCullDistance` | 怕魯與玩家的同步距離(cm),官方文件給出 min 5000 / max 15000 | 依伺服器規模調整,越小同步負擔越低但玩家視覺體驗變差 | 官方明載 |
| `PhysicsActiveDropItemMaxNum` | 啟用物理行為的掉落物數量上限 | 專案預設 -1(無上限);多來源建議調低以減少物理計算 | 官方文件有列;數值建議屬多來源一致 |
| `DropItemMaxNum` / `DropItemAliveMaxHours` | 掉落物總數上限 / 掉落物存活時數,直接影響世界物件量與存檔大小 | 社群建議 2000-2500 / 0.5-1.0 小時 | **未出現在官方 1.0 文件的 Performances 表**,但鍵確實存在(專案 schema 已含);多來源一致認為是重載伺服器最關鍵的降負手段之一 |
| `MaxGuildsPerFrame` | 每影格處理的公會數上限,值越高更新越即時但 CPU 成本越高 | 專案預設 10 | 同上,鍵存在但未列於官方 Performances 表;單一/少數來源說明其效能取捨 |
| `PlayerDataPalStorageUpdateCheckTickInterval` | 玩家怕魯倉庫更新檢查間隔(秒) | 專案預設 1 | 同上,鍵存在但未列於官方表;實際效能影響未見有數據佐證 |
| `bIsUseBackupSaveData` | 啟用世界備份,官方明寫會增加磁碟負載;官方並列出備份頻率梯度(30秒×5份/10分×6份/1小時×12份/1天×7份) | 依主機 IO 能力取捨;NVMe 開,慢速硬碟建議關或拉長間隔 | **官方明載**(含頻率細節) |
| `bActiveUNKO` / `DropItemMaxNum_UNKO` | 怕魯牧場排泄物(Dung)相關開關 | 預設 false / 100 | 經查證:UNKO(糞肥)是**遊戲內未完成/未使用的內容**,目前沒有怕魯會實際生產這個道具,一般伺服器開關這兩個鍵**沒有可觀察效果**。屬於「查得到鍵、但對效能與玩法都是無效佔位」的特例,不建議在效能指南中著墨 |
| `AutoSaveSpan` | 世界自動存檔秒數間隔 | 專案預設 30 秒;社群建議重載伺服器拉到 300-600 秒以避免存檔卡頓,但拉長會提高斷線回檔損失風險 | 鍵存在(專案 schema 已含),未列於官方 1.0 Performances 表;數值建議屬多來源一致但無官方保證 |

結論:**官方 1.0 文件的參數說明頁不完整**,做效能指南/GUI 提示文字時不能只信任官方頁面枚舉的 7 個鍵,要以實際 ini schema(本專案已有)為準;效能建議數值(如 DropItemMaxNum 2000-2500、AutoSaveSpan 300-600)全部屬於「多來源一致但無實測數據」等級,適合當作預設建議值,但不該宣稱「官方認證」。

來源:
- https://docs.palworldgame.com/settings-and-operation/configuration/(官方,經 curl 驗證但發現不完整)
- 專案內 `packages/shared/src/options.ts`(現有 schema,含上述所有鍵的預設值)
- https://pinehosting.com/blog/how-to-configure-your-palworld-server-a-complete-settings-guide/
- https://xgamingserver.com/blog/optimizing-game-settings-in-palworld-server-advanced-guide/

---

## 4. OS/系統層

| 手段 | 說法 | 證據強度 |
|---|---|---|
| **CPU 選型**:單執行緒效能優先,而非核心數 | Palworld 伺服器主要吃 2-3 個核心,鮮少超過 4 個;高時脈 4 核心優於低時脈多核 | **多來源一致**(dedicatedgameservers.net、社群 gist 皆同) |
| **RAM**:16GB 官方建議,8GB 可開機但風險高 | docs.palworldgame.com/getting-started/requirements/ 原文:CPU "4 Core +";RAM "16GB Recommended for larger than 32GB. 8GB is also bootable, but increases the possibility of server crashes due to out of memory." | **官方明載** |
| **儲存**:快 SSD,慢速儲存可能損毀存檔 | 官方原文:"Recommended for faster SSD. Low-performance storage may corrupt saved data" | **官方明載**——這點特別重要,慢 IO 不只是效能問題,官方直接警告會 corrupt 存檔 |
| **OS**:Windows 64bit 或 Linux 64bit(Ubuntu、AlmaLinux 等) | 官方支援兩者,原生 Linux build(SteamCMD app 2394010),不需 Wine/Proton | 官方明載;但 UE4SS/PalDefender 等**模組生態多為 Windows-only**(見第 6 節),Linux 支援普遍較弱 |
| **記憶體洩漏**:長時間運行 RAM 持續上升 | 多個獨立主機商部落格皆描述「開服後數天 RAM 從 6GB 漲到 12GB+」,1.0 版官方 patch notes 提到"optimized dedicated-server processing... memory usage to reduce stutter",但**未宣稱洩漏已解決** | **多來源一致**觀察 + 官方 1.0 patch notes 承認有做記憶體最佳化(但未明言修復洩漏) |
| **net.core.rmem_max / wmem_max**(Linux UDP buffer) | 建議調到 4MB~16MB,號稱降低高人數下的封包 RTT(一份來源宣稱 200 人負載下 P95 RTT 從 47ms 降到 22ms) | **單一來源**且具體數字(47ms→22ms)找不到第二方驗證或方法論說明,方向合理(UDP-heavy 遊戲伺服器調大緩衝區是業界常見手法)但硬數字不可信 |
| **CPU affinity 綁核** | 用 PowerShell/taskset 把伺服器行程綁定特定實體核心,避開跨 NUMA/超執行緒排程抖動;需注意「用 Steam GUI 的『啟動為伺服器』會導致無法設定 affinity」 | **單一來源**,方向在其他遊戲伺服器領域是常見優化,但無 Palworld 專屬實測 |
| **容器化(Docker)overhead** | 一份來源建議「除非已有容器編排,否則盡量避免 Docker,因為儲存 IO 效能疑慮增加存檔損毀風險」;但同時 `thijsvanloef/palworld-server-docker`、`jammsen/palworld-dedicated-server` 是社群最主流的部署方式,star 數高、更新活躍 | **來源互相矛盾**:反對 Docker 的說法只有單一 SEO 部落格,且理由(IO 效能)在正確掛載 volume(非 overlay fs 疊層寫入)的前提下不成立;主流社群工具本身證明 Docker 部署是可行且廣泛採用的模式。**評估:反 Docker 的說法證據薄弱,不採信**;真正的風險點是「用 bind mount / named volume 而非把存檔寫在 overlay 層」,這才是實際會影響 IO 與資料安全的地方 |

來源:
- https://docs.palworldgame.com/getting-started/requirements/(官方)
- https://dedicatedgameservers.net/articles/palworld-dedicated-server-requirements-2026/
- https://github.com/thijsvanloef/palworld-server-docker
- https://gist.github.com/blackjack4494/628748503c182f5cae04ddacd1e453fa

---

## 5. 運維手段

| 手段 | 說法 | 證據強度 |
|---|---|---|
| **定期重啟**(對抗記憶體洩漏) | 業界共識做法:6-24 小時排程重啟,4GB 以下小型伺服器建議更頻繁(每小時);2UpSkill/WinterNode/XGamingServer 等多方獨立來源都給出類似區間 | **多來源一致**,是目前唯一被普遍認可、真正解決記憶體洩漏症狀的手段(而非治本) |
| **停用入侵者怪(bEnableInvaderEnemy=False)** | 號稱能讓一次遊玩時段的 RAM 消耗減半 | **單一來源**（具體「減半」的量化說法只在一份來源出現),方向合理(少一種持續生成的敵人 AI/物件)但數字未見第二方佐證 |
| **存檔清理工具**:PalworldSaveTools(deafdudecomputers/PalworldSaveTools) | 提供刪除空公會、不活躍據點/玩家、重複玩家、無參照資料、修正非法怕魯數量上限、重置反空turret、解鎖私人箱子、修復全部建築等 | 經 GitHub 查證,**維護活躍**:v2.0.7 發布於 2026-07-14(研究前一天),182 個 release、477 star,聲稱支援「最新遊戲版本」。**多來源一致**推薦,是目前最完整的存檔瘦身/修復工具 |
| **PalDefender 清理指令** | `/killnearestbase`(刪除最近據點,含刪除前寫入 timestamped JSON 存檔備份)、`/deletepals`(依條件批次刪怕魯)、`/clearinv`/`/delitem`/`/delitems`(清玩家背包)——這些指令可用於手動清理離線玩家殘留物件、減少存檔與物件數量 | **官方 wiki 明列**(ultimeit.github.io/PalDefender/Commands/),指令存在且有描述;但「清理後對 server FPS/RAM 有多少實測改善」沒有量化數據,屬於「工具存在、效果合理推論但未量化」 |
| **世界存檔肥大化(save bloat)診斷** | 存檔膨脹主因是「已被搜刮容器的殘留 JSON 資料」與離線玩家/公會累積;PalworldSaveTools 可清空這些孤兒資料使檔案顯著縮小 | **多來源一致**(Steam 討論串 + 兩個獨立 save-editor 專案的 README 都描述同一機制) |

來源:
- https://github.com/deafdudecomputers/PalworldSaveTools
- https://ultimeit.github.io/PalDefender/Commands/
- https://2upskill.com/how-to-fix-palworld-memory-leak-and-server-lag-2026-complete-guide/

---

## 6. 伺服器端效能/清理 Mod 總覽(2026-07 現況)

| Mod/工具 | 安裝面 | 效能面向 | 維護狀態(2026) | 風險 | 證據強度 |
|---|---|---|---|---|---|
| **PalDefender**(Ultimeit/PalDefender) | **Server-only**,獨立閉源二進位,**不需要 UE4SS**("standalone Windows build...doesn't need UE4SS") | 主打反作弊(伺服器端驗證玩家行為),附帶清理型指令(`/killnearestbase`、`/deletepals`、`/clearinv` 等)可間接減少物件數/存檔量,但驗證本身也吃 CPU(每個玩家動作都要過一層檢查,無官方量化開銷數字) | **活躍**:v1.8.1 發布於 2026-07-10(1.0 上線當天),25 個 release | **僅支援 Windows 專用伺服器,官方明言 Linux 尚不支援**——若你的 GUI 目標是 Docker/Linux 部署,這是硬性相容性缺口;閉源、無公開原始碼,行為不可審計 | GitHub repo + wiki,**多來源一致**確認其為社群公認「公開伺服器必裝」工具 |
| **PalworldSaveTools**(deafdudecomputers) | **獨立桌面工具**,對存檔檔案離線操作,非常駐 mod,伺服器需先關閉再處理(README 未明講必須離線,但操作等級屬於直接改寫存檔檔案,強烈建議先停服) | 存檔大小(刪孤兒資料、空公會、重複玩家)、修正非法資料(可能間接避免載入/存檔時的異常耗時) | **非常活躍**:v2.0.7,2026-07-14,182 release、477 star,聲稱支援最新版本 | 直接改寫存檔,操作前務必備份;跨版本相容性需自行確認(README 建議存檔需來自「最新遊戲版本後」) | 多來源一致 + 專案本身活躍度可查證 |
| **Better Server-Side Commands / PalServerCommands**(Nexus 3669) | **需要 UE4SS**,Server-only 安裝(admin/玩家指令由伺服器端提供,不需玩家端裝對應 mod) | 主要是管理指令(傳送點、玩家鎖定、道具/怕魯生成、ID 查詢),非直接效能優化工具;可用於手動清理無主據點/道具間接減負 | Nexus 頁面存在,更新頻率未能查證(WebFetch 被 403 擋下,僅能靠搜尋引擎摘要判斷) | UE4SS/Lua mod **Windows-only,不支援 Linux 伺服器**;會破壞 crossplay(混合 Steam+Xbox+PS5 的伺服器,只要有一方沒裝相同 .pak/UE4SS 檔案就會加入失敗) | **單一/未證實**(無法直接讀取 Nexus 頁面驗證版本與更新日期,證據薄弱,僅供列名參考) |
| **UE4SS(Experimental / RE-UE4SS）** | **Server + Client 都要對應版本**(這是框架本身,前述兩款 mod 的依賴) | 本身不是效能工具,是讓 Lua/Blueprint mod 能跑在伺服器上的框架;有分支聲稱"optimized internal logic to reduce CPU overhead and mitigate memory leaks",但未見獨立測試佐證 | 有多個分支(官方 UE4SS、RE-UE4SS 社群 fork 主打 Linux 支援與穩定性修正) | Windows 為主,Linux 支援"finicky"(社群原話);且**任何裝了 UE4SS 的伺服器,只要玩家端沒裝對應版本就無法連線**,直接衝擊 crossplay 與"即開即玩"體驗 | 多來源一致但效能改善量化數據薄弱 |
| **PalworldSaveTools 之外的存檔編輯器**(Palworld Save Pal / Paver / palworld-save-tools PyPI 函式庫) | 獨立離線工具,非常駐 | 據 Palworld Save Pal README:"no longer storing unnecessary data (empty slots)... improves loading and writing speed" ,即減少存檔體積、加快讀寫 | 多個平行專案並存(oMaN-Rod/palworld-save-pal 等),個別維護活躍度不一,需逐一查證 | 同樣是直接改寫存檔,務必先備份 | 多來源一致（做的事情類似,互相佐證存檔膨脹是普遍真實問題） |

**對你 GUI 產品的關鍵含意(已整合 PalDefender)**:
1. PalDefender 目前**official 只支援 Windows dedicated server**。如果 GUI 走 Docker/Linux 部署路線,PalDefender 這條整合在 Linux 容器上會直接跑不起來——需要向使用者明確標示「PalDefender 僅 Windows」,或評估是否要為 Linux 用戶找替代方案(目前查無成熟的 Linux 原生替代品,UE4SS 系 mod 在 Linux 上也被社群形容為「finicky」)。
2. PalDefender 的清理指令(`killnearestbase`、`deletepals`、`clearinv`)可以做成 GUI 的「一鍵清理」按鈕,但目前沒有量化的效能改善數據,產品文案不宜宣稱具體百分比效益,只能定性描述「減少殘留物件與存檔量」。
3. PalworldSaveTools 是目前最活躍、最完整的存檔健康度工具(2026-07-14 才發新版),如果 GUI 要做「存檔健檢/瘦身」功能,這是最值得參考或整合的專案(CLI/函式庫皆有,PyPI 上也有 `palworld-save-tools` 可程式化呼叫)。

來源:
- https://github.com/Ultimeit/PalDefender
- https://ultimeit.github.io/PalDefender/Commands/
- https://github.com/deafdudecomputers/PalworldSaveTools
- https://www.nexusmods.com/palworld/mods/3669(僅搜尋引擎摘要,原頁 403 無法直接驗證)
- https://pypi.org/project/palworld-save-tools/
- https://github.com/oMaN-Rod/palworld-save-pal

---

## 已知資料缺口(誠實列出)

- 沒有找到任何**嚴謹的、有對照組的 benchmark**(例如「開/關某設定,同樣 20 人負載,量測 server tick time 差異」)——整個 Palworld 伺服器效能優化領域幾乎全靠主機商部落格與社群經驗談,鮮少有第一手實測數據公開。凡是本報告標「多來源一致」的項目,意思是「方向被廣泛認同」,不是「已被科學驗證」。
- Nexus Mods 頁面因 403 無法直接抓取原文,Better Server-Side Commands 的確切更新日期與版本號未能查證。
- 官方是否已修復或緩解記憶體洩漏,1.0 patch notes 只寫"optimized... memory usage to reduce stutter",未明確宣稱洩漏已解決,實際效果需要使用者自行長時間運行觀察。
- Server Clustering(2026-06 官方預告的多伺服器叢集功能)在 1.0 正式版 patch notes 中未出現,目前無官方設定文件,不在本次效能研究範圍內,但未來可能是另一個效能維度(跨伺服器負載分攤),值得列入下次追蹤清單。
