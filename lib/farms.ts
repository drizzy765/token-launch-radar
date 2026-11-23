// Chain-specific farm plans. The ticket, the hold and the category limit stay
// fixed; the asset, the fee token, the permission step and the gas follow the chain.

const PPM_WORD = /\b(?:minute|minutes|hour|hours|day|days)\b/;

type Rail =
  | "evm"
  | "spl"
  | "utxo"
  | "tron"
  | "stellar"
  | "xrp"
  | "move"
  | "cardano"
  | "algo"
  | "near"
  | "cosmos"
  | "stark"
  | "stacks"
  | "filecoin"
  | "hl"
  | "account";

interface Play {
  enter: string;
  leave: string;
  limit: string;
}

interface Desk {
  rail: Rail;
  asset: "USDC" | "USDT" | "native";
  fee: string;
  cents: number;
  fund: string;
  tx: string;
}

interface FarmInput {
  name: string;
  category: string | null;
  chains: string[];
  tvlUsd: number;
  change7d: number | null;
  ageDays: number | null;
  impliedUsd: number;
}

const RAIL: Record<string, Rail> = {
  Solana: "spl",
  Bitcoin: "utxo",
  Litecoin: "utxo",
  Doge: "utxo",
  Zcash: "utxo",
  Tron: "tron",
  Stellar: "stellar",
  Ripple: "xrp",
  Sui: "move",
  Aptos: "move",
  Cardano: "cardano",
  Algorand: "algo",
  Near: "near",
  Starknet: "stark",
  Stacks: "stacks",
  Filecoin: "filecoin",
  "Hyperliquid L1": "hl",
  Kava: "cosmos",
  Saga: "cosmos",
  Noble: "cosmos",
  Nibiru: "cosmos",
  Provenance: "cosmos",
  "Babylon Genesis": "cosmos",
  XION: "cosmos",
  Aleo: "account",
  Bittensor: "account",
  Canton: "account",
  Qubic: "account",
  Flow: "account",
  Hibachi: "account",
  Peaq: "account",
  Proton: "account",
  "Elysium Kinetiq": "account",
  Rayls: "account",
  Strato: "account",
  ZIGChain: "account",
  "Bifrost Network": "account",
  HeLa: "account",
};

const FEE: Record<string, string> = {
  Ethereum: "ETH",
  Base: "ETH",
  Arbitrum: "ETH",
  Optimism: "ETH",
  Linea: "ETH",
  Scroll: "ETH",
  "zkSync Era": "ETH",
  Blast: "ETH",
  Mode: "ETH",
  Unichain: "ETH",
  Ink: "ETH",
  "World Chain": "ETH",
  Soneium: "ETH",
  Zora: "ETH",
  Taiko: "ETH",
  "Polygon zkEVM": "ETH",
  Fraxtal: "ETH",
  Shape: "ETH",
  Abstract: "ETH",
  Binance: "BNB",
  Op_Bnb: "BNB",
  Polygon: "POL",
  Avalanche: "AVAX",
  Solana: "SOL",
  Bitcoin: "BTC",
  Litecoin: "LTC",
  Doge: "DOGE",
  Zcash: "ZEC",
  Tron: "TRX",
  Stellar: "XLM",
  Ripple: "XRP",
  Cardano: "ADA",
  Sui: "SUI",
  Aptos: "APT",
  Near: "NEAR",
  Algorand: "ALGO",
  Starknet: "STRK",
  Filecoin: "FIL",
  Stacks: "STX",
  Celo: "CELO",
  Flare: "FLR",
  Mantle: "MNT",
  Berachain: "BERA",
  Sei: "SEI",
  Cronos: "CRO",
  Moonbeam: "GLMR",
  Fantom: "FTM",
  Metis: "METIS",
  "X Layer": "OKB",
  ApeChain: "APE",
  Gnosis: "xDAI",
  Kava: "KAVA",
};

const CENTS: Record<string, number> = {
  Ethereum: 600,
  Bitcoin: 350,
  Tron: 120,
  Arbitrum: 40,
  Optimism: 30,
  Cardano: 25,
  Litecoin: 20,
  Zcash: 20,
  Avalanche: 20,
  "Rootstock": 25,
  RSK: 25,
  Stacks: 25,
  Base: 15,
  Starknet: 15,
  Doge: 15,
  Scroll: 20,
  Linea: 20,
  "zkSync Era": 20,
  Mantle: 8,
  Blast: 10,
  Binance: 10,
  Polygon: 5,
  Solana: 3,
  Sui: 5,
  Aptos: 5,
  Near: 5,
  Algorand: 5,
  Celo: 5,
  Gnosis: 5,
  Stellar: 2,
  Ripple: 2,
  Fantom: 8,
  Cronos: 8,
  Flare: 10,
  Sonic: 10,
  Berachain: 15,
  Unichain: 10,
  Ink: 10,
  "World Chain": 10,
  Op_Bnb: 5,
  Moonbeam: 10,
  Kava: 10,
  Filecoin: 15,
  Metis: 15,
  Manta: 15,
  Mode: 10,
  Fraxtal: 10,
  Taiko: 20,
  "Polygon zkEVM": 15,
  "X Layer": 8,
  ApeChain: 15,
  Sei: 8,
};

const PLAYS: Record<string, Play> = {
  Lending: {
    enter: "supply {bag} to the lending market at {name} on {chain} and keep the deposit receipt",
    leave: "withdraw the deposit plus any accrued interest at {name} on {chain}",
    limit: "Do not borrow against this deposit",
  },
  Dexs: {
    enter: "add {bag} as liquidity in the deepest stablecoin pool at {name} on {chain}",
    leave: "remove that liquidity at {name} on {chain} and convert both sides back to the asset you put in",
    limit: "Stay in a stable pair so you are not taking price divergence",
  },
  "Risk Curators": {
    enter: "deposit {bag} into the curated vault {name} allocates on {chain}",
    leave: "redeem the vault receipt at {name} on {chain} for the asset you deposited",
    limit: "Do not deposit into a second vault the curator lists until this one is open",
  },
  "Onchain Capital Allocator": {
    enter: "deposit {bag} into the allocator vault at {name} on {chain}",
    leave: "redeem the allocator receipt at {name} on {chain} back to the deposited asset",
    limit: "Do not add a manual position on top of the allocator",
  },
  Yield: {
    enter: "deposit {bag} into the yield vault at {name} on {chain}",
    leave: "withdraw the vault receipt at {name} on {chain} for the underlying asset",
    limit: "Do not loop the receipt into another protocol during the hold",
  },
  "Yield Aggregator": {
    enter: "deposit {bag} into the auto-compounding vault at {name} on {chain}",
    leave: "withdraw the vault shares at {name} on {chain} for the underlying asset",
    limit: "Do not claim and restake rewards into a different protocol mid-hold",
  },
  RWA: {
    enter: "subscribe {bag} to the on-chain asset pool at {name} on {chain}",
    leave: "redeem the subscription at {name} on {chain} for the asset you paid in",
    limit: "Do not redeem early unless the pool's own window is open",
  },
  Derivatives: {
    enter: "post {bag} as margin at {name} on {chain} and leave leverage at 1x",
    leave: "close the position at {name} on {chain} and withdraw the margin",
    limit: "Do not raise leverage above 1x",
  },
  CDP: {
    enter: "deposit {bag} as collateral at {name} on {chain} and do not draw a debt above 10% of that collateral",
    leave: "repay any small debt and withdraw the collateral at {name} on {chain}",
    limit: "Do not draw a larger debt than 10% of the collateral",
  },
  "CDP Manager": {
    enter: "deposit {bag} into the manager's collateral vault at {name} on {chain}",
    leave: "withdraw the collateral from the manager at {name} on {chain}",
    limit: "Do not open a second vault during the hold",
  },
  "Basis Trading": {
    enter: "deposit {bag} into the basis vault {name} runs on {chain}",
    leave: "withdraw from the basis vault at {name} on {chain} back to the deposited asset",
    limit: "Do not add a manual short on top of the vault",
  },
  "Staking Pool": {
    enter: "deposit {bag} into the staking pool {name} lists on {chain}",
    leave: "withdraw from the staking pool at {name} on {chain} back to the deposited asset",
    limit: "Do not restake the receipt somewhere else during the hold",
  },
  Chain: {
    enter: "bridge {bag} onto {chain} with {name} and hold it in your own wallet there",
    leave: "bridge it back off {chain} at {name} to the network you funded from",
    limit: "Do not lock it in a third-party contract during the hold",
  },
  "Liquidity Manager": {
    enter: "deposit {bag} into the managed liquidity position at {name} on {chain}",
    leave: "withdraw the managed position at {name} on {chain} back to the deposited asset",
    limit: "Do not open a manual range beside the manager",
  },
  Farm: {
    enter: "deposit {bag} into the primary farm pool at {name} on {chain}",
    leave: "withdraw from the farm pool at {name} on {chain} back to the deposited asset",
    limit: "Do not compound into a second farm during the hold",
  },
  "Leveraged Farming": {
    enter: "deposit {bag} at {name} on {chain} with leverage left at 1x",
    leave: "unwind the position and withdraw the deposited asset at {name} on {chain}",
    limit: "Do not turn leverage above 1x",
  },
  "Anchor BTC": {
    enter: "deposit the BTC-denominated amount the pool at {name} on {chain} accepts, sized to {bag}",
    leave: "withdraw that BTC-denominated deposit at {name} on {chain}",
    limit: "Do not wrap the receipt into another BTC product during the hold",
  },
  "Decentralized BTC": {
    enter: "deposit the BTC {name} custodies on {chain}, sized to {bag}",
    leave: "withdraw the BTC at {name} on {chain} back to your own wallet",
    limit: "Do not bridge the receipt to another chain during the hold",
  },
  CeDeFi: {
    enter: "deposit only the on-chain leg of {bag} at {name} on {chain}, not a custodial transfer",
    leave: "withdraw the on-chain leg at {name} on {chain} to the same wallet",
    limit: "Do not move the funds to a custodial balance during the hold",
  },
  "Dual-Token Stablecoin": {
    enter: "mint the stable asset at {name} on {chain} against {bag} and hold both",
    leave: "repay the minted stable asset and withdraw the collateral at {name} on {chain}",
    limit: "Do not mint more than the deposited amount",
  },
  "Stablecoin Wrapper": {
    enter: "wrap {bag} into the receipt {name} issues on {chain} and hold that receipt",
    leave: "unwrap the receipt at {name} on {chain} back to the asset you put in",
    limit: "Do not bridge the receipt during the hold",
  },
  Restaking: {
    enter: "deposit the receipt the restaking pool at {name} on {chain} accepts, sized to {bag}",
    leave: "withdraw that receipt at {name} on {chain} back to your wallet",
    limit: "Do not restake the new receipt into a second protocol",
  },
  "Prediction Market": {
    enter: "buy one liquid market at {name} on {chain} with {bag} and hold that side",
    leave: "sell the position back at {name} on {chain}, or wait for resolution and redeem",
    limit: "Do not add a second market during the hold",
  },
  "Uncollateralized Lending": {
    enter: "supply {bag} to the uncollateralized pool at {name} on {chain}",
    leave: "withdraw the supply at {name} on {chain} if the pool is liquid",
    limit: "Do not supply more than this one ticket",
  },
  "Cross Chain Bridge": {
    enter: "send {bag} across one route {name} lists on {chain}",
    leave: "bridge it back along the same route at {name} on {chain}",
    limit: "Do not split the ticket across two routes",
  },
  "Interest Rate Derivatives": {
    enter: "post {bag} as margin on one rate contract at {name} on {chain}",
    leave: "close the rate contract and withdraw the margin at {name} on {chain}",
    limit: "Do not add a second contract during the hold",
  },
  Indexes: {
    enter: "buy the index position at {name} on {chain} with {bag}",
    leave: "sell the index position at {name} on {chain} back to the deposited asset",
    limit: "Do not leverage the index",
  },
  "Crypto Card Issuer": {
    enter: "fund the on-chain balance {name} spends from on {chain} with {bag}",
    leave: "withdraw the unused balance at {name} on {chain} to your wallet",
    limit: "Do not spend the balance during the hold",
  },
  "OTC Marketplace": {
    enter: "post {bag} as a resting bid on {name}'s market on {chain}",
    leave: "cancel the bid and withdraw the funds at {name} on {chain}",
    limit: "Do not lift an offer larger than this ticket",
  },
  Insurance: {
    enter: "buy cover at {name} on {chain} sized to {bag} for the hold",
    leave: "let the cover at {name} on {chain} expire, or cancel it if the protocol allows",
    limit: "Do not buy cover above this ticket",
  },
  Payments: {
    enter: "route one payment of {bag} through {name} on {chain} and keep the receipt",
    leave: "withdraw any leftover balance at {name} on {chain} to your wallet",
    limit: "Do not route a second payment during the hold",
  },
  "Governance Incentives": {
    enter: "deposit {bag} into the incentives vault at {name} on {chain}",
    leave: "withdraw from the incentives vault at {name} on {chain}",
    limit: "Do not vote with a borrowed balance",
  },
  "Options Vault": {
    enter: "deposit {bag} as collateral in the options vault at {name} on {chain}, with no naked short",
    leave: "withdraw the collateral at {name} on {chain} after the vault's round",
    limit: "Do not sell a naked option on top of the vault",
  },
  "Collateral Markets": {
    enter: "post {bag} as collateral in the market at {name} on {chain}",
    leave: "withdraw the collateral at {name} on {chain}",
    limit: "Do not borrow against more than 10% of the collateral",
  },
  Privacy: {
    enter: "deposit {bag} into the private pool at {name} on {chain} and keep the viewing key",
    leave: "withdraw from the private pool at {name} on {chain} to the same wallet",
    limit: "Do not discard the viewing key",
  },
};

const DEFAULT_PLAY: Play = {
  enter: "deposit {bag} into the primary pool at {name} on {chain}",
  leave: "withdraw it at {name} on {chain} to the same wallet",
  limit: "Do not add a second leveraged loop on top of this deposit",
};

export function planFarm(input: FarmInput): string[] {
  const primary = input.chains[0] ?? "";
  const secondary = input.chains[1] ?? "";
  const where = primary || "the protocol's primary chain";
  const desk = deskFor(primary);
  const play = (input.category && PLAYS[input.category]) || DEFAULT_PLAY;
  const ticket = ticketUsd(input.tvlUsd);
  const hold = holdDays(input.ageDays, input.change7d, input.category);
  const bag = bagText(ticket, desk, where);
  const listed = input.ageDays == null ? "an unreported listing date" : `${input.ageDays} days listed`;
  const moved = changePhrase(input.change7d);
  const charge = railCost(desk);
  const door = usdFromCents(ticket * 100 + desk.cents);
  const steps: string[] = [];
  const paid: number[] = [];

  steps.push(line(desk.cents, desk.fund, `${fundText(desk, bag, input.name, where)}. Cash out the door before the deposit is ${door}`));
  paid.push(desk.cents);
  steps.push(line(charge.permit, charge.permit > 0 ? desk.tx : "about 5 minutes", permitText(desk, bag, input.name, where)));
  paid.push(charge.permit);
  steps.push(line(charge.enter, charge.enter > 0 ? desk.tx : "about 5 minutes", enterText(desk, play, bag, input.name, where)));
  paid.push(charge.enter);
  steps.push(line(0, "about 5 minutes", `${play.limit}. On ${where}, confirm the ${input.name} position screen shows only this deposit`));
  paid.push(0);
  steps.push(line(0, `${hold} days`, `leave the ${input.name} position on ${where} untouched. The record shows ${listed} and a 7-day TVL change of ${moved}`));
  paid.push(0);
  steps.push(line(0, "about 10 minutes", `every 7 days, compare TVL with the snapshot ${usd(input.tvlUsd)} (${moved}). If TVL is more than 25% under that figure, withdraw ${bag} on ${where}`));
  paid.push(0);

  let probe = 0;
  if (secondary) {
    const other = deskFor(secondary);
    probe = Math.max(100, Math.round(ticket / 5 / 50) * 50);
    const probeBag = bagText(probe, other, secondary);
    steps.push(line(other.cents, "about 20 minutes", probeText(where, secondary, other, probeBag, input.name, hold)));
    paid.push(other.cents);
  }

  const gasAll = paid.reduce((sum, cents) => sum + cents, 0) + desk.cents;
  steps.push(line(
    desk.cents,
    desk.tx,
    `${fill(play.leave, bag, input.name, where)}. All-in budget is ${usd(ticket + probe)} deployed and about ${usdFromCents(gasAll)} in gas over ${hold} days. Implied value ${usd(input.impliedUsd)} is this board's claim, not a market price`,
  ));

  for (const step of steps) {
    const text = step.trim();
    if (text.length < 20 || text.length > 600) {
      throw new Error(`${input.name} farm step length ${text.length}: ${text.slice(0, 80)}`);
    }
    if (!/\$\d/.test(text) || !PPM_WORD.test(text)) {
      throw new Error(`${input.name} farm step lacks a cost or a time`);
    }
    if (primary && !text.includes(primary)) {
      throw new Error(`${input.name} farm step never names ${primary}`);
    }
  }
  if (secondary && !steps.some((step) => step.includes(secondary))) {
    throw new Error(`${input.name} farm plan never names ${secondary}`);
  }
  return steps;
}

function deskFor(chain: string): Desk {
  if (!chain) {
    return { rail: "evm", asset: "USDC", fee: "the fee token", cents: 80, fund: "about 8 minutes", tx: "about 2 minutes" };
  }
  const rail = RAIL[chain] ?? "evm";
  const asset = rail === "utxo" ? "native" : rail === "tron" ? "USDT" : "USDC";
  return {
    rail,
    asset,
    fee: FEE[chain] ?? `the ${chain} fee token`,
    cents: CENTS[chain] ?? defaultCents(rail),
    fund: fundTime(chain, rail),
    tx: txTime(chain, rail),
  };
}

function defaultCents(rail: Rail): number {
  if (rail === "spl" || rail === "stellar" || rail === "xrp" || rail === "algo") return 5;
  if (rail === "utxo") return 25;
  if (rail === "tron") return 120;
  return 20;
}

function fundTime(chain: string, rail: Rail): string {
  if (rail === "utxo") return "about 40 minutes";
  if (chain === "Ethereum") return "about 15 minutes";
  if (chain === "Cardano" || rail === "stark") return "about 10 minutes";
  return "about 8 minutes";
}

function txTime(chain: string, rail: Rail): string {
  if (rail === "utxo") return "about 40 minutes";
  if (chain === "Ethereum" || rail === "stark") return "about 5 minutes";
  if (chain === "Cardano") return "about 8 minutes";
  return "about 2 minutes";
}

function railCost(desk: Desk): { permit: number; enter: number } {
  if (desk.rail === "evm" || desk.rail === "tron" || desk.rail === "stark") {
    return { permit: desk.cents, enter: desk.cents * 2 };
  }
  if (desk.rail === "stellar" || desk.rail === "xrp" || desk.rail === "algo") {
    return { permit: desk.cents, enter: desk.cents };
  }
  if (desk.rail === "utxo") return { permit: 0, enter: 0 };
  return { permit: 0, enter: desk.cents };
}

function fundText(desk: Desk, bag: string, name: string, chain: string): string {
  if (desk.rail === "utxo") {
    return `on ${chain}, send ${bag} to the deposit address ${name} shows. Pay the miner fee in ${desk.fee} and wait for one confirmation`;
  }
  if (desk.rail === "spl") {
    return `on ${chain}, send ${bag} as an SPL token to the wallet you will use at ${name}. Pay the fee in ${desk.fee}`;
  }
  if (desk.rail === "tron") {
    return `on ${chain}, send ${bag} as TRC-20 to the wallet you will use at ${name}. Leave extra ${desk.fee} in that wallet for energy`;
  }
  if (desk.rail === "hl") {
    return `on ${chain}, send ${bag} to the wallet you will connect to ${name}. Pay the transfer in ${desk.fee}`;
  }
  return `on ${chain}, send ${bag} to the wallet you will use at ${name}. Pay the transfer in ${desk.fee}`;
}

function permitText(desk: Desk, bag: string, name: string, chain: string): string {
  const fee = desk.fee;
  switch (desk.rail) {
    case "evm":
      return `on ${chain}, approve ${name} to spend ${bag}. This is an ERC-20 approval paid in ${fee}; approve this ticket only`;
    case "spl":
      return `on ${chain}, confirm the SPL token account for ${bag}. Solana has no ERC-20 approval; the deposit signature moves the tokens, and the fee is paid in ${fee}`;
    case "utxo":
      return `on ${chain}, confirm the deposit address ${name} showed and that the wallet counts one confirmation. ${chain} has no token approval and no contract receipt`;
    case "tron":
      return `on ${chain}, approve ${name} to spend ${bag}. Tron bills this TRC-20 approval as energy, so keep ${fee} in the wallet`;
    case "stellar":
      return `on ${chain}, open a trustline for ${desk.asset} if the wallet does not have one. The trustline is Stellar's permission step and is paid in ${fee}`;
    case "xrp":
      return `on ${chain}, set a trust line for ${desk.asset} if the wallet does not hold it. The trust line is the XRP Ledger's permission step and is paid in ${fee}`;
    case "move":
      return `on ${chain}, select the coin object that holds ${bag}. ${chain} passes the coin into the call and has no ERC-20 approval; the fee is paid in ${fee}`;
    case "cardano":
      return `on ${chain}, check the wallet holds ${bag}. Cardano spends native assets in the deposit itself, with no ERC-20 approval, and the fee is paid in ${fee}`;
    case "algo":
      return `on ${chain}, opt the wallet into ${desk.asset}. Algorand refuses the deposit until that opt-in lands, and the fee is paid in ${fee}`;
    case "near":
      return `on ${chain}, confirm the access key can call ${name}. Near has no separate token approval; the fee is paid in ${fee}`;
    case "cosmos":
      return `on ${chain}, review the deposit message ${name} asks you to sign. The fee is paid in ${fee}, and there is no ERC-20 approval`;
    case "stark":
      return `on ${chain}, invoke the token approval for ${bag} so ${name} can take it. Starknet charges this call in ${fee}`;
    case "stacks":
      return `on ${chain}, confirm the wallet will post ${bag} in the next contract call. Stacks does not use an ERC-20 approval, and the fee is paid in ${fee}`;
    case "filecoin":
      return `on ${chain}, confirm the wallet that will post ${bag}. The message fee is paid in ${fee}`;
    case "hl":
      return `on ${chain}, move ${bag} into the L1 balance ${name} reads. Hyperliquid L1 uses a signed transfer rather than an ERC-20 approval, paid in ${fee}`;
    default:
      return `on ${chain}, open ${name}'s deposit screen and approve only ${bag} if that screen asks. Pay the fee in ${fee}`;
  }
}

function enterText(desk: Desk, play: Play, bag: string, name: string, chain: string): string {
  const action = fill(play.enter, bag, name, chain);
  if (desk.rail === "utxo") {
    return `${action}. The miner fee was already paid on ${chain}, and ${chain} will not mint a receipt token`;
  }
  return action;
}

function probeText(primary: string, second: string, desk: Desk, bag: string, name: string, hold: number): string {
  let how = `deposit ${bag} with ${second}'s own permission step`;
  if (desk.rail === "utxo") how = `send ${bag} to the deposit address ${name} shows on ${second}`;
  else if (desk.rail === "spl") how = `deposit ${bag} with one SPL signature on ${second}, paid in ${desk.fee}`;
  else if (desk.rail === "evm") how = `approve and then deposit ${bag} with an ERC-20 call on ${second}, paid in ${desk.fee}`;
  else if (desk.rail === "tron") how = `approve and then deposit ${bag} as TRC-20 on ${second}, paid in ${desk.fee}`;
  else if (desk.rail === "stellar" || desk.rail === "xrp" || desk.rail === "algo") how = `open the chain permission for ${desk.asset}, then deposit ${bag} on ${second}`;
  return `after ${primary} is open, ${how} at ${name} and hold that probe for the same ${hold} days`;
}

function fill(text: string, bag: string, name: string, chain: string): string {
  return text.replaceAll("{bag}", bag).replaceAll("{name}", name).replaceAll("{chain}", chain);
}

function line(cents: number, time: string, body: string): string {
  return `About ${usdFromCents(cents)} gas, ${time}: ${sentence(body)}.`;
}

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function ticketUsd(tvl: number): number {
  if (tvl >= 1_000_000_000) return 2000;
  if (tvl >= 250_000_000) return 1000;
  if (tvl >= 50_000_000) return 500;
  if (tvl >= 10_000_000) return 250;
  return 100;
}

function holdDays(age: number | null, change: number | null, category: string | null): number {
  let days = 30;
  if (age != null && age >= 700) days = 75;
  else if (age != null && age >= 365) days = 60;
  else if (age != null && age >= 120) days = 45;
  if (category === "RWA") days = Math.max(days, 60);
  if (
    category === "Derivatives" ||
    category === "Prediction Market" ||
    category === "Options Vault" ||
    category === "Interest Rate Derivatives"
  ) {
    days = Math.min(days, 21);
  }
  if (change != null && change >= 25) days = Math.min(days, 21);
  if (change != null && change <= -20) days = Math.min(days, 14);
  return days;
}

function bagText(ticket: number, desk: Desk, chain: string): string {
  const money = usd(ticket);
  if (desk.asset === "native") return `the equivalent of ${money} in ${chain}'s native coin`;
  if (desk.asset === "USDT") return `${money} USDT`;
  return `${money} USDC`;
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
