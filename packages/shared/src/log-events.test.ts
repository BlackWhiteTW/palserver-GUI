import { test } from "node:test";
import assert from "node:assert/strict";
import { parseLogEvent, eventMatches } from "./index.js";

// 真實 PalDefender log 行(含 [時:分:秒][等級] 前綴、CRLF 尾端 \r)。
const CR = "\r"; // 模擬 Windows CRLF 切行後殘留的 CR

test("parseLogEvent: chat", () => {
  const ev = parseLogEvent(`[12:00:01][info] [Chat::Global]['Alice' (UserId=steam_1)]: hello world` + CR);
  assert.deepEqual(ev, { type: "chat", name: "Alice", channel: "Global", message: "hello world" });
});

test("parseLogEvent: join", () => {
  const ev = parseLogEvent(`[12:00:02][info] 'Bob' (UserId=steam_2, IP=1.2.3.4) has logged in.` + CR);
  assert.equal(ev?.type, "join");
  assert.equal(ev?.name, "Bob");
});

test("parseLogEvent: leave", () => {
  const ev = parseLogEvent(`[12:00:03][info] 'Bob' (UserId=steam_2) has logged out.` + CR);
  assert.equal(ev?.type, "leave");
  assert.equal(ev?.name, "Bob");
});

test("parseLogEvent: connect (pre-login)", () => {
  const ev = parseLogEvent(`[12:00:00][info] steam_2 ('1.2.3.4') connected to the server.` + CR);
  assert.equal(ev?.type, "connect");
  assert.equal(ev?.name, "steam_2");
});

test("parseLogEvent: death (generic)", () => {
  const ev = parseLogEvent(`[12:01:00][info] 'Alice' (UserId=steam_1) died to fall damage.` + CR);
  assert.deepEqual(ev, { type: "death", name: "Alice", cause: "fall damage" });
});

test("parseLogEvent: death (wild pal) — sets pal, matched before generic", () => {
  const ev = parseLogEvent(
    `[12:01:05][info] 'Alice' (UserId=steam_1) was attacked by a wild 'Lamball' and died.` + CR,
  );
  assert.equal(ev?.type, "death");
  assert.equal(ev?.pal, "Lamball");
});

test("parseLogEvent: capture", () => {
  const ev = parseLogEvent(`[12:02:00][info] 'Alice' (UserId=steam_1) has captured Pal 'Chikipi' at 1 2 3.` + CR);
  assert.deepEqual(ev, { type: "capture", name: "Alice", pal: "Chikipi" });
});

test("parseLogEvent: unknown line → null", () => {
  assert.equal(parseLogEvent(`[12:03:00][warning] some unrelated message` + CR), null);
});

test("parseLogEvent: CRLF must not break $-anchored chat regex", () => {
  // 若忘記 strip \r,聊天 regex 的尾端 `$` 會匹配失敗 → 回 null(這正是要防的回歸)。
  assert.notEqual(parseLogEvent(`[Chat::Guild]['Zoe' (UserId=steam_9)]: gg` + CR), null);
});

test("eventMatches: exact / namespace wildcard / global", () => {
  assert.equal(eventMatches(["player.chat"], "player.chat"), true);
  assert.equal(eventMatches(["player.chat"], "player.join"), false);
  assert.equal(eventMatches(["player.*"], "player.join"), true);
  assert.equal(eventMatches(["player.*"], "server.crash"), false);
  assert.equal(eventMatches(["*"], "boss.killed"), true);
  assert.equal(eventMatches([], "player.join"), false);
});
