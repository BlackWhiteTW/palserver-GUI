import { test } from "node:test";
import assert from "node:assert/strict";
import { logLineToEvent, onAgentEvent, emitAgentEvent, type AgentEvent } from "./events.js";

const CR = "\r"; // Windows CRLF 殘留

test("logLineToEvent: chat → player.chat", () => {
  const m = logLineToEvent(`[12:00:01][info] [Chat::Global]['Alice' (UserId=steam_1)]: hi there` + CR);
  assert.deepEqual(m, { type: "player.chat", data: { name: "Alice", channel: "Global", message: "hi there" } });
});

test("logLineToEvent: death → player.death (with pal on wild kill)", () => {
  const wild = logLineToEvent(`[12:01:00][info] 'Bob' (UserId=steam_2) was attacked by a wild 'Lamball' and died.` + CR);
  assert.equal(wild?.type, "player.death");
  assert.equal((wild?.data as { pal?: string }).pal, "Lamball");
  const generic = logLineToEvent(`[12:01:10][info] 'Bob' (UserId=steam_2) died to fall damage.` + CR);
  assert.deepEqual(generic, { type: "player.death", data: { name: "Bob", cause: "fall damage", pal: undefined } });
});

test("logLineToEvent: capture → player.capture", () => {
  const m = logLineToEvent(`[12:02:00][info] 'Alice' (UserId=steam_1) has captured Pal 'Chikipi' at 1 2 3.` + CR);
  assert.deepEqual(m, { type: "player.capture", data: { name: "Alice", pal: "Chikipi" } });
});

test("logLineToEvent: join / leave / build / unknown → null (那些不從 log 推)", () => {
  assert.equal(logLineToEvent(`[12:00:02][info] 'Bob' (UserId=steam_2) has logged in.` + CR), null);
  assert.equal(logLineToEvent(`[12:00:03][info] 'Bob' (UserId=steam_2) has logged out.` + CR), null);
  assert.equal(logLineToEvent(`[12:00:04][info] 'Bob' (UserId=steam_2) has build a Wooden Wall.` + CR), null);
  assert.equal(logLineToEvent(`[12:03:00][warning] unrelated` + CR), null);
});

test("bus: emit 送達訂閱者,取消訂閱後不再收到", () => {
  const got: AgentEvent[] = [];
  const off = onAgentEvent((ev) => got.push(ev));
  emitAgentEvent("player.chat", "inst-1", { name: "A", channel: "Global", message: "x" });
  off();
  emitAgentEvent("player.chat", "inst-1", { name: "A", channel: "Global", message: "y" });
  assert.equal(got.length, 1);
  assert.equal(got[0].type, "player.chat");
  assert.equal(got[0].instanceId, "inst-1");
  assert.ok(got[0].occurredAt); // ISO 時間戳有填
});
