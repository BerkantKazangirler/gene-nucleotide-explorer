export async function fetchData<T = unknown>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
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
