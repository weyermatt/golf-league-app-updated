import { QueryClient, QueryFunction } from "@tanstack/react-query";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

// Bearer token. Held in memory and — when the user opted into "Remember me" —
// persisted to localStorage so reloads on the published site keep them signed
// in even if the auth cookie is dropped (some mobile browsers, in-app webviews,
// and ad/tracking blockers silently strip third-party cookies). The server
// already accepts the same token via the Authorization header as a fallback.
const TOKEN_KEY = "tnt-auth-token";
function safeGet(): string | null {
  try { return typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null; }
  catch { return null; }
}
function safeSet(t: string | null) {
  try {
    if (typeof localStorage === "undefined") return;
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore quota / private mode */ }
}
let authToken: string | null = safeGet();
export function setAuthToken(token: string | null, persist: boolean = true) {
  authToken = token;
  if (persist) safeSet(token);
  else if (token == null) safeSet(null); // logout always clears storage
}
export function getAuthToken() { return authToken; }

function buildHeaders(hasBody: boolean): Record<string, string> {
  const h: Record<string, string> = {};
  if (hasBody) h["Content-Type"] = "application/json";
  if (authToken) h["Authorization"] = `Bearer ${authToken}`;
  return h;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const data = await res.clone().json();
      if (data?.message) msg = data.message;
    } catch { /* ignore */ }
    throw new Error(`${res.status}: ${msg}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(`${API_BASE}${url}`, {
    method,
    headers: buildHeaders(data !== undefined),
    body: data !== undefined ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/");
    const res = await fetch(`${API_BASE}${url}`, { headers: buildHeaders(false), credentials: "include" });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
