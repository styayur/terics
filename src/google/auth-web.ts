import { GOOGLE_SCOPES } from "./planner";

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

interface TokenClient {
  requestAccessToken(options?: { prompt?: string }): void;
}

interface GoogleOAuth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback?: (error: { message?: string; type?: string }) => void;
  }): TokenClient;
  revoke(accessToken: string, callback?: () => void): void;
}

declare global {
  interface Window {
    google?: { accounts?: { oauth2?: GoogleOAuth2 } };
  }
}

let loader: Promise<void> | null = null;
let accessToken: string | null = null;
let expiresAt = 0;

function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-terics-gis="1"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Google Identity Services 加载失败")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.dataset.tericsGis = "1";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Identity Services 加载失败"));
    document.head.append(script);
  });
  return loader;
}

export function googleOAuthConfigured(): boolean {
  return Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
}

export function googleOAuthClientId(): string {
  return String(import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "");
}

export async function requestGoogleAccessToken(): Promise<string> {
  const clientId = googleOAuthClientId();
  if (!clientId) {
    throw new Error("未配置 VITE_GOOGLE_CLIENT_ID；ICS 导出仍可用");
  }
  await loadGis();
  const oauth2 = window.google?.accounts?.oauth2;
  if (!oauth2) throw new Error("Google Identity Services 不可用");
  return new Promise((resolve, reject) => {
    const client = oauth2.initTokenClient({
      client_id: clientId,
      scope: GOOGLE_SCOPES.join(" "),
      callback: (response) => {
        if (!response.access_token) {
          reject(new Error(response.error_description || response.error || "Google 授权未返回访问令牌"));
          return;
        }
        accessToken = response.access_token;
        expiresAt = Date.now() + (response.expires_in ?? 3600) * 1000;
        resolve(response.access_token);
      },
      error_callback: (error) => reject(new Error(error.message || error.type || "Google 授权失败")),
    });
    client.requestAccessToken({ prompt: "" });
  });
}

export function currentGoogleAccessToken(): string | null {
  return accessToken && Date.now() < expiresAt - 30_000 ? accessToken : null;
}

export function clearGoogleToken(): void {
  if (accessToken && window.google?.accounts?.oauth2) {
    window.google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  expiresAt = 0;
}
