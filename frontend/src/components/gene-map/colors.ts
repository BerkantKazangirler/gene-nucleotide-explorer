import type { BlockKind } from "./geometry";

export const REGION_COLORS = {
  cds: "#4f8ef0",
  utr: "#3fbf73",
  intron: "#2d4856",
  intronLine: "#6f8b98",
  hover: "#ff5a4e",
  label: "#d9e5ea",
} as const;

export const BASE_COLORS: Record<string, string> = {
  A: "#3fbf73",
  T: "#ff5a4e",
  G: "#f2b134",
  C: "#4f8ef0",
  N: "#6f8b98",
};

const COMPLEMENT: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
export const complement = (b: string) => COMPLEMENT[b] ?? "N";

export const hydrogenBonds = (b: string) => (b === "G" || b === "C" ? 3 : b === "A" || b === "T" ? 2 : 0);

export type Region = BlockKind | "intron";
