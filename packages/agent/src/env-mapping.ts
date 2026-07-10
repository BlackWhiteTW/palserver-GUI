/**
 * PalWorldSettings.ini 鍵名 → thijsvanloef 環境變數名稱映射
 *
 * 只收錄 thijsvanloef compile-settings.sh 確實支援的鍵（已查證上游 template）。
 * 鍵名刻意與 packages/shared/src/options.ts 的 WORLD_OPTIONS 完全一致大小寫，
 * 這樣 settingsToEnvPatch 可直接吃 WorldSettings（不須大小寫轉換）。
 *
 * 注意：移植自 PalworldManager，當地來源用的是 autoSaveSpan（小寫 a），
 * 但 palserver-gui 的 WORLD_OPTIONS 用 AutoSaveSpan（大寫 A），這裡已對齊。
 */

export const INI_TO_ENV: Record<string, string> = {
  // 基本伺服器
  ServerName: 'SERVER_NAME',
  ServerDescription: 'SERVER_DESCRIPTION',
  ServerPassword: 'SERVER_PASSWORD',
  AdminPassword: 'ADMIN_PASSWORD',
  PublicPort: 'PUBLIC_PORT',
  PublicIP: 'PUBLIC_IP',
  ServerPlayerMaxNum: 'SERVER_PLAYER_MAX_NUM',
  CoopPlayerMaxNum: 'COOP_PLAYER_MAX_NUM',
  bShowPlayerList: 'SHOW_PLAYER_LIST',
  ChatPostLimitPerMinute: 'CHAT_POST_LIMIT_PER_MINUTE',

  // REST/RCON
  RESTAPIEnabled: 'REST_API_ENABLED',
  RESTAPIPort: 'REST_API_PORT',
  RCONEnabled: 'RCON_ENABLED',
  RCONPort: 'RCON_PORT',

  // 遊戲玩法
  Difficulty: 'DIFFICULTY',
  RandomizerType: 'RANDOMIZER_TYPE',
  RandomizerSeed: 'RANDOMIZER_SEED',
  bIsRandomizerPalLevelRandom: 'IS_RANDOMIZER_PAL_LEVEL_RANDOM',
  DeathPenalty: 'DEATH_PENALTY',
  bIsPvP: 'IS_PVP',
  bHardcore: 'HARDCORE',
  bCharacterRecreateInHardcore: 'CHARACTER_RECREATE_IN_HARDCORE',
  bPalLost: 'PAL_LOST',
  bEnablePlayerToPlayerDamage: 'ENABLE_PLAYER_TO_PLAYER_DAMAGE',
  bEnableFriendlyFire: 'ENABLE_FRIENDLY_FIRE',
  bEnableInvaderEnemy: 'ENABLE_INVADER_ENEMY',
  bEnableAimAssistPad: 'ENABLE_AIM_ASSIST_PAD',
  bEnableAimAssistKeyboard: 'ENABLE_AIM_ASSIST_KEYBOARD',
  bCanPickupOtherGuildDeathPenaltyDrop: 'CAN_PICKUP_OTHER_GUILD_DEATH_PENALTY_DROP',
  bEnableNonLoginPenalty: 'ENABLE_NON_LOGIN_PENALTY',
  bEnableFastTravel: 'ENABLE_FAST_TRAVEL',
  bIsStartLocationSelectByMap: 'IS_START_LOCATION_SELECT_BY_MAP',
  bExistPlayerAfterLogout: 'EXIST_PLAYER_AFTER_LOGOUT',
  bEnableDefenseOtherGuildPlayer: 'ENABLE_DEFENSE_OTHER_GUILD_PLAYER',
  bInvisibleOtherGuildBaseCampAreaFX: 'INVISIBLE_OTHER_GUILD_BASE_CAMP_AREA_FX',
  bBuildAreaLimit: 'BUILD_AREA_LIMIT',
  bIsMultiplay: 'IS_MULTIPLAY',

  // 倍率
  DayTimeSpeedRate: 'DAYTIME_SPEEDRATE',
  NightTimeSpeedRate: 'NIGHTTIME_SPEEDRATE',
  ExpRate: 'EXP_RATE',
  PalCaptureRate: 'PAL_CAPTURE_RATE',
  PalSpawnNumRate: 'PAL_SPAWN_NUM_RATE',
  WorkSpeedRate: 'WORK_SPEED_RATE',
  ItemWeightRate: 'ITEM_WEIGHT_RATE',

  // 傷害
  PalDamageRateAttack: 'PAL_DAMAGE_RATE_ATTACK',
  PalDamageRateDefense: 'PAL_DAMAGE_RATE_DEFENSE',
  PlayerDamageRateAttack: 'PLAYER_DAMAGE_RATE_ATTACK',
  PlayerDamageRateDefense: 'PLAYER_DAMAGE_RATE_DEFENSE',
  EquipmentDurabilityDamageRate: 'EQUIPMENT_DURABILITY_DAMAGE_RATE',

  // 生存
  PlayerStomachDecreaceRate: 'PLAYER_STOMACH_DECREASE_RATE',
  PlayerStaminaDecreaceRate: 'PLAYER_STAMINA_DECREASE_RATE',
  PlayerAutoHPRegeneRate: 'PLAYER_AUTO_HP_REGEN_RATE',
  PlayerAutoHpRegeneRateInSleep: 'PLAYER_AUTO_HP_REGEN_RATE_IN_SLEEP',
  PalStomachDecreaceRate: 'PAL_STOMACH_DECREASE_RATE',
  PalStaminaDecreaceRate: 'PAL_STAMINA_DECREASE_RATE',
  PalAutoHPRegeneRate: 'PAL_AUTO_HP_REGEN_RATE',
  PalAutoHpRegeneRateInSleep: 'PAL_AUTO_HP_REGEN_RATE_IN_SLEEP',

  // 建築
  BuildObjectDamageRate: 'BUILD_OBJECT_DAMAGE_RATE',
  BuildObjectDeteriorationDamageRate: 'BUILD_OBJECT_DETERIORATION_DAMAGE_RATE',
  MaxBuildingLimitNum: 'MAX_BUILDING_LIMIT_NUM',
  ServerReplicatePawnCullDistance: 'SERVER_REPLICATE_PAWN_CULL_DISTANCE',

  // 採集
  CollectionDropRate: 'COLLECTION_DROP_RATE',
  CollectionObjectHpRate: 'COLLECTION_OBJECT_HP_RATE',
  CollectionObjectRespawnSpeedRate: 'COLLECTION_OBJECT_RESPAWN_SPEED_RATE',
  EnemyDropItemRate: 'ENEMY_DROP_ITEM_RATE',
  DropItemMaxNum: 'DROP_ITEM_MAX_NUM',
  DropItemAliveMaxHours: 'DROP_ITEM_ALIVE_MAX_HOURS',
  ItemCorruptionMultiplier: 'ITEM_CORRUPTION_MULTIPLIER',
  SupplyDropSpan: 'SUPPLY_DROP_SPAN',

  // 據點/公會
  BaseCampMaxNum: 'BASE_CAMP_MAX_NUM',
  BaseCampWorkerMaxNum: 'BASE_CAMP_WORKER_MAX_NUM',
  BaseCampMaxNumInGuild: 'BASE_CAMP_MAX_NUM_IN_GUILD',
  GuildPlayerMaxNum: 'GUILD_PLAYER_MAX_NUM',
  bAutoResetGuildNoOnlinePlayers: 'AUTO_RESET_GUILD_NO_ONLINE_PLAYERS',
  AutoResetGuildTimeNoOnlinePlayers: 'AUTO_RESET_GUILD_TIME_NO_ONLINE_PLAYERS',

  // 夥伴
  PalEggDefaultHatchingTime: 'PAL_EGG_DEFAULT_HATCHING_TIME',
  bAllowGlobalPalboxExport: 'ALLOW_GLOBAL_PALBOX_EXPORT',
  bAllowGlobalPalboxImport: 'ALLOW_GLOBAL_PALBOX_IMPORT',

  // 其他
  AutoSaveSpan: 'AUTO_SAVE_SPAN',
  bIsUseBackupSaveData: 'USE_BACKUP_SAVE_DATA',
  LogFormatType: 'LOG_FORMAT_TYPE',
  bIsShowJoinLeftMessage: 'IS_SHOW_JOIN_LEFT_MESSAGE',

  // Palworld 1.0 補集（thijsvanloef compile-settings.sh 支援的鍵）
  Region: 'REGION',
  CrossplayPlatforms: 'CROSSPLAY_PLATFORMS',
  BanListURL: 'BAN_LIST_URL',
  bUseAuth: 'USEAUTH',
  bAllowClientMod: 'ALLOW_CLIENT_MOD',
  bEnableVoiceChat: 'ENABLE_VOICE_CHAT',
  VoiceChatMaxVolumeDistance: 'VOICE_CHAT_MAX_VOLUME_DISTANCE',
  VoiceChatZeroVolumeDistance: 'VOICE_CHAT_ZERO_VOLUME_DISTANCE',
  AutoTransferMasterCheckIntervalSeconds: 'AUTO_TRANSFER_MASTER_CHECK_INTERVAL_SECONDS',
  AutoTransferMasterThresholdDays: 'AUTO_TRANSFER_MASTER_THRESHOLD_DAYS',
  ItemContainerForceMarkDirtyInterval: 'ITEM_CONTAINER_FORCE_MARK_DIRTY_INTERVAL',
  MaxGuildsPerFrame: 'MAX_GUILDS_PER_FRAME',
  PlayerDataPalStorageUpdateCheckTickInterval: 'PLAYER_DATA_PAL_STORAGE_UPDATE_CHECK_TICK_INTERVAL',
  EnablePredatorBossPal: 'ENABLE_PREDATOR_BOSS_PAL',
  MonsterFarmActionSpeedRate: 'MONSTER_FARM_ACTION_SPEED_RATE',
  bActiveUNKO: 'ACTIVE_UNKO',
  DropItemMaxNum_UNKO: 'DROP_ITEM_MAX_NUM_UNKO',
  PhysicsActiveDropItemMaxNum: 'PHYSICS_ACTIVE_DROP_ITEM_MAX_NUM',
  DenyTechnologyList: 'DENY_TECHNOLOGY_LIST',
  bAllowEnhanceStat_Health: 'ALLOW_ENHANCE_STAT_HEALTH',
  bAllowEnhanceStat_Attack: 'ALLOW_ENHANCE_STAT_ATTACK',
  bAllowEnhanceStat_Stamina: 'ALLOW_ENHANCE_STAT_STAMINA',
  bAllowEnhanceStat_Weight: 'ALLOW_ENHANCE_STAT_WEIGHT',
  bAllowEnhanceStat_WorkSpeed: 'ALLOW_ENHANCE_STAT_WORK_SPEED',
  AdditionalDropItemWhenPlayerKillingInPvPMode: 'ADDITIONAL_DROP_ITEM_WHEN_PLAYER_KILLING_IN_PVP_MODE',
  AdditionalDropItemNumWhenPlayerKillingInPvPMode: 'ADDITIONAL_DROP_ITEM_NUM_WHEN_PLAYER_KILLING_IN_PVP_MODE',
  bAdditionalDropItemWhenPlayerKillingInPvPMode: 'ADDITIONAL_DROP_ITEM_WHEN_PLAYER_KILLING_IN_PVP_MODE_ENABLED',
  bDisplayPvPItemNumOnWorldMap_Player: 'DISPLAY_PVP_ITEM_NUM_ON_WORLD_MAP_PLAYER',
  BlockRespawnTime: 'BLOCK_RESPAWN_TIME',
  RespawnPenaltyDurationThreshold: 'RESPAWN_PENALTY_DURATION_THRESHOLD',
  RespawnPenaltyTimeScale: 'RESPAWN_PENALTY_TIME_SCALE',
  GuildRejoinCooldownMinutes: 'GUILD_REJOIN_COOLDOWN_MINUTES',
  bDisplayPvPItemNumOnWorldMap_BaseCamp: 'DISPLAY_PVP_ITEM_NUM_ON_WORLD_MAP_BASE_CAMP',
  BuildObjectHpRate: 'BUILD_OBJECT_HP_RATE',
  bEnableBuildingPlayerUIdDisplay: 'ENABLE_BUILDING_PLAYER_UID_DISPLAY',
  BuildingNameDisplayCacheTTLSeconds: 'BUILDING_NAME_DISPLAY_CACHE_TTL_SECONDS',
};

/** thijsvanloef 不透過 ini 控制的運維 env（直接設在 StatefulSet） */
export const OPS_ENV_KEYS = [
  'PLAYERS',
  'MULTITHREADING',
  'COMMUNITY',
  'BACKUP_ENABLED',
  'BACKUP_CRON_EXPRESSION',
  'DELETE_OLD_BACKUPS',
  'OLD_BACKUP_DAYS',
  'AUTO_REBOOT_ENABLED',
  'AUTO_REBOOT_CRON_EXPRESSION',
  'AUTO_REBOOT_WARN_MINUTES',
  'AUTO_UPDATE_ENABLED',
  'AUTO_UPDATE_CRON_EXPRESSION',
] as const;

/**
 * 將 ini 值轉為 thijsvanloef env 值
 */
export function iniValueToEnvValue(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'True' : 'False';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) return `(${value.join(',')})`;
  return String(value ?? '');
}

/**
 * 將一組設定變更轉為 env patch
 * 回傳 { envName: envValue }，僅含有對應 env 的鍵
 * 不支援的鍵被跳過
 */
export function settingsToEnvPatch(
  changes: Record<string, unknown>,
): { envPatch: Record<string, string>; unsupported: string[] } {
  const envPatch: Record<string, string> = {};
  const unsupported: string[] = [];
  for (const [iniKey, value] of Object.entries(changes)) {
    const envName = INI_TO_ENV[iniKey];
    if (envName) {
      envPatch[envName] = iniValueToEnvValue(value);
    } else {
      unsupported.push(iniKey);
    }
  }
  return { envPatch, unsupported };
}
