import { recordApi } from "./apiLog";

const API_BASE = String(import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export const apiUrl = (path: string) => (path.startsWith("/") ? `${API_BASE}${path}` : path);

export async function fetchData<T = unknown>(url: string, signal?: AbortSignal): Promise<T> {
  const full = apiUrl(url);
  const started = performance.now();
  const elapsed = () => Math.round(performance.now() - started);

  let response: Response;
  try {
    response = await fetch(full, { signal });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    const message = "Sunucuya ulaşılamadı. Backend'in (python app.py) çalıştığından emin ol.";
    recordApi({ url: full, ms: elapsed(), status: null, ok: false, body: { error: message } });
    throw new Error(message, { cause: error });
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = body?.error ?? `İstek başarısız oldu (HTTP ${response.status}).`;
    recordApi({ url: full, ms: elapsed(), status: response.status, ok: false, body: body ?? { error: message } });
    throw new Error(message);
  }

  const data = (await response.json()) as T;
  recordApi({ url: full, ms: elapsed(), status: response.status, ok: true, body: data });
  return data;
}
