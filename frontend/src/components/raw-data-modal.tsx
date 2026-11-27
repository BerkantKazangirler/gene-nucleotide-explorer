import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { getApiLog, subscribeApi, type ApiLogEntry } from "@/utils/apiLog";
import { formatNumber } from "@/utils/format";

interface Props {
  open: boolean;
  onClose: () => void;
}

const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("tr-TR");

const sizeOf = (text: string) => (text.length < 1024 ? `${text.length} karakter` : `${(text.length / 1024).toFixed(1)} KB`);

export const RawDataModal = ({ open, onClose }: Props) => {
  const ref = useRef<HTMLDialogElement>(null);
  const entries = useSyncExternalStore(subscribeApi, getApiLog);
  const [picked, setPicked] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  const current: ApiLogEntry | undefined = entries.find((e) => e.id === picked) ?? entries[0];
  const text = current ? JSON.stringify(current.body, null, 2) : "";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      aria-labelledby="raw-title"
      className="m-auto p-0 w-[min(1040px,calc(100vw-2rem))] h-[min(720px,calc(100vh-2rem))] rounded border border-line bg-paper text-ink backdrop:bg-ink/40 open:flex open:flex-col"
    >
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-line bg-sheet">
        <div>
          <h2 id="raw-title" className="font-semibold">
            Gelen API verisi
          </h2>
          <p className="text-[13px] text-ink-soft">
            Bu oturumda alınan {formatNumber(entries.length)} yanıt (en yeni üstte, en fazla 60 kayıt)
          </p>
        </div>
        <button onClick={onClose} className="h-8 px-3 border border-line rounded bg-paper hover:border-ink text-sm font-semibold">
          Kapat
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="flex-1 grid place-items-center p-8 text-center text-ink-soft text-sm">
          Henüz API yanıtı yok. Bir arama yapın veya bir gen açın.
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid md:grid-cols-[300px_1fr]">
          <ul className="min-h-0 overflow-y-auto border-b md:border-b-0 md:border-r border-line max-h-[240px] md:max-h-none">
            {entries.map((e) => {
              const active = current?.id === e.id;
              return (
                <li key={e.id}>
                  <button
                    onClick={() => setPicked(e.id)}
                    aria-current={active ? "true" : undefined}
                    className={`w-full text-left px-3 py-2 border-b border-line text-[13px] hover:bg-sheet ${active ? "bg-sheet" : ""}`}
                  >
                    <span className="flex items-center gap-2">
                      <span className={`font-mono text-xs font-bold ${e.ok ? "text-base-a" : "text-base-t"}`}>
                        {e.status ?? "ağ"}
                      </span>
                      <span className="text-ink-soft text-xs">{timeOf(e.at)}</span>
                      <span className="text-ink-soft text-xs ml-auto">{e.ms} ms</span>
                    </span>
                    <span className="block font-mono text-xs truncate mt-0.5" title={e.url}>
                      {e.url.replace(/^https?:\/\/[^/]+/, "")}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="min-h-0 min-w-0 flex flex-col">
            {current && (
              <>
                <div className="flex flex-wrap items-center gap-3 px-3 py-2 border-b border-line text-[13px]">
                  <span className="font-mono truncate min-w-0 flex-1" title={current.url}>
                    {current.url}
                  </span>
                  <span className="text-ink-soft whitespace-nowrap">{sizeOf(text)}</span>
                  <button
                    onClick={copy}
                    className="h-8 px-3 border border-line rounded bg-paper hover:border-ink font-semibold whitespace-nowrap"
                  >
                    {copied ? "Kopyalandı" : "JSON'u kopyala"}
                  </button>
                </div>
                <pre className="flex-1 min-h-0 overflow-auto p-3 text-xs leading-5 font-mono bg-paper whitespace-pre">{text}</pre>
              </>
            )}
          </div>
        </div>
      )}
    </dialog>
  );
};
