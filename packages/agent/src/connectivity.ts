import os from "node:os";
import { detectVpn, type ConnectionInfo } from "@palserver/shared";
import { DATA_DIR } from "./env.js";
import fs from "node:fs";
import path from "node:path";
import type { InstanceRecord } from "./store.js";
import * as k8s from "@kubernetes/client-node";
import { findPodName, loadKubeConfig } from "./k8s-files.js";

/**
 * Figures out how a friend can reach this server: LAN addresses, a Tailscale
 * address (100.64/10 CGNAT range), and — best-effort — the public IP plus
 * whether the host is behind NAT (so the UI can explain port forwarding vs a
 * VPN). The public IP lookup is cached so listing this never blocks.
 */

const PUBLIC_IP_CACHE = path.join(DATA_DIR, "public-ip.json");
const PUBLIC_IP_TTL_MS = 30 * 60_000;

const isPrivate = (ip: string) =>
  /^10\./.test(ip) ||
  /^192\.168\./.test(ip) ||
  /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
  /^169\.254\./.test(ip);

function localAddresses(): { lan: string[]; vpns: { name: string; address: string }[] } {
  const lan: string[] = [];
  const vpns: { name: string; address: string }[] = [];
  const seen = new Set<string>();
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const vpn = detectVpn(a.address);
      if (vpn) {
        // 同一個 VPN 只留第一個位址,避免列出重複網卡。
        if (!seen.has(vpn)) {
          seen.add(vpn);
          vpns.push({ name: vpn, address: a.address });
        }
      } else if (/^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[01])\./.test(a.address)) {
        lan.push(a.address);
      }
    }
  }
  return { lan, vpns };
}

async function publicIp(): Promise<string | null> {
  try {
    const cached = JSON.parse(fs.readFileSync(PUBLIC_IP_CACHE, "utf8"));
    if (Date.now() - Date.parse(cached.at) < PUBLIC_IP_TTL_MS) return cached.ip;
  } catch {
    /* no cache */
  }
  try {
    const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const ip = (await res.json()).ip as string;
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(PUBLIC_IP_CACHE, JSON.stringify({ ip, at: new Date().toISOString() }));
    return ip;
  } catch {
    return null;
  }
}

async function hostNetworkAddress(rec: InstanceRecord): Promise<string | null> {
  if (rec.backend !== "k8s" || !rec.k8sNamespace || !rec.k8sStatefulSet) return null;
  try {
    const kc = loadKubeConfig();
    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const podName = await findPodName(coreApi, rec.k8sNamespace, rec.k8sStatefulSet);
    if (!podName) return null;
    const pod = await coreApi.readNamespacedPod({ name: podName, namespace: rec.k8sNamespace });
    return pod.spec?.hostNetwork ? pod.status?.hostIP ?? null : null;
  } catch {
    return null;
  }
}

export async function getConnectionInfo(gamePort: number, rec?: InstanceRecord): Promise<ConnectionInfo> {
  let { lan, vpns } = localAddresses();
  const hostIp = rec ? await hostNetworkAddress(rec) : null;
  if (hostIp) {
    // The agent may run in a 10.42.x Kubernetes Pod while the game Pod uses
    // hostNetwork. Advertise the node address that actually owns the socket,
    // not the agent Pod IP which is unreachable from the LAN.
    lan = [hostIp, ...lan.filter((address) => address !== hostIp && !address.startsWith("10.42."))];
    vpns = vpns.filter((vpn) => vpn.address !== hostIp);
  }
  const pub = await publicIp();
  // If we have a public IP and none of our interfaces hold it, the host sits
  // behind a router (NAT) — direct connections need port forwarding.
  const behindNat = pub !== null && !lan.includes(pub) && !isPrivate(pub) ? true : pub !== null;
  // externalAddress 由 route 層以實例記錄覆寫(這裡沒有 rec 可讀)
  return { gamePort, lan, vpns, publicIp: pub, behindNat, externalAddress: null };
}
