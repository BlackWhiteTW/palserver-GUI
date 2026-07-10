import { useCallback, useEffect, useState } from "react";
import { FiCopy, FiCheck, FiGlobe, FiExternalLink, FiShield, FiMessageCircle } from "react-icons/fi";
import type { ConnectionInfo } from "@palserver/shared";
import type { AgentClient } from "./api";
import { card, btn as btnPrimary, btnGhost } from "./ui";

/** Our company's IP-direct-connect setup service, promoted for public access. */
const SERVICE = {
  name: "IP 直連設定服務",
  website: "https://iosoftware.ai/ip-connect-service",
  discord: "https://discord.gg/sgMMdUZd3V",
};

/** "How do my friends join?" — the question every host actually asks, laid
 * out for non-technical users: same-network, VPN (Radmin / Tailscale), and
 * the advanced public route, each with a copy-ready address. */
export function ConnectionCard({ client, instanceId }: { client: AgentClient; instanceId: string }) {
  const [info, setInfo] = useState<ConnectionInfo | null>(null);

  const refresh = useCallback(() => {
    client.connection(instanceId).then(setInfo).catch(() => setInfo(null));
  }, [client, instanceId]);

  useEffect(() => refresh(), [refresh]);

  if (!info) return null;
  const port = info.gamePort;

  return (
    <div className={`${card} flex flex-col gap-4`}>
      <h3 className="inline-flex items-center gap-2 text-sm font-extrabold">
        <FiGlobe className="size-4 text-pal" /> 邀請朋友加入
      </h3>

      {/* 1) VPN(推薦給遠端朋友) */}
      <Section
        icon={<FiShield className="size-4 text-pal" />}
        title="遠端的朋友 — 用 VPN 連線(推薦)"
        hint="不用動路由器、也不怕外網攻擊。你和朋友裝同一套免費 VPN、加入同一個網路,就像在同一個 WiFi 裡。"
      >
        {info.tailscale && (
          <div className="mb-2">
            <p className="mb-1 text-xs font-bold text-ink-muted">你的 Tailscale 位址:</p>
            <AddressChip address={`${info.tailscale}:${port}`} />
          </div>
        )}
        <div className="grid gap-2 sm:grid-cols-2">
          <VpnOption
            name="Radmin VPN"
            desc="免註冊、建個房間邀朋友加入,最適合遊戲聯機。"
            site="https://www.radmin-vpn.com/"
            tutorial="https://www.youtube.com/results?search_query=Radmin+VPN+Palworld+%E8%81%AF%E6%A9%9F+%E6%95%99%E5%AD%B8"
          />
          <VpnOption
            name="Tailscale"
            desc="用 Google/GitHub 帳號登入,安全穩定,適合長期使用。"
            site="https://tailscale.com/"
            tutorial="https://www.youtube.com/results?search_query=Tailscale+Palworld+%E5%B0%88%E7%94%A8%E4%BC%BA%E6%9C%8D%E5%99%A8+%E6%95%99%E5%AD%B8"
          />
        </div>
      </Section>

      {/* 2) 公開 IP 直連(主打協助設定服務) */}
      <div className="rounded-xl border-2 border-pal/40 bg-pal/5 p-3">
        <p className="inline-flex items-center gap-2 text-[13px] font-extrabold">
          <FiGlobe className="size-4 text-pal" />
          想讓朋友不裝 VPN 直接連?交給我們設定
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          公開 IP 直連需要處理路由器連接埠轉發、防火牆、浮動 IP / CGNAT 等問題,對新手很麻煩。
          我們提供「IP 直連設定服務」,協助你把公開連線一次設定到位。
          {info.publicIp && (
            <>
              <br />
              目前偵測到你的公開位址:
              <span className="ml-1 font-mono font-bold">{info.publicIp}:{port}</span>
              {info.behindNat && "(在路由器後面,需要設定連接埠轉發才能直連)"}
            </>
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <a
            className={`${btnPrimary} inline-flex items-center gap-1.5`}
            href={SERVICE.website}
            target="_blank"
            rel="noreferrer"
          >
            <FiExternalLink className="size-4" /> {SERVICE.name}
          </a>
          <a
            className={`${btnGhost} inline-flex items-center gap-1.5`}
            href={SERVICE.discord}
            target="_blank"
            rel="noreferrer"
          >
            <FiMessageCircle className="size-4" /> Discord 詢問
          </a>
        </div>
      </div>

      <p className="text-xs text-ink-muted">
        提示:朋友連線用的是「遊戲埠 UDP {port}」。若朋友連不進來,先確認伺服器正在運作中、且防火牆有放行。
      </p>
    </div>
  );
}

function Section({
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border-2 border-line p-3">
      <p className="inline-flex items-center gap-2 text-[13px] font-extrabold">
        {icon}
        {title}
      </p>
      <p className="mt-1 mb-2 text-xs text-ink-muted">{hint}</p>
      {children}
    </div>
  );
}

function AddressChip({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <button
      onClick={copy}
      className="inline-flex items-center gap-2 rounded-lg border-2 border-line bg-card-soft px-3 py-1.5 font-mono text-sm font-bold transition hover:border-pal"
      title="點擊複製"
    >
      {address}
      {copied ? <FiCheck className="size-4 text-grass" /> : <FiCopy className="size-4 text-ink-muted" />}
    </button>
  );
}

function VpnOption({
  name,
  desc,
  site,
  tutorial,
}: {
  name: string;
  desc: string;
  site: string;
  tutorial: string;
}) {
  return (
    <div className="rounded-xl bg-card-soft p-3">
      <p className="text-sm font-extrabold">{name}</p>
      <p className="mt-0.5 text-xs text-ink-muted">{desc}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <a
          className={`${btnGhost} inline-flex items-center gap-1.5 px-3 py-1 text-xs`}
          href={site}
          target="_blank"
          rel="noreferrer"
        >
          <FiExternalLink className="size-3.5" /> 官方網站
        </a>
        <a
          className={`${btnGhost} inline-flex items-center gap-1.5 px-3 py-1 text-xs`}
          href={tutorial}
          target="_blank"
          rel="noreferrer"
        >
          <FiExternalLink className="size-3.5" /> 教學影片
        </a>
      </div>
    </div>
  );
}
