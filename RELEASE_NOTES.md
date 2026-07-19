# palserver GUI — v2.6.0

贊助者新功能:頭目重生時間 —— 一鍵安裝純伺服器端模組,顯示全服野外頭目與地下城頭目的死活與重生時間,並疊到 GUI 地圖與公開地圖上。玩家端不需安裝。
New supporter feature: Boss Respawn Timers — one-click install a server-side mod that shows which overworld and dungeon bosses are alive or down (with respawn timers), overlaid on both the in-app map and the public map. Nothing to install on players' machines.
サポーター向け新機能:ボスのリスポーン時間 —— サーバー側モジュールをワンクリック導入し、フィールドボスとダンジョンボスの生死・リスポーン時間を表示、アプリ内マップと公開マップに重ねて表示。プレイヤー側の導入は不要です。

> 有開自動更新會自己抓,或依下方手動下載。
> The in-app updater fetches it automatically, or download below.
> 自動更新で取得、または下記から手動でダウンロード。

<details>
<summary><b>🇹🇼 繁體中文</b></summary>

### 新功能(贊助者先行)
- **頭目重生時間** — 新分頁一鍵安裝純伺服器端的 UE4SS Lua 模組,顯示全伺服器野外頭目與地下城頭目的死活與重生時間;還會疊到 GUI 地圖與公開地圖上——已擊殺的頭目 marker 變灰,滑過看重生時刻或倒數。模組只讀取遊戲狀態、不改遊戲內容,玩家端不需安裝任何東西。
  - **狀態黏著**:只要有人經過看到頭目活著,就會一直記著,不會因為玩家離開該區就變回「未知」;擊殺後的重生倒數也不會因為玩家離開而中斷。
  - 野外頭目綁「遊戲內時間」重生(約下個遊戲日),沒有固定秒數——本模組實測到一輪完整重生後才顯示精準倒數;地下城頭目的重生時間由遊戲內建、精準。

### 修正與改進
- 地圖:兩張底圖移除礦物圖層;野外頭目改用正式名稱,並區分「Alpha 頭目」與「封印領域」兩類。

</details>

<details>
<summary><b>🇨🇳 简体中文</b></summary>

### 新功能(赞助者先行)
- **头目重生时间** — 新分页一键安装纯服务器端的 UE4SS Lua 模块,显示全服务器野外头目与地下城头目的死活与重生时间;还会叠加到 GUI 地图与公开地图上——已击杀的头目标记变灰,滑过查看重生时刻或倒数。模块只读取游戏状态、不改游戏内容,玩家端无需安装任何东西。
  - **状态黏着**:只要有人经过看到头目活着,就会一直记住,不会因为玩家离开该区就变回「未知」;击杀后的重生倒数也不会因为玩家离开而中断。
  - 野外头目绑「游戏内时间」重生(约下个游戏日),没有固定秒数——本模块实测到一轮完整重生后才显示精准倒数;地下城头目的重生时间由游戏内建、精准。

### 修正与改进
- 地图:两张底图移除矿物图层;野外头目改用正式名称,并区分「Alpha 头目」与「封印领域」两类。

</details>

<details>
<summary><b>🇬🇧 English</b></summary>

### New features (supporters first)
- **Boss Respawn Timers** — A new tab installs a server-side UE4SS Lua mod with one click and shows which overworld and dungeon bosses are alive or down, plus their respawn times — overlaid on both the in-app map and the public map (a downed boss's marker greys out; hover to see its respawn time or countdown). The mod only reads game state and changes nothing in-game; players don't install anything.
  - **Sticky status**: once anyone passing by sees a boss alive, it stays remembered — it won't flip back to "unknown" just because the player left the area, and a post-kill countdown keeps running even after they leave.
  - Overworld bosses respawn on in-game time (around the next in-game day) with no fixed timer — a precise countdown appears only after the mod has measured one full respawn; dungeon boss respawn times are game-native and precise.

### Fixes & improvements
- Map: removed the ore layer from both base maps; overworld bosses now use their proper names and are split into "Alpha" bosses and "Sealed Realm" bosses.

</details>

<details>
<summary><b>🇯🇵 日本語</b></summary>

### 新機能(サポーター先行)
- **ボスのリスポーン時間** — 新しいタブからサーバー側の UE4SS Lua モジュールをワンクリックで導入し、サーバー上のフィールドボスとダンジョンボスの生死・リスポーン時間を表示します。アプリ内マップと公開マップにも重ねて表示され、討伐済みのボスはマーカーがグレーになり、ホバーでリスポーン時刻またはカウントダウンを確認できます。モジュールはゲーム状態を読み取るだけでゲーム内容は一切変更せず、プレイヤー側の導入も不要です。
  - **状態の記憶**:誰かが近くを通ってボスが生きているのを確認すれば、その状態を記憶し続けます。プレイヤーがエリアを離れても「不明」に戻らず、討伐後のカウントダウンも中断されません。
  - フィールドボスはゲーム内時間(おおよそ翌ゲーム内日)でリポップし、固定タイマーはありません——正確なカウントダウンは一度リポップを実測した後のみ表示されます。ダンジョンボスのリスポーン時間はゲーム内蔵で正確です。

### 修正・改善
- マップ:2 つのベースマップから鉱石レイヤーを削除。フィールドボスは正式名称に変更し、「アルファ」ボスと「封印領域」ボスに分類しました。

</details>
