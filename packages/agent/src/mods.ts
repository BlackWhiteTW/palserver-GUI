import fs from "node:fs";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ModComponent, ModsStatus } from "@palserver/shared";
import type { DriverContext } from "./driver.js";
import type { InstanceRecord } from "./store.js";
import { serverRoot } from "./native.js";

const execFileP = promisify(execFile);

/**
 * Mod management for native instances (the v1 headline feature, rebuilt):
 *  - PalDefender (formerly PalGuard): standalone anti-cheat, extracted into
 *    Pal/Binaries/Win64 (PalDefender.dll + d3d9.dll proxy loader); its config
 *    tree self-generates under Win64/PalDefender on first boot.
 *    Docs: https://ultimeit.github.io/PalDefender/
 *  - UE4SS: Lua/Blueprint mod loader, extracted into the same dir
 *    (dwmapi.dll + ue4ss/). Lua mods live in ue4ss/Mods, toggled via mods.txt.
 * Both are fetched from their GitHub latest release (URL overridable via env).
 */

const GH_REPOS: Record<ModComponent, { repo: string; asset: RegExp; envUrl: string }> = {
  ue4ss: {
    repo: "UE4SS-RE/RE-UE4SS",
    asset: /^UE4SS_v?[\d.]+\.zip$/i,
    envUrl: "PALSERVER_UE4SS_URL",
  },
  paldefender: {
    // The wiki names the asset PalDefender_Windows.zip but releases currently
    // ship it as PalDefender.zip — accept both.
    repo: "Ultimeit/PalDefender",
    asset: /^PalDefender(_Windows)?\.zip$/i,
    envUrl: "PALSERVER_PALDEFENDER_URL",
  },
};

const win64Dir = (root: string) => path.join(root, "Pal", "Binaries", "Win64");
/** UE4SS mods dir — new layout (ue4ss/Mods) or the flat pre-3.1 layout (Mods). */
const ue4ssModsDir = (root: string) => {
  const nested = path.join(win64Dir(root), "ue4ss", "Mods");
  return fs.existsSync(nested) ? nested : path.join(win64Dir(root), "Mods");
};
const paksDir = (root: string) => path.join(root, "Pal", "Content", "Paks");
/** Marker recording which versions the GUI installed. */
const markerFile = (root: string) => path.join(win64Dir(root), ".palserver-mods.json");

function readMarker(root: string): Partial<Record<ModComponent, string>> {
  try {
    return JSON.parse(fs.readFileSync(markerFile(root), "utf8"));
  } catch {
    return {};
  }
}

function writeMarker(root: string, component: ModComponent, version: string): void {
  const marker = { ...readMarker(root), [component]: version };
  fs.writeFileSync(markerFile(root), JSON.stringify(marker, null, 2));
}

export function getModsStatus(rec: InstanceRecord, ctx: DriverContext): ModsStatus {
  const unsupported = (reason: string): ModsStatus => ({
    supported: false,
    reason,
    ue4ss: { installed: false, version: null },
    paldefender: { installed: false, version: null },
    luaMods: [],
    pakMods: [],
  });

  if (rec.backend !== "native") {
    return unsupported("模組管理目前僅支援原生模式的實例");
  }
  const root = serverRoot(rec, ctx);
  if (!fs.existsSync(win64Dir(root))) {
    return unsupported("伺服器尚未安裝完成 — 先啟動一次讓 agent 下載伺服器");
  }

  const marker = readMarker(root);
  const ue4ssInstalled =
    fs.existsSync(path.join(win64Dir(root), "ue4ss", "UE4SS.dll")) ||
    fs.existsSync(path.join(win64Dir(root), "UE4SS.dll"));
  const paldefenderInstalled = fs.existsSync(path.join(win64Dir(root), "PalDefender.dll"));

  return {
    supported: true,
    ue4ss: { installed: ue4ssInstalled, version: marker.ue4ss ?? null },
    paldefender: { installed: paldefenderInstalled, version: marker.paldefender ?? null },
    luaMods: listLuaMods(root),
    pakMods: listPakMods(root),
  };
}

function listLuaMods(root: string): { name: string; enabled: boolean }[] {
  const dir = ue4ssModsDir(root);
  if (!fs.existsSync(dir)) return [];
  const enabledFromTxt = parseModsTxt(root);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== "shared")
    .map((e) => ({
      name: e.name,
      enabled:
        enabledFromTxt.get(e.name) === true ||
        fs.existsSync(path.join(dir, e.name, "enabled.txt")),
    }));
}

function parseModsTxt(root: string): Map<string, boolean> {
  const result = new Map<string, boolean>();
  const file = path.join(ue4ssModsDir(root), "mods.txt");
  if (!fs.existsSync(file)) return result;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const match = line.trim().match(/^([\w-]+)\s*:\s*([01])$/);
    if (match) result.set(match[1], match[2] === "1");
  }
  return result;
}

function listPakMods(root: string): string[] {
  const results: string[] = [];
  const scan = (dir: string, prefix: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".pak") && !entry.name.startsWith("Pal-")) {
        results.push(prefix + entry.name);
      }
      if (entry.isDirectory() && entry.name === "LogicMods") {
        scan(path.join(dir, entry.name), "LogicMods/");
      }
    }
  };
  scan(paksDir(root), "");
  return results;
}

export function setLuaModEnabled(
  rec: InstanceRecord,
  ctx: DriverContext,
  name: string,
  enabled: boolean,
): void {
  const root = serverRoot(rec, ctx);
  const modDir = path.join(ue4ssModsDir(root), name);
  if (!/^[\w-]+$/.test(name) || !fs.existsSync(modDir)) {
    throw Object.assign(new Error(`unknown lua mod: ${name}`), { statusCode: 404 });
  }
  // enabled.txt overrides mods.txt, so clear it when disabling.
  if (!enabled) fs.rmSync(path.join(modDir, "enabled.txt"), { force: true });

  const file = path.join(ue4ssModsDir(root), "mods.txt");
  const lines = fs.existsSync(file) ? fs.readFileSync(file, "utf8").split("\n") : [];
  const flag = `${name} : ${enabled ? 1 : 0}`;
  const idx = lines.findIndex((l) => l.trim().startsWith(`${name} `) || l.trim().startsWith(`${name}:`));
  if (idx >= 0) lines[idx] = flag;
  else lines.unshift(flag);
  fs.writeFileSync(file, lines.join("\n"));
}

async function resolveDownload(component: ModComponent): Promise<{ version: string; url: string }> {
  const { repo, asset, envUrl } = GH_REPOS[component];
  const override = process.env[envUrl];
  if (override) return { version: "custom", url: override };

  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { "user-agent": "palserver-gui", accept: "application/vnd.github+json" },
  });
  if (!res.ok) throw new Error(`GitHub release lookup failed for ${repo}: HTTP ${res.status}`);
  const release = (await res.json()) as {
    tag_name: string;
    assets: { name: string; browser_download_url: string }[];
  };
  const match = release.assets.find((a) => asset.test(a.name));
  if (!match) {
    throw new Error(
      `no matching asset in ${repo}@${release.tag_name} (looked for ${asset}); ` +
        `set ${envUrl} to pin a download URL`,
    );
  }
  return { version: release.tag_name, url: match.browser_download_url };
}

export async function installComponent(
  rec: InstanceRecord,
  ctx: DriverContext,
  component: ModComponent,
): Promise<{ version: string }> {
  const status = getModsStatus(rec, ctx);
  if (!status.supported) {
    throw Object.assign(new Error(status.reason ?? "mods unsupported"), { statusCode: 409 });
  }
  const root = serverRoot(rec, ctx);
  const { version, url } = await resolveDownload(component);

  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  // instanceDir may not exist yet for adopted installs that were never started
  fs.mkdirSync(ctx.instanceDir, { recursive: true });
  const zipPath = path.join(ctx.instanceDir, `${component}.zip`);
  fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));

  // Both zips are laid out relative to Pal/Binaries/Win64.
  // (tar on Windows 10+/macOS is bsdtar, which extracts zip archives.)
  await execFileP("tar", ["-xf", zipPath, "-C", win64Dir(root)]);
  fs.rmSync(zipPath, { force: true });
  writeMarker(root, component, version);
  return { version };
}
