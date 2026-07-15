# 存檔健檢(save-slim Stage 1)實作文件

日期:2026-07-15。上位計畫:[save-slim-plan.md](save-slim-plan.md)、整合研究:[savetools-integration.md](savetools-integration.md)。
本文件是動手前的完整規格 — 所有上游事實都已於今日線上查證(pinned commit),所有專案內慣例都已定位到檔案:行號。

## 0. 一頁總覽

```
使用者按「開始健檢」(web SavesTab 新卡片,贊助鎖 save-slim)
  → POST /api/instances/:id/saves/health {worldGuid}          (routes.ts 新端點)
  → agent save-tools.ts:
      [phase: download] 首次:從本 repo GitHub Release(tag palsav-tools-v1)
                        下載 palsav 凍結執行檔 + 以 SHA256SUMS.txt 驗證
                        (比照 self-update.ts 的 download()/expectedHash() 模式)
      [phase: convert]  複製 Level.sav 到暫存 → 子行程 palsav convert --to-json
                        (--minify-json,環境變數 PYTHONHASHSEED=0)
      [phase: analyze]  串流解析 JSON(stream-json,token 級,不整檔進記憶體)
                        → SaveHealthReport(玩家/公會/容器/掉落物統計)
      [done]            報告存 instanceDir/save-health.json;暫存檔清掉
  → web 每 2s GET /api/instances/:id/saves/health?worldGuid=… 輪詢 phase/pct
  → 顯示報告(檔案組成 + 六項計數 + 不活躍玩家/空公會明細)
```

凍結執行檔由本 repo 新 workflow `palsav-tools.yml` 手動觸發建置(win/linux x64),
GPL 隔離:執行期下載、子行程呼叫、不隨包發行 — 與 oodle.ts(ooz-wasm)同一法律模式。

## 1. 上游事實(已查證,pin 值)

- 上游:`deafdudecomputers/PalworldSaveTools`,pin commit **`2c8c65c4a60b04e63eeb7f0c1857a5ba903a24d9`**(2026-07-15 main)。
- 要凍結的子專案:`src/palsav`(套件 `palsav-flex` 0.2.0,GPL-3.0-or-later),含本地相依 `./palooz`(原生 C++ 擴充,自帶 ooz 原始碼,**不需** oo2core dll、不需 cmake/pybind11,純 setuptools)。
- CLI entry:`[project.scripts] palsav = "palsav.cli:main"`;子命令 `convert`/`backup`/`diag`/`validate`,第一參數非子命令時自動視為 `convert`。
- convert 旗標:`--to-json -o <out> -f --minify-json`;`--custom-properties` **預設全開**(公會 RawData 會被解析,這是健檢分析的前提)。`--library` 實際 choices 是 `zlib|palooz`(README 寫 libooz 是錯的)。
- `cli.py` 啟動時若 `PYTHONHASHSEED != '0'` 會重新 exec 自己一次 → Node spawn 時帶 `PYTHONHASHSEED=0` 跳過。
- 已驗證的 JSON 欄位路徑(健檢分析依據,出處 `palsav/commands/diag.py` 與 `palsav/rawdata/group.py`):
  - 根:`properties.worldSaveData.value.<Section>`
  - `CharacterSaveParameterMap.value[]`:entry.`value.RawData.value.object.SaveParameter.value.IsPlayer.value == true` → 玩家,否則帕魯。
  - `GroupSaveDataMap.value[]`:entry.`value.RawData.value.group_type == "EPalGroupType::Guild"`、`.guild_name`、`.players[]`(`player_uid`、`player_info.player_name`、`player_info.last_online_real_time`(i64 ticks,100ns since 0001-01-01))。
  - `ItemContainerSaveData.value[]`:entry.`value.SlotNum.value`(格數)、`value.Slots.value.values[].RawData.value.item.static_id`(空槽為 "None"/空)。
  - `CharacterContainerSaveData.value[]`:計數即可。
  - `MapObjectSaveData.value.values[]`:計數;`MapObjectId`(識別掉落物 dropitem 系)。
  - `DynamicItemSaveData.value.values[]`:計數。
- PyInstaller 注意:`cli.py` 用字串 `__import__` 載子命令 → 必須 `--hidden-import palsav.commands.convert`(+backup/diag/roundtrip_validation);palooz 要先 `pip install` 進 site-packages 再凍結(不能只擺原始碼)。
- palooz `setup.py` 的 `extra_compile_args` 是 GCC 風格(`-O3 -flto …`);MSVC 大概率只警告(D9002)不失敗,但**未實測** → workflow 在 Windows 加一步 sed 清空該列,確定性優先。

## 2. 交付物 A:CI workflow `.github/workflows/palsav-tools.yml`

- 觸發:`workflow_dispatch`,inputs:`upstream_ref`(default 上述 pin SHA)、`release_tag`(default `palsav-tools-v1`)。**不進 v* release 流程**,與 release.yml 無關。
- jobs.build,matrix:`windows-latest`(產 `palsav-win-x64.exe`)、`ubuntu-latest`(產 `palsav-linux-x64`)。步驟:
  1. `actions/checkout` 上游 repo(`repository: deafdudecomputers/PalworldSaveTools`,`ref: ${{ inputs.upstream_ref }}`;無 submodule,淺 clone 即可)。
  2. `actions/setup-python` 3.12。
  3. (Windows only)把 `src/palsav/palooz/setup.py` 的 GCC 旗標列換成 `extra_compile_args = []`。
  4. `pip install ./palooz && pip install . && pip install pyinstaller`(cwd `src/palsav`)。
  5. 產 entry stub(`from palsav.cli import main; main()`)→ `pyinstaller --onefile --name <asset名> --hidden-import palsav.commands.convert --hidden-import palsav.commands.backup --hidden-import palsav.commands.diag --hidden-import palsav.commands.roundtrip_validation entry.py`。
  6. 煙霧測試:`PYTHONHASHSEED=0 ./dist/<asset> --help`(退出碼 0 才算過;順便驗 MSVC 那個未實測點)。
  7. upload-artifact。
- jobs.release:攤平 → `sha256sum * > SHA256SUMS.txt` → 產 `SOURCE.txt`(寫明 GPL-3.0、上游 repo+pin commit URL,滿足散布二進位時的源碼指引)→ `softprops/action-gh-release@v2`:`tag_name: <release_tag>`、**`make_latest: false`**。
  - 安全性確認:self-update 挑版用 `parseVersion(tag_name)` 過濾([self-update.ts:183](../../packages/agent/src/self-update.ts#L183)),`palsav-tools-v1` 不是版本號格式,不會被自我更新誤認;`make_latest: false` 也不污染 `/releases/latest`。
- 上游升版流程:改 `upstream_ref` 重跑 workflow,`release_tag` 升為 `palsav-tools-v2`,agent 常數同步 bump(見下)。

## 3. 交付物 B:shared(`packages/shared/src/`)

- [features.ts:15-23](../../packages/shared/src/features.ts#L15-L23) `EARLY_ACCESS_FEATURES` 加 `{ id: "save-slim", label: "存檔健檢" }`(閘門邏輯 `hasFeature` 不用動)。
- `index.ts`(靠近 [SavesStatus:610](../../packages/shared/src/index.ts#L610))新增型別:

```ts
export interface SaveHealthCounts {
  players: number;            // 註冊玩家
  playersInactive30d: number; // 30 天以上未上線(見報告誠實條款)
  pals: number;               // 帕魯個體
  guilds: number;
  guildsEmpty: number;        // 無成員公會
  itemContainers: number;
  itemContainersEmpty: number; // 全空容器(已搜刮殘留)
  itemSlots: number;           // 容器總格數
  charContainers: number;
  mapObjects: number;          // 建築/世界物件
  dropItems: number;           // MapObjectId 含 dropitem 的世界掉落物
  dynamicItems: number;
}
export interface SaveHealthPlayerRow {
  name: string; uid: string; lastOnlineDaysAgo: number | null; guildName: string;
}
export interface SaveHealthReport {
  worldGuid: string;
  generatedAt: string;       // ISO
  toolTag: string;           // palsav-tools-v1
  levelSavBytes: number;
  levelSavMtime: string;     // 分析基準時間(離線天數以此為「現在」)
  playersDirBytes: number;
  playerSavCount: number;
  worldDirBytes: number;
  counts: SaveHealthCounts;
  inactivePlayers: SaveHealthPlayerRow[]; // 依離線天數降冪,上限 100
  emptyGuildNames: string[];              // 上限 50
}
export interface SaveHealthStatus {
  supported: boolean;        // 平台/後端是否支援
  reason?: string;           // 不支援原因(沿用 mods/saves 的 supported+reason 慣例)
  phase: "idle" | "download" | "convert" | "analyze";
  progressPct: number | null; // convert 為 null(不確定進度),analyze 依 bytes
  error: string | null;       // 上一次失敗原因
  report: SaveHealthReport | null; // 該世界最近一次成功報告(agent 重啟後仍在)
}
```

## 4. 交付物 C:agent(`packages/agent/src/`)

### 4a. `save-tools.ts` — 執行檔管理 + 健檢任務編排

- 常數:`PALSAV_TAG = "palsav-tools-v1"`;資產名依平台:`win32+x64 → palsav-win-x64.exe`、`linux+x64 → palsav-linux-x64`;下載 URL `https://github.com/${GITHUB_REPO}/releases/download/${PALSAV_TAG}/<asset>`(`GITHUB_REPO` 來自 [env.ts:77](../../packages/agent/src/env.ts#L77),自架 fork 也能覆蓋)。
- `ensurePalsav(onProgress)`:快取 `DATA_DIR/tools/palsav-${PALSAV_TAG}/<asset>`。
  - 下載走 [self-update.ts:264 download()](../../packages/agent/src/self-update.ts#L264)同款(fetch + content-length 進度 + pipeline 落檔);驗證抓同 release 的 `SHA256SUMS.txt`,比對用 [expectedHash()](../../packages/agent/src/self-update.ts#L288) 同款解析;已存在時重驗雜湊(oodle.ts 慣例),壞檔刪除丟錯。linux `chmod 755`。
  - 註:oodle.ts 是「hardcode 單一雜湊」,這裡改用 SUMS 檔是因為執行檔要等第一次 CI 跑完才有雜湊值(雞生蛋);SUMS 與資產同 release、同 HTTPS 信任層級,與 self-update 的既有安全姿態一致。後續要加固可把首發雜湊寫死回程式碼。
- 平台支援判斷 `saveHealthSupport(rec)`:
  - `process.platform` 不是 win32/linux 或 arch 不是 x64 → `supported:false`(「存檔健檢需要 Windows/Linux x64 主機(macOS 開發機不支援)」— 沿用 [mods.ts 的 supported+reason 慣例](../../packages/web/src/ModsTab.tsx#L107))。
  - `rec.backend === "k8s"` → v1 不支援(要先把數百 MB Level.sav 拉出 Pod,留待後續;文案明講)。native/docker 皆走 host FS,直接支援。
- `startHealthCheck(rec, ctx, worldGuid)`:每 instance 同時最多一個任務(進行中再叫 → 409)。流程:
  1. 世界目錄:`savedRoot(rec,ctx)` → `SaveGames/0/<worldGuid>`(從 saves.ts 匯出一個 `worldDirOf()` helper 重用,不複製邏輯;[saves.ts:118](../../packages/agent/src/saves.ts#L118))。
  2. `flushWorld` best-effort(比照 [createBackup:495](../../packages/agent/src/saves.ts#L495) — 伺服器運行中也能做,先請它落盤一次)。
  3. FS 統計:Level.sav 大小/mtime、`Players/` 檔數與大小、世界目錄總大小(dirSize 慣例已存在)。
  4. 複製 Level.sav 到 `ctx.instanceDir/health-tmp/`(避免讀到寫入半途的原檔;先 stat 原檔 mtime 當分析基準)。
  5. `spawn(palsav, ["convert", copy, "--to-json", "-o", tmpJson, "--minify-json", "-f"], { env: {...process.env, PYTHONHASHSEED: "0"}, windowsHide: true })`;stderr 收尾 200 行留給錯誤訊息。
  6. 串流分析 tmpJson(見 4b),進度 = 已讀 bytes / JSON 檔大小。
  7. 報告寫 `ctx.instanceDir/save-health.json`(以 worldGuid 為 key 的小 JSON,重啟可讀回);`finally` 清 health-tmp。
- `getHealthStatus(rec, ctx, worldGuid)`:合成 supported/進行中 phase/pct/上次錯誤/上次報告。
- 磁碟注意:JSON 暫存可能是 Level.sav 的數倍(數 GB);錯誤訊息要把「磁碟空間不足」寫清楚(ENOSPC 特判)。

### 4b. `save-health.ts` — 串流 JSON 分析器(獨立模組,可單元測試)

- 依賴:新增 `stream-json`(純 JS,esbuild 可打包;`@types/stream-json` dev)。用 token 級 parser(packValues),自維護 path stack,**不把任何 Section 整棵組回記憶體**;只在小型子樹(單一公會 entry、單一容器 entry)層級累積臨時狀態。
- 數字以字串收(i64 ticks 超過 2^53,轉 Number 只損失次秒精度,天數計算無妨)。
- 計數規則(路徑同第 1 節;Map 型 Section 的元素在 `.value[]`,Array 型在 `.value.values[]`,兩種路徑都註冊、取有出現者):
  - 玩家/帕魯:CharacterSaveParameterMap 元素數;元素內 `IsPlayer.value === true` → 玩家(每元素至多記一次)。
  - 公會:group_type 為 Guild 的元素;`players` 為空 → 空公會(收 guild_name,上限 50)。
  - 不活躍:公會名冊的 `last_online_real_time` → `days = (mtimeTicks − t) / 864e9`,`mtimeTicks = Level.sav mtimeMs×10⁴ + 621355968000000000`;數值不在 [0, 3650] 視為 null(**ticks 時鐘基準要 Windows 實機驗證**,這是本功能最大的資料面不確定點)。>30 天計入 `playersInactive30d`,明細收進 `inactivePlayers`(降冪,上限 100)。
  - 容器:元素數、`SlotNum.value` 加總;元素內所有 `static_id` 都空/"None" → 空容器。
  - mapObjects/dynamicItems/charContainers:元素計數;`MapObjectId` 值小寫含 `dropitem` → dropItems。
- 單元測試 `save-health.test.ts`(node:test,`tsx --test` 跑):餵手工合成的小 JSON(蓋玩家/帕魯、空/非空公會、空/非空容器、dropitem MapObjectId、離線 ticks 邊界),驗每個計數。合成資料的形狀照第 1 節路徑寫死 — 這同時是「上游 JSON 形狀」的文件化。

### 4c. `routes.ts` — 兩個端點(照 [saves 區段慣例](../../packages/agent/src/routes.ts#L1375))

```
GET  /api/instances/:id/saves/health?worldGuid=…   → SaveHealthStatus(200)
POST /api/instances/:id/saves/health {worldGuid}    → 202 + SaveHealthStatus(啟動;進行中 409;不支援 400)
```
zod 驗 worldGuid(同 [routes.ts:1401](../../packages/agent/src/routes.ts#L1401) 的 regex)。**不做贊助端 gate**:與其他贊助功能一致(閘門在 web 端 UI,agent 端點本就只認 token;若要 agent 端也鎖,是全專案一致性的另一個議題,不在本次)。

## 5. 交付物 D:web(`packages/web/src/`)

- [api.ts](../../packages/web/src/api.ts#L602) `AgentClient` 加 `saveHealth(id, worldGuid)`(GET)與 `startSaveHealth(id, worldGuid)`(POST),型別 import 自 shared。
- `SavesTab.tsx`:在 ScheduleCard 之後加 `HealthCard`:
  - 贊助鎖:照 [PalStatsTab.tsx:70-75 + 211-216](../../packages/web/src/PalStatsTab.tsx#L70)(`client.license()` → `hasFeature("save-slim", l)`;locked 顯示 FiLock 橫幅,不渲染操作區)。
  - 不支援(mac/k8s):虛線框 + 置中圖示 + reason(照 [ModsTab.tsx:107-114](../../packages/web/src/ModsTab.tsx#L107))。
  - 世界選擇:預設 active world,多世界給 `<select>`。
  - 執行中:輪詢 GET(2s,照 [UpdateCard.tsx:38-44](../../packages/web/src/UpdateCard.tsx#L38) 模式),phase 文案:下載工具(帶 pct)/轉換存檔(可能數分鐘,無進度)/分析中(帶 pct)。
  - 報告區:檔案組成(Level.sav/Players/世界總大小)+ counts 六格(玩家含不活躍、帕魯、公會含空、容器含殘留、掉落物、動態物品)+ 摺疊明細(不活躍玩家表、空公會清單)+ 說明文字:「唯讀分析,不會改動存檔;瘦身(清理)功能將在後續版本提供」。
  - 圖示:`FiActivity`(fi 系,47 處主力慣例;禁 emoji)。
  - 按鈕:伺服器運行中不擋(唯讀 + flush),但提示「運行中分析的是最近一次落盤的狀態」。
- i18n:新 key 全走 `t("中文原文")`;`packages/web/public/i18n/{en,ja,zh-CN}.json` 各補翻譯。**commit 前 `git diff` 這三檔,只能有自己的 key**(2026-07-12 教訓)。

## 6. 驗證計畫

| 層級 | 怎麼驗 | 這次能做嗎 |
|---|---|---|
| 型別/建置 | `pnpm typecheck`、`pnpm build`(root) | ✅ 本機 |
| 分析器邏輯 | `save-health.test.ts` 合成 JSON 單元測試 | ✅ 本機 |
| CI workflow | 語法層 `gh workflow` 難驗;推上去手動 dispatch 一次,看兩平台 build+煙霧測試綠 | ⚠️ 需要 push + 手動觸發(Windows MSVC 那步是首跑驗證點) |
| 端到端 | Windows 測試機(Tailscale)真實世界存檔跑健檢:轉檔成功、計數合理、**離線天數合理**(ticks 基準假設) | ❌ 留給使用者,是回報裡要明講的未驗項 |
| mac 行為 | dev 環境確認卡片顯示「不支援」而非壞掉 | ✅ 本機 |

## 7. 風險與明講的不確定點

1. **`last_online_real_time` 的時鐘基準**:欄位是 i64 ticks(group.py 明載),但「距今幾天」的換算假設它是 UTC FDateTime——邏輯上與社群工具一致,但未經本專案實測。分析器已做 [0,3650] 天的 sanity clamp,超界回 null;實機驗證是第一優先確認項。
2. **MSVC 編譯 palooz**:首跑 CI 才知道;已用「Windows 上清空 GCC 旗標」把風險收斂到接近零。
3. **JSON 暫存體積**:大型世界可能產生數 GB 暫存;v1 用 ENOSPC 特判 + 文案提醒,不做預先空間檢查(跨平台 free-space 檢查另有成本)。
4. **k8s 不支援**:v1 明示不支援,不是靜默失敗。
5. **不動 Stage 2**:任何寫回/清理一律不做;報告文案不承諾「能省多少」,只給客觀計數。

## 8. 檔案清單(預計改動)

| 檔案 | 動作 |
|---|---|
| `.github/workflows/palsav-tools.yml` | 新增 |
| `packages/shared/src/features.ts` | +1 feature |
| `packages/shared/src/index.ts` | +4 型別 |
| `packages/agent/src/save-tools.ts` | 新增(~250 行) |
| `packages/agent/src/save-health.ts` | 新增(~200 行) |
| `packages/agent/src/save-health.test.ts` | 新增 |
| `packages/agent/src/saves.ts` | 匯出 `worldDirOf()` helper(數行) |
| `packages/agent/src/routes.ts` | +2 端點 |
| `packages/agent/package.json` | +stream-json(dev: @types/stream-json) |
| `packages/web/src/api.ts` | +2 方法 |
| `packages/web/src/SavesTab.tsx` | +HealthCard |
| `packages/web/public/i18n/{en,ja,zh-CN}.json` | +翻譯 key |
