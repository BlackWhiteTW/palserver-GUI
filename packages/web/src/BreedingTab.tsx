import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiCrosshair, FiGitBranch, FiMapPin, FiMaximize2, FiRefreshCw, FiSearch, FiZoomIn, FiZoomOut } from "react-icons/fi";
import { GiEggClutch } from "react-icons/gi";
import { hasFeature, savToMap, type SaveBreedingPal } from "@palserver/shared";
import type { AgentClient } from "./api";
import { EntityPicker } from "./EntityPicker";
import { MultiPicker } from "./MultiPicker";
import { displayName, palIconUrl, useGameData, type GameData } from "./gameData";
import { solveBreeding, type BreedingData, type BreedingNode } from "./breedingSolver";
import { t, useI18n } from "./i18n";
import { EmptyState, SponsorLockNotice, btn, btnGhost, card, errorCls, labelCls, Select } from "./ui";

let recipesCache: BreedingData | null = null;
async function loadBreedingData(): Promise<BreedingData> {
  if (recipesCache) return recipesCache;
  const response = await fetch("/game-data/breeding.json");
  if (!response.ok) throw new Error(`breeding.json: HTTP ${response.status}`);
  recipesCache = (await response.json()) as BreedingData;
  return recipesCache;
}

const locationLabel: Record<SaveBreedingPal["location"], string> = {
  party: "隊伍",
  palbox: "帕魯箱",
  base: "據點",
  unknown: "未知位置",
};

const PALBOX_SLOTS_PER_PAGE = 30;

function sourceLocation(source: SaveBreedingPal): string {
  if (source.location === "palbox" && source.slotIndex != null) {
    return t("帕魯箱第 {page} 頁", { page: Math.floor(source.slotIndex / PALBOX_SLOTS_PER_PAGE) + 1 });
  }
  if (source.location === "base" && source.base) {
    const generatedName = /^(新規生成拠点|新规生成据点|新規生成據點)/.test(source.base.name);
    return source.base.name && !generatedName
      ? t("據點:{base}", { base: source.base.name })
      : t("公會據點");
  }
  return t(locationLabel[source.location]);
}

function sourceSummary(source: SaveBreedingPal): string {
  return t("{owner} · {location}", {
    owner: source.ownerName,
    location: sourceLocation(source),
  });
}

function speciesId(id: string): string {
  return id.replace(/^BOSS_/i, "");
}

function palName(data: GameData | null, id: string): string {
  const entity = data?.palByIdLower.get(speciesId(id).toLowerCase());
  return entity ? displayName(entity) : id;
}

function passiveIds(node: BreedingNode, desired: string[]): string[] {
  if (node.source) return node.source.passives.filter((id) => desired.includes(id));
  return desired.filter((_, index) => (node.passiveMask & (1 << index)) !== 0);
}

function PalTreeNode({
  node,
  data,
  desired,
  target,
  onShowOnMap,
}: {
  node: BreedingNode;
  data: GameData | null;
  desired: string[];
  target?: boolean;
  onShowOnMap?: (x: number, y: number) => void;
}) {
  const entity = data?.palByIdLower.get(speciesId(node.species).toLowerCase());
  const source = node.source;
  const matching = passiveIds(node, desired);
  return (
    <div className={`flex h-[116px] w-[240px] gap-2 overflow-hidden rounded-lg border-2 p-3 shadow-(--shadow-cute) ${node.requiredCapture ? "border-sun bg-sun/10" : target ? "border-pal bg-card" : "border-line bg-card"}`}>
      <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-line bg-card-soft">
        {entity?.icon && <img src={palIconUrl(entity.icon)} alt="" className="size-full object-contain" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-baseline gap-1.5 text-sm font-extrabold">
          <span className="truncate">{source?.nickname || palName(data, node.species)}</span>
          <span className="shrink-0 text-xs font-normal text-ink-muted">
            {node.gender === "m" ? "♂" : node.gender === "f" ? "♀" : "♂/♀"}
          </span>
          {source && (
            <span className="ml-auto shrink-0 text-[10px] font-bold text-ink-muted">
              Lv.{source.level ?? "—"}
            </span>
          )}
        </p>
        {source?.base && onShowOnMap ? (
          <button
            type="button"
            className="flex max-w-full items-center gap-1 text-left text-[11px] text-ink-muted transition hover:text-pal"
            title={`${sourceSummary(source)} · ${t("在地圖上查看")}`}
            onClick={() => {
              const point = savToMap(source.base!.x, source.base!.y);
              onShowOnMap(point.x, point.y);
            }}
          >
            <FiMapPin className="size-3 shrink-0" />
            <span className="truncate">{sourceSummary(source)}</span>
          </button>
        ) : (
          <p className="truncate text-[11px] text-ink-muted" title={source ? sourceSummary(source) : undefined}>
            {node.requiredCapture
              ? t("需捕捉")
              : source
                ? sourceSummary(source)
                : t("第 {n} 代配種結果", { n: node.generation })}
          </p>
        )}
        {source && (
          <p className="mt-1 truncate text-[10px] font-bold text-ink-muted">
            HP {source.talentHp ?? "—"} · ATK {source.talentShot ?? "—"} · DEF {source.talentDefense ?? "—"}
          </p>
        )}
        {matching.length > 0 && (
          <div className="mt-1.5 flex max-h-10 flex-wrap gap-1 overflow-hidden">
            {matching.map((id) => (
              <span key={id} className="max-w-full truncate rounded-sm border-l-3 border-pal bg-pal/10 px-1.5 py-0.5 text-[10px] font-bold text-ink">
                {data?.passiveById.get(id) ? displayName(data.passiveById.get(id)!) : id}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const TREE_NODE_WIDTH = 240;
const TREE_NODE_HEIGHT = 116;
const TREE_COLUMN_GAP = 96;
const TREE_ROW_GAP = 24;
const TREE_PADDING = 24;

interface TreeNodeLayout {
  id: string;
  node: BreedingNode;
  x: number;
  y: number;
}

interface TreeEdgeLayout {
  from: TreeNodeLayout;
  to: TreeNodeLayout;
}

function layoutBreedingTree(target: BreedingNode) {
  const nodes: TreeNodeLayout[] = [];
  const edges: TreeEdgeLayout[] = [];
  let leafIndex = 0;

  const visit = (node: BreedingNode, id: string): TreeNodeLayout => {
    let y: number;
    let parents: TreeNodeLayout[] = [];
    if (node.parents) {
      parents = [visit(node.parents[0], `${id}-0`), visit(node.parents[1], `${id}-1`)];
      y = (parents[0].y + parents[1].y) / 2;
    } else {
      y = TREE_PADDING + leafIndex * (TREE_NODE_HEIGHT + TREE_ROW_GAP);
      leafIndex += 1;
    }
    const current = {
      id,
      node,
      x: TREE_PADDING + node.generation * (TREE_NODE_WIDTH + TREE_COLUMN_GAP),
      y,
    };
    nodes.push(current);
    for (const parent of parents) edges.push({ from: parent, to: current });
    return current;
  };

  visit(target, "target");
  return {
    nodes,
    edges,
    width: TREE_PADDING * 2 + (target.generation + 1) * TREE_NODE_WIDTH + target.generation * TREE_COLUMN_GAP,
    height: TREE_PADDING * 2 + Math.max(1, leafIndex) * TREE_NODE_HEIGHT + Math.max(0, leafIndex - 1) * TREE_ROW_GAP,
  };
}

function BreedingTree({ target, data, desired, captureCount, onShowOnMap }: { target: BreedingNode; data: GameData | null; desired: string[]; captureCount: number; onShowOnMap?: (x: number, y: number) => void }) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const layout = useMemo(() => layoutBreedingTree(target), [target]);
  const [zoom, setZoom] = useState(1);

  useEffect(() => setZoom(1), [target]);

  const fit = () => {
    const available = viewportRef.current?.clientWidth ?? layout.width;
    setZoom(Math.max(0.25, Math.min(1, (available - 20) / layout.width)));
    viewportRef.current?.scrollTo({ left: 0, top: 0, behavior: "smooth" });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="inline-flex items-center gap-2 text-base font-extrabold">
            <FiGitBranch className="size-5 text-pal" /> {t("配種路徑")}
          </h3>
          <p className="mt-0.5 text-xs text-ink-muted">
            {captureCount > 0
              ? t("{generations} 代 · 共 {steps} 次配種 · 需捕捉 {captures} 隻", { generations: target.generation, steps: target.breedCount, captures: captureCount })
              : t("{generations} 代 · 共 {steps} 次配種", { generations: target.generation, steps: target.breedCount })}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button className={`${btnGhost} !px-3`} onClick={() => setZoom((value) => Math.max(0.25, value - 0.15))} aria-label={t("縮小")} title={t("縮小")}>
            <FiZoomOut className="size-4" />
          </button>
          <span className="w-12 text-center text-xs font-bold text-ink-muted">{Math.round(zoom * 100)}%</span>
          <button className={`${btnGhost} !px-3`} onClick={() => setZoom((value) => Math.min(1.4, value + 0.15))} aria-label={t("放大")} title={t("放大")}>
            <FiZoomIn className="size-4" />
          </button>
          <button className={`${btnGhost} !px-3`} onClick={fit} aria-label={t("符合寬度")} title={t("符合寬度")}>
            <FiMaximize2 className="size-4" />
          </button>
        </div>
      </div>
      <div
        ref={viewportRef}
        className="overflow-auto rounded-lg border-2 border-line bg-card-soft"
        style={{ height: Math.min(680, Math.max(300, layout.height * zoom + 4)) }}
      >
        <div className="relative" style={{ width: layout.width * zoom, height: layout.height * zoom }}>
          <div
            className="absolute top-0 left-0 origin-top-left"
            style={{ width: layout.width, height: layout.height, transform: `scale(${zoom})` }}
          >
            <svg className="absolute inset-0 size-full" aria-hidden="true">
              <defs>
                <marker id="breeding-tree-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--color-ink-muted)" />
                </marker>
              </defs>
              {layout.edges.map(({ from, to }) => {
                const x1 = from.x + TREE_NODE_WIDTH;
                const y1 = from.y + TREE_NODE_HEIGHT / 2;
                const x2 = to.x;
                const y2 = to.y + TREE_NODE_HEIGHT / 2;
                const bend = Math.max(36, (x2 - x1) * 0.45);
                return (
                  <path
                    key={`${from.id}-${to.id}`}
                    d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke="var(--color-ink-muted)"
                    strokeOpacity="0.65"
                    strokeWidth="2"
                    markerEnd="url(#breeding-tree-arrow)"
                  />
                );
              })}
            </svg>
            {layout.nodes.map((entry) => (
              <div key={entry.id} className="absolute" style={{ left: entry.x, top: entry.y }}>
                <PalTreeNode node={entry.node} data={data} desired={desired} target={entry.node === target} onShowOnMap={onShowOnMap} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BreedingTab({ client, instanceId, onShowOnMap }: { client: AgentClient; instanceId: string; onShowOnMap?: (x: number, y: number) => void }) {
  useI18n();
  const gameData = useGameData();
  const [breedingData, setBreedingData] = useState<BreedingData | null>(null);
  const [pals, setPals] = useState<SaveBreedingPal[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [worldGuid, setWorldGuid] = useState<string | null>(null);
  const [canScan, setCanScan] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [targetId, setTargetId] = useState("");
  const [passives, setPassives] = useState<string[]>([]);
  const [ownerUid, setOwnerUid] = useState("");
  const [maxGenerations, setMaxGenerations] = useState(4);
  const [calculating, setCalculating] = useState(false);
  const [solution, setSolution] = useState<ReturnType<typeof solveBreeding> | null>(null);
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const scanTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    client
      .license()
      .then((l) => setEntitled(hasFeature("breeding-calc", l)))
      .catch(() => setEntitled(false));
  }, [client]);
  useEffect(
    () => () => {
      if (scanTimer.current) clearInterval(scanTimer.current);
    },
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [snapshot, recipes] = await Promise.all([
        client.breedingSnapshot(instanceId),
        loadBreedingData(),
      ]);
      setBreedingData(recipes);
      setPals(snapshot.pals);
      setGeneratedAt(snapshot.generatedAt);
      setWorldGuid(snapshot.worldGuid);
      setSolution(null);
      setError(null);
      try {
        setCanScan((await client.saveHealth(instanceId, snapshot.worldGuid)).supported);
      } catch {
        setCanScan(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [client, instanceId]);

  useEffect(() => {
    void load();
  }, [load]);

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const pal of pals) {
      if (!pal.base) map.set(pal.ownerUid, pal.ownerName);
    }
    return [...map].sort((a, b) => a[1].localeCompare(b[1]));
  }, [pals]);
  const available = useMemo(() => {
    if (!ownerUid) return pals;
    const normalizeId = (id: string) => id.replace(/[^0-9a-f]/gi, "").toLowerCase();
    const guildIds = new Set(
      pals
        .filter((pal) => !pal.base && pal.ownerUid === ownerUid && pal.ownerGuildId)
        .map((pal) => normalizeId(pal.ownerGuildId!)),
    );
    return pals.filter(
      (pal) =>
        pal.ownerUid === ownerUid ||
        (pal.base !== undefined && guildIds.has(normalizeId(pal.base.guildId))),
    );
  }, [ownerUid, pals]);

  const scan = async () => {
    if (!worldGuid) return;
    setScanning(true);
    setError(null);
    try {
      await client.startSaveHealth(instanceId, worldGuid);
      await new Promise<void>((resolve) => {
        let failures = 0;
        scanTimer.current = setInterval(async () => {
          try {
            const status = await client.saveHealth(instanceId, worldGuid);
            failures = 0;
            if (status.phase === "idle") {
              if (scanTimer.current) clearInterval(scanTimer.current);
              if (status.error) setError(status.error);
              resolve();
            }
          } catch {
            // 掃描仍在 agent 上跑,單次查詢失敗不中斷;但連續失敗代表 agent 斷線,停止輪詢。
            failures += 1;
            if (failures >= 45) {
              if (scanTimer.current) clearInterval(scanTimer.current);
              setError(t("無法取得掃描狀態(與 agent 的連線中斷)。請重新整理後再試。"));
              resolve();
            }
          }
        }, 2000);
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const calculate = async () => {
    if (!breedingData || !targetId) return;
    setCalculating(true);
    // 雙層 rAF:第一層在本幀 paint 前執行,巢狀的第二層落在下一幀 —— 讓「計算中…」先繪製出來,
    // 同步求解才不會把這格 paint 一起卡死(單層 rAF 的 resolve 仍在 paint 之前)。
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    try {
      setSolution(solveBreeding(breedingData, available, targetId, passives, maxGenerations));
    } finally {
      setCalculating(false);
    }
  };

  if (entitled === false)
    return <SponsorLockNotice>{t("這是贊助者先行版功能。到「設定 → 贊助者識別碼」輸入識別碼即可使用。")}</SponsorLockNotice>;
  if (loading && !breedingData) return <p className="text-ink-muted">{t("載入中…")}</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-muted">
          {generatedAt
            ? t("存檔掃描於 {when} · 可用帕魯 {n} 隻", {
                when: new Date(generatedAt).toLocaleString(),
                n: available.length,
              })
            : t("尚未掃描存檔。先從存檔刷新以載入全服帕魯。")}
        </p>
        {canScan && (
          <button className={`${btnGhost} inline-flex items-center gap-1.5`} onClick={() => void scan()} disabled={scanning}>
            <FiRefreshCw className={`size-3.5 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? t("掃描存檔中…(依存檔大小可能需要幾分鐘)") : t("從存檔刷新")}
          </button>
        )}
      </div>
      {error && <p className={errorCls}>{error}</p>}

      <div className={`${card} grid gap-4 md:grid-cols-2`}>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{t("目標帕魯")}</span>
          <EntityPicker
            catalog={gameData?.pals ?? []}
            iconUrl={palIconUrl}
            value={targetId}
            onChange={(id) => {
              setTargetId(id);
              setSolution(null);
            }}
            placeholder={t("搜尋目標帕魯…")}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{t("使用範圍")}</span>
          <Select
            value={ownerUid}
            onChange={(event) => {
              setOwnerUid(event.target.value);
              setSolution(null);
            }}
          >
            <option value="">{t("全服玩家及公會據點的帕魯")}</option>
            {owners.map(([uid, name]) => <option key={uid} value={uid}>{name}</option>)}
          </Select>
        </label>
        <div className="flex flex-col gap-1.5 md:col-span-2">
          <span className={labelCls}>{t("目標被動詞條(最多 4 個)")}</span>
          <MultiPicker
            catalog={gameData?.passives ?? []}
            value={passives}
            onChange={(ids) => {
              setPassives(ids);
              setSolution(null);
            }}
            max={4}
            placeholder={t("搜尋被動詞條…")}
          />
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={labelCls}>{t("最大配種代數")}</span>
          <Select
            value={String(maxGenerations)}
            onChange={(event) => {
              setMaxGenerations(Number(event.target.value));
              setSolution(null);
            }}
          >
            {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{t("{n} 代", { n })}</option>)}
          </Select>
        </label>
        <div className="flex items-end">
          <button className={`${btn} inline-flex w-full items-center justify-center gap-1.5`} disabled={!targetId || !generatedAt || calculating} onClick={() => void calculate()}>
            <FiSearch className="size-4" /> {calculating ? t("計算中…") : t("計算最短路徑")}
          </button>
        </div>
      </div>

      {solution && !solution.target && (
        <EmptyState icon={<GiEggClutch />} title={t("在 {n} 代內找不到路徑", { n: maxGenerations })}>
          {t("已從現有帕魯推導出 {n} 個可達物種。可增加代數、擴大玩家範圍或減少目標詞條。", { n: solution.reachableSpecies })}
        </EmptyState>
      )}

      {solution?.target && solution.requiredCaptures.length > 0 && (
        <div className="rounded-md border-2 border-sun/50 bg-sun/10 p-4">
          <p className="inline-flex items-center gap-2 text-sm font-extrabold text-ink">
            <FiCrosshair className="size-4 text-sun" />
            {t("現有帕魯不足，補充捕捉 {n} 隻帕魯後可配種", { n: solution.requiredCaptures.length })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {solution.requiredCaptures.map((node) => (
              <span key={`${node.species}-${node.gender}`} className="inline-flex items-center gap-1.5 rounded-md border border-sun/60 bg-card px-2 py-1 text-xs font-bold text-ink">
                {palName(gameData, node.species)}
                <span className="text-ink-muted">{node.gender === "m" ? "♂" : "♀"}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {solution?.target && solution.target.generation > 0 && (
        <>
          <BreedingTree target={solution.target} data={gameData} desired={passives} captureCount={solution.requiredCaptures.length} onShowOnMap={onShowOnMap} />
          <p className="text-center text-xs text-ink-muted">
            {t("路線圖顯示詞條的可能繼承路徑;實際遺傳有機率成分,通常需要重複配種幾次才能讓子代集齊全部目標詞條。")}
          </p>
        </>
      )}

      <p className="text-center text-[11px] text-ink-muted">
        {t("配方資料來自 Pal Calc {version}(MIT)", { version: breedingData?.version ?? "" })} ·{" "}
        <a className="underline" href="https://github.com/tylercamp/palcalc" target="_blank" rel="noreferrer">tylercamp/palcalc</a>
      </p>
    </div>
  );
}
