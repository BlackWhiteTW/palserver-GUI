import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { enableAutoReload, readAutoReload } from "./palschema.js";

/** 假的伺服器根目錄(Pal/Binaries/Win64/UE4SS/Mods/PalSchema 佈局)。 */
function fakeRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "palschema-ar-"));
  fs.mkdirSync(path.join(root, "Pal", "Binaries", "Win64", "UE4SS", "Mods", "PalSchema"), { recursive: true });
  return root;
}
const cfgFile = (root: string) =>
  path.join(root, "Pal", "Binaries", "Win64", "UE4SS", "Mods", "PalSchema", "config", "config.json");

test("enableAutoReload:config 不存在時建立並只寫我們的鍵", () => {
  const root = fakeRoot();
  assert.equal(readAutoReload(root), false);
  enableAutoReload(root);
  assert.deepEqual(JSON.parse(fs.readFileSync(cfgFile(root), "utf8")), { enableAutoReload: true });
  assert.equal(readAutoReload(root), true);
  fs.rmSync(root, { recursive: true, force: true });
});

test("enableAutoReload:保留既有設定鍵(languageOverride 等)", () => {
  const root = fakeRoot();
  fs.mkdirSync(path.dirname(cfgFile(root)), { recursive: true });
  fs.writeFileSync(
    cfgFile(root),
    JSON.stringify({ languageOverride: "zh-Hant", enableAutoReload: false, enableDebugLogging: true }, null, 2),
  );
  enableAutoReload(root);
  assert.deepEqual(JSON.parse(fs.readFileSync(cfgFile(root), "utf8")), {
    languageOverride: "zh-Hant",
    enableAutoReload: true,
    enableDebugLogging: true,
  });
  fs.rmSync(root, { recursive: true, force: true });
});

test("enableAutoReload:已開啟時不重寫檔案(冪等)", () => {
  const root = fakeRoot();
  enableAutoReload(root);
  const before = fs.statSync(cfgFile(root)).mtimeMs;
  enableAutoReload(root); // 已 true → 提前 return,不動檔案
  assert.equal(fs.statSync(cfgFile(root)).mtimeMs, before);
  fs.rmSync(root, { recursive: true, force: true });
});

test("readAutoReload:壞 JSON 視為未開啟", () => {
  const root = fakeRoot();
  fs.mkdirSync(path.dirname(cfgFile(root)), { recursive: true });
  fs.writeFileSync(cfgFile(root), "{oops");
  assert.equal(readAutoReload(root), false);
  fs.rmSync(root, { recursive: true, force: true });
});
