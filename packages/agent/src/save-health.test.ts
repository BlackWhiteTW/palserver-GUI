import assert from "node:assert/strict";
import test from "node:test";
import { Readable } from "node:stream";
import { analyzeLevelJsonStream } from "./save-health.js";

/**
 * 合成的 Level.sav JSON 最小樣本 — 形狀照上游 palsav(pin 2c8c65c)輸出:
 * diag.py 的取值路徑 + rawdata/group.py 的公會名冊欄位。
 * 這份測試同時是「我們假設的上游 JSON 形狀」的文件化;上游改格式時先改這裡。
 */

const EPOCH_TICKS = 621_355_968_000_000_000n;
const TICKS_PER_DAY = 864_000_000_000n;

/** mtime 基準:2026-07-15T00:00:00Z */
const MTIME_MS = Date.UTC(2026, 6, 15);

function ticksDaysAgo(days: number): string {
  const now = BigInt(MTIME_MS) * 10_000n + EPOCH_TICKS;
  return String(now - BigInt(days) * TICKS_PER_DAY);
}

function charEntry(isPlayer: boolean) {
  return {
    key: { PlayerUId: { value: "u" }, InstanceId: { value: "i" } },
    value: {
      RawData: {
        value: {
          object: {
            SaveParameter: {
              value: isPlayer ? { IsPlayer: { value: true }, Level: { value: 10 } } : { Level: { value: 5 } },
            },
          },
        },
      },
    },
  };
}

function guildEntry(name: string, players: { uid: string; name: string; daysAgo: number }[]) {
  return {
    key: { value: "gid" },
    value: {
      GroupType: { value: { value: "EPalGroupType::Guild" } },
      RawData: {
        value: {
          group_type: "EPalGroupType::Guild",
          guild_name: name,
          players: players.map((p) => ({
            player_uid: p.uid,
            player_info: {
              // 數字用「原始 JSON 數字」寫進字串裡,見 buildJson()
              last_online_real_time: `__RAW_${ticksDaysAgo(p.daysAgo)}__`,
              player_name: p.name,
            },
          })),
        },
      },
    },
  };
}

function orgEntry() {
  return {
    key: { value: "oid" },
    value: { RawData: { value: { group_type: "EPalGroupType::Organization", players: [] } } },
  };
}

function containerEntry(slotNum: number, itemIds: (string | null)[]) {
  return {
    key: { ID: { value: "cid" } },
    value: {
      SlotNum: { value: `__RAW_${slotNum}__` },
      Slots: {
        value: {
          values: itemIds.map((id) => ({
            RawData: { value: { item: { static_id: id ?? "None" } } },
          })),
        },
      },
    },
  };
}

function mapObject(id: string) {
  return { MapObjectId: { value: id }, Model: { value: {} } };
}

function buildJson(): string {
  const doc = {
    header: { save_game_class_name: "PalWorldSaveGame" },
    properties: {
      worldSaveData: {
        value: {
          CharacterSaveParameterMap: {
            value: [charEntry(true), charEntry(true), charEntry(false), charEntry(false), charEntry(false)],
          },
          GroupSaveDataMap: {
            value: [
              guildEntry("ActiveGuild", [
                { uid: "p1", name: "Alice", daysAgo: 2 },
                { uid: "p2", name: "Bob", daysAgo: 45 },
              ]),
              guildEntry("GhostGuild", []),
              orgEntry(),
            ],
          },
          ItemContainerSaveData: {
            value: [containerEntry(20, ["Wood", null]), containerEntry(10, [null, null]), containerEntry(5, [])],
          },
          CharacterContainerSaveData: { value: [{ key: {}, value: {} }, { key: {}, value: {} }] },
          MapObjectSaveData: {
            value: { values: [mapObject("PalBoxV2"), mapObject("DropItemBase"), mapObject("dropitem"), mapObject("Campfire")] },
          },
          DynamicItemSaveData: { value: { values: [{ a: 1 }] } },
        },
        type: "StructProperty",
      },
    },
    trailer: "AAAA",
  };
  // JSON.stringify 會把 i64 ticks 弄成 number literal 沒問題(此處僅測試),
  // 但為了保證與 orjson 相同的「大整數原樣輸出」,用佔位符替換成裸數字。
  return JSON.stringify(doc).replace(/"__RAW_(-?\d+)__"/g, "$1");
}

test("analyzeLevelJsonStream:計數與離線名單", async () => {
  const r = await analyzeLevelJsonStream(Readable.from([buildJson()]), MTIME_MS);

  assert.equal(r.counts.players, 2);
  assert.equal(r.counts.pals, 3);
  assert.equal(r.counts.guilds, 2); // org 不算
  assert.equal(r.counts.guildsEmpty, 1);
  assert.deepEqual(r.emptyGuildNames, ["GhostGuild"]);

  assert.equal(r.counts.itemContainers, 3);
  assert.equal(r.counts.itemContainersEmpty, 2); // 全空 + 零槽
  assert.equal(r.counts.itemSlots, 35);
  assert.equal(r.counts.charContainers, 2);

  assert.equal(r.counts.mapObjects, 4);
  assert.equal(r.counts.dropItems, 2); // DropItemBase + dropitem(大小寫不敏感)
  assert.equal(r.counts.dynamicItems, 1);

  // Alice 2 天前上線(未達 30 天)不列;Bob 45 天列入
  assert.equal(r.counts.playersInactive30d, 1);
  assert.equal(r.inactivePlayers.length, 1);
  assert.equal(r.inactivePlayers[0].name, "Bob");
  assert.equal(r.inactivePlayers[0].uid, "p2");
  assert.equal(r.inactivePlayers[0].guildName, "ActiveGuild");
  assert.equal(r.inactivePlayers[0].lastOnlineDaysAgo, 45);
});

test("analyzeLevelJsonStream:荒謬 ticks 回 null 而非硬湊", async () => {
  const doc = {
    properties: {
      worldSaveData: {
        value: {
          GroupSaveDataMap: {
            value: [
              guildEntry("G", [{ uid: "p9", name: "Weird", daysAgo: 9999 }]), // 超出 sanity 範圍
            ],
          },
        },
      },
    },
  };
  const json = JSON.stringify(doc).replace(/"__RAW_(-?\d+)__"/g, "$1");
  const r = await analyzeLevelJsonStream(Readable.from([json]), MTIME_MS);
  assert.equal(r.counts.guilds, 1);
  assert.equal(r.counts.playersInactive30d, 0); // days=null 不計入不活躍
  assert.equal(r.inactivePlayers.length, 0);
});

test("analyzeLevelJsonStream:壞 JSON 以錯誤收場", async () => {
  await assert.rejects(
    () => analyzeLevelJsonStream(Readable.from(['{"properties": {broken']), MTIME_MS),
    /解析失敗/,
  );
});
