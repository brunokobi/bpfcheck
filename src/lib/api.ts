// Cliente HTTP da API própria do BPF Check (substitui o supabase-js).

export const API_URL = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, "")
  || "https://bpfcheck-api.brunokobi.tech";

const TOKEN_KEY = "bpfcheck.token";
const USER_KEY = "bpfcheck.user";

export type AppRole = "admin" | "user";

export interface AppUser {
  id: string;
  email: string;
  name: string | null;
  role: AppRole;
}

export class ApiError extends Error {
  constructor(public status: number, public detail: unknown) {
    super(typeof detail === "string" ? detail : `HTTP ${status}`);
  }
}

/** Erro de rede (sem resposta do servidor): a operação pode ser repetida mais tarde. */
export class NetworkError extends Error {}

const safeStorage = {
  get(key: string) {
    try { return localStorage.getItem(key); } catch { return null; }
  },
  set(key: string, value: string | null) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, value);
    } catch { /* storage bloqueado: sessão só em memória */ }
  },
};

export const session = {
  token: () => safeStorage.get(TOKEN_KEY),
  user: (): AppUser | null => {
    const raw = safeStorage.get(USER_KEY);
    if (!raw) return null;
    try { return JSON.parse(raw) as AppUser; } catch { return null; }
  },
  save(token: string, user: AppUser) {
    safeStorage.set(TOKEN_KEY, token);
    safeStorage.set(USER_KEY, JSON.stringify(user));
  },
  clear() {
    safeStorage.set(TOKEN_KEY, null);
    safeStorage.set(USER_KEY, null);
  },
};

type Listener = () => void;
const unauthorizedListeners = new Set<Listener>();
export const onUnauthorized = (fn: Listener) => {
  unauthorizedListeners.add(fn);
  return () => { unauthorizedListeners.delete(fn); };
};

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown; auth?: boolean } = {},
): Promise<T> {
  const { json, auth = true, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (json !== undefined) headers.set("Content-Type", "application/json");
  const token = session.token();
  if (auth && token) headers.set("Authorization", `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    });
  } catch (err) {
    throw new NetworkError((err as Error)?.message || "network_error");
  }

  if (!res.ok) {
    let detail: unknown = res.statusText;
    try { detail = (await res.json()).detail; } catch { /* corpo não-JSON */ }
    if (res.status === 401 && auth) unauthorizedListeners.forEach(fn => fn());
    throw new ApiError(res.status, detail);
  }
  return (res.status === 204 ? undefined : await res.json()) as T;
}

/** Repetível = falha temporária (rede, 5xx, 408, 429). 4xx de validação não adianta repetir. */
export const isRetryable = (err: unknown) =>
  err instanceof NetworkError ||
  (err instanceof ApiError && (err.status >= 500 || err.status === 408 || err.status === 429 || err.status === 401));
