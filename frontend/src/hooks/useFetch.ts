import { useEffect, useState } from "react";
import { fetchData } from "@/utils/fetchData";

export type FetchState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "success"; data: T };

/** url null ise istek atılmaz. url değişince önceki istek iptal edilir. */
export function useFetch<T>(url: string | null): FetchState<T> {
  const [state, setState] = useState<FetchState<T>>({ status: url ? "loading" : "idle" });
  const [prevUrl, setPrevUrl] = useState(url);

  if (url !== prevUrl) {
    setPrevUrl(url);
    setState({ status: url ? "loading" : "idle" });
  }

  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    fetchData<T>(url, ctrl.signal)
      .then((data) => setState({ status: "success", data }))
      .catch((e: Error) => {
        if (e.name !== "AbortError") setState({ status: "error", error: e.message });
      });
    return () => ctrl.abort();
  }, [url]);

  return state;
}
