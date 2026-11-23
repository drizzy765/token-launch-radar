// Implied value from the snapshot's own figures.
// TVL × category multiple × growth × age × chains, in whole dollars.
// Tokens that already trade are comparables only. No protocol name is special-cased.

import { planFarm } from "./farms.ts";
import type { CategoryMultiple, CompRow, LaunchRow, PageData, Protocol, Snapshot } from "./types.ts";

const PPM = 1_000_000;
const MIN_CATEGORY_COMPS = 6;
const GROWTH_LO = -20;
const GROWTH_HI = 35;
const GROWTH_PPM_PER_POINT = 6_000;
const AGE_FLOOR = 0.68;
const AGE_SPAN = 0.42;
const AGE_TAU = 1.5;
const AGE_MISSING_PPM = 750_000;
const CHAIN_STEP_PPM = 30_000;
const CHAIN_EXTRA_CAP = 12;
export const VALUE_CAP = 100_000_000_000_000;

const SCREENED_CATEGORIES = new Set([
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
  kind: string;
  count: number;
}

interface Book {
  nComps: number;
  p10Ppm: number;
  p90Ppm: number;
  globalPpm: number;
  comps: CompRow[];
  lookup: (category: string | null) => MultipleHit;
}

export function loadSnapshot(raw: string): Snapshot {
  const parsed = JSON.parse(raw) as Partial<Snapshot>;
  if (!parsed || !Array.isArray(parsed.protocols) || !Array.isArray(parsed.watchlist)) {
    throw new Error("snapshot is missing protocols or watchlist");
  }
  return {
    as_of: String(parsed.as_of ?? ""),
    floor_usd: Number(parsed.floor_usd ?? 0),
    protocols: parsed.protocols as Protocol[],
    watchlist: parsed.watchlist.map((slug) => String(slug)),
  };
}

export function scoreBoard(snapshot: Snapshot): { rows: LaunchRow[]; page: PageData } {
  const watch = new Set(snapshot.watchlist);
  const book = comparableBook(snapshot.protocols);
  const rows: LaunchRow[] = [];
  let screenedOut = 0;

  for (const protocol of snapshot.protocols) {
    if (!recordsNoToken(protocol)) continue;
    const onWatch = watch.has(protocol.slug);
    if (!onWatch && structuralReject(protocol)) {
      screenedOut += 1;
      continue;
    }
    rows.push(scoreOne(snapshot.as_of, protocol, onWatch, book));
  }

  rows.sort((a, b) => {
    if (a.implied_value_usd !== b.implied_value_usd) return b.implied_value_usd - a.implied_value_usd;
    if (a.tvl_usd !== b.tvl_usd) return b.tvl_usd - a.tvl_usd;
    if (a.slug < b.slug) return -1;
    if (a.slug > b.slug) return 1;
    return 0;
  });
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
    n_screened_out: screenedOut,
    p10_ppm: book.p10Ppm,
    p90_ppm: book.p90Ppm,
    global_ppm: book.globalPpm,
    categories: categoryTable(rows),
    comps: book.comps,
    rows,
  };
  return { rows, page };
}

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

export function toDataScript(page: PageData): string {
  return `globalThis.FATHOM=${JSON.stringify(page)};\n`;
}

export function impliedDollars(tvl: number, parts: number[]): number {
  const scale = BigInt(PPM);
  let value = BigInt(Math.round(tvl));
  for (const part of parts) value *= BigInt(part);
  value /= scale ** BigInt(parts.length);
  if (value < 1n) return 1;
  if (value > BigInt(VALUE_CAP)) return VALUE_CAP;
  return Number(value);
}

export function confidenceFor(count: number, kind: string): string {
  if (count <= 0) return "Unanchored";
  if (kind !== "category") return "Thin";
  if (count < 12) return "Fair";
  return "High";
}

function categoryTable(rows: LaunchRow[]): CategoryMultiple[] {
  const byName = new Map<string, CategoryMultiple>();
  for (const row of rows) {
    const name = row.category ?? "Uncategorized";
    const found = byName.get(name);
    if (found) found.n_rows += 1;
    else {
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
  return [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function comparableBook(protocols: Protocol[]): Book {
  const raw: { cat: string; ratio: number }[] = [];
  for (const protocol of protocols) {
    if (!isComparable(protocol)) continue;
    raw.push({ cat: protocol.category ?? "", ratio: protocol.mcap_usd! / protocol.tvl_usd });
  }
  const sorted = raw.map((item) => item.ratio).sort((a, b) => a - b);
  const p10 = percentile(sorted, 0.1);
  const p90 = percentile(sorted, 0.9);
  const winsor = raw.map((item) => ({ cat: item.cat, ratio: Math.min(p90, Math.max(p10, item.ratio)) }));
  const globalMedian = median(winsor.map((item) => item.ratio).sort((a, b) => a - b));
  const grouped = new Map<string, number[]>();
  for (const item of winsor) {
    const list = grouped.get(item.cat) ?? [];
    list.push(item.ratio);
    grouped.set(item.cat, list);
  }
  for (const list of grouped.values()) list.sort((a, b) => a - b);
  const globalPpm = Math.round(globalMedian * PPM);

  const comps: CompRow[] = protocols
    .filter(isComparable)
    .map((protocol) => ({
      slug: protocol.slug,
      name: protocol.name,
      category: protocol.category,
      tvl_usd: Math.round(protocol.tvl_usd),
      mcap_usd: Math.round(protocol.mcap_usd!),
      ratio_ppm: Math.round((protocol.mcap_usd! / protocol.tvl_usd) * PPM),
    }))
    .sort((a, b) => {
      const left = a.category ?? "";
      const right = b.category ?? "";
      if (left !== right) return left < right ? -1 : 1;
      if (a.slug < b.slug) return -1;
      if (a.slug > b.slug) return 1;
      return 0;
    });

  return {
    nComps: raw.length,
    p10Ppm: Math.round(p10 * PPM),
    p90Ppm: Math.round(p90 * PPM),
    globalPpm,
    comps,
    lookup(category: string | null): MultipleHit {
      const list = grouped.get(category ?? "") ?? [];
      const count = list.length;
      const rawPpm = count === 0 ? 0 : Math.round(median(list) * PPM);
      if (count >= MIN_CATEGORY_COMPS) return { ppm: rawPpm, raw: rawPpm, kind: "category", count };
      return { ppm: globalPpm, raw: rawPpm, kind: "global", count };
    },
  };
}

function scoreOne(asOf: string, protocol: Protocol, onWatch: boolean, book: Book): LaunchRow {
  const multiple = book.lookup(protocol.category);
  const growthPpm = growthFactorPpm(protocol.change_7d);
  const age = ageDays(asOf, protocol.listed_at);
  const agePpm = age == null ? AGE_MISSING_PPM : Math.round(ageFactor(age) * PPM);
  const extra = Math.min(CHAIN_EXTRA_CAP, Math.max(0, protocol.chains.length - 1));
  const chainPpm = PPM + CHAIN_STEP_PPM * extra;
  const tvl = Math.round(protocol.tvl_usd);
  const implied = impliedDollars(tvl, [multiple.ppm, growthPpm, agePpm, chainPpm]);
  return {
    slug: protocol.slug,
    name: protocol.name,
    rank: 0,
    implied_value_usd: implied,
    category: protocol.category,
    chains: protocol.chains.slice(),
    tvl_usd: tvl,
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
      tvlUsd: tvl,
      change7d: protocol.change_7d,
      ageDays: age,
      impliedUsd: implied,
    }),
  };
}

function growthFactorPpm(change: number | null): number {
  if (change == null || !Number.isFinite(change)) return PPM;
  const clamped = Math.min(GROWTH_HI, Math.max(GROWTH_LO, change));
  return PPM + Math.round(clamped * GROWTH_PPM_PER_POINT);
}

function ageFactor(days: number): number {
  const years = days / 365;
  return AGE_FLOOR + AGE_SPAN * (1 - Math.exp(-years / AGE_TAU));
}

function ageDays(asOf: string, listed: string | null): number | null {
  if (!listed) return null;
  const end = dayNumber(asOf);
  const start = dayNumber(listed);
  if (!Number.isFinite(end) || !Number.isFinite(start)) return null;
  return Math.max(0, end - start);
}

function dayNumber(iso: string): number {
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (!year || !month || !day) return Number.NaN;
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function recordsNoToken(protocol: Protocol): boolean {
  return protocol.gecko_id == null && protocol.symbol == null;
}

function isComparable(protocol: Protocol): boolean {
  return !recordsNoToken(protocol) && protocol.mcap_usd != null && protocol.mcap_usd > 0 && protocol.tvl_usd > 0;
}

function structuralReject(protocol: Protocol): boolean {
  if (protocol.category && SCREENED_CATEGORIES.has(protocol.category)) return true;
  if (/\b(?:wrapped|staked|staking)\b/i.test(protocol.name)) return true;
  if (/ (?:v\d+(?:\.\d+)?|\d+\.\d+)$/i.test(protocol.name)) return true;
  if (/^(?:Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/.test(protocol.name)) return true;
  return false;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 1;
  const index = Math.round((sorted.length - 1) * p);
  return sorted[Math.min(sorted.length - 1, Math.max(0, index))]!;
}

function median(sorted: number[]): number {
  const n = sorted.length;
  if (n === 0) return 1;
  const mid = n >> 1;
  if (n % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}
