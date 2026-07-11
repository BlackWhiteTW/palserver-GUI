/**
 * The single source of truth for PalWorldSettings.ini options the GUI manages.
 * Keys and types follow the official server docs
 * (docs.palworldgame.com/settings-and-operation/configuration, v0.7.x).
 *
 * Defaults below seed NEW instances only. TODO(v2): once an instance's server
 * files are installed, parse the game's own DefaultPalWorldSettings.ini and
 * prefer its values — that keeps us correct across game updates.
 *
 * The zod schema, the agent's ini serializer, and the web settings editor are
 * all derived from this table, so adding an option here is the only step
 * needed to surface it end to end.
 */

export type OptionCategory =
  | "server"
  | "pal"
  | "player"
  | "guild"
  | "build"
  | "drop"
  | "world";

export type OptionMeta =
  | { type: "float"; default: number; min: number; max: number; step: number; category: OptionCategory }
  | { type: "int"; default: number; min: number; max: number; category: OptionCategory }
  | { type: "bool"; default: boolean; category: OptionCategory }
  | { type: "enum"; default: string; choices: readonly string[]; category: OptionCategory }
  | { type: "string"; default: string; maxLength: number; secret?: boolean; category: OptionCategory };

const rate = (
  category: OptionCategory,
  d = 1,
  min = 0.1,
  max = 5,
  step = 0.1,
): OptionMeta => ({ type: "float", default: d, min, max, step, category });

export const WORLD_OPTIONS = {
  // ── server ────────────────────────────────────────────────────────────
  ServerName: { type: "string", default: "palserver GUI Server", maxLength: 64, category: "server" },
  ServerDescription: { type: "string", default: "", maxLength: 256, category: "server" },
  ServerPassword: { type: "string", default: "", maxLength: 64, secret: true, category: "server" },
  AdminPassword: { type: "string", default: "", maxLength: 64, secret: true, category: "server" },
  ServerPlayerMaxNum: { type: "int", default: 32, min: 1, max: 32, category: "server" },
  CoopPlayerMaxNum: { type: "int", default: 4, min: 1, max: 8, category: "server" },
  PublicIP: { type: "string", default: "", maxLength: 64, category: "server" },
  PublicPort: { type: "int", default: 8211, min: 1024, max: 65535, category: "server" },
  bIsMultiplay: { type: "bool", default: false, category: "server" },
  bShowPlayerList: { type: "bool", default: false, category: "server" },
  bIsShowJoinLeftMessage: { type: "bool", default: true, category: "server" },
  RESTAPIEnabled: { type: "bool", default: true, category: "server" },
  RESTAPIPort: { type: "int", default: 8212, min: 1024, max: 65535, category: "server" },
  RCONEnabled: { type: "bool", default: false, category: "server" },
  RCONPort: { type: "int", default: 25575, min: 1024, max: 65535, category: "server" },
  ChatPostLimitPerMinute: { type: "int", default: 10, min: 1, max: 120, category: "server" },
  LogFormatType: { type: "enum", default: "Text", choices: ["Text", "Json"], category: "server" },
  bIsUseBackupSaveData: { type: "bool", default: true, category: "server" },
  AutoSaveSpan: { type: "float", default: 30, min: 10, max: 600, step: 5, category: "server" },
  Region: { type: "string", default: "", maxLength: 64, category: "server" },
  CrossplayPlatforms: {
    type: "string", default: "(Steam,Xbox,PS5,Mac)", maxLength: 256, category: "server",
  },
  BanListURL: {
    type: "string",
    default: "https://b.palworldgame.com/api/banlist.txt",
    maxLength: 512,
    category: "server",
  },
  bUseAuth: { type: "bool", default: true, category: "server" },
  bAllowClientMod: { type: "bool", default: true, category: "server" },
  bEnableVoiceChat: { type: "bool", default: false, category: "server" },
  VoiceChatMaxVolumeDistance: {
    type: "float", default: 3000, min: 0, max: 50000, step: 100, category: "server",
  },
  VoiceChatZeroVolumeDistance: {
    type: "float", default: 15000, min: 0, max: 50000, step: 100, category: "server",
  },
  AutoTransferMasterCheckIntervalSeconds: {
    type: "float", default: 3600, min: 60, max: 86400, step: 1, category: "server",
  },
  AutoTransferMasterThresholdDays: { type: "int", default: 14, min: 0, max: 365, category: "server" },
  ItemContainerForceMarkDirtyInterval: {
    type: "float", default: 1, min: 0, max: 60, step: 0.1, category: "server",
  },
  MaxGuildsPerFrame: { type: "int", default: 10, min: 1, max: 100, category: "server" },
  PlayerDataPalStorageUpdateCheckTickInterval: {
    type: "float", default: 1, min: 0, max: 60, step: 0.1, category: "server",
  },

  // ── pal ───────────────────────────────────────────────────────────────
  PalCaptureRate: rate("pal", 1, 0.5, 2),
  PalSpawnNumRate: rate("pal", 1, 0.5, 3),
  PalDamageRateAttack: rate("pal"),
  PalDamageRateDefense: rate("pal"),
  PalStomachDecreaceRate: rate("pal"),
  PalStaminaDecreaceRate: rate("pal"),
  PalAutoHPRegeneRate: rate("pal"),
  PalAutoHpRegeneRateInSleep: rate("pal"),
  PalEggDefaultHatchingTime: { type: "float", default: 72, min: 0, max: 240, step: 1, category: "pal" },
  WorkSpeedRate: rate("pal", 1, 0.1, 10),
  bPalLost: { type: "bool", default: false, category: "pal" },
  bAllowGlobalPalboxExport: { type: "bool", default: true, category: "pal" },
  bAllowGlobalPalboxImport: { type: "bool", default: false, category: "pal" },
  EnablePredatorBossPal: { type: "bool", default: true, category: "pal" },
  MonsterFarmActionSpeedRate: rate("pal", 1, 0.1, 10),

  // ── player ────────────────────────────────────────────────────────────
  ExpRate: rate("player", 1, 0.1, 20),
  PlayerDamageRateAttack: rate("player"),
  PlayerDamageRateDefense: rate("player"),
  PlayerStomachDecreaceRate: rate("player"),
  PlayerStaminaDecreaceRate: rate("player"),
  PlayerAutoHPRegeneRate: rate("player"),
  PlayerAutoHpRegeneRateInSleep: rate("player"),
  ItemWeightRate: rate("player"),
  EquipmentDurabilityDamageRate: rate("player"),
  bEnablePlayerToPlayerDamage: { type: "bool", default: false, category: "player" },
  bEnableFriendlyFire: { type: "bool", default: false, category: "player" },
  bIsPvP: { type: "bool", default: false, category: "player" },
  DeathPenalty: {
    type: "enum",
    default: "All",
    choices: ["None", "Item", "ItemAndEquipment", "All"],
    category: "player",
  },
  bEnableFastTravel: { type: "bool", default: true, category: "player" },
  bIsStartLocationSelectByMap: { type: "bool", default: false, category: "player" },
  bExistPlayerAfterLogout: { type: "bool", default: false, category: "player" },
  bEnableNonLoginPenalty: { type: "bool", default: true, category: "player" },
  bAllowEnhanceStat_Health: { type: "bool", default: true, category: "player" },
  bAllowEnhanceStat_Attack: { type: "bool", default: true, category: "player" },
  bAllowEnhanceStat_Stamina: { type: "bool", default: true, category: "player" },
  bAllowEnhanceStat_Weight: { type: "bool", default: true, category: "player" },
  bAllowEnhanceStat_WorkSpeed: { type: "bool", default: true, category: "player" },
  AdditionalDropItemWhenPlayerKillingInPvPMode: {
    type: "enum",
    default: "PlayerDropItem",
    choices: ["None", "PlayerDropItem", "AllItems"],
    category: "player",
  },
  AdditionalDropItemNumWhenPlayerKillingInPvPMode: {
    type: "int", default: 1, min: 0, max: 9999, category: "player",
  },
  bAdditionalDropItemWhenPlayerKillingInPvPMode: {
    type: "bool", default: false, category: "player",
  },
  bDisplayPvPItemNumOnWorldMap_Player: { type: "bool", default: false, category: "player" },
  BlockRespawnTime: { type: "float", default: 5, min: 0, max: 3600, step: 0.5, category: "player" },
  RespawnPenaltyDurationThreshold: {
    type: "float", default: 0, min: 0, max: 3600, step: 0.5, category: "player",
  },
  RespawnPenaltyTimeScale: { type: "float", default: 2, min: 0, max: 10, step: 0.1, category: "player" },

  // ── guild ─────────────────────────────────────────────────────────────
  GuildPlayerMaxNum: { type: "int", default: 20, min: 1, max: 100, category: "guild" },
  BaseCampMaxNum: { type: "int", default: 128, min: 1, max: 1024, category: "guild" },
  BaseCampMaxNumInGuild: { type: "int", default: 4, min: 1, max: 10, category: "guild" },
  BaseCampWorkerMaxNum: { type: "int", default: 15, min: 1, max: 50, category: "guild" },
  bAutoResetGuildNoOnlinePlayers: { type: "bool", default: false, category: "guild" },
  AutoResetGuildTimeNoOnlinePlayers: {
    type: "float", default: 72, min: 1, max: 168, step: 1, category: "guild",
  },
  bEnableDefenseOtherGuildPlayer: { type: "bool", default: false, category: "guild" },
  bCanPickupOtherGuildDeathPenaltyDrop: { type: "bool", default: false, category: "guild" },
  bInvisibleOtherGuildBaseCampAreaFX: { type: "bool", default: false, category: "guild" },
  GuildRejoinCooldownMinutes: { type: "int", default: 0, min: 0, max: 10080, category: "guild" },
  bDisplayPvPItemNumOnWorldMap_BaseCamp: { type: "bool", default: false, category: "guild" },

  // ── build ─────────────────────────────────────────────────────────────
  BuildObjectDamageRate: rate("build"),
  BuildObjectDeteriorationDamageRate: rate("build", 1, 0, 10),
  bBuildAreaLimit: { type: "bool", default: false, category: "build" },
  MaxBuildingLimitNum: { type: "int", default: 0, min: 0, max: 10000, category: "build" },
  ServerReplicatePawnCullDistance: {
    type: "int", default: 15000, min: 5000, max: 15000, category: "build",
  },
  BuildObjectHpRate: rate("build", 1, 0.1, 10),
  bEnableBuildingPlayerUIdDisplay: { type: "bool", default: false, category: "build" },
  BuildingNameDisplayCacheTTLSeconds: {
    type: "int", default: 60, min: 0, max: 600, category: "build",
  },

  // ── drop ──────────────────────────────────────────────────────────────
  DropItemMaxNum: { type: "int", default: 3000, min: 0, max: 5000, category: "drop" },
  DropItemAliveMaxHours: { type: "float", default: 1, min: 0, max: 24, step: 0.5, category: "drop" },
  CollectionDropRate: rate("drop", 1, 0.5, 3),
  EnemyDropItemRate: rate("drop", 1, 0.5, 3),
  ItemCorruptionMultiplier: rate("drop"),
  SupplyDropSpan: { type: "int", default: 180, min: 30, max: 1440, category: "drop" },
  DropItemMaxNum_UNKO: { type: "int", default: 100, min: 0, max: 5000, category: "drop" },
  bActiveUNKO: { type: "bool", default: false, category: "drop" },
  PhysicsActiveDropItemMaxNum: { type: "int", default: -1, min: -1, max: 10000, category: "drop" },
  DenyTechnologyList: { type: "string", default: "", maxLength: 512, category: "drop" },

  // ── world ─────────────────────────────────────────────────────────────
  Difficulty: {
    type: "enum", default: "None", choices: ["None", "Casual", "Normal", "Hard"], category: "world",
  },
  DayTimeSpeedRate: rate("world"),
  NightTimeSpeedRate: rate("world"),
  CollectionObjectHpRate: rate("world", 1, 0.5, 3),
  CollectionObjectRespawnSpeedRate: rate("world", 1, 0.5, 3),
  bEnableInvaderEnemy: { type: "bool", default: true, category: "world" },
  bEnableAimAssistPad: { type: "bool", default: true, category: "world" },
  bEnableAimAssistKeyboard: { type: "bool", default: false, category: "world" },
  bHardcore: { type: "bool", default: false, category: "world" },
  bCharacterRecreateInHardcore: { type: "bool", default: false, category: "world" },
  RandomizerType: {
    type: "enum", default: "None", choices: ["None", "Region", "All"], category: "world",
  },
  RandomizerSeed: { type: "int", default: 0, min: 0, max: 2147483647, category: "world" },
  bIsRandomizerPalLevelRandom: { type: "bool", default: false, category: "world" },
} as const satisfies Record<string, OptionMeta>;

export type WorldOptionKey = keyof typeof WORLD_OPTIONS;

export const OPTION_CATEGORIES: readonly OptionCategory[] = [
  "server",
  "world",
  "pal",
  "player",
  "guild",
  "build",
  "drop",
];

export function optionKeysByCategory(category: OptionCategory): WorldOptionKey[] {
  return (Object.keys(WORLD_OPTIONS) as WorldOptionKey[]).filter(
    (k) => WORLD_OPTIONS[k].category === category,
  );
}
