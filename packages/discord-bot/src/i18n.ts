import type { BotLang } from "@palserver/shared";

/**
 * bot 輸出語言(單一行程 = 單一語言,由 GUI 設定或 DISCORD_LANG env 決定;見 startBot())。
 * 字典 key 一律用繁中原文,含原本的標點(對齊 packages/web/src/i18n.tsx 的慣例):lang=zh-TW
 * 或字典缺該 key 時原樣回傳 key 本身當繁中文字,不會空白或報錯。{name} 語法做參數插值,同 web 版。
 */

let currentLang: BotLang = "en";

export function setLang(lang: BotLang): void {
  currentLang = lang;
}

export function getLang(): BotLang {
  return currentLang;
}

type Dict = Partial<Record<Exclude<BotLang, "zh-TW">, string>>;

const DICTS: Record<string, Dict> = {
  // ── 通用 ──
  點擊複製: { en: "Click to copy", ja: "クリックでコピー", "zh-CN": "点击复制" },
  管理員: { en: "Admin", ja: "管理者", "zh-CN": "管理员" },
  對象: { en: "Target", ja: "対象", "zh-CN": "对象" },
  原因: { en: "Reason", ja: "理由", "zh-CN": "原因" },
  指令: { en: "Command", ja: "コマンド", "zh-CN": "指令" },
  "(無輸出)": { en: "(no output)", ja: "(出力なし)", "zh-CN": "(无输出)" },
  未知錯誤: { en: "Unknown error", ja: "不明なエラー", "zh-CN": "未知错误" },
  "…(輸出已截斷)": { en: "\n…(output truncated)", ja: "\n…(出力は省略されました)", "zh-CN": "\n…(输出已截断)" },

  // ── /players ──
  查看目前在線玩家: { en: "Show currently online players", ja: "現在オンラインのプレイヤーを表示", "zh-CN": "查看当前在线玩家" },
  "在線玩家({n})": { en: "Online players ({n})", ja: "オンラインプレイヤー({n})", "zh-CN": "在线玩家({n})" },

  // ── /status ──
  查看伺服器狀態: { en: "Show server status", ja: "サーバーステータスを表示", "zh-CN": "查看服务器状态" },

  // ── /broadcast ──
  在遊戲內廣播訊息: { en: "Broadcast a message in-game", ja: "ゲーム内でメッセージを放送", "zh-CN": "在游戏内广播消息" },
  要廣播的訊息: { en: "Message to broadcast", ja: "放送するメッセージ", "zh-CN": "要广播的消息" },
  廣播已送出: { en: "Broadcast sent", ja: "放送を送信しました", "zh-CN": "广播已发送" },

  // ── /save ──
  立即儲存世界存檔: { en: "Save the world immediately", ja: "ワールドを即座に保存", "zh-CN": "立即保存世界存档" },
  存檔完成: { en: "Save complete", ja: "保存完了", "zh-CN": "存档完成" },
  "世界存檔已寫入磁碟。": { en: "The world save has been written to disk.", ja: "ワールドデータをディスクに書き込みました。", "zh-CN": "世界存档已写入磁盘。" },

  // ── /restart ──
  重新啟動伺服器: { en: "Restart the server", ja: "サーバーを再起動", "zh-CN": "重新启动服务器" },
  伺服器重啟中: { en: "Server restarting", ja: "サーバー再起動中", "zh-CN": "服务器重启中" },
  "所有玩家將暫時斷線;重啟完成後即可重新連線。": {
    en: "All players will be disconnected briefly; reconnect once the restart finishes.",
    ja: "全プレイヤーが一時的に切断されます。再起動完了後、再接続できます。",
    "zh-CN": "所有玩家将暂时断线;重启完成后即可重新连接。",
  },

  // ── /kick ──
  將在線玩家踢出伺服器: { en: "Kick an online player from the server", ja: "オンラインプレイヤーをサーバーからキックします", "zh-CN": "将在线玩家踢出服务器" },
  "玩家名稱(必須在線)": { en: "Player name (must be online)", ja: "プレイヤー名(オンライン限定)", "zh-CN": "玩家名称(必须在线)" },
  已踢出玩家: { en: "Player kicked", ja: "プレイヤーをキックしました", "zh-CN": "已踢出玩家" },
  "**{name}** 已被踢出伺服器。": { en: "**{name}** has been kicked from the server.", ja: "**{name}** はサーバーからキックされました。", "zh-CN": "**{name}** 已被踢出服务器。" },

  // ── /ban ──
  "封鎖玩家(離線也可以,用名稱或 UID)": { en: "Ban a player (works offline; name or UID)", ja: "プレイヤーを禁止(オフラインも可、名前または UID)", "zh-CN": "封锁玩家(离线也可以,用名称或 UID)" },
  玩家名稱或UID: { en: "Player name or UID", ja: "プレイヤー名または UID", "zh-CN": "玩家名称或 UID" },
  "封鎖原因(選填)": { en: "Ban reason (optional)", ja: "禁止理由(任意)", "zh-CN": "封锁原因(选填)" },
  已封鎖玩家: { en: "Player banned", ja: "プレイヤーを禁止しました", "zh-CN": "已封锁玩家" },

  // ── /rcon ──
  "執行 RCON 指令(進階功能,需了解指令語法)": { en: "Run an RCON command (advanced; requires knowing the syntax)", ja: "RCON コマンドを実行(上級者向け、構文の知識が必要)", "zh-CN": "执行 RCON 指令(进阶功能,需了解指令语法)" },
  "RCON 指令": { en: "RCON command", ja: "RCON コマンド", "zh-CN": "RCON 指令" },
  "RCON 執行結果": { en: "RCON result", ja: "RCON 実行結果", "zh-CN": "RCON 执行结果" },

  // ── /start /stop ──
  啟動伺服器: { en: "Start the server", ja: "サーバーを起動", "zh-CN": "启动服务器" },
  伺服器啟動中: { en: "Server starting", ja: "サーバー起動中", "zh-CN": "服务器启动中" },
  "世界載入需要一點時間;可用 /status 或狀態面板確認上線。": {
    en: "The world takes a moment to load — use /status or the status panel to confirm it's online.",
    ja: "ワールドの読み込みには少し時間がかかります。/status またはステータスパネルで起動を確認してください。",
    "zh-CN": "世界载入需要一点时间;可用 /status 或状态面板确认上线。",
  },
  停止伺服器: { en: "Stop the server", ja: "サーバーを停止", "zh-CN": "停止服务器" },
  伺服器已停止: { en: "Server stopped", ja: "サーバー停止済み", "zh-CN": "服务器已停止" },
  "可用 /start 重新啟動。": { en: "Use /start to bring it back up.", ja: "/start で再起動できます。", "zh-CN": "可用 /start 重新启动。" },

  // ── /join ──
  "查看連線位址(怎麼加入伺服器)": { en: "Show the connection address (how to join)", ja: "接続アドレスを表示(参加方法)", "zh-CN": "查看连接地址(怎么加入服务器)" },
  對外位址: { en: "External address", ja: "外部アドレス", "zh-CN": "对外地址" },
  公網: { en: "Public IP", ja: "パブリック IP", "zh-CN": "公网" },
  "(需在路由器設定連接埠轉發)": { en: " (port forwarding required on your router)", ja: "(ルーターでポート転送の設定が必要)", "zh-CN": "(需在路由器设置端口转发)" },
  區網: { en: "LAN", ja: "LAN", "zh-CN": "局域网" },
  如何加入伺服器: { en: "How to join the server", ja: "サーバーへの参加方法", "zh-CN": "如何加入服务器" },
  "在 Palworld 主選單「加入多人遊戲」輸入:\n{lines}": {
    en: 'In Palworld\'s main menu, choose "Join Multiplayer Game" and enter:\n{lines}',
    ja: "Palworld のメインメニューで「マルチプレイに参加」を選び、以下を入力してください:\n{lines}",
    "zh-CN": "在 Palworld 主菜单「加入多人游戏」输入:\n{lines}",
  },
  "目前無法取得連線位址。": { en: "Connection address unavailable right now.", ja: "現在接続アドレスを取得できません。", "zh-CN": "目前无法取得连接地址。" },

  // ── /version ──
  查看遊戲版本與更新狀態: { en: "Show the game version and update status", ja: "ゲームのバージョンと更新状況を表示", "zh-CN": "查看游戏版本与更新状态" },
  無法查詢版本: { en: "Unable to check version", ja: "バージョンを確認できません", "zh-CN": "无法查询版本" },
  "此伺服器不支援版本查詢。": { en: "This server doesn't support version checks.", ja: "このサーバーはバージョン確認に対応していません。", "zh-CN": "此服务器不支持版本查询。" },
  "有新版本可更新(管理員可用 /update)": { en: "Update available (admins can run /update)", ja: "更新が利用可能(管理者は /update を実行できます)", "zh-CN": "有新版本可更新(管理员可用 /update)" },
  已是最新版本: { en: "Up to date", ja: "最新バージョンです", "zh-CN": "已是最新版本" },
  "無法判定(Steam 無法連線或自帶安裝)": { en: "Unknown (Steam unreachable, or a self-provided install)", ja: "不明(Steam に接続できない、または独自インストール)", "zh-CN": "无法判定(Steam 无法连接或自带安装)" },
  遊戲版本: { en: "Game version", ja: "ゲームバージョン", "zh-CN": "游戏版本" },
  目前版本: { en: "Current version", ja: "現在のバージョン", "zh-CN": "当前版本" },
  未知: { en: "Unknown", ja: "不明", "zh-CN": "未知" },
  更新狀態: { en: "Update status", ja: "更新状況", "zh-CN": "更新状态" },
  官方最新更新: { en: "Latest official update", ja: "公式の最新更新", "zh-CN": "官方最新更新" },

  // ── /update ──
  "更新伺服器到最新版(需先停止伺服器)": { en: "Update the server to the latest version (server must be stopped)", ja: "サーバーを最新版に更新(サーバー停止が必要)", "zh-CN": "更新服务器到最新版(需先停止服务器)" },
  更新已開始: { en: "Update started", ja: "更新を開始しました", "zh-CN": "更新已开始" },
  "下載與安裝需要幾分鐘;完成後用 /start 啟動、/version 確認版本。": {
    en: "Downloading and installing takes a few minutes; use /start to boot it and /version to confirm.",
    ja: "ダウンロードとインストールには数分かかります。完了後 /start で起動し、/version で確認してください。",
    "zh-CN": "下载与安装需要几分钟;完成后用 /start 启动、/version 确认版本。",
  },

  // ── /backup ──
  立即備份世界存檔: { en: "Back up the world save right now", ja: "ワールドデータを今すぐバックアップ", "zh-CN": "立即备份世界存档" },
  "找不到世界存檔(伺服器可能還沒開過)。": { en: "No world save found (the server may have never been started).", ja: "ワールドデータが見つかりません(サーバーを一度も起動していない可能性)。", "zh-CN": "找不到世界存档(服务器可能还没开过)。" },
  備份完成: { en: "Backup complete", ja: "バックアップ完了", "zh-CN": "备份完成" },
  檔案: { en: "File", ja: "ファイル", "zh-CN": "文件" },
  大小: { en: "Size", ja: "サイズ", "zh-CN": "大小" },

  // ── /unban ──
  "解除封鎖玩家(名稱或 UID)": { en: "Unban a player (name or UID)", ja: "プレイヤーの禁止を解除(名前または UID)", "zh-CN": "解除封锁玩家(名称或 UID)" },
  已解除封鎖: { en: "Unbanned", ja: "禁止を解除しました", "zh-CN": "已解除封锁" },
  "**{name}** 已從封鎖名單移除。": { en: "**{name}** has been removed from the ban list.", ja: "**{name}** は禁止リストから削除されました。", "zh-CN": "**{name}** 已从封锁名单移除。" },

  // ── /top ──
  "玩家等級排行榜(含離線玩家)": { en: "Player level leaderboard (includes offline players)", ja: "プレイヤーレベルランキング(オフラインも含む)", "zh-CN": "玩家等级排行榜(含离线玩家)" },
  等級排行榜: { en: "Level leaderboard", ja: "レベルランキング", "zh-CN": "等级排行榜" },
  "尚無存檔掃描資料(伺服器開過並掃描後就會有)。": {
    en: "No save-scan data yet (available once the server has run and been scanned).",
    ja: "まだセーブスキャンデータがありません(サーバーが起動しスキャンされると表示されます)。",
    "zh-CN": "尚无存档扫描数据(服务器开过并扫描后就会有)。",
  },
  帕魯: { en: "Pals", ja: "パル", "zh-CN": "帕鲁" },
  資料時間: { en: "Data as of", ja: "データ時刻", "zh-CN": "数据时间" },

  // ── /guilds ──
  "公會清單(成員數與據點等級)": { en: "Guild list (member count & base levels)", ja: "ギルド一覧(メンバー数・拠点レベル)", "zh-CN": "公会列表(成员数与据点等级)" },
  公會清單: { en: "Guild list", ja: "ギルド一覧", "zh-CN": "公会列表" },
  "需要啟用PalDefenderREST才能查詢公會。": { en: "Requires PalDefender REST to be enabled to query guilds.", ja: "ギルド情報の取得には PalDefender REST の有効化が必要です。", "zh-CN": "需要启用 PalDefender REST 才能查询公会。" },
  "公會詳情需要贊助者授權。": { en: "Guild details require a sponsor license.", ja: "ギルドの詳細情報はスポンサー認証が必要です。", "zh-CN": "公会详情需要赞助者授权。" },
  "目前沒有任何公會。": { en: "There are no guilds yet.", ja: "現在ギルドはありません。", "zh-CN": "目前没有任何公会。" },
  成員: { en: "Members", ja: "メンバー", "zh-CN": "成员" },
  據點: { en: "Bases", ja: "拠点", "zh-CN": "据点" },
  "公會清單({n})": { en: "Guild list ({n})", ja: "ギルド一覧({n})", "zh-CN": "公会列表({n})" },

  // ── /boss ──
  "野外頭目重生狀態(需頭目回報模組)": { en: "Wild boss respawn status (requires the boss reporter mod)", ja: "野生ボスのリスポーン状況(ボス報告 mod が必要)", "zh-CN": "野外头目重生状态(需头目回报模组)" },
  頭目重生: { en: "Boss respawns", ja: "ボスのリスポーン", "zh-CN": "头目重生" },
  "尚無頭目資料(伺服器啟動後模組每 15 秒回報一次)。": {
    en: "No boss data yet (the mod reports every 15s once the server is running).",
    ja: "まだボスデータがありません(サーバー起動後、mod が 15 秒ごとに報告します)。",
    "zh-CN": "尚无头目数据(服务器启动后模组每 15 秒回报一次)。",
  },
  "尚未安裝頭目回報模組 — 到 GUI 的「頭目重生」分頁一鍵安裝。": {
    en: 'Boss reporter mod not installed — install it with one click in the GUI\'s "Boss Respawn" tab.',
    ja: "ボス報告 mod が未インストールです — GUI の「ボスリスポーン」タブでワンクリックインストールできます。",
    "zh-CN": "尚未安装头目回报模组 — 到 GUI 的「头目重生」分页一键安装。",
  },
  野外頭目重生: { en: "Wild boss respawns", ja: "野生ボスのリスポーン", "zh-CN": "野外头目重生" },
  "**已擊殺頭目**": { en: "**Defeated bosses**", ja: "**討伐済みボス**", "zh-CN": "**已击杀头目**" },
  "目前沒有觀測到被擊殺的頭目。": { en: "No defeated bosses observed right now.", ja: "現在、討伐されたボスは観測されていません。", "zh-CN": "目前没有观测到被击杀的头目。" },
  "\n資料已一段時間未更新(伺服器可能已停止)。": { en: "\nData hasn't updated in a while (the server may be stopped).", ja: "\nデータが一定時間更新されていません(サーバーが停止している可能性があります)。", "zh-CN": "\n数据已一段时间未更新(服务器可能已停止)。" },
  約下個遊戲日重生: { en: "respawns around the next in-game day", ja: "次のゲーム内の日頃にリスポーン", "zh-CN": "约下个游戏日重生" },
  即將重生: { en: "respawning soon", ja: "まもなくリスポーン", "zh-CN": "即将重生" },
  "約 {t} 後重生": { en: "respawns in about {t}", ja: "約{t}後にリスポーン", "zh-CN": "约 {t} 后重生" },
  存活: { en: "Alive", ja: "生存", "zh-CN": "存活" },
  已擊殺: { en: "Defeated", ja: "討伐済み", "zh-CN": "已击杀" },
  "未知(區域未載入)": { en: "Unknown (area not loaded)", ja: "不明(未読み込み領域)", "zh-CN": "未知(区域未载入)" },

  // ── views.ts:共用 embed ──
  伺服器離線: { en: "Server offline", ja: "サーバーはオフライン", "zh-CN": "服务器离线" },
  "伺服器目前離線或尚未設定即時資訊。": { en: "The server is offline or live info isn't configured yet.", ja: "サーバーがオフライン、またはライブ情報が未設定です。", "zh-CN": "服务器目前离线或尚未设置即时信息。" },
  "目前沒有玩家在線。": { en: "No players online right now.", ja: "現在オンラインのプレイヤーはいません。", "zh-CN": "目前没有玩家在线。" },
  "\n…共 {n} 位玩家在線": { en: "\n…{n} players online in total", ja: "\n…オンライン合計 {n} 人", "zh-CN": "\n…共 {n} 位玩家在线" },
  在線人數: { en: "Players", ja: "オンライン人数", "zh-CN": "在线人数" },
  "伺服器 FPS": { en: "Server FPS", ja: "サーバー FPS", "zh-CN": "服务器 FPS" },
  運行時間: { en: "Uptime", ja: "稼働時間", "zh-CN": "运行时间" },
  遊戲天數: { en: "Game day", ja: "ゲーム内日数", "zh-CN": "游戏天数" },
  "第 {n} 天": { en: "Day {n}", ja: "{n} 日目", "zh-CN": "第 {n} 天" },
  據點數量: { en: "Bases", ja: "拠点数", "zh-CN": "据点数量" },
  " 天 ": { en: "d ", ja: "日 ", "zh-CN": " 天 " },
  " 小時 ": { en: "h ", ja: "時間 ", "zh-CN": " 小时 " },
  " 分": { en: "m", ja: "分", "zh-CN": " 分" },

  // ── status-panel.ts ──
  狀態面板: { en: "Status Panel", ja: "ステータスパネル", "zh-CN": "状态面板" },
  "狀態面板啟動中…": { en: "Status panel starting…", ja: "ステータスパネル起動中…", "zh-CN": "状态面板启动中…" },
  "{prefix} · {name} · 每分鐘自動更新": { en: "{prefix} · {name} · auto-updates every minute", ja: "{prefix}・{name}・毎分自動更新", "zh-CN": "{prefix} · {name} · 每分钟自动更新" },

  // ── bot.ts:系統性訊息 ──
  權限不足: { en: "Insufficient permission", ja: "権限不足", "zh-CN": "权限不足" },
  "此指令僅限管理員(白名單)使用。請伺服器主在 GUI 的「Discord Bot」分頁把你的 Discord user id 加入白名單。": {
    en: 'This command is restricted to whitelisted admins. Ask the server owner to add your Discord user ID in the GUI\'s "Discord Bot" tab.',
    ja: "このコマンドはホワイトリストの管理者専用です。サーバー管理者に GUI の「Discord Bot」タブで自分の Discord ユーザー ID を追加してもらってください。",
    "zh-CN": "此指令仅限管理员白名单使用。请服务器主在 GUI 的「Discord Bot」分页把你的 Discord user id 加入白名单。",
  },
  操作失敗: { en: "Action failed", ja: "操作に失敗しました", "zh-CN": "操作失败" },

  // ── agent.ts(discord-bot 自己的 REST 客戶端錯誤;agent 回應本身的 detail 不在此在地化範圍) ──
  "無法連線到 agent({url}):{detail}": { en: "Couldn't connect to the agent ({url}): {detail}", ja: "agent に接続できません({url}):{detail}", "zh-CN": "无法连接到 agent({url}):{detail}" },
  "AGENT_TOKEN 失效,請重新設定(不會自動重試)。": {
    en: "AGENT_TOKEN is invalid — please reconfigure it (this won't retry automatically).",
    ja: "AGENT_TOKEN が無効です。再設定してください(自動再試行はされません)。",
    "zh-CN": "AGENT_TOKEN 失效,请重新设置(不会自动重试)。",
  },
  "agent 回應錯誤(HTTP {status}):{detail}": { en: "agent returned an error (HTTP {status}): {detail}", ja: "agent がエラーを返しました(HTTP {status}):{detail}", "zh-CN": "agent 回应错误(HTTP {status}):{detail}" },
  "找不到 AGENT_INSTANCE_ID 指定的實例({id})。": { en: "Instance specified by AGENT_INSTANCE_ID not found ({id}).", ja: "AGENT_INSTANCE_ID で指定されたインスタンスが見つかりません({id})。", "zh-CN": "找不到 AGENT_INSTANCE_ID 指定的实例({id})。" },
  "agent 目前沒有任何實例,請先在 GUI 建立一個。": { en: "The agent has no instances yet — create one in the GUI first.", ja: "agent にインスタンスがまだありません。先に GUI で作成してください。", "zh-CN": "agent 目前没有任何实例,请先在 GUI 创建一个。" },
  "找不到在線玩家「{name}」(kick 只能對在線玩家操作,請確認名稱正確)。": {
    en: 'Online player "{name}" not found (kick only works on online players — check the name).',
    ja: "オンラインプレイヤー「{name}」が見つかりません(kick はオンラインプレイヤーのみ対象。名前を確認してください)。",
    "zh-CN": "找不到在线玩家「{name}」(kick 只能对在线玩家操作,请确认名称正确)。",
  },
};

/** t(key, params?):key 是繁中原文;lang=zh-TW 或字典缺該 key 時原樣回傳,不報錯不空白。 */
export function t(key: string, params?: Record<string, string | number>): string {
  let out = (currentLang !== "zh-TW" && DICTS[key]?.[currentLang]) || key;
  if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(String(v));
  return out;
}
