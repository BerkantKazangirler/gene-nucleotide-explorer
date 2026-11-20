export async function fetchData<T = unknown>(url: string, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (error) {
    if ((error as Error).name === "AbortError") throw error;
    throw new Error("Sunucuya ulaşılamadı. Backend'in (python app.py) çalıştığından emin ol.", { cause: error });
  }

  if (!response.ok) {
    let message = `İstek başarısız oldu (HTTP ${response.status}).`;
    try {
      const body = await response.json();
      if (body?.error) message = body.error;
    } catch {
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}
