import assert from "node:assert/strict";
import test from "node:test";
import { checkPorts } from "./port-check.js";

test("checkPorts marks managed and same-protocol duplicate ports as conflicts", async () => {
  const result = await checkPorts(
    [
      { key: "game", port: 43001, protocol: "udp" },
      { key: "query", port: 43001, protocol: "udp" },
      { key: "rest", port: 43002, protocol: "tcp" },
    ],
    { udp: new Set([43001]), tcp: new Set() },
    { probe: async () => true },
  );

  assert.equal(result[0].free, false);
  assert.equal(result[1].free, false);
  assert.equal(result[2].free, true);
  assert.notEqual(result[0].suggestion, undefined);
  assert.notEqual(result[1].suggestion, undefined);
});
