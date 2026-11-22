/**
 * Launch Radar model — scores pre-token DefiLlama protocols by implied launch FDV.
 *
 * Pipeline (deterministic, no Date.now, no randomness):
 *  1. Parse the sealed snapshot.
 *  2. Build category FDV/TVL comps from protocols that already trade (have mcap).
 *  3. Score every rankable pre-token protocol with:
 *       size * category_multiple * growth * longevity * chain_breadth
 *  4. Always cover the watchlist; then add the strongest early (below-floor) names.
 *  5. Emit board rows with concrete farm plans.
 */

export interface SnapshotProtocol {
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
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelConstants {
  /** Soft-log TVL divisor so mega-TVL does not dominate linearly. */
  size_unit: number;
  /** Minimum TVL (USD) considered for early (below-floor) picks. */
  early_floor_usd: number;
  /** Cap on early rows added beyond the watchlist. */
  early_cap: number;
  /** Clamp for 7d TVL change before it enters the growth factor. */
  growth_floor: number;
  growth_cap: number;
  /** Weight of growth inside the multiplier (0..1). */
  growth_weight: number;
  /** Longevity curve: days to full "airdrop maturity" premium. */
  longevity_days: number;
  longevity_floor: number;
  longevity_range: number;
  unknown_age_days: number;
  /** Fallback FDV/TVL when a category has no live comps. */
  default_fdv_tvl: number;
  /** Hard clamp on the category multiple. */
  multiple_floor: number;
  multiple_cap: number;
  /** Absolute implied-value ceiling (gate max is 1e14). */
  value_cap: number;
}

export const MODEL: ModelConstants = {
  size_unit: 25_000_000,
  early_floor_usd: 5_000_000,
  early_cap: 220,
  growth_floor: -50,
  growth_cap: 100,
  growth_weight: 0.35,
  longevity_days: 900,
  longevity_floor: 0.72,
  longevity_range: 0.48,
  unknown_age_days: 280,
  default_fdv_tvl: 0.32,
  multiple_floor: 0.04,
  multiple_cap: 4.5,
  value_cap: 50_000_000_000,
};

export const MODEL_VERSION = 'launch-radar-2';

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  on_watchlist: boolean;
  model: {
    size_score: number;
    category_multiple: number;
    growth_multiplier: number;
    longevity_multiplier: number;
    chain_multiplier: number;
    growth_pct: number;
  };
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
  fdv_tvl: number;
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  on_watchlist: boolean;
  size_score: number;
  category_multiple: number;
  growth_multiplier: number;
  longevity_multiplier: number;
  chain_multiplier: number;
  farm_steps: string[];
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  model_blurb: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  category_comps: { category: string; sample: number; median_fdv_tvl: number }[];
  rows: RadarRow[];
  live: LiveRow[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/i;
const EXCLUDED_CATEGORIES = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

const L1_CHAINS = new Set([
  'Ethereum',
  'Solana',
  'Bitcoin',
  'Tron',
  'Avalanche',
  'Sui',
  'Aptos',
  'Near',
  'TON',
  'Cardano',
  'Cosmos',
  'Injective',
  'Sei',
  'Hyperliquid L1',
]);

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Pre-token and not a wrapped / exchange / versioned / bridge product. */
export function isRankable(p: SnapshotProtocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSIONED.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  if (EXCHANGE_PREFIX.test(p.name)) return false;
  return true;
}

/** Soft size score: TVL / (TVL + unit) * (TVL + unit) → roughly TVL with diminishing returns above unit. */
export function sizeScore(tvl: number, unit: number): number {
  const safe = Math.max(0, tvl);
  return (safe * safe) / (safe + unit);
}

export function growthMultiplier(change7d: number | null, model: ModelConstants): { mult: number; pct: number } {
  const raw = finite(change7d, 0);
  const pct = Math.min(model.growth_cap, Math.max(model.growth_floor, raw));
  return { mult: 1 + (pct / 100) * model.growth_weight, pct };
}

export function longevityMultiplier(age: number | null, model: ModelConstants): number {
  const days = age ?? model.unknown_age_days;
  const clipped = Math.min(Math.max(days, 0), model.longevity_days);
  return model.longevity_floor + (clipped / model.longevity_days) * model.longevity_range;
}

export function chainMultiplier(chains: string[]): number {
  const unique = [...new Set(chains.filter((c) => typeof c === 'string' && c.length > 0))];
  const n = unique.length;
  let score = 1;
  if (n >= 2) score += 0.06;
  if (n >= 4) score += 0.06;
  if (n >= 8) score += 0.05;
  if (unique.some((c) => L1_CHAINS.has(c))) score += 0.08;
  if (unique.includes('Ethereum') && unique.includes('Solana')) score += 0.04;
  return score;
}

/** Per-category median FDV/TVL from live (token-bearing) protocols. */
export function buildCategoryComps(
  protocols: SnapshotProtocol[],
  model: ModelConstants,
): Map<string, { sample: number; median: number }> {
  const buckets = new Map<string, number[]>();
  for (const p of protocols) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    if (p.category === null) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!Number.isFinite(ratio) || ratio <= 0) continue;
    // Drop extreme outliers that warp the median (token lockers, etc.).
    if (ratio > 20 || ratio < 0.005) continue;
    const list = buckets.get(p.category);
    if (list) list.push(ratio);
    else buckets.set(p.category, [ratio]);
  }
  const out = new Map<string, { sample: number; median: number }>();
  for (const [cat, ratios] of buckets) {
    ratios.sort((a, b) => a - b);
    const med = median(ratios);
    const clamped = Math.min(model.multiple_cap, Math.max(model.multiple_floor, med));
    out.set(cat, { sample: ratios.length, median: clamped });
  }
  return out;
}

export function categoryMultiple(
  category: string | null,
  comps: Map<string, { sample: number; median: number }>,
  model: ModelConstants,
): number {
  if (category !== null) {
    const hit = comps.get(category);
    if (hit !== undefined && hit.sample >= 1) return hit.median;
  }
  return model.default_fdv_tvl;
}

export function scoreProtocol(
  p: SnapshotProtocol,
  asOf: string,
  comps: Map<string, { sample: number; median: number }>,
  model: ModelConstants,
): {
  implied: number;
  age: number | null;
  size: number;
  catMult: number;
  growthMult: number;
  growthPct: number;
  lonMult: number;
  chainMult: number;
} {
  const age = ageDays(asOf, p.listed_at);
  const size = sizeScore(p.tvl_usd, model.size_unit);
  const catMult = categoryMultiple(p.category, comps, model);
  const g = growthMultiplier(p.change_7d, model);
  const lonMult = longevityMultiplier(age, model);
  const chainMult = chainMultiplier(p.chains);
  const raw = size * catMult * g.mult * lonMult * chainMult;
  const implied = Math.max(1, Math.min(model.value_cap, Math.round(raw)));
  return {
    implied,
    age,
    size,
    catMult,
    growthMult: g.mult,
    growthPct: g.pct,
    lonMult,
    chainMult,
  };
}

/** Category-aware farm plans: concrete cost + time language, 4–6 steps. */
export function farmPlan(p: SnapshotProtocol, age: number | null): string[] {
  const cat = (p.category ?? 'Protocol').toLowerCase();
  const chain = p.chains[0] ?? 'the primary chain';
  const ageNote =
    age === null
      ? 'listed date unknown — treat as mid-season'
      : age < 90
        ? `listed ~${age} days ago — early season`
        : age < 365
          ? `listed ~${age} days ago — mid season`
          : `listed ~${age} days ago — late / high-expectation season`;
  const tvlM = (p.tvl_usd / 1_000_000).toFixed(1);
  const base: string[] = [
    `Read the official docs and Discord/Telegram for ${p.name}; confirm points, seasons, and eligibility before spending gas (${ageNote}).`,
    `Fund a fresh wallet on ${chain} with enough native gas plus $200–$2,000 of working capital sized to the $${tvlM}M TVL pool (never your main cold wallet).`,
  ];

  if (/lending|cdp|borrow/.test(cat)) {
    return [
      ...base,
      `Supply a supported asset on ${p.name}, then borrow against it at a conservative LTV; keep the position open for 2–8 weeks of continuous activity.`,
      `Loop once or twice only if liquidation risk stays under control; record each tx hash for the points dashboard.`,
      `Interact weekly: repay a slice, re-supply, or switch collateral so the account shows recurring use, not a one-shot deposit.`,
      `Before any claim window, revoke unused approvals and move rewards to cold storage within 24 hours of unlock.`,
    ];
  }
  if (/dex|amm|liquidity/.test(cat)) {
    return [
      ...base,
      `Provide concentrated or full-range liquidity in a top pair on ${p.name}; start with $500–$5,000 and monitor IL for 2–6 weeks.`,
      `Route 5–20 swaps per week through the same wallet so volume and LP time both accumulate toward a season score.`,
      `Stake LP tokens or deposit into any gauge/boost the protocol offers; claim fees weekly rather than letting them idle.`,
      `Exit LP into stables 3–7 days before a suspected snapshot if IL or airdrop rules warrant, then re-enter if farming continues.`,
    ];
  }
  if (/yield|aggregator|farm|basis/.test(cat)) {
    return [
      ...base,
      `Deposit into the highest-TVL vault on ${p.name} that accepts stables or ETH; leave funds for at least one full epoch (typically 7–14 days).`,
      `Compound or harvest on the schedule the docs recommend; screenshot the vault share balance after each harvest.`,
      `Rotate once into a second vault under the same protocol to show breadth without splitting capital too thin.`,
      `Watch for points multipliers tied to lockups; only lock what you can leave until the stated unlock date.`,
    ];
  }
  if (/derivative|perps|options|prediction/.test(cat)) {
    return [
      ...base,
      `Open a small perpetual or options position on ${p.name} (notionals $200–$2,000); keep funding costs under control for 2–4 weeks.`,
      `Trade both long and short sides across at least three sessions so the account is not a one-direction wash.`,
      `Provide maker liquidity or use any points-boosted order type the docs describe, if fees stay under 0.1% per round trip.`,
      `Close flat before major macro events; archive PnL and volume screenshots for eligibility disputes.`,
    ];
  }
  if (/rwa|capital allocator|insurance|payment|privacy|index/.test(cat)) {
    return [
      ...base,
      `Complete any KYC or allowlist the product requires; budget 1–5 business days and keep confirmation emails.`,
      `Mint, subscribe, or deposit the minimum ticket the docs state; hold through at least one reporting or epoch cycle.`,
      `Use the product’s secondary actions (transfer, redeem test, governance poll) once so the wallet is not deposit-only.`,
      `Set a calendar reminder for the next season end; withdraw only after you confirm snapshot rules.`,
    ];
  }
  if (/restak|staking pool|anchor|btc/.test(cat)) {
    return [
      ...base,
      `Deposit the supported LST/LRT or BTC wrapper on ${p.name}; prefer the liquid receipt token so you can still farm elsewhere.`,
      `Delegate or restake according to the operator set with the best documented points weight; rebalance monthly.`,
      `Bridge or wrap only through the protocol’s canonical path; avoid third-party wrappers that may be excluded.`,
      `Track receipt-token balance daily for 30+ days; many seasons weight time-weighted deposits heavily.`,
    ];
  }
  return [
    ...base,
    `Use the core product of ${p.name} with a position sized to 1–5% of your liquid crypto for 3–8 weeks of continuous activity.`,
    `Trigger at least three distinct contract interactions (deposit, secondary action, withdraw/partial) spaced across different weeks.`,
    `Join the points or loyalty program if one exists; link the same wallet and verify the dashboard reflects your txs within 48 hours.`,
    `Before TGE rumors harden, reduce leverage to zero, revoke approvals, and park any claimable rewards offline.`,
  ];
}

function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const comps = buildCategoryComps(snapshot.protocols, model);
  const watch = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();

  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }

  const early = snapshot.protocols
    .filter(
      (p) =>
        !chosen.has(p.slug) &&
        isRankable(p) &&
        p.tvl_usd >= model.early_floor_usd &&
        p.tvl_usd < snapshot.floor_usd,
    )
    .map((p) => ({ p, s: scoreProtocol(p, snapshot.as_of, comps, model) }))
    .sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, model.early_cap);

  for (const e of early) chosen.set(e.p.slug, e.p);

  const scored = [...chosen.values()].map((p) => {
    const s = scoreProtocol(p, snapshot.as_of, comps, model);
    return { p, s };
  });
  scored.sort((a, b) => b.s.implied - a.s.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));

  // Break pure ties so the board never collapses to one shared value.
  let last = Number.POSITIVE_INFINITY;
  return scored.map((row, i) => {
    let value = row.s.implied;
    if (value >= last) value = Math.max(1, last - 1);
    last = value;
    const steps = farmPlan(row.p, row.s.age).map((t) => t.trim()).filter((t) => t.length >= 20 && t.length <= 600);
    while (steps.length < 3) steps.push(`Continue using ${row.p.name} weekly with documented txs until the season ends.`);
    return {
      rank: i + 1,
      slug: row.p.slug,
      name: row.p.name,
      category: row.p.category,
      chains: row.p.chains.slice(),
      tvl_usd: row.p.tvl_usd,
      change_7d: row.p.change_7d,
      listed_at: row.p.listed_at,
      age_days: row.s.age,
      implied_value_usd: value,
      on_watchlist: watch.has(row.p.slug),
      model: {
        size_score: Math.round(row.s.size),
        category_multiple: Math.round(row.s.catMult * 1000) / 1000,
        growth_multiplier: Math.round(row.s.growthMult * 1000) / 1000,
        longevity_multiplier: Math.round(row.s.lonMult * 1000) / 1000,
        chain_multiplier: Math.round(row.s.chainMult * 1000) / 1000,
        growth_pct: Math.round(row.s.growthPct * 100) / 100,
      },
      farm_steps: steps.slice(0, 12),
    };
  });
}

export function buildLive(snapshot: Snapshot, limit = 32): LiveRow[] {
  return snapshot.protocols
    .filter((p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains.slice(),
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
      fdv_tvl: Math.round(((p.mcap_usd as number) / p.tvl_usd) * 1000) / 1000,
    }))
    .sort((a, b) => b.mcap_usd - a.mcap_usd || (a.slug < b.slug ? -1 : 1))
    .slice(0, limit);
}

export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const comps = buildCategoryComps(snapshot.protocols, model);
  const category_comps = [...comps.entries()]
    .map(([category, v]) => ({ category, sample: v.sample, median_fdv_tvl: Math.round(v.median * 1000) / 1000 }))
    .sort((a, b) => b.sample - a.sample || (a.category < b.category ? -1 : 1));
  const live = buildLive(snapshot);
  const early_size = board.filter((r) => !r.on_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    model_blurb:
      'Implied launch FDV = soft-log TVL × category median FDV/TVL (from live comps) × 7d growth × longevity × chain breadth. Watchlist is covered first; early names are below-floor pre-token protocols ranked the same way.',
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size,
    live_size: live.length,
    category_comps,
    rows: board.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      on_watchlist: r.on_watchlist,
      size_score: r.model.size_score,
      category_multiple: r.model.category_multiple,
      growth_multiplier: r.model.growth_multiplier,
      longevity_multiplier: r.model.longevity_multiplier,
      chain_multiplier: r.model.chain_multiplier,
      farm_steps: r.farm_steps,
    })),
    live,
  };
  return { board, radar };
}

export function parseSnapshot(raw: string): Snapshot {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new SnapshotError('snapshot is not valid JSON');
  }
  if (typeof data !== 'object' || data === null) throw new SnapshotError('snapshot root must be an object');
  const o = data as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || typeof o.source !== 'string' || typeof o.floor_usd !== 'number') {
    throw new SnapshotError('snapshot missing as_of, source, or floor_usd');
  }
  if (!Array.isArray(o.protocols) || !Array.isArray(o.watchlist)) {
    throw new SnapshotError('snapshot missing protocols or watchlist arrays');
  }
  const protocols: SnapshotProtocol[] = o.protocols.map((item, i) => {
    if (typeof item !== 'object' || item === null) throw new SnapshotError(`protocol ${i} is not an object`);
    const p = item as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number') {
      throw new SnapshotError(`protocol ${i} missing slug, name, or tvl_usd`);
    }
    if (!Array.isArray(p.chains)) throw new SnapshotError(`protocol ${p.slug} chains must be an array`);
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: p.chains.filter((c): c is string => typeof c === 'string'),
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) {
    return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  }
  if (board.length < 100 || board.length > 4000) return `board has ${board.length} rows; need 100–4000`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied value`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}`;
  }
  for (const r of board) {
    if (r.farm_steps.length < 3 || r.farm_steps.length > 12) return `${r.slug} has ${r.farm_steps.length} farm steps`;
    for (const s of r.farm_steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) return `${r.slug} has a farm step of ${t.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
