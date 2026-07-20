/**
 * 伺服器日誌 → 結構化事件解析(agent 與 web 共用)。
 *
 * 這是「玩家事件」的單一真相來源:web 的日誌套版(logHighlight.formatLine)與 agent 的
 * webhook 事件推送都用這裡的 regex,避免兩份規則各自漂移。
 *
 * regex 對照真實 PalDefender log(格式 `[時:分:秒][等級] 訊息`)整理,見各 pattern 註解。
 * ⚠️ 解析前一律 strip 行尾空白 / CR / BOM:Windows log 是 CRLF,收在 `$` 錨點的 regex
 *    若不先去掉 `\r` 會全部匹配失敗(踩過的坑)。
 */

export type LogEventType =
  | "chat"
  | "join"
  | "connect"
  | "leave"
  | "death"
  | "capture"
  | "build";

export interface ParsedLogEvent {
  type: LogEventType;
  /** 玩家名;connect 事件(登入前)是 steam id。 */
  name: string;
  /** chat:頻道(Global / Guild …)。 */
  channel?: string;
  /** chat:訊息內容。 */
  message?: string;
  /** death:死因(野生擊殺時為帕魯名,見 pal)。 */
  cause?: string;
  /** capture:被捕帕魯名;death:野生擊殺的帕魯名。 */
  pal?: string;
  /** build:建造物名稱。 */
  built?: string;
}

/** 去尾端空白 / CR / BOM,讓 `$` 錨點在 CRLF 日誌上正常匹配。 */
export function stripLogLine(raw: string): string {
  return raw.replace(/[\s﻿]+$/, "");
}

/**
 * 把一行 raw log 解析成結構化事件;認不得的行回 null。
 * 順序即優先序(第一個命中者勝),故聊天 / 加入等排在前面。
 */
export function parseLogEvent(raw: string): ParsedLogEvent | null {
  const line = stripLogLine(raw);
  let m: RegExpMatchArray | null;

  // 聊天  [Chat::Global]['Name' (UserId=…)]: 訊息
  if ((m = line.match(/\[Chat::(\w+)\]\['([^']+)'[^\]]*\]:\s?(.*)$/)))
    return { type: "chat", name: m[2], channel: m[1], message: m[3] };

  // 加入  'Name' (UserId=…, IP=…) has logged in.
  if ((m = line.match(/'([^']+)'[^)]*\) has logged in/)))
    return { type: "join", name: m[1] };

  // 離開  'Name' (…) has logged out.
  if ((m = line.match(/'([^']+)'[^)]*\) has logged out/)))
    return { type: "leave", name: m[1] };

  // 連線中(登入前)  steam_xxx ('IP') connected to the server.
  if ((m = line.match(/(steam_\w+) \('[^']*'\) connected to the server/)))
    return { type: "connect", name: m[1] };

  // 死亡(野生擊殺)  'Name' (…) was attacked by a wild 'Pal' … and died.
  if ((m = line.match(/'([^']+)'[^)]*\) was attacked by a wild '([^']+)'.*died/)))
    return { type: "death", name: m[1], cause: `wild ${m[2]}`, pal: m[2] };

  // 死亡(一般)  'Name' (…) died to …
  if ((m = line.match(/'([^']+)'[^)]*\) died to (.+?)\.?$/)))
    return { type: "death", name: m[1], cause: m[2] };

  // 捕捉  'Name' (…) has captured Pal 'Pal' at x y z.
  if ((m = line.match(/'([^']+)'[^)]*\) has captured Pal '([^']+)'/)))
    return { type: "capture", name: m[1], pal: m[2] };

  // 建造  'Name' (…) has build a …
  if ((m = line.match(/'([^']+)'[^)]*\) has build a (.+?)\.?$/)))
    return { type: "build", name: m[1], built: m[2] };

  return null;
}
