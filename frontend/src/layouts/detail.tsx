import { lazy, Suspense, useMemo, useRef, useState, type ReactNode } from "react";
import { ChromosomeBar } from "@/components/gene-map/ChromosomeBar";
import { ExonInfo } from "@/components/gene-map/ExonInfo";
import { GeneTrack } from "@/components/gene-map/GeneTrack";
import type { BaseHover, BaseWindow } from "@/components/gene-map/GeneScene";
import { sortTranscripts, type HoverTarget } from "@/components/gene-map/geometry";
import { BASE_COLORS, hydrogenBonds, REGION_COLORS } from "@/components/gene-map/colors";
import { useFetch } from "@/hooks/useFetch";
import type { GeneStructure, GeneSummary } from "@/types";
import { fetchData } from "@/utils/fetchData";
import { formatLength, formatNumber } from "@/utils/format";
import { Notice } from "./search";

const GeneScene = lazy(() => import("@/components/gene-map/GeneScene"));
const GeneGraph = lazy(() => import("@/components/gene-map/GeneGraph"));

interface Props {
  geneId: string;
  onBack: () => void;
}

export const DetailLayout = ({ geneId, onBack }: Props) => {
  const gene = useFetch<GeneSummary>(`/api/genes/${geneId}`);
  const structure = useFetch<GeneStructure>(`/api/genes/${geneId}/structure`);

  return (
    <div className="pt-4">
      <button onClick={onBack} className="text-sm text-link hover:underline">
        Sonuçlara dön
      </button>

      {gene.status === "loading" && <p className="mt-4 text-ink-soft">Gen bilgisi yükleniyor…</p>}
      {gene.status === "error" && (
        <div className="mt-4">
          <Notice tone="error">{gene.error}</Notice>
        </div>
      )}
      {gene.status === "success" && <GeneHeader gene={gene.data} />}

      <section className="mt-8" aria-labelledby="map-title">
        <h2 id="map-title" className="text-lg font-semibold border-b border-line pb-1">
          Gen yapısı
        </h2>
        <p className="mt-2 text-sm text-ink-soft max-w-3xl">
          Ekzonlar sarmal üzerinde renkli bölgeler olarak gösterilir: mavi kısımlar proteine çevrilir (CDS), yeşil kısımlar
          çevrilmez (UTR), sönük kısımlar introndur. Bir ekzon seçilerek o bölgenin baz çiftleri açılabilir.
        </p>

        <div className="mt-4">
          {structure.status === "loading" && <PanelMessage>Gen yapısı NCBI'dan alınıyor…</PanelMessage>}
          {structure.status === "error" && <PanelMessage tone="error">{structure.error}</PanelMessage>}
          {structure.status === "success" &&
            (structure.data.transcripts.length === 0 ? (
              <PanelMessage>Bu gen için NCBI kaydında transkript (mRNA) bilgisi yok, harita çizilemiyor.</PanelMessage>
            ) : (
              <GeneMap structure={structure.data} geneId={geneId} />
            ))}
        </div>
      </section>

      {gene.status === "success" && gene.data.summary && (
        <section className="mt-8 max-w-4xl">
          <h2 className="text-lg font-semibold border-b border-line pb-1">NCBI özeti</h2>
          <p className="mt-2 leading-relaxed" lang="en">
            {gene.data.summary}
          </p>
          <p className="mt-1 text-[13px] text-ink-soft">Metin NCBI Gene kaydından alınmıştır.</p>
        </section>
      )}
    </div>
  );
};

const GeneHeader = ({ gene }: { gene: GeneSummary }) => (
  <header className="mt-3">
    <h1 className="text-2xl font-bold">{gene.name}</h1>
    <p className="text-ink-soft">{gene.description}</p>

    <table className="mt-4 w-full max-w-4xl text-sm border-t border-line">
      <tbody>
        <Row label="Gene ID">
          <a href={`https://www.ncbi.nlm.nih.gov/gene/${gene.id}`} target="_blank" rel="noreferrer">
            {gene.id}
          </a>
        </Row>
        <Row label="Tür">
          <i>{gene.organism}</i>
          {gene.organism_common && <span className="text-ink-soft"> ({gene.organism_common})</span>}
        </Row>
        {gene.other_aliases && <Row label="Diğer adları">{gene.other_aliases}</Row>}
        <Row label="Kromozom bölgesi">{gene.map_location ?? gene.chromosome ?? "—"}</Row>
        {gene.accession && gene.seq_start && (
          <Row label="Genomik konum">
            {gene.accession}: {formatNumber(gene.seq_start)}–{formatNumber(gene.seq_stop)},{" "}
            {gene.strand === -1 ? "ters iplik" : "ileri iplik"}
          </Row>
        )}
        <Row label="Uzunluk">
          {formatLength(gene.length)}
          {gene.exon_count > 0 && `, ${gene.exon_count} ekzon`}
        </Row>
        {gene.chromosome_length && gene.seq_start && (
          <Row label="Kromozom üzerindeki yeri">
            <ChromosomeBar gene={gene} />
          </Row>
        )}
      </tbody>
    </table>
  </header>
);

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <tr className="border-b border-line align-top">
    <th scope="row" className="py-1.5 pr-4 w-48 text-left font-semibold text-ink-soft whitespace-nowrap">
      {label}
    </th>
    <td className="py-1.5">{children}</td>
  </tr>
);

type BasesState =
  | { status: "idle" }
  | { status: "loading"; exon: number }
  | { status: "error"; exon: number; error: string }
  | { status: "ready"; exon: number; data: BaseWindow };

const BASE_WINDOW = 60;

const GeneMap = ({ structure, geneId }: { structure: GeneStructure; geneId: string }) => {
  const transcripts = useMemo(() => sortTranscripts(structure.transcripts), [structure]);
  const [selectedId, setSelectedId] = useState(transcripts[0].id);
  const [hovered, setHovered] = useState<HoverTarget | null>(null);
  const [pinned, setPinned] = useState<HoverTarget | null>(null);
  const [view, setView] = useState<"helix" | "graph">("helix");
  const [bases, setBases] = useState<BasesState>({ status: "idle" });
  const [baseHover, setBaseHover] = useState<BaseHover | null>(null);
  const request = useRef(0);
  const selected = transcripts.find((t) => t.id === selectedId) ?? transcripts[0];

  const selectTranscript = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    setPinned(null);
    setBases({ status: "idle" });
  };

  const showBases = async (exonNumber: number) => {
    const exon = selected.exons.find((e) => e.number === exonNumber);
    if (!exon) return;
    const L = structure.length;
    let start: number;
    if (exon.length <= BASE_WINDOW - 16) {
      start = Math.round((exon.start + exon.end) / 2) - BASE_WINDOW / 2;
    } else {
      start = exon.start - 8;
    }
    start = Math.max(1, Math.min(start, L - BASE_WINDOW + 1));
    const end = Math.min(L, start + BASE_WINDOW - 1);

    const id = ++request.current;
    setView("helix");
    setPinned({ transcriptId: selected.id, exon: exonNumber });
    setBases({ status: "loading", exon: exonNumber });
    try {
      const data = await fetchData<BaseWindow>(`/api/genes/${geneId}/sequence?start=${start}&end=${end}`);
      if (id === request.current) setBases({ status: "ready", exon: exonNumber, data });
    } catch (e) {
      if (id === request.current) setBases({ status: "error", exon: exonNumber, error: (e as Error).message });
    }
  };

  const leaveBases = () => {
    request.current++;
    setBases({ status: "idle" });
    setBaseHover(null);
  };

  const shared = {
    length: structure.length,
    transcripts,
    selectedId: selected.id,
    hovered,
    pinned,
    onHover: setHovered,
    onPin: setPinned,
    onSelectTranscript: selectTranscript,
  };

  const inBases = view === "helix" && bases.status === "ready";
  const target = hovered ?? pinned;
  const focusExon = target && target.transcriptId === selected.id ? target.exon : null;

  const legend = inBases ? (
    <>
      <Legend color={BASE_COLORS.A}>A</Legend>
      <Legend color={BASE_COLORS.T}>T</Legend>
      <Legend color={BASE_COLORS.G}>G</Legend>
      <Legend color={BASE_COLORS.C}>C</Legend>
    </>
  ) : view === "graph" ? (
    <>
      <Legend color="#9fb4bd" dot>Transkript</Legend>
      <Legend color={REGION_COLORS.cds} dot>Kodlayan ekzon</Legend>
      <Legend color={REGION_COLORS.utr} dot>Kodlamayan ekzon</Legend>
      <Legend color="#f2b134" dot>Protein</Legend>
    </>
  ) : (
    <>
      <Legend color={REGION_COLORS.cds}>CDS</Legend>
      <Legend color={REGION_COLORS.utr}>UTR</Legend>
      <Legend color={REGION_COLORS.intronLine} thin>İntron</Legend>
    </>
  );

  let status: ReactNode;
  if (view === "graph") status = "Aynı ekzonu kullanan transkriptler aynı düğüme bağlanır.";
  else if (bases.status === "loading") status = `Ekzon ${bases.exon} bölgesinin dizisi NCBI'dan alınıyor…`;
  else if (bases.status === "error") status = <span className="text-base-t">{bases.error}</span>;
  else if (inBases && baseHover)
    status = (
      <>
        Konum {formatNumber(baseHover.pos)}: <b style={{ color: BASE_COLORS[baseHover.base] }}>{baseHover.base}</b>
        {hydrogenBonds(baseHover.base) === 3 ? "≡" : "="}
        <b style={{ color: BASE_COLORS[baseHover.pair] }}>{baseHover.pair}</b>, {hydrogenBonds(baseHover.base)} hidrojen bağı,{" "}
        {baseHover.exon != null ? `ekzon ${baseHover.exon} (${baseHover.region === "cds" ? "CDS" : "UTR"})` : "intron"}
      </>
    );
  else if (inBases)
    status = `${formatNumber(bases.data.start)}–${formatNumber(bases.data.end)}, ${bases.data.sequence.length} baz çifti`;
  else status = "Döndürmek için sürükleyin, yakınlaştırmak için kaydırın.";

  return (
    <div className="border border-line rounded">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2 bg-sheet border-b border-line text-sm">
        <div role="tablist" aria-label="Görünüm" className="flex gap-4">
          {(
            [
              ["helix", "Çift sarmal"],
              ["graph", "İlişki ağı"],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => setView(v)}
              className={`py-1 border-b-2 ${view === v ? "border-ink font-semibold" : "border-transparent text-ink-soft hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2 ml-auto">
          {transcripts.length > 1 && !inBases && (
            <label className="flex items-center gap-2">
              <span className="text-ink-soft">Transkript</span>
              <select
                value={selected.id}
                onChange={(e) => selectTranscript(e.target.value)}
                className="h-8 border border-line rounded px-1 bg-paper max-w-[14rem]"
              >
                {transcripts.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id} ({t.exons.length} ekzon)
                  </option>
                ))}
              </select>
            </label>
          )}
          {inBases ? (
            <ToolButton onClick={leaveBases}>Gen görünümüne dön</ToolButton>
          ) : (
            view === "helix" &&
            focusExon != null &&
            bases.status !== "loading" && (
              <ToolButton onClick={() => showBases(focusExon)}>Ekzon {focusExon} baz çiftleri</ToolButton>
            )
          )}
        </div>
      </div>

      <div className="relative h-[320px] sm:h-[520px] bg-stage text-[#d9e5ea]">
        <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-sm">Yükleniyor…</div>}>
          {view === "helix" ? (
            <GeneScene
              length={structure.length}
              transcript={selected}
              hovered={hovered}
              pinned={pinned}
              onHover={setHovered}
              onPin={setPinned}
              bases={bases.status === "ready" ? bases.data : null}
              onHoverBase={setBaseHover}
            />
          ) : (
            <GeneGraph symbol={structure.symbol ?? "Gen"} {...shared} />
          )}
        </Suspense>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 px-3 py-1.5 bg-sheet border-t border-line text-[13px]">
        <p className="text-ink-soft" aria-live="polite">
          {status}
        </p>
        <ul className="flex flex-wrap gap-x-4 gap-y-1">{legend}</ul>
      </div>

      <div className="px-3 pt-3 pb-1 border-t border-line">
        <GeneTrack {...shared} />
      </div>

      <div className="px-3 py-3 border-t border-line" aria-live="polite">
        <ExonInfo transcript={selected} target={target} onPin={setPinned} onShowBases={showBases} />
      </div>
    </div>
  );
};

const ToolButton = ({ children, onClick }: { children: ReactNode; onClick: () => void }) => (
  <button onClick={onClick} className="h-8 px-3 border border-line rounded bg-paper hover:border-ink font-semibold">
    {children}
  </button>
);

const Legend = ({ color, thin, dot, children }: { color: string; thin?: boolean; dot?: boolean; children: ReactNode }) => (
  <li className="flex items-center gap-1.5">
    <span className="inline-block" style={{ background: color, width: dot ? 9 : 16, height: thin ? 2 : 9, borderRadius: dot ? 9 : 1 }} />
    {children}
  </li>
);

const PanelMessage = ({ children, tone }: { children: ReactNode; tone?: "error" }) => (
  <div
    role={tone === "error" ? "alert" : undefined}
    className={`border border-line rounded bg-sheet px-4 py-16 text-center text-sm ${tone === "error" ? "text-base-t" : "text-ink-soft"}`}
  >
    {children}
  </div>
);
