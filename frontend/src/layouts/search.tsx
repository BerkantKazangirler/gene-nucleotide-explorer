import { useState, type FormEvent, type ReactNode } from "react";
import { useFetch } from "@/hooks/useFetch";
import type { SearchResponse, SearchResult } from "@/types";
import { formatLength } from "@/utils/format";

const EXAMPLES = ["MEFV", "BRCA1", "TP53", "CFTR", "HBB"];
const ORGANISMS = [
  { value: "", label: "Tüm türler" },
  { value: "Homo sapiens", label: "İnsan" },
  { value: "Mus musculus", label: "Fare" },
];

interface Props {
  query: string;
  organism: string;
  onSearch: (q: string, organism: string) => void;
  onOpen: (geneId: string) => void;
}

export const SearchLayout = ({ query, organism, onSearch, onOpen }: Props) => {
  const [text, setText] = useState(query);
  const [org, setOrg] = useState(organism);

  const url = query
    ? `/api/search?q=${encodeURIComponent(query)}${organism ? `&organism=${encodeURIComponent(organism)}` : ""}`
    : null;
  const state = useFetch<SearchResponse>(url);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (q) onSearch(q, org);
  };

  return (
    <div className="pt-14 sm:pt-20">
      <section className="max-w-2xl">
        <h1 className="font-display font-extrabold text-4xl sm:text-6xl leading-[1.02] tracking-tight">
          Hangi geni merak ediyorsun?
        </h1>
        <p className="mt-4 text-lg text-ink-soft max-w-xl">
          Gen sembolünü ya da NCBI gen numarasını yaz. Genin nerede durduğunu, hangi parçalardan oluştuğunu ve
          proteine dönüşen kısmını 3B haritada göster.
        </p>

        <form onSubmit={submit} className="mt-8">
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="q">
              Gen sembolü veya numarası
            </label>
            <input
              id="q"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Örneğin MEFV veya 4210"
              autoComplete="off"
              spellCheck={false}
              className="flex-1 min-w-0 h-14 rounded-xl border border-line bg-sheet px-4 text-lg font-medium placeholder:text-ink-soft/60 focus:outline-none focus:border-base-c"
            />
            <button className="h-14 px-6 rounded-xl bg-ink text-sheet font-bold hover:bg-base-c transition-colors">Ara</button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <fieldset className="flex rounded-lg border border-line p-0.5 bg-sheet">
              <legend className="sr-only">Tür</legend>
              {ORGANISMS.map((o) => (
                <label
                  key={o.value}
                  className={`px-3 py-1.5 rounded-md cursor-pointer ${org === o.value ? "bg-ink text-sheet" : "text-ink-soft hover:text-ink"}`}
                >
                  <input
                    type="radio"
                    name="organism"
                    className="sr-only"
                    checked={org === o.value}
                    onChange={() => setOrg(o.value)}
                  />
                  {o.label}
                </label>
              ))}
            </fieldset>
            <div className="flex flex-wrap items-center gap-2 text-ink-soft">
              <span>Dene:</span>
              {EXAMPLES.map((ex) => (
                <button
                  type="button"
                  key={ex}
                  onClick={() => {
                    setText(ex);
                    setOrg("Homo sapiens");
                    onSearch(ex, "Homo sapiens");
                  }}
                  className="font-mono text-[13px] px-2 py-1 rounded-md border border-line bg-sheet text-ink hover:border-ink"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </form>
      </section>

      <section className="mt-14" aria-live="polite">
        {state.status === "loading" && <ResultsSkeleton />}
        {state.status === "error" && <Notice tone="error">{state.error}</Notice>}
        {state.status === "success" && state.data.results.length === 0 && (
          <Notice>
            “{state.data.query}” adında bir gen bulunamadı. Gen sembolünü kontrol et (ör. MEFV) ya da tür filtresini
            “Tüm türler” yap. Enzim adları (ör. EcoRI) burada aranmaz.
          </Notice>
        )}
        {state.status === "success" && state.data.results.length > 0 && (
          <>
            <p className="text-sm text-ink-soft mb-3">
              {state.data.total > state.data.results.length
                ? `${state.data.total} sonucun ilk ${state.data.results.length} tanesi`
                : `${state.data.results.length} sonuç`}
            </p>
            <ul className="divide-y divide-line border-y border-line">
              {state.data.results.map((r) => (
                <ResultRow key={r.id} r={r} onOpen={onOpen} />
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
};

const ResultRow = ({ r, onOpen }: { r: SearchResult; onOpen: (id: string) => void }) => (
  <li>
    <button
      onClick={() => onOpen(r.id)}
      disabled={!r.has_location}
      className="w-full text-left py-4 px-2 -mx-2 rounded-lg grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[9rem_minmax(0,1fr)_auto] gap-x-6 gap-y-1 items-baseline hover:bg-sheet disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <span className="font-display font-bold text-2xl tracking-tight">{r.symbol ?? r.id}</span>
      <span className="sm:order-none order-last col-span-2 sm:col-span-1 min-w-0">
        <span className="block truncate">{r.description}</span>
        <span className="block text-sm text-ink-soft">
          <i>{r.organism}</i>
          {r.map_location && <>, kromozom {r.map_location}</>}
        </span>
      </span>
      <span className="text-sm text-ink-soft text-right whitespace-nowrap">
        {r.has_location ? (
          <>
            {r.exon_count > 0 && <>{r.exon_count} ekzon, </>}
            {formatLength(r.length)}
          </>
        ) : (
          "konum bilgisi yok"
        )}
      </span>
    </button>
  </li>
);

const ResultsSkeleton = () => (
  <div className="border-y border-line divide-y divide-line" aria-label="Sonuçlar yükleniyor">
    {[0, 1, 2].map((i) => (
      <div key={i} className="py-5 flex gap-6 animate-pulse">
        <div className="h-6 w-24 rounded bg-line" />
        <div className="h-4 flex-1 max-w-md rounded bg-line mt-1" />
      </div>
    ))}
  </div>
);

export const Notice = ({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) => (
  <div
    role={tone === "error" ? "alert" : undefined}
    className={`rounded-xl border px-4 py-3 max-w-2xl ${tone === "error" ? "border-base-t/40 bg-base-t/5 text-base-t" : "border-line bg-sheet text-ink-soft"}`}
  >
    {children}
  </div>
);
