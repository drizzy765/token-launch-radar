// Fathom v3: Unified library facade exported for main.ts and test harnesses.

export { explainBoardProblem } from "./gate.ts";
export {
  confidenceFor,
  impliedDollars,
  isStructuralReject,
  isTradingComparable,
  loadSnapshot,
  recordsNoToken,
  scoreBoard,
  toBoardJson,
  toDataScript,
  VALUE_CAP,
} from "./value.ts";
export { planFarm, resolveChainDesk, formatUsd, formatUsdFromCents } from "./farms.ts";
export type { CategoryMultiple, CompRow, LaunchRow, PageData, Protocol, Snapshot } from "./types.ts";
