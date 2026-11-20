import { useState, type FormEvent, type ReactNode } from "react";
import { useFetch } from "@/hooks/useFetch";
import type { SearchResponse } from "@/types";
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
  const url = query
    ? `/api/search?q=${encodeURIComponent(query)}${organism ? `&organism=${encodeURIComponent(organism)}` : ""}`
    : null;
  const state = useFetch<SearchResponse>(url);
  const [text, setText] = useState(query);
  const [org, setOrg] = useState(organism);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    if (q) onSearch(q, org);
  };

  if (!query) {
    return (
      <div className="pt-8 max-w-3xl">
        <h1 className="text-xl font-semibold">Gen arama</h1>
        <p className="mt-2 text-ink-soft leading-relaxed">
          NCBI Gene veritabanında gen sembolü (MEFV gibi) ya da Gene ID (4210 gibi) ile arama yapılır. Bir sonuca
          tıklandığında genin kromozom üzerindeki yeri, transkriptleri, ekzon ve intron yapısı, proteine çevrilen bölgeleri
          ve nükleotid dizisi görüntülenir.
        </p>
        <form onSubmit={submit} className="mt-6">
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="home-q">
              Gen sembolü veya numarası
            </label>
            <input
              id="home-q"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="Örneğin MEFV veya 4210"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              className="flex-1 min-w-0 h-14 rounded-xl border border-line bg-paper px-4 text-lg font-medium placeholder:text-ink-soft/60 focus:outline-none focus:border-base-c"
            />
            <button className="h-14 px-6 rounded-xl bg-ink text-paper font-bold hover:bg-base-c transition-colors">Ara</button>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
            <fieldset className="flex rounded-lg border border-line p-0.5 bg-paper">
              <legend className="sr-only">Tür</legend>
              {ORGANISMS.map((o) => (
                <label
                  key={o.value}
                  className={`px-3 py-1.5 rounded-md cursor-pointer ${org === o.value ? "bg-ink text-paper" : "text-ink-soft hover:text-ink"}`}
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
                  className="font-mono text-[13px] px-2 py-1 rounded-md border border-line bg-paper text-ink hover:border-ink"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="pt-6" aria-live="polite">
      <h1 className="text-xl font-semibold">
        Arama sonuçları: <span className="font-normal">{query}</span>
        {organism && <span className="font-normal text-ink-soft"> ({organism})</span>}
      </h1>

      {state.status === "loading" && <p className="mt-4 text-ink-soft">Aranıyor…</p>}
      {state.status === "error" && (
        <div className="mt-4">
          <Notice tone="error">{state.error}</Notice>
        </div>
      )}
      {state.status === "success" && state.data.results.length === 0 && (
        <div className="mt-4">
          <Notice>
            “{state.data.query}” için sonuç bulunamadı. Gen sembolünü kontrol edin ya da tür filtresini “Tüm türler” yapın.
            Enzim adları (EcoRI gibi) bu aramada geçerli değildir.
          </Notice>
        </div>
      )}
      {state.status === "success" && state.data.results.length > 0 && (
        <>
          <p className="mt-1 text-sm text-ink-soft">
            {state.data.total > state.data.results.length
              ? `${state.data.total} kayıt bulundu, ilk ${state.data.results.length} tanesi gösteriliyor.`
              : `${state.data.results.length} kayıt bulundu.`}
          </p>
          <div className="mt-4 overflow-x-auto border border-line rounded">
            <table className="w-full text-sm">
              <thead className="bg-sheet text-left text-ink-soft">
                <tr>
                  <th className="px-3 py-2 font-semibold">Sembol</th>
                  <th className="px-3 py-2 font-semibold">Açıklama</th>
                  <th className="px-3 py-2 font-semibold">Tür</th>
                  <th className="px-3 py-2 font-semibold">Konum</th>
                  <th className="px-3 py-2 font-semibold text-right">Ekzon</th>
                  <th className="px-3 py-2 font-semibold text-right">Uzunluk</th>
                </tr>
              </thead>
              <tbody>
                {state.data.results.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => r.has_location && onOpen(r.id)}
                    className={`border-t border-line ${r.has_location ? "cursor-pointer hover:bg-sheet" : "text-ink-soft"}`}
                  >
                    <td className="px-3 py-2 font-semibold whitespace-nowrap">
                      {r.has_location ? (
                        <a
                          href={`?gene=${r.id}`}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onOpen(r.id);
                          }}
                        >
                          {r.symbol ?? r.id}
                        </a>
                      ) : (
                        r.symbol ?? r.id
                      )}
                    </td>
                    <td className="px-3 py-2">{r.description}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <i>{r.organism}</i>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">{r.map_location ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{r.exon_count > 0 ? r.exon_count : "—"}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      {r.has_location ? formatLength(r.length) : "konum yok"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
};

export const Notice = ({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "error" }) => (
  <div
    role={tone === "error" ? "alert" : undefined}
    className={`border-l-4 px-3 py-2 max-w-3xl text-sm ${tone === "error" ? "border-base-t bg-base-t/5 text-base-t" : "border-line bg-sheet text-ink-soft"}`}
  >
    {children}
  </div>
);
