const API_BASE = String(import.meta.env.VITE_API_URL ?? "").replace(/\/+$/, "");

export const apiUrl = (path: string) => (path.startsWith("/") ? `${API_BASE}${path}` : path);

export async function fetchData<T = unknown>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(apiUrl(url), { signal });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new Error("Sunucuya ulaşılamadı. Backend'in (python app.py) çalıştığından emin ol.", { cause: error });
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `İstek başarısız oldu (HTTP ${response.status}).`);
  }
  return response.json() as Promise<T>;
}
