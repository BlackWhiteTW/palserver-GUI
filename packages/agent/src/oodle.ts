import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { DATA_DIR } from "./env.js";

/**
 * Oodle 解壓支援 — 新版 Palworld 存檔(magic "PlM")的 payload 是 Oodle
 * Mermaid 壓縮流(位元組 8C 0A 開頭),Node 沒有內建解壓器。
 *
 * 方案:ooz(clean-room 的 Oodle 解壓實作)的 WASM 建置(npm: ooz-wasm)。
 * 它是 GPL-3.0,不能打包進本專案(PolyForm-NC)的發行物 —— 所以比照
 * DepotDownloader 模式:第一次遇到 PlM 存檔時才從 CDN 下載到 data-dir
 * (釘版本 + SHA-256 驗證),以獨立元件的形式在執行期載入。
 *
 * 只需要「解壓」:寫回一律轉存 zlib 的 PlZ 容器,遊戲同時支援兩種格式
 * (每次遊戲改版,舊 PlZ 存檔都能被新版讀取)。
 */

const OOZ_VERSION = "2.0.0";
const OOZ_URL = `https://cdn.jsdelivr.net/npm/ooz-wasm@${OOZ_VERSION}/build/ooz.js`;
/** 對應 npm 套件 ooz-wasm@2.0.0 的 build/ooz.js(單檔內嵌 wasm)。 */
const OOZ_SHA256 = "5aed30da1da505793fd1e3383db4572797bcce8a0e9e71176d1f6a5d60ec0e6c";

interface OozModule {
  _malloc(n: number): number;
  _free(p: number): void;
  _Kraken_Decompress(src: number, srcLen: number, dst: number, dstLen: number): number;
  HEAPU8: Uint8Array;
}

let oozPromise: Promise<OozModule> | null = null;

async function ensureOozFile(): Promise<string> {
  const dir = path.join(DATA_DIR, "tools", `ooz-wasm-${OOZ_VERSION}`);
  const file = path.join(dir, "ooz.js");
  if (!fs.existsSync(file)) {
    const res = await fetch(OOZ_URL, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`下載 Oodle 解壓元件失敗:HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    const hash = crypto.createHash("sha256").update(buf).digest("hex");
    if (hash !== OOZ_SHA256) throw new Error("Oodle 解壓元件雜湊不符,已拒絕載入(可能被竄改)");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, buf);
  } else {
    // 既有檔案也重驗一次,壞檔就刪掉重來(下次呼叫會重新下載)。
    const hash = crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
    if (hash !== OOZ_SHA256) {
      fs.rmSync(file, { force: true });
      throw new Error("Oodle 解壓元件雜湊不符,已移除;請再試一次(會重新下載)");
    }
  }
  return file;
}

/** 載入 ooz wasm 模組(單例)。檔案是 ESM(emscripten 輸出),為了在 SEA
 *  打包環境也能載,把它轉成 CJS 形式後用 Function 執行 —— 只動兩處:
 *  import.meta.url(僅用於定位外部 wasm,單檔建置用不到)與 export 語句。 */
function loadOoz(): Promise<OozModule> {
  if (!oozPromise) {
    oozPromise = (async () => {
      const file = await ensureOozFile();
      let src = fs.readFileSync(file, "utf8");
      // ESM → CJS:import.meta.url 全部換成真實檔案 URL 字串(glue 只拿它定位
      // 外部 wasm 與 createRequire,單檔建置實際用不到外部 wasm),export 改 CJS。
      const fileUrl = JSON.stringify(new URL(`file://${file.replace(/\\/g, "/")}`).href);
      src = src.split("import.meta.url").join(fileUrl);
      src = src.replace(/export default Module;\s*$/, "module.exports = Module;");
      const mod = { exports: null as unknown };
      new Function("module", "exports", src)(mod, mod.exports);
      const factory = mod.exports as () => Promise<OozModule>;
      if (typeof factory !== "function") throw new Error("Oodle 解壓元件載入失敗(格式不符預期)");
      return await factory();
    })();
    // 失敗就重置,下次呼叫重試(例如網路暫時不通)。
    oozPromise.catch(() => {
      oozPromise = null;
    });
  }
  return oozPromise;
}

/** 解壓 Oodle 壓縮流(Kraken/Mermaid/Leviathan 由資料自帶的 header 決定)。 */
export async function oodleDecompress(data: Buffer, rawSize: number): Promise<Buffer> {
  const ooz = await loadOoz();
  const SAFE_SPACE = 64; // ooz 解碼器可能寫超出 rawSize 一點點的緩衝
  const srcPtr = ooz._malloc(data.byteLength);
  const dstPtr = ooz._malloc(rawSize + SAFE_SPACE);
  try {
    ooz.HEAPU8.set(data, srcPtr);
    const n = ooz._Kraken_Decompress(srcPtr, data.byteLength, dstPtr, rawSize);
    if (n !== rawSize) throw new Error(`Oodle 解壓失敗(回傳 ${n},預期 ${rawSize})`);
    return Buffer.from(ooz.HEAPU8.subarray(dstPtr, dstPtr + rawSize));
  } finally {
    ooz._free(srcPtr);
    ooz._free(dstPtr);
  }
}
