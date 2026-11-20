import { useMemo } from "react";
import type { Transcript } from "@/types";
import { formatNumber, niceStep } from "@/utils/format";
import { transcriptBlocks, type HoverTarget } from "./geometry";

const VB_W = 1000;
const LABEL_W = 132;
const PAD_X = 12;
const RULER_H = 30;
const ROW_H = 34;

interface Props {
  length: number;
  transcripts: Transcript[];
  selectedId: string;
  hovered: HoverTarget | null;
  pinned: HoverTarget | null;
  onHover: (t: HoverTarget | null) => void;
  onPin: (t: HoverTarget) => void;
  onSelectTranscript: (id: string) => void;
}

export const GeneTrack = ({ length, transcripts, selectedId, hovered, pinned, onHover, onPin, onSelectTranscript }: Props) => {
  const x = (pos: number) => LABEL_W + ((pos - 1) / length) * (VB_W - LABEL_W - PAD_X);
  const ticks = useMemo(() => {
    const step = niceStep(length);
    const out: number[] = [];
    for (let p = step; p < length; p += step) out.push(p);
    return out;
  }, [length]);

  const height = RULER_H + transcripts.length * ROW_H + 6;

  return (
    <div className="overflow-x-auto">
      <svg
        viewBox={`0 0 ${VB_W} ${height}`}
        className="w-full min-w-[640px] block"
        role="img"
        aria-label="Transkriptlerin düz haritası"
        onMouseLeave={() => onHover(null)}
      >
        <line x1={x(1)} x2={x(length)} y1={RULER_H - 8} y2={RULER_H - 8} stroke="var(--color-line)" />
        {ticks.map((p) => (
          <g key={p}>
            <line x1={x(p)} x2={x(p)} y1={RULER_H - 12} y2={height} stroke="var(--color-line)" strokeDasharray="2 4" />
            <text x={x(p)} y={RULER_H - 16} textAnchor="middle" fontSize="11" fill="var(--color-ink-soft)">
              {formatNumber(p)}
            </text>
          </g>
        ))}

        {transcripts.map((t, row) => {
          const y = RULER_H + row * ROW_H + ROW_H / 2;
          const active = t.id === selectedId;
          const blocks = transcriptBlocks(t);
          const first = t.exons[0].start;
          const last = t.exons[t.exons.length - 1].end;
          const hot = (n: number) =>
            (hovered?.transcriptId === t.id && hovered.exon === n) || (pinned?.transcriptId === t.id && pinned.exon === n);
          return (
            <g key={t.id} opacity={active ? 1 : 0.45} className="cursor-pointer" onClick={() => onSelectTranscript(t.id)}>
              {active && <rect x={0} y={y - ROW_H / 2 + 1} width={VB_W} height={ROW_H - 2} rx={6} fill="var(--color-base-c)" opacity={0.07} />}
              <text x={10} y={y + 4} fontSize="12" fontWeight={active ? 700 : 400} fill="var(--color-ink)">
                {t.id}
              </text>
              <line x1={x(first)} x2={x(last)} y1={y} y2={y} stroke="var(--color-base-g)" strokeWidth={1.2} />
              {blocks.map((b, i) => {
                const h = b.kind === "cds" ? 16 : 9;
                const w = Math.max(x(b.end + 1) - x(b.start), 1.5);
                return (
                  <rect
                    key={i}
                    x={x(b.start)}
                    y={y - h / 2}
                    width={w}
                    height={h}
                    rx={1.5}
                    fill={hot(b.exon) ? "var(--color-base-t)" : b.kind === "cds" ? "var(--color-base-c)" : "var(--color-base-a)"}
                  />
                );
              })}
              {t.exons.map((e) => {
                const w = Math.max(x(e.end + 1) - x(e.start), 8);
                return (
                  <rect
                    key={`hit-${e.number}`}
                    x={x(e.start) - (w - (x(e.end + 1) - x(e.start))) / 2}
                    y={y - ROW_H / 2 + 2}
                    width={w}
                    height={ROW_H - 4}
                    fill="transparent"
                    onMouseEnter={() => onHover({ transcriptId: t.id, exon: e.number })}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      onSelectTranscript(t.id);
                      onPin({ transcriptId: t.id, exon: e.number });
                    }}
                  >
                    <title>{`${t.id} ekzon ${e.number}: ${formatNumber(e.start)}–${formatNumber(e.end)}`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
};
