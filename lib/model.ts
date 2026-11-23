// Fathom scores a sealed DefiLlama snapshot into a launch board.
// Implied dollars use only tvl_usd, change_7d, listed_at, category, and chains,
// with mcap_usd/tvl_usd from protocols that already record a token as comparables.
// No protocol name is special-cased.

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
const VALUE_CAP = 100_000_000_000_000;

const SCREENED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const GAS_CENTS: Record<string, number> = {
  Ethereum: 600,
  Arbitrum: 40,
  Optimism: 30,
  Base: 15,
  Polygon: 5,
  Binance: 10,
  Avalanche: 20,
  Solana: 3,
  Tron: 120,
  Bitcoin: 350,
  "Hyperliquid L1": 20,
  Sui: 5,
  Cardano: 25,
  Ripple: 2,
  TON: 10,
  Monad: 20,
  Plasma: 15,
  Linea: 20,
  Sonic: 10,
  Berachain: 15,
  Flare: 10,
  Scroll: 20,
  Starknet: 15,
  "zkSync Era": 20,
  Mantle: 8,
  Blast: 10,
  Mode: 10,
  Fraxtal: 10,
  Metis: 15,
  Manta: 15,
  Celo: 5,
  Gnosis: 5,
  xDai: 5,
  Fantom: 8,
  Cronos: 8,
  Moonbeam: 10,
  Kava: 10,
  Doge: 15,
  Litecoin: 20,
  Stellar: 2,
  Near: 5,
  Aptos: 5,
  Sei: 8,
  "Polygon zkEVM": 15,
  Aurora: 10,
  Harmony: 5,
  Klaytn: 10,
  Boba: 20,
  Core: 15,
  Merlin: 20,
  BSquared: 20,
  Bob: 20,
  "Bitlayer": 20,
  "Rootstock": 25,
  "Osmosis": 8,
  "Cosmos": 8,
  "Injective": 8,
  "Celestia": 8,
  "Stacks": 25,
  "ICP": 5,
  "Algorand": 5,
  "Hedera": 5,
  "Kaia": 8,
  "opBNB": 5,
  "Manta Pacific": 15,
  "Scroll": 20,
  "Taiko": 20,
  "Zora": 10,
  "World Chain": 10,
  "Unichain": 10,
  "Ink": 10,
  "Soneium": 10,
  "Shape": 10,
  "Abstract": 10,
  "ApeChain": 15,
  "Cronos zkEVM": 10,
  "X Layer": 8,
  "PulseChain": 15,
  "Moonriver": 15,
  "Canto": 15,
  "Astar": 10,
  "Filecoin": 15,
  "EOS": 5,
  "WEMIX": 10,
  "Kava": 10,
  "Telos": 10,
  "Syscoin": 10,
  "Fusion": 15,
  "Bittorrent": 5,
  "ThunderCore": 8,
  "Meter": 10,
  "Velas": 10,
  "Oasis": 10,
  "Secret": 15,
  "Persistence": 10,
  "Kujira": 8,
  "Neutron": 8,
  "dYdX": 8,
  "Sei": 8,
  "Sui": 5,
  "Aptos": 5,
};

interface Play {
  enter: string;
  leave: string;
  limit: string;
}

const PLAYS: Record<string, Play> = {
  Lending: {
    enter: "supply it to the lending market and keep the deposit receipt",
    leave: "withdraw the deposit plus any accrued interest",
    limit: "Do not borrow against this deposit",
  },
  Dexs: {
    enter: "add it as liquidity in the deepest stablecoin pool",
    leave: "remove the liquidity and convert both sides back to the asset you put in",
    limit: "Stay in a stable pair so you are not taking price divergence",
  },
  "Risk Curators": {
    enter: "deposit it into the curated vault this protocol allocates",
    leave: "redeem the vault receipt for the asset you deposited",
    limit: "Do not deposit into a second vault the curator lists until this one is open",
  },
  "Onchain Capital Allocator": {
    enter: "deposit it into the allocator vault",
    leave: "redeem the allocator receipt back to the deposited asset",
    limit: "Do not add a manual position on top of the allocator",
  },
  Yield: {
    enter: "deposit it into the yield vault",
    leave: "withdraw the vault receipt for the underlying asset",
    limit: "Do not loop the receipt into another protocol during the hold",
  },
  "Yield Aggregator": {
    enter: "deposit it into the auto-compounding vault",
    leave: "withdraw the vault shares for the underlying asset",
    limit: "Do not claim and restake rewards into a different protocol mid-hold",
  },
  RWA: {
    enter: "subscribe that amount to the on-chain asset pool",
    leave: "redeem the subscription for the asset you paid in",
    limit: "Do not redeem early unless the pool's own window is open",
  },
  Derivatives: {
    enter: "post it as margin and leave leverage at 1x",
    leave: "close the position and withdraw the margin",
    limit: "Do not raise leverage above 1x",
  },
  CDP: {
    enter: "deposit it as collateral and do not draw a debt above 10% of that collateral",
    leave: "repay any small debt and withdraw the collateral",
    limit: "Do not draw a larger debt than 10% of the collateral",
  },
  "CDP Manager": {
    enter: "deposit it into the manager's collateral vault",
    leave: "withdraw the collateral from the manager",
    limit: "Do not open a second vault during the hold",
  },
  "Basis Trading": {
    enter: "deposit it into the basis vault the protocol runs",
    leave: "withdraw from the basis vault back to the deposited asset",
    limit: "Do not add a manual short on top of the vault",
  },
  "Staking Pool": {
    enter: "deposit it into the staking pool the protocol lists",
    leave: "withdraw from the staking pool back to the deposited asset",
    limit: "Do not restake the receipt somewhere else during the hold",
  },
  Chain: {
    enter: "bridge it onto this network and hold it in your own wallet there",
    leave: "bridge it back to the network you funded from",
    limit: "Do not lock it in a third-party contract during the hold",
  },
  "Liquidity Manager": {
    enter: "deposit it into the managed liquidity position",
    leave: "withdraw the managed position back to the deposited asset",
    limit: "Do not open a manual range beside the manager",
  },
  Farm: {
    enter: "deposit it into the farm's primary pool",
    leave: "withdraw from the farm pool back to the deposited asset",
    limit: "Do not compound into a second farm during the hold",
  },
  "Leveraged Farming": {
    enter: "deposit it with leverage left at 1x",
    leave: "unwind the position and withdraw the deposited asset",
    limit: "Do not turn leverage above 1x",
  },
  "Anchor BTC": {
    enter: "deposit the BTC-denominated amount the pool accepts",
    leave: "withdraw that BTC-denominated deposit",
    limit: "Do not wrap the receipt into another BTC product during the hold",
  },
  "Decentralized BTC": {
    enter: "deposit the BTC the pool custodies on-chain",
    leave: "withdraw the BTC back to your own wallet",
    limit: "Do not bridge the receipt to another chain during the hold",
  },
  CeDeFi: {
    enter: "deposit only the on-chain leg, not a custodial transfer",
    leave: "withdraw the on-chain leg to the same wallet",
    limit: "Do not move the funds to a custodial balance during the hold",
  },
  "Dual-Token Stablecoin": {
    enter: "mint the stable asset against this collateral and hold both",
    leave: "repay the minted stable asset and withdraw the collateral",
    limit: "Do not mint more than the deposited amount",
  },
  Restaking: {
    enter: "deposit the receipt the restaking pool accepts",
    leave: "withdraw that receipt back to your wallet",
    limit: "Do not restake the new receipt into a second protocol",
  },
  "Prediction Market": {
    enter: "buy one liquid market with it and hold that side",
    leave: "sell the position back, or wait for resolution and redeem",
    limit: "Do not add a second market during the hold",
  },
  "Uncollateralized Lending": {
    enter: "supply it to the uncollateralized pool",
    leave: "withdraw the supply if the pool is liquid",
    limit: "Do not supply more than this one ticket",
  },
  "Cross Chain Bridge": {
    enter: "send it across one route this protocol lists",
    leave: "bridge it back along the same route",
    limit: "Do not split the ticket across two routes",
  },
  "Interest Rate Derivatives": {
    enter: "post it as margin on one rate contract",
    leave: "close the rate contract and withdraw the margin",
    limit: "Do not add a second contract during the hold",
  },
  Indexes: {
    enter: "buy the index position with it",
    leave: "sell the index position back to the deposited asset",
    limit: "Do not leverage the index",
  },
  "Crypto Card Issuer": {
    enter: "fund the on-chain balance the card spends from",
    leave: "withdraw the unused balance to your wallet",
    limit: "Do not spend the balance during the hold",
  },
  "OTC Marketplace": {
    enter: "post it as a resting bid on the protocol's market",
    leave: "cancel the bid and withdraw the funds",
    limit: "Do not lift an offer larger than this ticket",
  },
  Insurance: {
    enter: "buy cover sized to this ticket for the hold",
    leave: "let the cover expire, or cancel it if the protocol allows",
    limit: "Do not buy cover above this ticket",
  },
  Payments: {
    enter: "route one payment of this size through the protocol and keep the receipt",
    leave: "withdraw any leftover balance to your wallet",
    limit: "Do not route a second payment during the hold",
  },
  "Governance Incentives": {
    enter: "deposit it into the incentives vault",
    leave: "withdraw from the incentives vault",
    limit: "Do not vote with a borrowed balance",
  },
  "Options Vault": {
    enter: "deposit it as collateral in the options vault, with no naked short",
    leave: "withdraw the collateral after the vault's round",
    limit: "Do not sell a naked option on top of the vault",
  },
  "Collateral Markets": {
    enter: "post it as collateral in the market",
    leave: "withdraw the collateral",
    limit: "Do not borrow against more than 10% of the collateral",
  },
  Privacy: {
    enter: "deposit it into the protocol's private pool and keep the viewing key",
    leave: "withdraw from the private pool to the same wallet",
    limit: "Do not discard the viewing key",
  },
  "Leveraged Farming": {
    enter: "deposit it with leverage left at 1x",
    leave: "unwind and withdraw the deposited asset",
    limit: "Do not turn leverage above 1x",
  },
};

const DEFAULT_PLAY: Play = {
  enter: "deposit it into the protocol's primary pool",
  leave: "withdraw it to the same wallet",
  limit: "Do not add a second leveraged loop on top of this deposit",
};

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

  const byName = new Map<string, CategoryMultiple>();
  for (const row of rows) {
    const name = row.category ?? "Uncategorized";
    const found = byName.get(name);
    if (found) {
      found.n_rows += 1;
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
  const categories = [...byName.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

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
    categories,
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

export function explainBoardProblem(rows: LaunchRow[], watchlist: string[]): string | null {
  if (rows.length < 100 || rows.length > 4000) return `row count ${rows.length} is outside 100 to 4000`;
  const slugs = new Set<string>();
  const byRank = [...rows].sort((a, b) => a.rank - b.rank);
  for (let i = 0; i < byRank.length; i += 1) {
    const row = byRank[i]!;
    if (row.rank !== i + 1) return `rank ${row.rank} is not ${i + 1}`;
    if (slugs.has(row.slug)) return `duplicate slug ${row.slug}`;
    slugs.add(row.slug);
    if (!row.name.trim()) return `empty name for ${row.slug}`;
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > VALUE_CAP) {
      return `implied value for ${row.slug} is not a positive whole dollar amount`;
    }
    if (i > 0 && row.implied_value_usd > byRank[i - 1]!.implied_value_usd) {
      return `implied value rises at rank ${row.rank}`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    for (const step of row.farm_steps) {
      const text = step.trim();
      if (text.length < 20 || text.length > 600) return `${row.slug} farm step length ${text.length}`;
      if (!/\$\d/.test(text) || !/\b(?:minute|minutes|hour|hours|day|days)\b/.test(text)) {
        return `${row.slug} farm step lacks a cost or a time`;
      }
    }
    const again = impliedDollars(row.tvl_usd, [row.multiple_ppm, row.growth_ppm, row.age_ppm, row.chain_ppm]);
    if (again !== row.implied_value_usd) return `${row.slug} implied ${row.implied_value_usd} does not match product ${again}`;
  }
  const values = new Set(rows.map((row) => row.implied_value_usd));
  if (rows.length >= 2 && values.size < 2) return "every implied value is the same";
  for (const slug of watchlist) {
    if (!slugs.has(slug)) return `watchlist slug ${slug} is missing`;
  }
  return null;
}

interface Book {
  nComps: number;
  p10Ppm: number;
  p90Ppm: number;
  globalPpm: number;
  comps: CompRow[];
  lookup: (category: string | null) => { ppm: number; raw: number; kind: string; count: number };
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
      const ca = a.category ?? "";
      const cb = b.category ?? "";
      if (ca !== cb) return ca < cb ? -1 : 1;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });

  return {
    nComps: raw.length,
    p10Ppm: Math.round(p10 * PPM),
    p90Ppm: Math.round(p90 * PPM),
    globalPpm,
    comps,
    lookup(category: string | null) {
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
  const farm = farmSteps(protocol, age, implied);
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
    farm_steps: farm,
  };
}

function impliedDollars(tvl: number, parts: number[]): number {
  const scale = BigInt(PPM);
  let value = BigInt(Math.round(tvl));
  for (const part of parts) value *= BigInt(part);
  value /= scale ** BigInt(parts.length);
  if (value < 1n) return 1;
  if (value > BigInt(VALUE_CAP)) return VALUE_CAP;
  return Number(value);
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

function farmSteps(protocol: Protocol, age: number | null, implied: number): string[] {
  const play = (protocol.category && PLAYS[protocol.category]) || DEFAULT_PLAY;
  const primary = protocol.chains[0] ?? "";
  const secondary = protocol.chains[1] ?? "";
  const where = primary || "the protocol's primary chain";
  const ticket = ticketUsd(protocol.tvl_usd);
  const hold = holdDays(age, protocol.change_7d, protocol.category);
  const gas = gasCents(primary);
  const enterGas = gas * 2;
  const probe = secondary ? Math.max(100, Math.round(ticket / 5 / 50) * 50) : 0;
  const probeGas = secondary ? gasCents(secondary) : 0;
  const gasAll = gas + gas + enterGas + gas + probeGas;
  const listed = age == null ? "an unreported listing date" : `${age} days listed`;
  const moved = changePhrase(protocol.change_7d);
  const steps = [
    `About ${usdFromCents(gas)} gas, ${fundPhrase(primary)}: move ${bag(ticket, primary)} onto ${where} for ${protocol.name}. Cash out the door before the deposit is ${usdFromCents(ticket * 100 + gas)}.`,
    `About ${usdFromCents(gas)} gas, ${txPhrase(primary)}: approve ${bag(ticket, primary)} so ${protocol.name} can pull it on ${where}.`,
    `About ${usdFromCents(enterGas)} gas, ${txPhrase(primary)}: ${lead(play.enter).replace(" it", ` ${bag(ticket, primary)}`)} on ${where} at ${protocol.name}.`,
    `About $0, about 5 minutes: ${play.limit.replace(/\.$/, "")} at ${protocol.name}, and confirm the position screen shows only this deposit.`,
    `About $0, ${hold} days: leave the ${protocol.name} position on ${where} untouched. The record shows ${listed} and a 7-day TVL change of ${moved}.`,
    `About $0, about 10 minutes: every 7 days, compare TVL with the snapshot ${usd(protocol.tvl_usd)} (${moved}). If TVL is more than 25% under that figure, withdraw ${bag(ticket, primary)}.`,
  ];
  if (secondary) {
    steps.push(
      `About ${usdFromCents(probeGas)} gas, about 20 minutes: after ${where} is open, deposit ${bag(probe, secondary)} on ${secondary} as a smaller ${protocol.name} probe and hold it for the same ${hold} days.`,
    );
  }
  steps.push(
    `About ${usdFromCents(gas)} gas, ${txPhrase(primary)}: ${lead(play.leave)} at ${protocol.name} on ${where}. All-in budget is ${usd(ticket + probe)} deployed and about ${usdFromCents(gasAll)} in gas over ${hold} days. Implied value ${usd(implied)} is this board's claim, not a market price.`,
  );
  return steps;
}

function ticketUsd(tvl: number): number {
  if (tvl >= 1_000_000_000) return 2000;
  if (tvl >= 250_000_000) return 1000;
  if (tvl >= 50_000_000) return 500;
  return tvl >= 10_000_000 ? 250 : 100;
}

function holdDays(age: number | null, change: number | null, category: string | null): number {
  let days = 30;
  if (age != null && age >= 700) days = 75;
  else if (age != null && age >= 365) days = 60;
  else if (age != null && age >= 120) days = 45;
  if (category === "RWA") days = Math.max(days, 60);
  if (category === "Derivatives" || category === "Prediction Market" || category === "Options Vault" || category === "Interest Rate Derivatives") {
    days = Math.min(days, 21);
  }
  if (change != null && change >= 25) days = Math.min(days, 21);
  if (change != null && change <= -20) days = Math.min(days, 14);
  return days;
}

function bag(ticket: number, chain: string): string {
  if (chain === "Bitcoin" || chain === "Litecoin" || chain === "Doge") {
    return `the equivalent of ${usd(ticket)} in ${chain}'s native coin`;
  }
  if (chain === "Tron") return `${usd(ticket)} USDT`;
  return `${usd(ticket)} USDC`;
}

function gasCents(chain: string): number {
  if (!chain) return 80;
  return GAS_CENTS[chain] ?? 80;
}

function fundPhrase(chain: string): string {
  if (chain === "Bitcoin" || chain === "Litecoin" || chain === "Doge") return "about 40 minutes";
  if (chain === "Ethereum") return "about 15 minutes";
  return "about 8 minutes";
}

function txPhrase(chain: string): string {
  if (chain === "Bitcoin" || chain === "Litecoin" || chain === "Doge") return "about 40 minutes";
  if (chain === "Ethereum") return "about 5 minutes";
  if (chain === "Cardano") return "about 8 minutes";
  return "about 2 minutes";
}

function changePhrase(change: number | null): string {
  if (change == null || !Number.isFinite(change)) return "unreported";
  const rounded = Math.round(change * 10) / 10;
  const body = Math.abs(rounded).toFixed(1);
  if (rounded > 0) return `+${body}%`;
  if (rounded < 0) return `-${body}%`;
  return "0.0%";
}

function usd(dollars: number): string {
  return usdFromCents(Math.round(dollars) * 100);
}

function usdFromCents(cents: number): string {
  const rounded = Math.round(cents);
  const whole = Math.trunc(Math.abs(rounded) / 100);
  const frac = Math.abs(rounded) % 100;
  const body = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const amount = frac === 0 ? `$${body}` : `$${body}.${String(frac).padStart(2, "0")}`;
  return rounded < 0 ? `-${amount}` : amount;
}

function lead(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
