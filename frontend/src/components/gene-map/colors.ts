import type { BlockKind } from "./geometry";

/** Bölge renkleri (koyu sahne üzerinde okunacak tonlar). */
export const REGION_COLORS = {
  cds: "#4f8ef0",
  utr: "#3fbf73",
  intron: "#2d4856",
  intronLine: "#6f8b98",
  hover: "#ff5a4e",
  label: "#d9e5ea",
} as const;

/**
 * Baz renkleri. Sanger kromatogram geleneğinde G siyahtır; koyu zeminde görünmeyeceği için amber kullanılır.
 */
export const BASE_COLORS: Record<string, string> = {
  A: "#3fbf73",
  T: "#ff5a4e",
  G: "#f2b134",
  C: "#4f8ef0",
  N: "#6f8b98",
};

const COMPLEMENT: Record<string, string> = { A: "T", T: "A", G: "C", C: "G" };
export const complement = (b: string) => COMPLEMENT[b] ?? "N";

/** A–T arasında 2, G–C arasında 3 hidrojen bağı vardır. */
export const hydrogenBonds = (b: string) => (b === "G" || b === "C" ? 3 : b === "A" || b === "T" ? 2 : 0);

export type Region = BlockKind | "intron";
