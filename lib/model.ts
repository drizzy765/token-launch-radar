// Public surface main.ts runs. Scoring lives in value.ts, plans in farms.ts.

export { explainBoardProblem } from "./gate.ts";
export { loadSnapshot, scoreBoard, toBoardJson, toDataScript } from "./value.ts";
export type { LaunchRow, PageData, Snapshot } from "./types.ts";
