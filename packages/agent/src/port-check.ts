import net from "node:net";
import dgram from "node:dgram";

/**
 * 啟動前的埠占用檢查(新手最常見的開不起來原因:別的程式或另一台伺服器占走埠)。
 * 直接對 0.0.0.0 試綁:綁得起來=可用,EADDRINUSE/EACCES=被占用。
 * 伺服器啟動前呼叫,所以自己的埠不會誤判(行程還沒起來)。
 */

export function tcpPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.listen({ port, host: "0.0.0.0", exclusive: true }, () => {
      srv.close(() => resolve(true));
    });
  });
}

export function udpPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const sock = dgram.createSocket("udp4");
    sock.once("error", () => {
      try {
        sock.close();
      } catch {
        /* 未綁定時 close 會丟,無妨 */
      }
      resolve(false);
    });
    sock.bind({ port, address: "0.0.0.0", exclusive: true }, () => {
      sock.close(() => resolve(true));
    });
  });
}

export interface PortCheckEntry {
  /** game=遊戲埠(UDP)、query=查詢埠(UDP)、rest=REST API(TCP)、
   *  rcon=RCON(TCP)、paldefender=PalDefender REST(TCP) */
  key: "game" | "query" | "rest" | "rcon" | "paldefender";
  port: number;
  protocol: "udp" | "tcp";
  free: boolean;
  /** 被占用時的建議替代埠(OS 可綁 + 不與其他實例/其他檢查項撞) */
  suggestion?: number;
}

export type PortProbe = (entry: { key: PortCheckEntry["key"]; port: number; protocol: "udp" | "tcp" }) => Promise<boolean>;

/** 對一組埠做占用檢查;occupied 額外視為已占用(其他實例的登記埠等)。 */
export async function checkPorts(
  entries: { key: PortCheckEntry["key"]; port: number; protocol: "udp" | "tcp" }[],
  occupied: { udp: Set<number>; tcp: Set<number> },
  options: { probe?: PortProbe } = {},
): Promise<PortCheckEntry[]> {
  const out: PortCheckEntry[] = [];
  // 本次檢查/建議中已用掉的埠,建議值彼此不互撞
  const taken = { udp: new Set(occupied.udp), tcp: new Set(occupied.tcp) };
  const seen = { udp: new Set<number>(), tcp: new Set<number>() };
  for (const e of entries) taken[e.protocol].add(e.port);

  for (const e of entries) {
    const duplicate = seen[e.protocol].has(e.port);
    seen[e.protocol].add(e.port);
    const externallyFree = options.probe
      ? await options.probe(e)
      : e.protocol === "udp"
        ? await udpPortFree(e.port)
        : await tcpPortFree(e.port);
    const free = externallyFree && !occupied[e.protocol].has(e.port) && !duplicate;
    const entry: PortCheckEntry = { ...e, free };
    if (!free) {
      for (let cand = e.port + 1; cand < e.port + 200 && cand <= 65535; cand++) {
        if (taken[e.protocol].has(cand)) continue;
        const ok = options.probe
          ? await options.probe({ ...e, port: cand })
          : e.protocol === "udp"
            ? await udpPortFree(cand)
            : await tcpPortFree(cand);
        if (ok) {
          entry.suggestion = cand;
          taken[e.protocol].add(cand);
          break;
        }
      }
    }
    out.push(entry);
  }
  return out;
}
