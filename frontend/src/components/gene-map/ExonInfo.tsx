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
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <p>
          <b>{t.id}</b>
          {t.product && <span className="text-ink-soft"> {t.product}</span>}
          <br />
          {t.exons.length} ekzon, toplam {formatNumber(share.total)} baz; bunun {formatNumber(share.cds)} bazı proteine
          çevrilir.
        </p>
        <Btn onClick={() => go(1)}>1. ekzonu seç</Btn>
      </div>
    );
  }

  const blocks = transcriptBlocks(t).filter((b) => b.exon === exon.number);
  const coding = blocks.filter((b) => b.kind === "cds").reduce((a, b) => a + b.end - b.start + 1, 0);
  const kind = coding === 0 ? "UTR" : coding === exon.length ? "CDS" : "kısmen CDS";

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <div className="overflow-x-auto max-w-full">
        <table>
          <tbody>
            <tr className="text-ink-soft">
              <Cell>Ekzon</Cell>
              <Cell>Konum (gen içi)</Cell>
              <Cell>Uzunluk</Cell>
              <Cell>Kodlayan</Cell>
              <Cell>Tür</Cell>
            </tr>
            <tr className="font-semibold">
              <Cell>
                {exon.number} / {t.exons.length}
              </Cell>
              <Cell>
                {formatNumber(exon.start)}–{formatNumber(exon.end)}
              </Cell>
              <Cell>{formatNumber(exon.length)} baz</Cell>
              <Cell>{formatNumber(coding)} baz</Cell>
              <Cell>{kind}</Cell>
            </tr>
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap gap-2">
        <Btn onClick={() => go(exon.number - 1)} disabled={exon.number <= 1}>
          Önceki
        </Btn>
        <Btn onClick={() => go(exon.number + 1)} disabled={exon.number >= t.exons.length}>
          Sonraki
        </Btn>
        {onShowBases && <Btn onClick={() => onShowBases(exon.number)}>Baz çiftlerini göster</Btn>}
      </div>
    </div>
  );
};

const Cell = ({ children }: { children: ReactNode }) => <td className="pr-6 py-0.5 whitespace-nowrap">{children}</td>;

const Btn = ({ children, onClick, disabled }: { children: ReactNode; onClick: () => void; disabled?: boolean }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    className="h-8 px-3 border border-line rounded bg-paper hover:border-ink disabled:opacity-40 disabled:hover:border-line"
  >
    {children}
  </button>
);
