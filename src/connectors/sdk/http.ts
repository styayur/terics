export class ConnectorHttpError extends Error {
  readonly status: number;
  readonly url: string;

  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = "ConnectorHttpError";
    this.status = status;
    this.url = url;
  }
}

async function request(fetchImpl: typeof fetch, url: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetchImpl(url, { ...init, signal: controller.signal, credentials: "include" });
    } catch (error) {
      throw new ConnectorHttpError(
        `只读请求失败：${error instanceof Error ? error.message : String(error)}`,
        0,
        url,
      );
    } finally {
      clearTimeout(timeout);
    }
}

export async function fetchJson<T>(url: string, init: RequestInit = {}, fetchImpl: typeof fetch = globalThis.fetch): Promise<T> {
  const response = await request(fetchImpl, url, {
    ...init,
    headers: {
      Accept: "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest",
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new ConnectorHttpError(`教务只读接口返回 HTTP ${response.status}`, response.status, url);
  }
  const text = await response.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ConnectorHttpError("教务接口未返回 JSON，可能登录态已失效或页面结构已变化", response.status, url);
  }
}

export async function postForm<T>(url: string, body: Record<string, string>, fetchImpl: typeof fetch = globalThis.fetch): Promise<T> {
  return fetchJson<T>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body: new URLSearchParams(body).toString(),
  }, fetchImpl);
}

export function postFormText<T>(url: string, body = "", fetchImpl: typeof fetch = globalThis.fetch): Promise<T> {
  return fetchJson<T>(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
    },
    body,
  }, fetchImpl);
}
