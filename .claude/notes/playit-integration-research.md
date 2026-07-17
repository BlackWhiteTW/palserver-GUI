# playit.gg 隧道整合研究(2026-07-17)

結論:**可行**。playit-agent 是 BSD-2-Clause,可隨附下載/整合。v1.0.x 是 daemon(`playitd`)+ CLI(`playit-cli`)雙執行檔架構;claim 流程與 tunnel 管理其實是三個平面 HTTPS API(api.playit.gg),**建議 Node.js agent 直接呼叫這些 API**(不必shell out `playit-cli` 解析 TUI 輸出),只需要子行程管理 `playitd` 本體來建立實際的網路隧道連線。以下事實全部從官方原始碼(github.com/playit-cloud/playit-agent, tag v1.0.10, 2026-06-08 發布)與 GitHub Releases API 實查,標「未證實」的是查不到官方文件、只有社群來源。

## 1. 授權與發佈

- License:**BSD-2-Clause**(GitHub API `license.spdx_id` 確認,repos/playit-cloud/playit-agent)。可商用整合、可隨附下載,無 copyleft 限制。
- 最新 release:`v1.0.10`,published_at 2026-06-08。來源:`https://api.github.com/repos/playit-cloud/playit-agent/releases/latest`
- 每個平台有**兩種執行檔**:`playit-*`(daemon,即 `playitd`)與 `playit-cli-*`(CLI/TUI,透過 IPC 連 daemon)。
  - Windows x64:`playit-windows-x86_64.exe`(未簽章)與 `playit-windows-x86_64-signed.exe`(**已簽章**,建議用這個避免 SmartScreen 警告)。另有對應 `.msi` 安裝檔(含 signed 版)。
  - Linux x64:`playit-linux-amd64`(daemon)、`playit-cli-linux-amd64`(CLI)。也有對應 `.deb`/`.rpm`/`.apk`。
  - 完整清單與各檔 SHA256 見下方「SHA256」小節。
- **沒有獨立的 checksums.txt**(`/releases/download/v1.0.10/checksums.txt` 回 404)。但 GitHub Releases API 對每個 asset 都回傳 `digest` 欄位(GitHub 自己算的 sha256),下載前可用 GitHub API 查詢比對,不需要另外找官方簽章檔。

### SHA256(v1.0.10,GitHub API digest 欄位,實查)
```
playit-windows-x86_64-signed.exe : 2dbdaad119844cbbc062cc9774b8b462afa5f1b4b7832a9fc5ef4676cae887cf
playit-windows-x86_64.exe        : 97ad38fcbd1c4fafcb84a99c0b1b1ba216f76ef5372ae2f6ef142652a1239ad4
playit-linux-amd64               : 2df7d9f10227ab312b1ad341853db4e8a8243df5cfcdbae58713a4271711c339
playit-cli-linux-amd64           : 6fd54d147ae1d3232b22c1c1f4aa3d13cf16d889e840ca2d3f90b4f50a2e7301
```
(其餘平台見上方 Bash 輸出,或重跑 `curl -s https://api.github.com/repos/playit-cloud/playit-agent/releases/latest`。)

## 2. headless 生命週期(claim 流程,原始碼逐字核對)

架構分兩個執行檔:`playitd`(背景 daemon,實際建隧道)+ `playit-cli`(claim/管理用)。**claim 流程本質是 3 支 HTTPS API,可以完全繞過 `playit-cli`、由我們自己的 Node.js 直接呼叫**:

1. **產生 claim code**:純本地運算,不是 API 呼叫 —— 5 bytes 隨機數 hex 編碼(`packages/playit-cli/src/main.rs:312-316`):
   ```rust
   let mut buffer = [0u8; 5];
   rand::rng().fill(&mut buffer);
   hex::encode(&buffer)   // 10 個 hex 字元
   ```
2. **claim URL**(給玩家/管理者按同意用,格式固定):`https://playit.gg/claim/{code}`(main.rs:318-324)。這是要顯示在 UI 上讓使用者點開的連結。
3. **輪詢 setup 狀態**:`POST https://api.playit.gg/claim/setup`,body `{code, agent_type, version}`。`agent_type` 是 enum `"assignable"` 或 `"self-managed"`(官方 `playit setup` 用 `assignable`)。回傳狀態機:`WaitingForUserVisit` → `WaitingForUser` → `UserAccepted` / `UserRejected`。輪詢間隔原始碼用 200ms~2s。
4. **兌換 secret**:使用者在瀏覽器按「同意」後,呼叫 `POST https://api.playit.gg/claim/exchange`,body `{code}`,回傳 `{secret_key: string}`。原始碼每 2 秒重試,直到成功或逾時。

這整個流程完全不需要瀏覽器以外的東西回呼我們的 agent —— **是我們主動輪詢**,不是網頁按完會 callback 到 agent。UI 上只要顯示 claim URL,等背景輪詢拿到 secret_key 即可。

CLI 對應指令(供參考,若想直接呼叫二進位而非重寫 HTTP 呼叫):
```
playit-cli claim generate                              # 印出 claim code
playit-cli claim url <code> [--name X] [--type self-managed]   # 印出 claim URL
playit-cli claim exchange <code> [--wait <seconds>]     # 輪詢直到拿到 secret,印到 stdout(0=無限等待)
```

**取得 secret 之後,啟動 daemon 完全無互動、無需 claim URL 再介入**:
```
playitd --secret <secret_key>
# 或
playitd --secret_path <path-to-playit.toml>
```
(`packages/playitd/src/bin/playitd.rs:11-17`,兩個參數 `conflicts_with` 互斥)。預設 secret 檔路徑(`packages/playitd/src/paths.rs`):優先看 cwd 下 `playit.toml`,Linux 再看 `/etc/playit/playit.toml`,否則落到 `playit_ipc::paths::playit_config_dir()/playit.toml`(各平台的 config dir,如 Windows 是 `%PROGRAMDATA%\playit_gg\playit.toml`)。**建議我們自己管理 secret 檔路徑,明確傳 `--secret_path`,不要依賴預設值。**

Auth header 格式(`packages/api_client/src/lib.rs:15`,呼叫任何需要驗證的 API 時):
```
Authorization: Agent-Key <secret_key>
```

## 3. tunnel 建立(可完全程式化,不需要網頁操作)

官方 API base:`https://api.playit.gg`(可用 `API_BASE` 環境變數覆蓋,`main.rs:27-28`)。以下端點從 `packages/api_client/src/api.rs`(自動產生的 API client,2157 行)逐一核對,也與獨立的 `playit-api-java` repo(OpenAPI 產生的 Java client)交叉驗證一致:

- `POST /v1/tunnels/create`(帶 `Authorization: Agent-Key <secret>`)—— 建立 tunnel。Request `ReqTunnelsCreateV1`:
  ```rust
  pub struct ReqTunnelsCreateV1 {
      pub ports: TunnelPortDetails,       // 見下
      pub origin: AccountTunnelOriginCreate,  // Agent(AgentOrigin{agent_id, config})
      pub enabled: bool,
      pub alloc: Option<CreateTunnelAllocationRequest>, // Hostname/DedicatedIp/SharedIp/Region/PortAllocation,可省略用預設配置
      pub name: Option<String>,
      pub firewall_id: Option<uuid::Uuid>,
  }
  ```
  `TunnelPortDetails` 支援 `custom-udp(u16)` / `custom-tcp(u16)` / `custom-both(u16)`,**不是只能選預設遊戲清單**。`TunnelType` enum 只列了 minecraft-java/bedrock、valheim、terraria、starbound、rust、7days、unturned、https —— **沒有 Palworld 預設項**,所以 Palworld 要用 `TunnelPortDetails::CustomUdp(8211)`,protocol-agnostic,能用。
  `origin: Agent(AgentOrigin{agent_id: None, ...})` 讓 playit 後端把這個 tunnel 綁到「目前這把 secret key 對應的 agent(即我們跑的 `playitd` 行程)」,流量會轉發到該 agent 所在主機的本地連接埠 —— 也就是 PalServer 跑的同一台機器,不需要額外指定 LAN IP。
- `POST /v1/tunnels/list`:列出已建 tunnel。
- `POST /v1/agents/rundata`:回傳 `AgentRunDataV1 { agent_id, tunnels: [AgentTunnelV1], pending, notices, permissions }`。**`AgentTunnelV1.display_address` 就是要顯示給玩家的公開位址字串**(見第 4 節)。
- 其他相關端點:`/v1/tunnels/config`、`/v1/tunnels/propset`、`/v1/schemas/get`(取得 tunnel 設定 schema,`AgentTunnelConfig` 是 name/value pair 清單,精確欄位需另呼叫此端點列舉,未逐一反推)。

**不需要到 playit.gg 網頁手動建 tunnel** —— 上述都是純 API,用 agent 的 secret key(`Agent-Key` header)即可呼叫,可完全整合進我們的 Node.js agent。

## 4. 公開位址取得

呼叫 `POST /v1/agents/rundata`(帶 `Authorization: Agent-Key <secret>`),回傳的 `AgentRunDataV1.tunnels[]` 每筆 `AgentTunnelV1` 有:
```rust
pub struct AgentTunnelV1 {
    pub id: uuid::Uuid,
    pub display_address: String,   // ← 玩家要輸入的位址,如 xxx.gl.ply.gg:12345
    pub port_type: PortType,
    pub port_count: u16,
    pub tunnel_type: Option<String>,
    pub tunnel_type_display: String,
    pub agent_config: AgentTunnelConfig,
    pub disabled_reason: Option<...>,
    ...
}
```
`display_address` 是現成的字串(從原始碼欄位命名與型別確認,實際格式如 `*.gl.ply.gg:PORT` 屬社群教學所述、**未在原始碼字面上看到範例字串,格式細節「未證實」**,但欄位本身是官方 API 直接回傳的顯示用地址,不需自己拼接)。剛建立、還在配置中的 tunnel 會出現在 `pending: Vec<AgentPendingTunnelV1>`(有 `status_msg` 說明目前狀態),等它轉進 `tunnels[]` 才代表配置完成、`display_address` 才有效。

## 5. 限制

- 免費方案:社群/GitHub issue 標題與部落格文章提到「4 個免費 TCP + 4 個免費 UDP tunnel」;官方 `playit.gg/support/playit-premium/` 頁面明講「Premium 把可分配的埠數從 4 提升到 16」、Premium 才有指定地區路由(免費只有 Global Anycast,可能繞遠路,如北美使用者被路由到新加坡)、Premium 才有更多 firewall rules/agents、3 個自訂網域。**官方頁面沒有寫死流量頻寬上限的具體數字**,只提到重度流量會被降速(來源:社群 Discord 討論 discuss.playit.gg,未證實具體門檻)。
- UDP 支援:**確認支援**,免費方案就有 UDP tunnel 額度,教學與 GitHub issue 都用 UDP 建 Palworld/Minecraft 隧道。Palworld 專用伺服器預設埠是 `8211/UDP`,是唯一必開的埠(來源:xgamingserver.com 等社群文件,遊戲本身埠號屬公開常識,非 playit 官方文件範圍)。
- Palworld 沒有 playit 內建的 `TunnelType` 預設項(見第 3 節),要用 `custom-udp`,行為上等同其他自訂 UDP 遊戲,無額外限制。

## 整合建議(給後續實作參考,非查證結果)

1. 下載:GitHub Releases API 抓 `playit-windows-x86_64-signed.exe`(Windows)/`playit-linux-amd64`(Linux),用 API 回傳的 `digest` 欄位核對 SHA256(參照專案既有的其他 GitHub binary 整合模式)。
2. claim 流程直接用 Node.js `fetch` 打 `/claim/setup`+`/claim/exchange`,不需要子行程解析 `playit-cli` 的 TUI 輸出 —— 更好控制、更適合灌進自家 UI。
3. secret 拿到後,自己選一個 `playit.toml` 路徑,子行程啟動 `playitd --secret_path <path>`(不要依賴平台預設路徑,以免撞到使用者本機已安裝的其他 playit 服務)。
4. tunnel 建立、`display_address` 查詢同樣直接 Node.js 呼叫 `/v1/tunnels/create` + `/v1/agents/rundata`,不必解析 daemon stdout。
5. `AgentTunnelConfig`(agent_config 的 name/value schema)欄位細節未完全反推,真的要送 `origin.config` 內容時,先呼叫 `/v1/schemas/get` 或用免費帳號手動跑一次 `playit setup` + 網頁建 tunnel 觀察實際 request body 比對,再定案(本次研究時間內未做這步)。

## 來源清單

- https://api.github.com/repos/playit-cloud/playit-agent/releases/latest (release/asset/SHA256 實查)
- https://api.github.com/repos/playit-cloud/playit-agent (license 欄位)
- https://github.com/playit-cloud/playit-agent (README,BSD-2-Clause 徽章、Docker 指令)
- https://raw.githubusercontent.com/playit-cloud/playit-agent/master/packages/api_client/src/api.rs (API 端點與 struct,原始碼逐字)
- https://raw.githubusercontent.com/playit-cloud/playit-agent/master/packages/api_client/src/lib.rs (Agent-Key auth header 格式)
- https://raw.githubusercontent.com/playit-cloud/playit-agent/master/packages/api_client/src/http_client.rs (Authorization header 呼叫方式)
- https://raw.githubusercontent.com/playit-cloud/playit-agent/master/packages/playit-cli/src/main.rs (CLI 子指令、claim flow 完整邏輯)
- https://raw.githubusercontent.com/playit-cloud/playit-agent/master/packages/playitd/src/bin/playitd.rs (`--secret`/`--secret_path` 參數)
- https://raw.githubusercontent.com/playit-cloud/playit-agent/master/packages/playitd/src/paths.rs (預設 secret 路徑邏輯)
- https://github.com/playit-cloud/playit-api-java (Java API client,交叉驗證端點清單與 base URL)
- https://playit.gg/support/playit-premium/ (免費 vs Premium 差異,官方頁面)
- 社群來源(未證實,僅供交叉參考):discuss.playit.gg 流量限制討論、GitHub issue #127(TCP/UDP 免費額度數字)、xgamingserver.com(Palworld 埠號)
