import assert from "node:assert/strict";
import test from "node:test";
import type { InstanceRecord } from "./store.js";
import { containerConverterCommand } from "./runtime-health.js";
import { palsavAssetName } from "./save-tools.js";

const record = (backend: InstanceRecord["backend"], runtime: InstanceRecord["runtime"]): InstanceRecord =>
  ({ backend, runtime } as InstanceRecord);

test("Wine Docker/Kubernetes 健檢固定使用 Windows palsav", () => {
  assert.equal(palsavAssetName(record("docker", "wine")), "palsav-win-x64.exe");
  assert.equal(palsavAssetName(record("k8s", "wine")), "palsav-win-x64.exe");
  assert.equal(palsavAssetName(record("docker", "native")), "palsav-linux-x64");
  assert.equal(palsavAssetName(record("k8s", "native")), "palsav-linux-x64");
});

test("Wine 容器轉換命令固定 hash seed 並使用相容的參數順序", () => {
  assert.deepEqual(
    containerConverterCommand(
      "wine",
      "/tmp/job/palsav-win-x64.exe",
      "/tmp/job/Level.sav",
      "/tmp/job/Level.sav.json",
    ),
    [
      "timeout",
      "1800",
      "env",
      "PYTHONHASHSEED=0",
      "wine",
      "/tmp/job/palsav-win-x64.exe",
      "--to-json",
      "-o",
      "/tmp/job/Level.sav.json",
      "--minify-json",
      "-f",
      "/tmp/job/Level.sav",
    ],
  );
});

test("非 Wine 容器直接執行容器平台工具", () => {
  const command = containerConverterCommand(
    "native",
    "/tmp/job/palsav-linux-x64",
    "/tmp/job/Level.sav",
    "/tmp/job/Level.sav.json",
  );
  assert.equal(command[4], "/tmp/job/palsav-linux-x64");
  assert.equal(command.includes("wine"), false);
});
