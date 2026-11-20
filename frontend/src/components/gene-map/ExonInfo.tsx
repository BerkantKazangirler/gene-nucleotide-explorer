import type { ReactNode } from "react";
import type { Transcript } from "@/types";
import { formatNumber } from "@/utils/format";
import { codingShare, transcriptBlocks, type HoverTarget } from "./geometry";

interface Props {
  transcript: Transcript;
  target: HoverTarget | null;
  onPin: (t: HoverTarget) => void;
  onShowBases?: (exon: number) => void;
}

export const ExonInfo = ({ transcript: t, target, onPin, onShowBases }: Props) => {
  const exon = target && target.transcriptId === t.id ? t.exons.find((e) => e.number === target.exon) : undefined;
  const go = (n: number) => onPin({ transcriptId: t.id, exon: n });

  if (!exon) {
    const share = codingShare(t);
    return (
      <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-center">
        <p className="text-ink-soft">
          <strong className="text-ink">{t.id}</strong> {t.product ? `(${t.product})` : ""} {t.exons.length} ekzondan
          oluşuyor. Ekzonların toplam {formatNumber(share.total)} bazının {formatNumber(share.cds)} tanesi proteine
          çevriliyor. Ayrıntı için haritada bir ekzonun üzerine gel ya da tıkla.
        </p>
        <button onClick={() => go(1)} className="justify-self-start sm:justify-self-end px-3 py-2 rounded-lg border border-line bg-sheet hover:border-ink text-sm font-medium">
          1. ekzondan başla
        </button>
      </div>
    );
  }

  const blocks = transcriptBlocks(t).filter((b) => b.exon === exon.number);
  const coding = blocks.filter((b) => b.kind === "cds").reduce((a, b) => a + b.end - b.start + 1, 0);
  const kind =
    coding === 0 ? "Bu ekzon proteine çevrilmiyor (UTR)." : coding === exon.length ? "Tamamı proteine çevriliyor (CDS)." : "Bir kısmı proteine çevriliyor.";

  return (
    <div className="grid sm:grid-cols-[1fr_auto] gap-4 items-center">
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-2">
        <Fact label="Ekzon">
          {exon.number} / {t.exons.length}
        </Fact>
        <Fact label="Gen içindeki konum">
          {formatNumber(exon.start)}–{formatNumber(exon.end)}
        </Fact>
        <Fact label="Uzunluk">{formatNumber(exon.length)} baz</Fact>
        <Fact label="Kodlayan kısım">{formatNumber(coding)} baz</Fact>
        <p className="col-span-full text-sm text-ink-soft">{kind}</p>
      </dl>
      <div className="flex flex-wrap gap-2 justify-self-start sm:justify-self-end">
        {onShowBases && (
          <button
            onClick={() => onShowBases(exon.number)}
            className="px-3 py-2 rounded-lg bg-ink text-sheet hover:bg-base-c text-sm font-bold"
          >
            Baz çiftlerini göster
          </button>
        )}
        <button
          onClick={() => go(exon.number - 1)}
          disabled={exon.number <= 1}
          className="px-3 py-2 rounded-lg border border-line bg-sheet hover:border-ink disabled:opacity-40 text-sm font-medium"
        >
          Önceki ekzon
        </button>
        <button
          onClick={() => go(exon.number + 1)}
          disabled={exon.number >= t.exons.length}
          className="px-3 py-2 rounded-lg border border-line bg-sheet hover:border-ink disabled:opacity-40 text-sm font-medium"
        >
          Sonraki ekzon
        </button>
      </div>
    </div>
  );
};

const Fact = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-sm text-ink-soft">{label}</dt>
    <dd className="font-display font-bold text-xl">{children}</dd>
  </div>
);
