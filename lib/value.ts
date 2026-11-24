// Fathom v3: Implied protocol launch valuation engine.
// Implied Value = TVL × Category Multiple × Growth Modifier × Age Factor × Chain Breadth.
// All operations are executed in integer parts-per-million (PPM) fixed-point arithmetic.
// Existing tokens serve solely as trading comparables.

import { planFarm } from "./farms.ts";
import type { CategoryMultiple, CompRow, LaunchRow, PageData, Protocol, Snapshot } from "./types.ts";

export const PPM = 1_000_000;
export const MIN_CATEGORY_COMPS = 6;
export const GROWTH_LO = -20;
export const GROWTH_HI = 35;
export const GROWTH_PPM_PER_POINT = 6_000;
export const AGE_FLOOR = 0.68;
export const AGE_SPAN = 0.42;
export const AGE_TAU = 1.5;
export const AGE_MISSING_PPM = 750_000;
export const CHAIN_STEP_PPM = 30_000;
export const CHAIN_EXTRA_CAP = 12;
export const VALUE_CAP = 100_000_000_000_000;

export const SCREENED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

interface MultipleHit {
  ppm: number;
  raw: number;
  kind: "category" | "global";
  count: number;
}

interface ComparableBook {
  nComps: number;
  p10Ppm: number;
  p90Ppm: number;
  globalPpm: number;
  comps: CompRow[];
  lookup: (category: string | null) => MultipleHit;
}

/** Parse and validate the immutable snapshot input */
export function loadSnapshot(raw: string): Snapshot {
  const parsed = JSON.parse(raw) as Partial<Snapshot>;
  if (!parsed || !Array.isArray(parsed.protocols) || !Array.isArray(parsed.watchlist)) {
    throw new Error("Snapshot JSON must contain protocols array and watchlist array");
  }
  return {
    as_of: String(parsed.as_of ?? ""),
    floor_usd: Number(parsed.floor_usd ?? 0),
    protocols: parsed.protocols as Protocol[],
    watchlist: parsed.watchlist.map((slug) => String(slug)),
  };
}

/** Score all candidate protocols and generate the sorted radar board */
export function scoreBoard(snapshot: Snapshot): { rows: LaunchRow[]; page: PageData } {
  const watchSet = new Set(snapshot.watchlist);
  const book = buildComparableBook(snapshot.protocols);
  const rows: LaunchRow[] = [];
  let screenedOutCount = 0;

  for (const protocol of snapshot.protocols) {
    if (!recordsNoToken(protocol)) continue;

    const onWatch = watchSet.has(protocol.slug);
    if (!onWatch && isStructuralReject(protocol)) {
      screenedOutCount += 1;
      continue;
    }
    rows.push(scoreSingleProtocol(snapshot.as_of, protocol, onWatch, book));
  }

  // Sort descending by implied valuation, tie-break by TVL, then alphabetically by slug
  rows.sort((a, b) => {
    if (a.implied_value_usd !== b.implied_value_usd) {
      return b.implied_value_usd - a.implied_value_usd;
    }
    if (a.tvl_usd !== b.tvl_usd) {
      return b.tvl_usd - a.tvl_usd;
    }
    return a.slug.localeCompare(b.slug);
  });

  // Assign sequential 1-based ranks
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });

  const page: PageData = {
    as_of: snapshot.as_of,
    floor_usd: snapshot.floor_usd,
    n_protocols: snapshot.protocols.length,
    n_watchlist: snapshot.watchlist.length,
    n_rows: rows.length,
    n_comps: book.nComps,
    n_screened_out: screenedOutCount,
    p10_ppm: book.p10Ppm,
    p90_ppm: book.p90Ppm,
    global_ppm: book.globalPpm,
    categories: summarizeCategories(rows),
    comps: book.comps,
    rows,
  };

  return { rows, page };
}

/** Serialize slim board format required by the competition gate */
export function toBoardJson(rows: LaunchRow[]): string {
  const slim = rows.map((row) => ({
    slug: row.slug,
    name: row.name,
    rank: row.rank,
    implied_value_usd: row.implied_value_usd,
    farm_steps: row.farm_steps,
  }));
  return `${JSON.stringify({ rows: slim })}\n`;
}

/** Serialize page payload into window/global data script */
export function toDataScript(page: PageData): string {
  return `globalThis.FATHOM=${JSON.stringify(page)};\n`;
}

/** Fixed-point valuation arithmetic in integer PPM */
export function impliedDollars(tvl: number, factorsPpm: number[]): number {
  const scale = BigInt(PPM);
  let value = BigInt(Math.round(tvl));
  for (const factor of factorsPpm) {
    value *= BigInt(factor);
  }
  value /= scale ** BigInt(factorsPpm.length);

  if (value < 1n) return 1;
  if (value > BigInt(VALUE_CAP)) return VALUE_CAP;
  return Number(value);
}

/** Derive confidence tier from available market comparables */
export function confidenceFor(count: number, kind: "category" | "global"): "High" | "Fair" | "Thin" | "Unanchored" {
  if (count <= 0) return "Unanchored";
  if (kind !== "category") return "Thin";
  if (count < 12) return "Fair";
  return "High";
}

/** Aggregate category statistics across ranked rows */
function summarizeCategories(rows: LaunchRow[]): CategoryMultiple[] {
  const byName = new Map<string, CategoryMultiple>();
  for (const row of rows) {
    const name = row.category ?? "Uncategorized";
    const existing = byName.get(name);
    if (existing) {
      existing.n_rows += 1;
    } else {
      byName.set(name, {
        name,
        n_rows: 1,
        n_comps: row.comparable_count,
        multiple_ppm: row.multiple_ppm,
        raw_ppm: row.raw_multiple_ppm,
        kind: row.multiple_kind,
      });
    }
  }
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Build market comparable registry from active trading protocols */
function buildComparableBook(protocols: Protocol[]): ComparableBook {
  const rawPairs: { cat: string; ratio: number }[] = [];
  for (const p of protocols) {
    if (!isTradingComparable(p)) continue;
    rawPairs.push({
      cat: p.category ?? "",
      ratio: p.mcap_usd! / p.tvl_usd,
    });
  }

  const allRatios = rawPairs.map((pair) => pair.ratio).sort((a, b) => a - b);
  const p10 = computePercentile(allRatios, 0.1);
  const p90 = computePercentile(allRatios, 0.9);

  // Winsorize ratios between 10th and 90th percentiles
  const winsorized = rawPairs.map((pair) => ({
    cat: pair.cat,
    ratio: Math.min(p90, Math.max(p10, pair.ratio)),
  }));

  const globalMedianRatio = computeMedian(winsorized.map((pair) => pair.ratio).sort((a, b) => a - b));
  const globalPpm = Math.round(globalMedianRatio * PPM);

  const categoryGroups = new Map<string, number[]>();
  for (const item of winsorized) {
    const bucket = categoryGroups.get(item.cat) ?? [];
    bucket.push(item.ratio);
    categoryGroups.set(item.cat, bucket);
  }
  for (const bucket of categoryGroups.values()) {
    bucket.sort((a, b) => a - b);
  }

  const comps: CompRow[] = protocols
    .filter(isTradingComparable)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      tvl_usd: Math.round(p.tvl_usd),
      mcap_usd: Math.round(p.mcap_usd!),
      ratio_ppm: Math.round((p.mcap_usd! / p.tvl_usd) * PPM),
    }))
    .sort((a, b) => {
      const leftCat = a.category ?? "";
      const rightCat = b.category ?? "";
      if (leftCat !== rightCat) return leftCat.localeCompare(rightCat);
      return a.slug.localeCompare(b.slug);
    });

  return {
    nComps: rawPairs.length,
    p10Ppm: Math.round(p10 * PPM),
    p90Ppm: Math.round(p90 * PPM),
    globalPpm,
    comps,
    lookup(category: string | null): MultipleHit {
      const bucket = categoryGroups.get(category ?? "") ?? [];
      const count = bucket.length;
      const rawPpm = count === 0 ? 0 : Math.round(computeMedian(bucket) * PPM);
      if (count >= MIN_CATEGORY_COMPS) {
        return { ppm: rawPpm, raw: rawPpm, kind: "category", count };
      }
      return { ppm: globalPpm, raw: rawPpm, kind: "global", count };
    },
  };
}

/** Calculate valuation attributes and farm steps for a single candidate */
function scoreSingleProtocol(
  asOf: string,
  protocol: Protocol,
  onWatch: boolean,
  book: ComparableBook,
): LaunchRow {
  const multiple = book.lookup(protocol.category);
  const growthPpm = calculateGrowthFactorPpm(protocol.change_7d);
  const age = calculateAgeDays(asOf, protocol.listed_at);
  const agePpm = age == null ? AGE_MISSING_PPM : Math.round(calculateAgeFactor(age) * PPM);
  const extraChains = Math.min(CHAIN_EXTRA_CAP, Math.max(0, protocol.chains.length - 1));
  const chainPpm = PPM + CHAIN_STEP_PPM * extraChains;
  const roundedTvl = Math.round(protocol.tvl_usd);

  const impliedUsd = impliedDollars(roundedTvl, [multiple.ppm, growthPpm, agePpm, chainPpm]);

  return {
    slug: protocol.slug,
    name: protocol.name,
    rank: 0,
    implied_value_usd: impliedUsd,
    category: protocol.category,
    chains: [...protocol.chains],
    tvl_usd: roundedTvl,
    change_7d: protocol.change_7d,
    listed_at: protocol.listed_at,
    age_days: age,
    watchlist: onWatch,
    multiple_ppm: multiple.ppm,
    raw_multiple_ppm: multiple.raw,
    growth_ppm: growthPpm,
    age_ppm: agePpm,
    chain_ppm: chainPpm,
    multiple_kind: multiple.kind,
    comparable_count: multiple.count,
    confidence: confidenceFor(multiple.count, multiple.kind),
    farm_steps: planFarm({
      name: protocol.name,
      category: protocol.category,
      chains: protocol.chains,
      tvlUsd: roundedTvl,
      change7d: protocol.change_7d,
      ageDays: age,
      impliedUsd,
    }),
  };
}

/** Calculate 7-day TVL growth modifier in PPM */
function calculateGrowthFactorPpm(change: number | null): number {
  if (change == null || !Number.isFinite(change)) return PPM;
  const clamped = Math.min(GROWTH_HI, Math.max(GROWTH_LO, change));
  return PPM + Math.round(clamped * GROWTH_PPM_PER_POINT);
}

/** Asymptotic protocol seasoning / maturity factor */
function calculateAgeFactor(days: number): number {
  const years = days / 365;
  return AGE_FLOOR + AGE_SPAN * (1 - Math.exp(-years / AGE_TAU));
}

/** Days between listing date and snapshot date */
function calculateAgeDays(asOf: string, listedAt: string | null): number | null {
  if (!listedAt) return null;
  const end = parseIsoDayNumber(asOf);
  const start = parseIsoDayNumber(listedAt);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, end - start);
}

/** Convert YYYY-MM-DD string to integer UTC day count */
function parseIsoDayNumber(iso: string): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (!year || !month || !day) return Number.NaN;
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

/** Identifies pre-token protocols with no recorded token */
export function recordsNoToken(protocol: Protocol): boolean {
  return protocol.gecko_id == null && protocol.symbol == null;
}

/** Identifies trading protocols with meaningful market capitalization and TVL */
export function isTradingComparable(protocol: Protocol): boolean {
  return !recordsNoToken(protocol) && protocol.mcap_usd != null && protocol.mcap_usd > 0 && protocol.tvl_usd > 0;
}

/** Check if protocol matches structural exclusion criteria */
export function isStructuralReject(protocol: Protocol): boolean {
  if (protocol.category && SCREENED_CATEGORIES.has(protocol.category)) return true;
  if (/\b(?:wrapped|staked|staking)\b/i.test(protocol.name)) return true;
  if (/ (?:v\d+(?:\.\d+)?|\d+\.\d+)$/i.test(protocol.name)) return true;
  if (/^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/.test(protocol.name)) return true;
  return false;
}

/** Compute nearest rank percentile on pre-sorted array */
function computePercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 1;
  const index = Math.round((sorted.length - 1) * p);
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))]!;
}

/** Compute median on pre-sorted array */
function computeMedian(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 1;
  const mid = n >> 1;
  if (n % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}
