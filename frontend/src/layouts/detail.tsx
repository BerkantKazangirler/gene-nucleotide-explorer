import { lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { ChromosomeBar } from "@/components/gene-map/ChromosomeBar";
import { ExonInfo } from "@/components/gene-map/ExonInfo";
import { GeneTrack } from "@/components/gene-map/GeneTrack";
import { sortTranscripts, type HoverTarget } from "@/components/gene-map/geometry";
import { useFetch } from "@/hooks/useFetch";
import type { GeneStructure, GeneSummary } from "@/types";
import { formatLength, formatNumber } from "@/utils/format";
import { Notice } from "./search";

// three.js büyük bir kütüphane; sadece detay sayfası açılınca yüklenir
const GeneScene = lazy(() => import("@/components/gene-map/GeneScene"));

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
          Her sıra bir transkript, yani genin okunma şekillerinden biri. Kalın parçalar ekzonlar, aradaki ince sarmal
          intronlar. Mavi kısımlar proteine çevrilir, yeşil kısımlar çevrilmez.
        </p>

        <div className="mt-5">
          {structure.status === "loading" && <StageMessage>Gen yapısı NCBI'dan alınıyor…</StageMessage>}
          {structure.status === "error" && <StageMessage tone="error">{structure.error}</StageMessage>}
          {structure.status === "success" &&
            (structure.data.transcripts.length === 0 ? (
              <StageMessage>Bu gen için NCBI kaydında transkript (mRNA) bilgisi yok, harita çizilemiyor.</StageMessage>
            ) : (
              <GeneMap structure={structure.data} />
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

const GeneMap = ({ structure }: { structure: GeneStructure }) => {
  const transcripts = useMemo(() => sortTranscripts(structure.transcripts), [structure]);
  const [selectedId, setSelectedId] = useState(transcripts[0].id);
  const [hovered, setHovered] = useState<HoverTarget | null>(null);
  const [pinned, setPinned] = useState<HoverTarget | null>(null);
  const selected = transcripts.find((t) => t.id === selectedId) ?? transcripts[0];

  const selectTranscript = (id: string) => {
    if (id === selectedId) return;
    setSelectedId(id);
    setPinned(null);
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

  return (
    <div className="rounded-2xl overflow-hidden border border-stage-line bg-sheet">
      <div className="relative h-[420px] sm:h-[480px] bg-stage">
        <Suspense fallback={<div className="absolute inset-0 grid place-items-center text-[#d9e5ea]">3B sahne yükleniyor…</div>}>
          <GeneScene {...shared} />
        </Suspense>

        <div className="absolute top-3 left-3 right-3 flex flex-wrap gap-3 justify-between items-start pointer-events-none">
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-[#d9e5ea] bg-stage/80 rounded-lg px-3 py-2">
            <Legend color="var(--color-base-c)">Kodlayan bölge (CDS)</Legend>
            <Legend color="var(--color-base-a)">Kodlamayan ekzon (UTR)</Legend>
            <Legend color="#8aa1ad" thin>
              İntron
            </Legend>
          </ul>
          {transcripts.length > 1 && (
            <label className="pointer-events-auto text-sm text-[#d9e5ea] bg-stage/80 rounded-lg px-3 py-2 flex items-center gap-2">
              Transkript
              <select
                value={selected.id}
                onChange={(e) => selectTranscript(e.target.value)}
                className="bg-stage border border-stage-line rounded-md px-2 py-1 text-[#d9e5ea] max-w-[14rem]"
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
        <p className="absolute bottom-3 left-3 text-xs text-[#9fb4bd] pointer-events-none">
          Sürükleyerek döndür, kaydırarak yakınlaş, bir ekzona tıklayarak seç.
        </p>
      </div>

      <div className="px-3 sm:px-5 pt-4 pb-2 border-t border-line">
        <GeneTrack {...shared} />
      </div>

      <div className="px-4 sm:px-5 py-4 border-t border-line" aria-live="polite">
        <ExonInfo transcript={selected} target={hovered ?? pinned} onPin={setPinned} />
      </div>
    </div>
  );
};

const Legend = ({ color, thin, children }: { color: string; thin?: boolean; children: ReactNode }) => (
  <li className="flex items-center gap-2">
    <span className="inline-block w-5 rounded-full" style={{ background: color, height: thin ? 3 : 10 }} />
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
