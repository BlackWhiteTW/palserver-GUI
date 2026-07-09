import type {
  AgentInfo,
  CreateInstanceInput,
  InstanceDetail,
  InstanceStats,
  InstanceSummary,
  ModComponent,
  ModsStatus,
  WorldSettings,
} from "@palserver/shared";

export interface Connection {
  url: string; // e.g. http://localhost:8250
  token: string;
}

const STORAGE_KEY = "palserver.connection";

export function loadConnection(): Connection | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw) as Connection) : null;
}

export function saveConnection(conn: Connection | null): void {
  if (conn) localStorage.setItem(STORAGE_KEY, JSON.stringify(conn));
  else localStorage.removeItem(STORAGE_KEY);
}

export class AgentClient {
  constructor(private conn: Connection) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await fetch(`${this.conn.url}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${this.conn.token}`,
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...init.headers,
      },
    });
    if (res.status === 204) return undefined as T;
    const body = await res.json().catch(() => ({ error: res.statusText }));
    if (!res.ok) throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
    return body as T;
  }

  info(): Promise<AgentInfo> {
    return this.request("/api/info");
  }

  listInstances(): Promise<InstanceSummary[]> {
    return this.request("/api/instances");
  }

  getInstance(id: string): Promise<InstanceDetail> {
    return this.request(`/api/instances/${id}`);
  }

  createInstance(input: CreateInstanceInput): Promise<InstanceSummary> {
    return this.request("/api/instances", { method: "POST", body: JSON.stringify(input) });
  }

  action(id: string, action: "start" | "stop" | "restart"): Promise<InstanceSummary> {
    return this.request(`/api/instances/${id}/${action}`, { method: "POST" });
  }

  deleteInstance(id: string): Promise<void> {
    return this.request(`/api/instances/${id}`, { method: "DELETE" });
  }

  updateSettings(
    id: string,
    patch: Partial<WorldSettings>,
  ): Promise<{ applied: string; settings: WorldSettings }> {
    return this.request(`/api/instances/${id}/settings`, {
      method: "PUT",
      body: JSON.stringify(patch),
    });
  }

  stats(id: string): Promise<InstanceStats> {
    return this.request(`/api/instances/${id}/stats`);
  }

  mods(id: string): Promise<ModsStatus> {
    return this.request(`/api/instances/${id}/mods`);
  }

  installMod(id: string, component: ModComponent): Promise<{ version: string }> {
    return this.request(`/api/instances/${id}/mods/${component}/install`, { method: "POST" });
  }

  toggleLuaMod(id: string, name: string, enabled: boolean): Promise<ModsStatus> {
    return this.request(`/api/instances/${id}/mods/lua-toggle`, {
      method: "POST",
      body: JSON.stringify({ name, enabled }),
    });
  }

  logsSocket(id: string): WebSocket {
    const wsUrl = this.conn.url.replace(/^http/, "ws");
    return new WebSocket(`${wsUrl}/api/instances/${id}/logs?token=${encodeURIComponent(this.conn.token)}`);
  }
}
