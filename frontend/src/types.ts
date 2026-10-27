export type Strand = 1 | -1;

export interface SearchResult {
  id: string;
  symbol: string | null;
  description: string | null;
  organism: string | null;
  organism_common: string | null;
  chromosome: string | null;
  map_location: string | null;
  exon_count: number;
  length: number | null;
  strand: Strand | null;
  has_location: boolean;
}

export interface SearchResponse {
  query: string;
  organism: string | null;
  total: number;
  results: SearchResult[];
}

export interface GeneSummary {
  id: string;
  name: string | null;
  description: string | null;
  summary: string | null;
  organism: string | null;
  organism_common: string | null;
  chromosome: string | null;
  map_location: string | null;
  accession: string | null;
  exon_count: number;
  other_aliases: string | null;
  seq_start: number | null;
  seq_stop: number | null;
  strand: Strand | null;
  length: number | null;
  chromosome_length: number | null;
}

export interface Exon {
  number: number;
  start: number;
  end: number;
  length: number;
}

export interface Cds {
  protein_id: string | null;
  product: string | null;
  start: number;
  end: number;
  segments: { start: number; end: number }[];
}

export interface Transcript {
  id: string;
  type: string;
  product: string | null;
  partial: boolean;
  exons: Exon[];
  cds: Cds | null;
}

export interface GeneStructure {
  gene_id: string | null;
  symbol: string | null;
  length: number;
  strand: Strand;
  gene: { start: number; end: number };
  transcripts: Transcript[];
  unmatched_cds: Cds[];
}
