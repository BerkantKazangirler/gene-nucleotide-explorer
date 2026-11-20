import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, { type ForceGraphMethods } from "react-force-graph-3d";
import type { Transcript } from "@/types";
import type { HoverTarget } from "./geometry";
import { buildGraph, type GeneLink, type GeneNode } from "./graphData";
import { REGION_COLORS } from "./helix";
import { makeTextSprite } from "./textSprite";

export interface GeneGraphProps {
  symbol: string;
  transcripts: Transcript[];
  selectedId: string;
  hovered: HoverTarget | null;
  pinned: HoverTarget | null;
  onHover: (t: HoverTarget | null) => void;
  onPin: (t: HoverTarget) => void;
  onSelectTranscript: (id: string) => void;
}

const NODE_COLORS = {
  gene: "#eef4f6",
  transcript: "#9fb4bd",
  protein: "#f2b134",
};

export default function GeneGraph(props: GeneGraphProps) {
  const { symbol, transcripts, selectedId, hovered, pinned, onHover, onPin, onSelectTranscript } = props;
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<ForceGraphMethods<GeneNode, GeneLink> | undefined>(undefined);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const fitted = useRef(false);

  const data = useMemo(() => buildGraph(symbol, transcripts), [symbol, transcripts]);

  const ready = size.width > 0;
  useEffect(() => {
    if (!ready) return;
    (fg.current?.d3Force("charge") as { strength?: (v: number) => void } | undefined)?.strength?.(-180);
    fg.current?.d3ReheatSimulation();
    const id = window.setTimeout(() => fg.current?.zoomToFit(600, 50), 1400);
    return () => window.clearTimeout(id);
  }, [data, ready]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      setSize({ width: Math.round(entry.contentRect.width), height: Math.round(entry.contentRect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const target = hovered ?? pinned;
  const isHot = (n: GeneNode) =>
    n.kind === "exon" && !!target && n.exonIn?.[target.transcriptId] === target.exon;
  const onSelected = (n: GeneNode) =>
    n.kind === "gene" ||
    n.id === `tx:${selectedId}` ||
    (n.kind === "exon" && n.exonIn?.[selectedId] != null) ||
    (n.kind === "protein" && !!n.transcripts?.includes(selectedId));

  const exonTarget = (n: GeneNode): HoverTarget | null => {
    if (!n.exonIn) return null;
    const tid = n.exonIn[selectedId] != null ? selectedId : Object.keys(n.exonIn)[0];
    return { transcriptId: tid, exon: n.exonIn[tid] };
  };

  return (
    <div ref={wrap} className="absolute inset-0">
      {size.width > 0 && (
        <ForceGraph3D<GeneNode, GeneLink>
          ref={fg}
          width={size.width}
          height={size.height}
          graphData={data}
          backgroundColor="#10242e"
          showNavInfo={false}
          dagMode="td"
          dagLevelDistance={70}
          nodeRelSize={4}
          nodeResolution={18}
          nodeOpacity={0.95}
          nodeVal={(n) =>
            n.kind === "gene" ? 9 : n.kind === "exon" ? 0.6 + Math.log10(n.length ?? 10) / 2 : n.kind === "protein" ? 4 : 3
          }
          nodeColor={(n) => {
            if (isHot(n)) return REGION_COLORS.hover;
            const base =
              n.kind === "exon" ? (n.coding ? REGION_COLORS.cds : REGION_COLORS.utr) : NODE_COLORS[n.kind as keyof typeof NODE_COLORS];
            return onSelected(n) ? base : `${base}55`;
          }}
          nodeLabel={(n) => `<div class="graph-tip">${n.tooltip}</div>`}
          nodeThreeObjectExtend
          nodeThreeObject={(n) => {
            const size = n.kind === "gene" ? 8 : n.kind === "exon" ? 4.2 : 5;
            const sprite = makeTextSprite(n.label, REGION_COLORS.label, size);
            sprite.position.set(0, n.kind === "gene" ? 13 : n.kind === "exon" ? 7 : 9, 0);
            return sprite;
          }}
          linkColor={(l) => (l.transcript === selectedId ? "#cfe0e7" : "#3b5a68")}
          linkOpacity={0.55}
          linkWidth={(l) => (l.transcript === selectedId ? 0.9 : 0.2)}
          linkDirectionalParticles={(l) => (l.transcript === selectedId && l.kind !== "transcript-exon" ? 3 : 0)}
          linkDirectionalParticleWidth={1.8}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleColor={() => NODE_COLORS.protein}
          onNodeHover={(n) => {
            if (wrap.current) wrap.current.style.cursor = n ? "pointer" : "";
            onHover(n ? exonTarget(n) : null);
          }}
          onNodeClick={(n) => {
            if (n.kind === "transcript") onSelectTranscript(n.label);
            if (n.kind === "protein" && n.transcripts?.length && !n.transcripts.includes(selectedId))
              onSelectTranscript(n.transcripts[0]);
            if (n.kind === "exon") {
              const t = exonTarget(n);
              if (t) {
                onSelectTranscript(t.transcriptId);
                onPin(t);
              }
            }
          }}
          d3VelocityDecay={0.3}
          cooldownTicks={160}
          onEngineStop={() => {
            if (fitted.current) return;
            fitted.current = true;
            fg.current?.zoomToFit(700, 50);
          }}
        />
      )}
    </div>
  );
}
