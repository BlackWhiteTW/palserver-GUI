# 遊戲資料維護指南（Palworld 改版時要做的事）

> 給未來維護者 / AI session 看。Palworld 每次改版（新地區、新怕魯、新物品、新詞條/技能）
> 之後，這份專案內嵌的靜態遊戲資料就會過時，要照這份更新。上一次大更新是
> **1.0 / 屋久島（Yakushima）**，把 items 1585→2185、pals 187→290。

## 什麼時候要更新

遊戲有以下任一情況就要更新對應資料：

| 遊戲變動 | 要更新的資料 |
|---|---|
| 新怕魯、新怕魯屬性變體 | `pals.json` + `pals/` 圖示 |
| 新物品、新武器、新道具 | `items.json` + `items/` 圖示 |
| 新詞條（被動技） | `passives.json` |
| 新主動技 | `activeSkills.json` |
| 新地區 / 地圖重繪 | 地圖底圖 + `landmarks.json`（見最後一節） |

## 資料檔清單與 schema

全部在 `packages/web/public/game-data/`。前端由 `packages/web/src/gameData.ts` 載入，
執行時還會背景比對 GitHub raw 上的最新版（所以只改名稱翻譯不用重新出版）。

| 檔案 | schema | 圖示資料夾 | 來源 |
|---|---|---|---|
| `pals.json` | `{id, name, icon?, zh?, ja?}` | `pals/` | paldb.cc / paldeck.cc |
| `items.json` | `{id, name, icon?, zh?, ja?}` | `items/` | paldb.cc |
| `passives.json` | `{id, name, zh?, ja?, rank}` | 無（前端畫箭頭） | paldb.cc + paldeck.cc |
| `activeSkills.json` | `{id, name, zh?, ja?, element?}` | 無 | paldb.cc + paldeck.cc |

**關鍵原則**：`id` 是遊戲/PalDefender 內部 id（不是顯示名），是對接遊戲存檔與 REST 的鍵，
**絕不能改**。名稱翻譯（zh/ja）可以更新；`id` 一旦錯了，玩家資料就對不上。JSON 一律
compact 單行（`JSON.stringify(x) + "\n"`），欄位順序固定 `id, name, icon, zh, ja, ...` 方便 diff。

抓取一律帶 User-Agent `palserver-gui-data-sync (maintainer-approved; github.com/io-software-ai/palserver-gui)`
（維護者已獲 paldb.cc 同意，見 `packages/web/public/game-data/CREDITS.md`），並禮貌節流。

---

## 更新怕魯 / 物品（pals.json / items.json）

這兩個**只能新增、不能覆蓋既有條目**（既有的英文名有人工修正過、既有 id 對接玩家資料）。
流程是「爬新條目 → 只合併差集 → 下載圖示」。

### 1. 爬取「新條目」

- **物品完整清單**：`https://paldb.cc/en/Items` 是 server-render 的**完整**清單（上次 1850 筆）。
  每張卡片有 `data-hover="?s=Items%2F<id>"`（抓 id）與 `<img src="https://cdn.paldb.cc/image/...">`（抓 icon URL）。
  三語名稱：`/en/Items`、`/tw/Items`、`/ja/Items` 三頁，同一 id 對接。
- **怕魯完整清單**：⚠️ `https://paldb.cc/en/Pals` 只 server-render 前 ~120 筆（**不完整**，且不是單純前 N 筆）。
  改用 **`https://paldeck.cc/pals`**（Next.js，資料在 `self.__next_f.push([n,"..."])` 串流片段；
  用 `scripts/fetch-skills-passives.mjs` 裡的 `nextFlight()` 手法拼回，再正則抓
  `"name":...,"asset_name":...,"icon":...`）——上次解析出 290 筆，含屋久島新怪。
- 每筆輸出 `{id, name, zh?, ja?, icon, iconUrl}`，`icon`=iconUrl 的 basename，只留「既有 JSON 沒有的 id」。

### 2. 合併 + 下載圖示

用 `scripts/merge-new-catalog-entries.mjs`（讀一份 new-entries JSON，只 append 差集、下載
`iconUrl` 到對應資料夾；**下載失敗就拿掉該筆的 icon 欄**，避免破圖）。

```
node scripts/merge-new-catalog-entries.mjs items <new-items.json>
node scripts/merge-new-catalog-entries.mjs pals  <new-pals.json>
```

- 怕魯圖示 host：`https://cdn.paldb.cc/image/Pal/Texture/PalIcon/Normal/<basename>`。
- 物品圖示 host：`https://cdn.paldb.cc/image/Others/InventoryItemIcon/Texture/<basename>` 或卡片 `<img src>`。
- 少數新條目 paldb 不提供圖（cdn 回 403）→ 腳本會自動略過 icon 欄，該筆無圖但仍可用。

---

## 更新詞條 / 主動技（passives.json / activeSkills.json）

這兩個是**從來源整份重建**（沒有人工精修要保護），直接跑：

```
node scripts/fetch-skills-passives.mjs
```

它會抓 paldb.cc `/en /tw /ja` 的 `Active_Skills`（用 `EPalWazaID::<id>` anchor 對接三語，可靠）
與 paldeck.cc 的 passives/skills（英文名、rank、element）。已知限制：

- **詞條 zh 是「用 rank 順序位置對齊」**（paldb 詞條頁沒有 per-entry id）——每次重跑要確認
  paldb en/tw 詞條清單筆數與順序一致，否則會整段錯位。
- **詞條 ja 目前抓不到**：paldb ja 詞條頁筆數落後（上次只有 102/114），位置對齊會誤植，故留空。
  若之後 paldb ja 補齊到與 en 同筆同序，可在腳本裡打開 ja 位置對齊。
- 新版剛出時，個別新詞條 paldb 還沒收錄（上次 `MiniNushi/Whopper` 缺 zh）——正常，之後重跑會補上。

---

## 更新地圖（底圖 + 地標）

地圖在 `packages/web/src/MapTab.tsx`，用 Leaflet `CRS.Simple` 把一張大底圖鋪成座標系。

- **底圖**：`packages/web/public/palworld-full-map.jpg`。上次是從 palworld.gg 的 raster tiles
  （`/images/tiles/{z}/{x}/{y}.png`，zoom 0–6）用 jimp 拼接成 zoom-4（4096²）JPG。要更高解析度就拼 zoom-5。
  換底圖後**必須重算 `IMAGE_BOUNDS`**（`MapTab.tsx:40`）：它是「世界座標邊界」經 `savToMap()`
  換算成地圖座標的結果。世界邊界（palworld.gg 反推）X∈[-1099400, 349400]、Y∈[-724400, 724400]。
  新地區若擴大了世界邊界，這兩組數字都要跟著改，否則地標會偏移。
- **座標換算**：`savToMap(worldX, worldY)`（存檔世界座標 → 遊戲內地圖座標），marker 放在
  `L.latLng(mapY, mapX)`。paldb.cc 的 `ipos` 就等於 `savToMap` 的輸出（已用「起始之丘」校準）。
- **地標**：`packages/web/public/game-data/landmarks.json`，`{type, x, y, lv?, name:{en,zh,ja}}`，
  x/y 是地圖座標（= savToMap 輸出）。type 目前有 `Fast Travel` / `Tower` / `Dungeon`，各有專屬
  圖示在 `game-data/landmark-icons/`。新地區的傳送點/塔主/地牢從 paldb.cc 抓，`ipos` 直接當 x/y。
- 地標是**贊助者限定**功能（與公會據點同層 gating），改資料不影響 gating。

---

## 收尾前的驗證清單（每次更新都要跑）

1. **JSON 合法**：每個改過的檔案 `JSON.parse` 過。
2. **圖示都在**：每個有 `icon` 欄的條目，對應圖檔存在於資料夾（掃一次 `access()`，missing 應為 0）。
3. **既有資料沒被動到**：pals/items 更新後，既有 id 全數還在、名稱沒被覆蓋（`git diff` 只該有新增）。
4. **i18n 覆蓋率**：印出各檔 zh/ja 覆蓋率，明顯掉落就是解析壞了。抓不到的誠實留空，**不要**塞英文或 `-`。
5. **build 過**：`pnpm --filter @palserver/web exec vite build`。
6. **抽查渲染**：挑幾個新怕魯/物品，確認 name/zh/ja/icon 四欄都對。
7. commit 時**只加自己動到的檔**（使用者常同時在改別的檔案，用明確路徑 `git add`，別 `git add -A`）。

## 踩坑筆記（別重踩）

- paldb.cc 改版後，舊 `fetch-game-data-i18n.mjs` 的 `<a class="itemname" data-hover="?s=...">` 名稱正則
  在**詳細頁**失效（data-hover 變 `/cache/<lang>/..._hover/<hash>`，href 變顯示名 slug）。
  **索引頁**的 `?s=<Kind>%2F<id>` anchor 仍有效——抓 id 用它。
- 怕魯索引頁不完整（只 120），完整清單走 paldeck.cc/pals，別浪費時間在 paldb 分頁上。
- 圖示偶爾 403，別讓整批中斷；缺圖的條目留著、拿掉 icon 欄即可。
- 詞條沒有可靠的多語 id 對接來源，zh 只能位置對齊、ja 拿不到——這是來源限制，不是你的 bug。
