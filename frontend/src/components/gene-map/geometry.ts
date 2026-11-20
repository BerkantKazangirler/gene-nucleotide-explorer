import type { Transcript } from "@/types";

export type BlockKind = "utr" | "cds";

export interface Block {
  exon: number;
  start: number;
  end: number;
  kind: BlockKind;
}

export function transcriptBlocks(t: Transcript): Block[] {
  const blocks: Block[] = [];
  for (const exon of t.exons) {
    const segs = t.cds?.segments.filter((s) => s.end >= exon.start && s.start <= exon.end) ?? [];
    if (segs.length === 0) {
      blocks.push({ exon: exon.number, start: exon.start, end: exon.end, kind: "utr" });
      continue;
    }
    let cursor = exon.start;
    for (const s of segs) {
      const cs = Math.max(s.start, exon.start);
      const ce = Math.min(s.end, exon.end);
      if (cs > cursor) blocks.push({ exon: exon.number, start: cursor, end: cs - 1, kind: "utr" });
      blocks.push({ exon: exon.number, start: cs, end: ce, kind: "cds" });
      cursor = ce + 1;
    }
    if (cursor <= exon.end) blocks.push({ exon: exon.number, start: cursor, end: exon.end, kind: "utr" });
  }
  return blocks;
}

export function codingShare(t: Transcript) {
  const blocks = transcriptBlocks(t);
  const cds = blocks.filter((b) => b.kind === "cds").reduce((a, b) => a + b.end - b.start + 1, 0);
  const total = t.exons.reduce((a, e) => a + e.length, 0);
  return { cds, total };
}

export function sortTranscripts(ts: Transcript[]): Transcript[] {
  return [...ts].sort((a, b) => {
    const am = a.type === "mRNA" ? 0 : 1;
    const bm = b.type === "mRNA" ? 0 : 1;
    if (am !== bm) return am - bm;
    return b.exons.length - a.exons.length;
  });
}

export interface HoverTarget {
  transcriptId: string;
  exon: number;
}
