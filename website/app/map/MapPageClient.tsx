'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import { brandHref, getMapDict, pickMapLang, readStoredMapLang, storeMapLang, type MapLang } from './i18n';
import MapNav from './MapNav';
import type { MapSnapshotV1, MapWorld, SnapshotApiResponse, StaticBoss, StaticLandmark } from './types';

const LeafletMap = dynamic(() => import('./LeafletMap'), { ssr: false });

const PRIMARY_BASE = 'https://stats.iosoftware.ai';
const BACKUP_BASE = 'https://palserver-stats.iosoftware.workers.dev';
const POLL_MS = 20_000;
const STALE_MS = 5 * 60 * 1000;

type LoadStatus = 'loading' | 'ok' | 'not-found' | 'missing-id' | 'error';

type FetchResult =
  | { status: 'ok'; data: SnapshotApiResponse }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

/** 主端點失敗(非 404)才試備援;帶 ?api= 覆寫時只打那一個 base,不自動兜底
 * (本機聯測 / 未來 agent 直連模式要能精準指到單一端點)。 */
async function fetchSnapshot(id: string, apiOverride: string | null): Promise<FetchResult> {
  const askOnce = (base: string) =>
    fetch(`${base}/api/map/snapshot?id=${encodeURIComponent(id)}`, { cache: 'no-store' });

  const primary = apiOverride || PRIMARY_BASE;
  try {
    const res = await askOnce(primary);
    if (res.status === 404) return { status: 'not-found' };
    if (res.ok) return { status: 'ok', data: (await res.json()) as SnapshotApiResponse };
    if (apiOverride) return { status: 'error', message: `HTTP ${res.status}` };
  } catch (err) {
    if (apiOverride) return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
  if (apiOverride) return { status: 'error', message: 'unreachable' };

  try {
    const res = await askOnce(BACKUP_BASE);
    if (res.status === 404) return { status: 'not-found' };
    if (res.ok) return { status: 'ok', data: (await res.json()) as SnapshotApiResponse };
    return { status: 'error', message: `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

export default function MapPageClient() {
  const searchParams = useSearchParams();
  const shareId = searchParams.get('s');
  const apiOverride = searchParams.get('api');

  // SSR/靜態匯出的第一次渲染沒有 navigator/localStorage,先用預設繁中,掛載後才決定
  // 真正的顯示語言(避免 hydration 的伺服端/client 文字不一致警告):優先用使用者在
  // 品牌頂欄手動選過、存在 localStorage 的語言,沒選過才退回瀏覽器語言(pickMapLang)。
  const [lang, setLang] = useState<MapLang>('zh');
  useEffect(() => {
    setLang(readStoredMapLang() ?? pickMapLang());
  }, []);
  // 品牌頂欄(MapNav)的語言切換行為:跟官網 LangSwitch 不同,官網切站台路由語系,
  // 這裡切 viewer 自身顯示語言的 client state,並記住選擇。
  const handleLangChange = (l: MapLang) => {
    setLang(l);
    storeMapLang(l);
  };
  const d = getMapDict(lang);

  const [status, setStatus] = useState<LoadStatus>('loading');
  const [snapshot, setSnapshot] = useState<MapSnapshotV1 | null>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);
  const hasDataRef = useRef(false);

  const [world, setWorld] = useState<MapWorld>('main');
  const [showPlayers, setShowPlayers] = useState(true);
  const [showOffline, setShowOffline] = useState(false);
  const [showBases, setShowBases] = useState(true);
  const [showLandmarks, setShowLandmarks] = useState(true);
  // 頭目層預設關:主世界有 83 個頭目(野外頭目 Alpha Pal + 封印領域 Sealed Realm 合計),
  // 全開會鋪滿整張圖、蓋掉玩家/據點,使用者要看再自己開(呈現方式仍與 GUI 一致,只是預設收合)。
  const [showBosses, setShowBosses] = useState(false);

  const [landmarks, setLandmarks] = useState<StaticLandmark[]>([]);
  const [treeLandmarks, setTreeLandmarks] = useState<StaticLandmark[]>([]);
  const [bosses, setBosses] = useState<StaticBoss[]>([]);
  const [treeBosses, setTreeBosses] = useState<StaticBoss[]>([]);

  // 靜態地標/野外頭目(隨網站一起打包,只載一次;缺檔就當沒有這個圖層)。
  useEffect(() => {
    fetch('/map-assets/landmarks.json')
      .then((r) => (r.ok ? (r.json() as Promise<StaticLandmark[]>) : []))
      .then((v) => setLandmarks(Array.isArray(v) ? v : []))
      .catch(() => setLandmarks([]));
    fetch('/map-assets/worldtree-landmarks.json')
      .then((r) => (r.ok ? (r.json() as Promise<StaticLandmark[]>) : []))
      .then((v) => setTreeLandmarks(Array.isArray(v) ? v : []))
      .catch(() => setTreeLandmarks([]));
    fetch('/map-assets/bosses.json')
      .then((r) => (r.ok ? (r.json() as Promise<StaticBoss[]>) : []))
      .then((v) => setBosses(Array.isArray(v) ? v : []))
      .catch(() => setBosses([]));
    fetch('/map-assets/worldtree-bosses.json')
      .then((r) => (r.ok ? (r.json() as Promise<StaticBoss[]>) : []))
      .then((v) => setTreeBosses(Array.isArray(v) ? v : []))
      .catch(() => setTreeBosses([]));
  }, []);

  // 快照輪詢:第一次立即抓,之後每 20 秒;拿過資料後,之後的輪詢失敗不清畫面,
  // 只是不更新(agoText/離線橫幅會自然反映資料變舊)。連結被撤銷(404)則不論
  // 先前是否成功過,一律切到「連結不存在」畫面。
  useEffect(() => {
    if (!shareId) {
      setStatus('missing-id');
      return;
    }
    let cancelled = false;
    const load = async () => {
      const r = await fetchSnapshot(shareId, apiOverride);
      if (cancelled) return;
      if (r.status === 'ok') {
        hasDataRef.current = true;
        setSnapshot(r.data.snapshot);
        setUpdatedAt(r.data.updatedAt);
        setStatus('ok');
      } else if (r.status === 'not-found') {
        setStatus('not-found');
      } else if (!hasDataRef.current) {
        setStatus('error');
      }
    };
    void load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [shareId, apiOverride]);

  // 「更新於 N 秒前」的顯示用時鐘,跟輪詢頻率脫鉤,每秒跳一次比較順眼。
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const agoText = useMemo(() => {
    if (updatedAt == null || now == null) return null;
    const sec = Math.max(0, Math.round((now - updatedAt) / 1000));
    if (sec < 5) return d.updatedJustNow;
    if (sec < 60) return d.updatedSecondsAgo(sec);
    return d.updatedMinutesAgo(Math.round(sec / 60));
  }, [updatedAt, now, d]);

  const isStale = updatedAt != null && now != null && now - updatedAt > STALE_MS;

  const playersAvailable = !!snapshot?.show?.players;
  const offlineAvailable = !!snapshot?.show?.offline;
  const basesAvailable = !!snapshot?.show?.bases;
  const showNames = snapshot?.show?.names !== false;
  const showGuildNames = snapshot?.show?.guildNames !== false;
  const landmarksAvailable = landmarks.length > 0 || treeLandmarks.length > 0;
  const bossesAvailable = bosses.length > 0 || treeBosses.length > 0;

  if (status === 'missing-id') {
    return <StateScreen lang={lang} title={d.missingIdTitle} body={d.missingIdBody} />;
  }
  if (status === 'not-found') {
    return <StateScreen lang={lang} title={d.notFoundTitle} body={d.notFoundBody} />;
  }
  if (!snapshot) {
    if (status === 'error') return <StateScreen lang={lang} title={d.fetchErrorTitle} body={d.fetchErrorBody} />;
    return (
      <div className="map2-boot">
        <BrandLockup lang={lang} className="map2-boot-brand" />
        <p>{d.loading}</p>
      </div>
    );
  }

  return (
    <div className="map2-page">
      <MapNav lang={lang} onLangChange={handleLangChange} d={d} />

      <div className="map2-status">
        <div className="map2-title">
          <span className="map2-servername">{snapshot.name || '—'}</span>
          <span className="map2-online">{d.online(snapshot.onlineCount, snapshot.maxPlayers)}</span>
        </div>
        <div className="map2-spacer" />
        {agoText && <span className="map2-ago">{agoText}</span>}
      </div>

      {isStale && <div className="map2-banner">{d.offlineBanner}</div>}

      <div className="map2-toolbar">
        {playersAvailable && (
          <ToggleBtn active={showPlayers} onClick={() => setShowPlayers((v) => !v)} label={d.players} />
        )}
        {offlineAvailable && (
          <ToggleBtn active={showOffline} onClick={() => setShowOffline((v) => !v)} label={d.offlinePlayers} />
        )}
        {basesAvailable && <ToggleBtn active={showBases} onClick={() => setShowBases((v) => !v)} label={d.bases} />}
        {landmarksAvailable && (
          <ToggleBtn active={showLandmarks} onClick={() => setShowLandmarks((v) => !v)} label={d.landmarks} />
        )}
        {bossesAvailable && (
          <ToggleBtn active={showBosses} onClick={() => setShowBosses((v) => !v)} label={d.boss} />
        )}
        {/* 世界切換恆在:即使快照裡沒有任何 m:"tree" 的動態標記(伺服器上沒人在世界樹),
            世界樹底圖本身、靜態地標(landmarks.json)都還是看得到,不該被鎖住。 */}
        <div className="map2-worldswitch">
          <button
            className={world === 'main' ? 'map2-wbtn map2-wbtn-on' : 'map2-wbtn'}
            onClick={() => setWorld('main')}
          >
            {d.mainWorld}
          </button>
          <button
            className={world === 'tree' ? 'map2-wbtn map2-wbtn-on' : 'map2-wbtn'}
            onClick={() => setWorld('tree')}
          >
            {d.worldTree}
          </button>
        </div>
      </div>

      <div className="map2-stage">
        <div className="map2-card">
          <LeafletMap
            world={world}
            snapshot={snapshot}
            landmarks={landmarks}
            treeLandmarks={treeLandmarks}
            bosses={bosses}
            treeBosses={treeBosses}
            showPlayers={showPlayers}
            showOffline={showOffline}
            showBases={showBases}
            showLandmarks={showLandmarks}
            showBosses={showBosses}
            showNames={showNames}
            showGuildNames={showGuildNames}
            lang={lang}
          />
        </div>
      </div>

      <footer className="map2-footer">
        <a href={brandHref(lang)} target="_blank" rel="noopener noreferrer">
          {d.poweredBy}
        </a>
      </footer>
    </div>
  );
}

function ToggleBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button className={active ? 'map2-tbtn map2-tbtn-on' : 'map2-tbtn'} onClick={onClick}>
      {label}
    </button>
  );
}

/** 品牌鎖印(logo 徽章 + 「palserver」字標):載入中/缺參數/連結失效等狀態頁共用,
 * 一律連回官網對應語系首頁。資料載入成功後的正式頁面改用品牌頂欄 MapNav(與官網
 * Nav.tsx 視覺一致),不再走這個較小的鎖印版本。 */
function BrandLockup({ lang, className }: { lang: MapLang; className?: string }) {
  return (
    <a
      className={className ? `map2-brand ${className}` : 'map2-brand'}
      href={brandHref(lang)}
      target="_blank"
      rel="noopener noreferrer"
    >
      <span className="map2-brand-mark">
        <img src="/assets/logo.png" alt="" width={30} height={30} />
      </span>
      <span className="map2-brand-name">palserver</span>
    </a>
  );
}

function StateScreen({ lang, title, body }: { lang: MapLang; title: string; body: string }) {
  return (
    <div className="map2-boot">
      <BrandLockup lang={lang} className="map2-boot-brand" />
      <div className="map2-state-card">
        <h1>{title}</h1>
        <p>{body}</p>
      </div>
    </div>
  );
}
