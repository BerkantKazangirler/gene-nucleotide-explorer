import type { GeneSummary } from "@/types";
import { formatLength } from "@/utils/format";

export const ChromosomeBar = ({ gene }: { gene: GeneSummary }) => {
  const total = gene.chromosome_length;
  if (!total || !gene.seq_start || !gene.seq_stop) return null;
  const left = (gene.seq_start / total) * 100;
  const width = Math.max(((gene.seq_stop - gene.seq_start) / total) * 100, 0.4);

  return (
    <figure className="mt-8">
      <div className="relative h-5">
        <div className="absolute inset-y-1 left-0 right-0 rounded-full bg-line" />
        <div
          className="absolute -inset-y-0.5 rounded-sm bg-base-t"
          style={{ left: `${left}%`, width: `max(${width}%, 3px)` }}
          aria-hidden
        />
      </div>
      <figcaption className="mt-2 flex justify-between text-sm text-ink-soft gap-4">
        <span>
          {gene.chromosome}. kromozom, toplam {formatLength(total)}
        </span>
        <span className="text-right">
          {gene.name} burada: {formatLength(gene.seq_start)} konumundan itibaren
        </span>
      </figcaption>
    </figure>
  );
};
