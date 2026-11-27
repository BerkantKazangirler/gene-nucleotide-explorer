export interface ApiLogEntry {
  id: number;
  url: string;
  at: string;
  ms: number;
  status: number | null;
  ok: boolean;
  body: unknown;
}

type Listener = () => void;

const MAX_ENTRIES = 60;
const listeners = new Set<Listener>();
let entries: ApiLogEntry[] = [];
let nextId = 1;

export function recordApi(entry: Omit<ApiLogEntry, "id" | "at">) {
  entries = [{ ...entry, id: nextId++, at: new Date().toISOString() }, ...entries].slice(0, MAX_ENTRIES);
  listeners.forEach((listener) => listener());
}

export function getApiLog(): ApiLogEntry[] {
  return entries;
}

export function subscribeApi(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
