import type { Transcript } from "@/types";
import { formatNumber } from "@/utils/format";
import { transcriptBlocks } from "./geometry";

export type NodeKind = "gene" | "transcript" | "exon" | "protein";

export interface GeneNode {
  id: string;
  kind: NodeKind;
  label: string;
  tooltip: string;
  /** Ekzon düğümü için: transkript id -> o transkriptteki ekzon numarası */
  exonIn?: Record<string, number>;
  coding?: boolean;
  length?: number;
  /** Protein düğümü için: onu kodlayan transkriptler */
  transcripts?: string[];
}

export interface GeneLink {
  source: string;
  target: string;
  kind: "gene-transcript" | "transcript-exon" | "transcript-protein";
  transcript: string;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/**
 * Gen → transkript → ekzon → protein ilişki ağı.
 * Aynı koordinatlara sahip ekzonlar tek düğümdür; böylece hangi ekzonun hangi transkriptlerde
 * tekrar kullanıldığı (alternatif kırpılma) ağda doğrudan görünür.
 */
export function buildGraph(symbol: string, transcripts: Transcript[]) {
  const nodes = new Map<string, GeneNode>();
  const links: GeneLink[] = [];
  const geneId = "gene";

  nodes.set(geneId, {
    id: geneId,
    kind: "gene",
    label: symbol,
    tooltip: `<b>${esc(symbol)}</b><br>${transcripts.length} transkript`,
  });

  // Benzersiz ekzonları konuma göre numarala (E1, E2, ...)
  const unique = new Map<string, { start: number; end: number }>();
  for (const t of transcripts) for (const e of t.exons) unique.set(`${e.start}-${e.end}`, { start: e.start, end: e.end });
  const order = [...unique.entries()].sort((a, b) => a[1].start - b[1].start || a[1].end - b[1].end);
  order.forEach(([key, e], i) => {
    nodes.set(`exon:${key}`, {
      id: `exon:${key}`,
      kind: "exon",
      label: `E${i + 1}`,
      tooltip: "",
      exonIn: {},
      coding: false,
      length: e.end - e.start + 1,
    });
  });

  for (const t of transcripts) {
    const tid = `tx:${t.id}`;
    nodes.set(tid, {
      id: tid,
      kind: "transcript",
      label: t.id,
      tooltip: `<b>${esc(t.id)}</b>${t.product ? `<br>${esc(t.product)}` : ""}<br>${t.exons.length} ekzon`,
    });
    links.push({ source: geneId, target: tid, kind: "gene-transcript", transcript: t.id });

    const coding = new Set(transcriptBlocks(t).filter((b) => b.kind === "cds").map((b) => b.exon));
    for (const e of t.exons) {
      const node = nodes.get(`exon:${e.start}-${e.end}`)!;
      node.exonIn![t.id] = e.number;
      node.coding ||= coding.has(e.number);
      links.push({ source: tid, target: node.id, kind: "transcript-exon", transcript: t.id });
    }

    if (t.cds) {
      const pid = `protein:${t.cds.protein_id ?? t.id}`;
      const existing = nodes.get(pid);
      if (existing) existing.transcripts!.push(t.id);
      else
        nodes.set(pid, {
          id: pid,
          kind: "protein",
          label: t.cds.protein_id ?? "protein",
          tooltip: "",
          transcripts: [t.id],
        });
      links.push({ source: tid, target: pid, kind: "transcript-protein", transcript: t.id });
    }
  }

  for (const n of nodes.values()) {
    if (n.kind === "exon") {
      const [s, e] = n.id.slice(5).split("-").map(Number);
      const uses = Object.entries(n.exonIn!)
        .map(([tid, num]) => `${esc(tid)}: ${num}. ekzon`)
        .join("<br>");
      n.tooltip = `<b>${n.label}</b> ${n.coding ? "(proteine çevrilen kısım var)" : "(proteine çevrilmez)"}<br>${formatNumber(s)}–${formatNumber(e)}, ${formatNumber(n.length!)} baz<br>${uses}`;
    }
    if (n.kind === "protein") {
      n.tooltip = `<b>${esc(n.label)}</b><br>Protein, kodlayan transkriptler:<br>${n.transcripts!.map(esc).join("<br>")}`;
    }
  }

  return { nodes: [...nodes.values()], links };
}
