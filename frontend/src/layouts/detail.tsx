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

// three.js büyük bir kütüphane; 3B görünümler sadece detay sayfası açılınca yüklenir
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
    <div className="pt-8">
      <button onClick={onBack} className="text-sm text-ink-soft hover:text-ink underline underline-offset-4">
        Aramaya dön
      </button>

      {gene.status === "loading" && <HeaderSkeleton />}
      {gene.status === "error" && (
        <div className="mt-6">
          <Notice tone="error">{gene.error}</Notice>
        </div>
      )}
      {gene.status === "success" && <GeneHeader gene={gene.data} />}

      <section className="mt-10" aria-labelledby="map-title">
        <h2 id="map-title" className="font-display font-bold text-2xl tracking-tight">
          Gen haritası
        </h2>
        <p className="mt-1 text-ink-soft max-w-2xl">
          Gen, DNA'nın çift sarmalı üzerinde bir bölge. Sarmalın parlak kısımları ekzonlar: mavi kısımlar proteine
          çevrilir, yeşil kısımlar çevrilmez. Sönük kısımlar intronlar. Bir ekzon seçip baz çiftlerine yakınlaşabilir ya
          da ilişki ağında transkriptlerin hangi ekzonları paylaştığını görebilirsin.
        </p>

        <div className="mt-5">
          {structure.status === "loading" && <StageMessage>Gen yapısı NCBI'dan alınıyor…</StageMessage>}
          {structure.status === "error" && <StageMessage tone="error">{structure.error}</StageMessage>}
          {structure.status === "success" &&
            (structure.data.transcripts.length === 0 ? (
              <StageMessage>Bu gen için NCBI kaydında transkript (mRNA) bilgisi yok, harita çizilemiyor.</StageMessage>
            ) : (
              <GeneMap structure={structure.data} geneId={geneId} />
            ))}
        </div>
      </section>

      {gene.status === "success" && gene.data.summary && (
        <section className="mt-12 max-w-3xl">
          <h2 className="font-display font-bold text-2xl tracking-tight">NCBI özeti</h2>
          <p className="mt-1 text-sm text-ink-soft">NCBI bu metni İngilizce sağlıyor.</p>
          <p className="mt-3 leading-relaxed" lang="en">
            {gene.data.summary}
          </p>
        </section>
      )}
    </div>
  );
};

const GeneHeader = ({ gene }: { gene: GeneSummary }) => (
  <header className="mt-4">
    <h1 className="font-display font-extrabold text-6xl sm:text-8xl tracking-tighter leading-none">{gene.name}</h1>
    <p className="mt-3 text-xl max-w-2xl">{gene.description}</p>
    <dl className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-x-6 gap-y-4 border-t border-line pt-5">
      <Fact label="Tür">
        <i>{gene.organism}</i>
      </Fact>
      <Fact label="Kromozom bölgesi">{gene.map_location ?? gene.chromosome ?? "—"}</Fact>
      <Fact label="Uzunluk">{formatLength(gene.length)}</Fact>
      <Fact label="Ekzon sayısı">{gene.exon_count > 0 ? gene.exon_count : "—"}</Fact>
      <Fact label="Okuma yönü" hint="Gen DNA'nın iki ipliğinden hangisinde yer alıyor. Haritada her zaman 5′→3′ yönünde gösterilir.">
        {gene.strand === -1 ? "Ters iplik" : gene.strand === 1 ? "İleri iplik" : "—"}
      </Fact>
      <Fact label="NCBI kaydı">
        {gene.accession ? (
          <a
            className="underline underline-offset-2 break-all"
            href={`https://www.ncbi.nlm.nih.gov/gene/${gene.id}`}
            target="_blank"
            rel="noreferrer"
          >
            Gene {gene.id}
          </a>
        ) : (
          "—"
        )}
      </Fact>
    </dl>
    {gene.accession && gene.seq_start && (
      <p className="mt-3 text-sm text-ink-soft">
        {gene.accession}: {formatNumber(gene.seq_start)}–{formatNumber(gene.seq_stop)}
      </p>
    )}
    <ChromosomeBar gene={gene} />
  </header>
);

type BasesState =
  | { status: "idle" }
  | { status: "loading"; exon: number }
  | { status: "error"; exon: number; error: string }
  | { status: "ready"; exon: number; data: BaseWindow };

const BASE_WINDOW = 60; // yakın görünümde gösterilen baz çifti sayısı

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

  /** Ekzonun çevresinden 60 bazlık bir pencere seçip gerçek diziyi NCBI'dan ister. */
  const showBases = async (exonNumber: number) => {
    const exon = selected.exons.find((e) => e.number === exonNumber);
    if (!exon) return;
    const L = structure.length;
    let start: number;
    if (exon.length <= BASE_WINDOW - 16) {
      // kısa ekzon: tamamı ve iki yanındaki intron sınırı görünsün
      start = Math.round((exon.start + exon.end) / 2) - BASE_WINDOW / 2;
    } else {
      // uzun ekzon: intron-ekzon sınırından başla
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

  return (
    <div className="rounded-2xl overflow-hidden border border-stage-line bg-sheet">
      <div className="relative h-[460px] sm:h-[540px] bg-stage text-[#d9e5ea]">
        <Suspense fallback={<div className="absolute inset-0 grid place-items-center">3B sahne yükleniyor…</div>}>
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

        {/* üst şerit: açıklama + görünüm seçimi */}
        <div className="absolute top-3 left-3 right-3 flex flex-wrap gap-3 justify-between items-start pointer-events-none">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm bg-stage/80 rounded-lg px-3 py-2 max-w-full">
            {inBases ? (
              <>
                <Legend color={BASE_COLORS.A}>A</Legend>
                <Legend color={BASE_COLORS.T}>T</Legend>
                <Legend color={BASE_COLORS.G}>G</Legend>
                <Legend color={BASE_COLORS.C}>C</Legend>
                <li className="text-[#9fb4bd]">A, T ile; G, C ile eşleşir</li>
              </>
            ) : view === "graph" ? (
              <>
                <Legend color="#eef4f6" dot>Gen</Legend>
                <Legend color="#9fb4bd" dot>Transkript</Legend>
                <Legend color={REGION_COLORS.cds} dot>Kodlayan ekzon</Legend>
                <Legend color={REGION_COLORS.utr} dot>Kodlamayan ekzon</Legend>
                <Legend color="#f2b134" dot>Protein</Legend>
              </>
            ) : (
              <>
                <Legend color={REGION_COLORS.cds}>Kodlayan bölge (CDS)</Legend>
                <Legend color={REGION_COLORS.utr}>Kodlamayan ekzon (UTR)</Legend>
                <Legend color={REGION_COLORS.intronLine} thin>İntron</Legend>
              </>
            )}
          </ul>
          <div className="pointer-events-auto flex flex-wrap gap-2 justify-end">
            <div role="group" aria-label="Görünüm" className="flex rounded-lg bg-stage/80 border border-stage-line p-0.5 text-sm">
              {(
                [
                  ["helix", "Çift sarmal"],
                  ["graph", "İlişki ağı"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  aria-pressed={view === v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1.5 rounded-md ${view === v ? "bg-[#d9e5ea] text-stage font-bold" : "hover:text-white"}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {transcripts.length > 1 && !inBases && (
              <label className="text-sm bg-stage/80 rounded-lg px-3 py-1.5 flex items-center gap-2 border border-stage-line">
                <span className="sr-only sm:not-sr-only">Transkript</span>
                <select
                  value={selected.id}
                  onChange={(e) => selectTranscript(e.target.value)}
                  className="bg-stage rounded-md px-1 py-0.5 max-w-[12rem]"
                >
                  {transcripts.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id} ({t.exons.length} ekzon)
                    </option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>

        {/* alt şerit: duruma göre yardım, yükleniyor, baz bilgisi ve eylemler */}
        <div className="absolute bottom-3 left-3 right-3 flex flex-wrap gap-2 justify-between items-end pointer-events-none">
          <p className="text-xs sm:text-sm text-[#9fb4bd] bg-stage/70 rounded-md px-2 py-1" aria-live="polite">
            {view === "graph" &&
              "Aynı ekzonu kullanan transkriptler aynı düğüme bağlanır. Sürükle, kaydır, bir düğüme tıkla."}
            {view === "helix" && bases.status === "loading" && `Ekzon ${bases.exon} çevresindeki dizi NCBI'dan alınıyor…`}
            {view === "helix" && bases.status === "error" && <span className="text-[#ff8a80]">{bases.error}</span>}
            {view === "helix" && bases.status === "idle" && "Sürükleyerek döndür, kaydırarak yakınlaş, bir ekzona tıklayarak seç."}
            {inBases &&
              (baseHover ? (
                <span className="text-[#d9e5ea]">
                  {formatNumber(baseHover.pos)}. baz: <b style={{ color: BASE_COLORS[baseHover.base] }}>{baseHover.base}</b>
                  {hydrogenBonds(baseHover.base) === 3 ? " ≡ " : " = "}
                  <b style={{ color: BASE_COLORS[baseHover.pair] }}>{baseHover.pair}</b> ({hydrogenBonds(baseHover.base)} hidrojen
                  bağı),{" "}
                  {baseHover.exon != null
                    ? `ekzon ${baseHover.exon} ${baseHover.region === "cds" ? "(proteine çevrilir)" : "(çevrilmez)"}`
                    : "intron"}
                </span>
              ) : (
                `${formatNumber(bases.data.start)}–${formatNumber(bases.data.end)} arası, ${bases.data.sequence.length} baz çifti. Bir basamağın üzerine gel.`
              ))}
          </p>
          <div className="pointer-events-auto flex gap-2">
            {inBases ? (
              <StageButton onClick={leaveBases}>Gen görünümüne dön</StageButton>
            ) : (
              view === "helix" &&
              focusExon != null &&
              bases.status !== "loading" && (
                <StageButton onClick={() => showBases(focusExon)} primary>
                  Ekzon {focusExon}: baz çiftlerini göster
                </StageButton>
              )
            )}
          </div>
        </div>
      </div>

      <div className="px-3 sm:px-5 pt-4 pb-2 border-t border-line">
        <GeneTrack {...shared} />
      </div>

      <div className="px-4 sm:px-5 py-4 border-t border-line" aria-live="polite">
        <ExonInfo transcript={selected} target={target} onPin={setPinned} onShowBases={showBases} />
      </div>
    </div>
  );
};

const StageButton = ({ children, onClick, primary }: { children: ReactNode; onClick: () => void; primary?: boolean }) => (
  <button
    onClick={onClick}
    className={`text-sm px-3 py-2 rounded-lg border font-medium ${
      primary
        ? "bg-[#d9e5ea] text-stage border-transparent hover:bg-white"
        : "bg-stage/80 border-stage-line hover:border-[#d9e5ea]"
    }`}
  >
    {children}
  </button>
);

const Legend = ({ color, thin, dot, children }: { color: string; thin?: boolean; dot?: boolean; children: ReactNode }) => (
  <li className="flex items-center gap-2">
    <span
      className="inline-block rounded-full"
      style={{ background: color, width: dot ? 10 : 20, height: thin ? 3 : 10 }}
    />
    {children}
  </li>
);

const Fact = ({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) => (
  <div>
    <dt className="text-sm text-ink-soft" title={hint}>
      {label}
    </dt>
    <dd className="mt-0.5 font-medium">{children}</dd>
  </div>
);

const StageMessage = ({ children, tone }: { children: ReactNode; tone?: "error" }) => (
  <div
    role={tone === "error" ? "alert" : undefined}
    className={`h-[320px] rounded-2xl bg-stage grid place-items-center px-6 text-center ${tone === "error" ? "text-[#ff8a80]" : "text-[#d9e5ea]"}`}
  >
    <p className="max-w-md">{children}</p>
  </div>
);

const HeaderSkeleton = () => (
  <div className="mt-4 animate-pulse" aria-label="Gen bilgisi yükleniyor">
    <div className="h-20 w-64 rounded-lg bg-line" />
    <div className="mt-4 h-5 w-96 max-w-full rounded bg-line" />
  </div>
);
