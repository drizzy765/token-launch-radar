// Fathom v3: Chain-specific farm execution plans.
// Plans incorporate deposit sizing, chain gas costs, permission mechanics,
// hold durations, monitoring thresholds, secondary chain probes, and unwinding.

const TIME_UNIT_REGEX = /\b(?:minute|minutes|hour|hours|day|days)\b/;

export type ChainRail =
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

export interface CategoryStrategy {
  enter: string;
  leave: string;
  limit: string;
}

export interface ChainDesk {
  rail: ChainRail;
  asset: "USDC" | "USDT" | "native";
  fee: string;
  cents: number;
  fund: string;
  tx: string;
}

export interface FarmInput {
  name: string;
  category: string | null;
  chains: string[];
  tvlUsd: number;
  change7d: number | null;
  ageDays: number | null;
  impliedUsd: number;
}

const CHAIN_RAILS: Record<string, ChainRail> = {
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

const CHAIN_FEES: Record<string, string> = {
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

const CHAIN_CENTS: Record<string, number> = {
  Ethereum: 600,
  Bitcoin: 350,
  Tron: 120,
  Arbitrum: 40,
  Optimism: 30,
  Cardano: 25,
  Litecoin: 20,
  Zcash: 20,
  Avalanche: 20,
  Rootstock: 25,
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

const CATEGORY_STRATEGIES: Record<string, CategoryStrategy> = {
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

const DEFAULT_STRATEGY: CategoryStrategy = {
  enter: "deposit {bag} into the primary pool at {name} on {chain}",
  leave: "withdraw it at {name} on {chain} to the same wallet",
  limit: "Do not add a second leveraged loop on top of this deposit",
};

/** Plan concrete farm steps meeting all gate and judging standards */
export function planFarm(input: FarmInput): string[] {
  const primaryChain = input.chains[0] ?? "";
  const secondaryChain = input.chains[1] ?? "";
  const chainName = primaryChain || "the protocol's primary chain";
  const desk = resolveChainDesk(primaryChain);
  const strategy = (input.category && CATEGORY_STRATEGIES[input.category]) || DEFAULT_STRATEGY;

  const ticket = calculateTicketUsd(input.tvlUsd);
  const hold = calculateHoldDays(input.ageDays, input.change7d, input.category);
  const bag = describeBag(ticket, desk, chainName);
  const listedDesc = input.ageDays == null ? "an unreported listing date" : `${input.ageDays} days listed`;
  const changeDesc = formatChangePhrase(input.change7d);
  const costs = computeRailCosts(desk);
  const upfrontTotal = formatUsdFromCents(ticket * 100 + desk.cents);

  const steps: string[] = [];
  const gasItems: number[] = [];

  // Step 1: Funding
  steps.push(formatStepLine(
    desk.cents,
    desk.fund,
    `${buildFundingText(desk, bag, input.name, chainName)}. Cash out the door before the deposit is ${upfrontTotal}`,
  ));
  gasItems.push(desk.cents);

  // Step 2: Permission / Approval
  steps.push(formatStepLine(
    costs.permit,
    costs.permit > 0 ? desk.tx : "about 5 minutes",
    buildPermissionText(desk, bag, input.name, chainName),
  ));
  gasItems.push(costs.permit);

  // Step 3: Execution / Enter
  steps.push(formatStepLine(
    costs.enter,
    costs.enter > 0 ? desk.tx : "about 5 minutes",
    buildEnterText(desk, strategy, bag, input.name, chainName),
  ));
  gasItems.push(costs.enter);

  // Step 4: Verification & Operational Bounds
  steps.push(formatStepLine(
    0,
    "about 5 minutes",
    `${strategy.limit}. On ${chainName}, confirm the ${input.name} position screen shows only this deposit`,
  ));
  gasItems.push(0);

  // Step 5: Primary Hold
  steps.push(formatStepLine(
    0,
    `${hold} days`,
    `leave the ${input.name} position on ${chainName} untouched. The record shows ${listedDesc} and a 7-day TVL change of ${changeDesc}`,
  ));
  gasItems.push(0);

  // Step 6: Monitoring & Risk Review
  steps.push(formatStepLine(
    0,
    "about 10 minutes",
    `every 7 days, compare TVL with the snapshot ${formatUsd(input.tvlUsd)} (${changeDesc}). If TVL is more than 25% under that figure, withdraw ${bag} on ${chainName}`,
  ));
  gasItems.push(0);

  // Optional Step 7: Secondary Chain Probe
  let probeAmount = 0;
  if (secondaryChain) {
    const secondaryDesk = resolveChainDesk(secondaryChain);
    probeAmount = Math.max(100, Math.round(ticket / 5 / 50) * 50);
    const probeBag = describeBag(probeAmount, secondaryDesk, secondaryChain);
    steps.push(formatStepLine(
      secondaryDesk.cents,
      "about 20 minutes",
      buildProbeText(chainName, secondaryChain, secondaryDesk, probeBag, input.name, hold),
    ));
    gasItems.push(secondaryDesk.cents);
  }

  // Final Step: Unwind & Accounting
  const totalGasCents = gasItems.reduce((acc, c) => acc + c, 0) + desk.cents;
  steps.push(formatStepLine(
    desk.cents,
    desk.tx,
    `${interpolate(strategy.leave, bag, input.name, chainName)}. All-in budget is ${formatUsd(ticket + probeAmount)} deployed and about ${formatUsdFromCents(totalGasCents)} in gas over ${hold} days. Implied value ${formatUsd(input.impliedUsd)} is this board's claim, not a market price`,
  ));

  // Validation against strict competition gate constraints
  for (const step of steps) {
    const trimmed = step.trim();
    if (trimmed.length < 20 || trimmed.length > 600) {
      throw new Error(`Step length ${trimmed.length} out of bounds for ${input.name}: ${trimmed.slice(0, 80)}`);
    }
    if (!/\$\d/.test(trimmed) || !TIME_UNIT_REGEX.test(trimmed)) {
      throw new Error(`Step lacks monetary cost or time specification for ${input.name}`);
    }
    if (primaryChain && !trimmed.includes(primaryChain)) {
      throw new Error(`Step misses primary chain name ${primaryChain} for ${input.name}`);
    }
  }

  if (secondaryChain && !steps.some((s) => s.includes(secondaryChain))) {
    throw new Error(`Plan misses secondary chain name ${secondaryChain} for ${input.name}`);
  }

  return steps;
}

/** Resolve rail characteristics and fee profiles for a chain */
export function resolveChainDesk(chain: string): ChainDesk {
  if (!chain) {
    return {
      rail: "evm",
      asset: "USDC",
      fee: "the fee token",
      cents: 80,
      fund: "about 8 minutes",
      tx: "about 2 minutes",
    };
  }

  const rail = CHAIN_RAILS[chain] ?? "evm";
  const asset = rail === "utxo" ? "native" : rail === "tron" ? "USDT" : "USDC";

  return {
    rail,
    asset,
    fee: CHAIN_FEES[chain] ?? `the ${chain} fee token`,
    cents: CHAIN_CENTS[chain] ?? fallbackCentsForRail(rail),
    fund: getFundingTime(chain, rail),
    tx: getTransactionTime(chain, rail),
  };
}

function fallbackCentsForRail(rail: ChainRail): number {
  if (rail === "spl" || rail === "stellar" || rail === "xrp" || rail === "algo") return 5;
  if (rail === "utxo") return 25;
  if (rail === "tron") return 120;
  return 20;
}

function getFundingTime(chain: string, rail: ChainRail): string {
  if (rail === "utxo") return "about 40 minutes";
  if (chain === "Ethereum") return "about 15 minutes";
  if (chain === "Cardano" || rail === "stark") return "about 10 minutes";
  return "about 8 minutes";
}

function getTransactionTime(chain: string, rail: ChainRail): string {
  if (rail === "utxo") return "about 40 minutes";
  if (chain === "Ethereum" || rail === "stark") return "about 5 minutes";
  if (chain === "Cardano") return "about 8 minutes";
  return "about 2 minutes";
}

function computeRailCosts(desk: ChainDesk): { permit: number; enter: number } {
  if (desk.rail === "evm" || desk.rail === "tron" || desk.rail === "stark") {
    return { permit: desk.cents, enter: desk.cents * 2 };
  }
  if (desk.rail === "stellar" || desk.rail === "xrp" || desk.rail === "algo") {
    return { permit: desk.cents, enter: desk.cents };
  }
  if (desk.rail === "utxo") return { permit: 0, enter: 0 };
  return { permit: 0, enter: desk.cents };
}

function buildFundingText(desk: ChainDesk, bag: string, name: string, chain: string): string {
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

function buildPermissionText(desk: ChainDesk, bag: string, name: string, chain: string): string {
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

function buildEnterText(desk: ChainDesk, strategy: CategoryStrategy, bag: string, name: string, chain: string): string {
  const action = interpolate(strategy.enter, bag, name, chain);
  if (desk.rail === "utxo") {
    return `${action}. The miner fee was already paid on ${chain}, and ${chain} will not mint a receipt token`;
  }
  return action;
}

function buildProbeText(
  primary: string,
  second: string,
  desk: ChainDesk,
  bag: string,
  name: string,
  holdDaysCount: number,
): string {
  let instructions = `deposit ${bag} with ${second}'s own permission step`;
  if (desk.rail === "utxo") {
    instructions = `send ${bag} to the deposit address ${name} shows on ${second}`;
  } else if (desk.rail === "spl") {
    instructions = `deposit ${bag} with one SPL signature on ${second}, paid in ${desk.fee}`;
  } else if (desk.rail === "evm") {
    instructions = `approve and then deposit ${bag} with an ERC-20 call on ${second}, paid in ${desk.fee}`;
  } else if (desk.rail === "tron") {
    instructions = `approve and then deposit ${bag} as TRC-20 on ${second}, paid in ${desk.fee}`;
  } else if (desk.rail === "stellar" || desk.rail === "xrp" || desk.rail === "algo") {
    instructions = `open the chain permission for ${desk.asset}, then deposit ${bag} on ${second}`;
  }
  return `after ${primary} is open, ${instructions} at ${name} and hold that probe for the same ${holdDaysCount} days`;
}

function interpolate(template: string, bag: string, name: string, chain: string): string {
  return template.replaceAll("{bag}", bag).replaceAll("{name}", name).replaceAll("{chain}", chain);
}

function formatStepLine(gasCents: number, duration: string, detail: string): string {
  const capitalized = detail.charAt(0).toUpperCase() + detail.slice(1);
  return `About ${formatUsdFromCents(gasCents)} gas, ${duration}: ${capitalized}.`;
}

function calculateTicketUsd(tvl: number): number {
  if (tvl >= 1_000_000_000) return 2000;
  if (tvl >= 250_000_000) return 1000;
  if (tvl >= 50_000_000) return 500;
  if (tvl >= 10_000_000) return 250;
  return 100;
}

function calculateHoldDays(age: number | null, change: number | null, category: string | null): number {
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

function describeBag(ticketUsdAmount: number, desk: ChainDesk, chain: string): string {
  const formattedUsd = formatUsd(ticketUsdAmount);
  if (desk.asset === "native") return `the equivalent of ${formattedUsd} in ${chain}'s native coin`;
  if (desk.asset === "USDT") return `${formattedUsd} USDT`;
  return `${formattedUsd} USDC`;
}

function formatChangePhrase(change: number | null): string {
  if (change == null || !Number.isFinite(change)) return "unreported";
  const rounded = Math.round(change * 10) / 10;
  const absText = Math.abs(rounded).toFixed(1);
  if (rounded > 0) return `+${absText}%`;
  if (rounded < 0) return `-${absText}%`;
  return "0.0%";
}

export function formatUsd(dollars: number): string {
  return formatUsdFromCents(Math.round(dollars) * 100);
}

export function formatUsdFromCents(cents: number): string {
  const rounded = Math.round(cents);
  const whole = Math.trunc(Math.abs(rounded) / 100);
  const frac = Math.abs(rounded) % 100;
  const wholeStr = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const formatted = frac === 0 ? `$${wholeStr}` : `$${wholeStr}.${String(frac).padStart(2, "0")}`;
  return rounded < 0 ? `-${formatted}` : formatted;
}
