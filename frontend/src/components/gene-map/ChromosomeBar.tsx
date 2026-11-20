import type { GeneSummary } from "@/types";
import { formatLength } from "@/utils/format";

export const ChromosomeBar = ({ gene }: { gene: GeneSummary }) => {
  const total = gene.chromosome_length;
  if (!total || !gene.seq_start || !gene.seq_stop) return null;
  const left = (gene.seq_start / total) * 100;
  const width = Math.max(((gene.seq_stop - gene.seq_start) / total) * 100, 0.4);

  return (
    <div className="max-w-md">
      <div className="relative h-3 mt-1 bg-line rounded-sm" aria-hidden>
        <div className="absolute inset-y-0 bg-base-t" style={{ left: `${left}%`, width: `max(${width}%, 2px)` }} />
      </div>
      <div className="mt-1 flex justify-between text-[12px] text-ink-soft">
        <span>0</span>
        <span>
          Kromozom {gene.chromosome}, {formatLength(total)}
        </span>
      </div>
    </div>
  );
};
