import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { CustomPalInput } from "@palserver/shared";
import type { InstanceRecord } from "./store.js";
import type { DriverContext } from "./driver.js";
import { serverRoot } from "./native.js";
import { rconExec } from "./rcon.js";
import { givePalEgg } from "./paldefender-rest.js";
import { runtimeRemove, runtimeWriteText } from "./runtime-files.js";

/**
 * 自訂帕魯:把表單轉成 PalDefender 的 PalTemplate.json,寫進它讀取的資料夾,再發給玩家。
 * 範本用完即刪。PalDefender 只支援原生實例,路徑固定在 Pal/Binaries/Win64/PalDefender/Pals/Templates。
 *  - pal 模式:RCON `givepal_j <UserId> <範本名>`。
 *  - egg 模式:PalDefender REST `/give/paleggs/{UserId}`,因為 RCON 的 giveegg_j 沒有玩家參數。
 */

const templatesRel = "Pal/Binaries/Win64/PalDefender/Pals/Templates";
const templatesDir = (root: string) => path.join(root, ...templatesRel.split("/"));

/** 表單 -> PalTemplate 欄位(省略的就不寫,交給 PalDefender 預設)。 */
function buildTemplate(input: CustomPalInput): Record<string, unknown> {
  const t: Record<string, unknown> = { PalID: input.palId };
  if (input.nickname) t.Nickname = input.nickname;
  if (input.gender) t.Gender = input.gender;
  if (input.level != null) t.Level = input.level;
  if (input.partnerSkillLevel != null) t.PartnerSkillLevel = input.partnerSkillLevel;
  if (input.passives?.length) t.Passives = input.passives;
  if (input.activeSkills?.length) t.ActiveSkills = input.activeSkills;
  if (input.condensedPals != null) t.CondensedPals = input.condensedPals;

  const iv: Record<string, number> = {};
  if (input.ivs?.health != null) iv.Health = input.ivs.health;
  if (input.ivs?.attackMelee != null) iv.AttackMelee = input.ivs.attackMelee;
  if (input.ivs?.attackShot != null) iv.AttackShot = input.ivs.attackShot;
  if (input.ivs?.defense != null) iv.Defense = input.ivs.defense;
  if (Object.keys(iv).length) t.IVs = iv;

  const souls: Record<string, number> = {};
  if (input.souls?.health != null) souls.Health = input.souls.health;
  if (input.souls?.attack != null) souls.Attack = input.souls.attack;
  if (input.souls?.defense != null) souls.Defense = input.souls.defense;
  if (input.souls?.craftSpeed != null) souls.CraftSpeed = input.souls.craftSpeed;
  if (Object.keys(souls).length) t.PalSouls = souls;

  return t;
}

/** 寫暫存範本 → 依模式用 RCON givepal_j 或 REST 給蛋 → 刪暫存檔。回傳給予結果訊息。 */
export async function giveCustomPal(
  rec: InstanceRecord,
  ctx: DriverContext,
  input: CustomPalInput,
): Promise<string> {
  const name = `gui_${crypto.randomBytes(6).toString("hex")}`;
  const relFile = `${templatesRel}/${name}.json`;
  if (rec.backend === "k8s") {
    await runtimeWriteText(rec, ctx, relFile, JSON.stringify(buildTemplate(input), null, 2));
  } else {
    const dir = templatesDir(serverRoot(rec, ctx));
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(buildTemplate(input), null, 2));
  }

  try {
    if (!input.userId) throw Object.assign(new Error("缺少目標玩家"), { statusCode: 400 });
    if (input.mode === "egg") {
      // REST /give/paleggs/{UserId},PalTemplate 帶完整範本檔名(含 .json)。
      if (!input.eggId) throw Object.assign(new Error("缺少蛋 ID"), { statusCode: 400 });
      const n = await givePalEgg(rec, ctx, input.userId, input.eggId, `${name}.json`, input.level);
      return `已給予帕魯蛋 ×${n}`;
    }
    // /givepal_j <UserID> <PalTemplate>
    return await rconExec(rec, `givepal_j ${input.userId} ${name}`);
  } finally {
    if (rec.backend === "k8s") {
      await runtimeRemove(rec, ctx, relFile).catch(() => {});
    } else {
      fs.rmSync(path.join(templatesDir(serverRoot(rec, ctx)), `${name}.json`), { force: true });
    }
  }
}
