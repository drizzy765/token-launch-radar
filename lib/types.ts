// Shared shapes for the v2 radar. The snapshot fields are the sealed DefiLlama record.

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface LaunchRow {
  slug: string;
  name: string;
  rank: number;
  implied_value_usd: number;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  watchlist: boolean;
  multiple_ppm: number;
  raw_multiple_ppm: number;
  growth_ppm: number;
  age_ppm: number;
  chain_ppm: number;
  multiple_kind: string;
  comparable_count: number;
  confidence: string;
  farm_steps: string[];
}

export interface CategoryMultiple {
  name: string;
  n_rows: number;
  n_comps: number;
  multiple_ppm: number;
  raw_ppm: number;
  kind: string;
}

export interface CompRow {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  ratio_ppm: number;
}

export interface PageData {
  as_of: string;
  floor_usd: number;
  n_protocols: number;
  n_watchlist: number;
  n_rows: number;
  n_comps: number;
  n_screened_out: number;
  p10_ppm: number;
  p90_ppm: number;
  global_ppm: number;
  categories: CategoryMultiple[];
  comps: CompRow[];
  rows: LaunchRow[];
}
