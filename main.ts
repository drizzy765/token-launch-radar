// Fathom v3: Protocol Launch Radar entrypoint.
// Reads the sealed DefiLlama snapshot, scores pre-token candidates,
// validates the output against the competition gate, and compiles the dossier.
//
// Usage: MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { explainBoardProblem, loadSnapshot, scoreBoard, toBoardJson, toDataScript } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const rootDir = dirname(fileURLToPath(import.meta.url));

const DOSSIER_LIMITS = {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};

/** Parse command line flag values */
function parseFlag(flagName: string, defaultValue: string): string {
  const target = `--${flagName}`;
  const prefix = `${target}=`;
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i] ?? "";
    if (arg === target) return process.argv[i + 1] ?? defaultValue;
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return defaultValue;
}

/** Normalize snapshot file path */
function resolveSnapshotPath(rawPath: string): string {
  return rawPath.endsWith(".json") ? rawPath : join(rawPath, "snapshot.json");
}

/** Recursively copy non-hidden regular files from source to destination */
function copyDirectoryFiles(fromDir: string, toDir: string): string[] {
  mkdirSync(toDir, { recursive: true });
  const copiedFiles: string[] = [];
  for (const entry of readdirSync(fromDir).filter((name) => !name.startsWith(".")).sort()) {
    const sourcePath = join(fromDir, entry);
    if (!statSync(sourcePath).isFile()) continue;
    writeFileSync(join(toDir, entry), readFileSync(sourcePath));
    copiedFiles.push(entry);
  }
  return copiedFiles;
}

/** Validate dashboard constraints: html, css, js files, no remote URLs, total size <= 64KB */
function validateDashboardAssets(dir: string): number {
  let totalBytes = 0;
  let htmlCount = 0;
  let cssCount = 0;
  let jsCount = 0;

  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const filePath = join(dir, name);
    if (!statSync(filePath).isFile()) continue;

    const buffer = readFileSync(filePath);
    totalBytes += buffer.length;

    if (/https?:\/\//i.test(buffer.toString("utf8"))) {
      throw new Error(`Forbidden network URL detected in dashboard asset: ${name}`);
    }
    if (name.endsWith(".html")) htmlCount += 1;
    if (name.endsWith(".css")) cssCount += 1;
    if (name.endsWith(".js")) jsCount += 1;
  }

  if (htmlCount < 1 || cssCount < 1 || jsCount < 1) {
    throw new Error("Dashboard must include at least one .html, one .css, and one .js file");
  }
  if (totalBytes > 65_536) {
    throw new Error(`Dashboard assets exceed 64KB size limit: ${totalBytes} bytes`);
  }
  return totalBytes;
}

function terminate(msg: string): never {
  process.stderr.write(`fathom: ${msg}\n`);
  process.exit(1);
}

// 1. Resolve and parse input snapshot
const inputPath = resolveSnapshotPath(parseFlag("input", "/input"));
if (!existsSync(inputPath)) {
  terminate(`Snapshot file not found at ${inputPath}`);
}

const outputPath = parseFlag("output", process.env.MAKEFUN_OUTPUT_DIR ?? "/output");
const snapshot = loadSnapshot(readFileSync(inputPath, "utf8"));

// 2. Score candidate protocols and assemble radar board
const scored = scoreBoard(snapshot);

// 3. Verify gate requirements locally
const validationIssue = explainBoardProblem(scored.rows, snapshot.watchlist);
if (validationIssue) {
  terminate(`Board rejected by validation gate: ${validationIssue}`);
}

// 4. Validate dashboard assets
const dashboardSize = validateDashboardAssets(join(rootDir, "dashboard"));

// 5. Emit outputs
mkdirSync(outputPath, { recursive: true });
writeFileSync(join(outputPath, "board.json"), toBoardJson(scored.rows));
writeFileSync(join(outputPath, "data.js"), toDataScript(scored.page));
copyDirectoryFiles(join(rootDir, "dashboard"), join(outputPath, "dashboard"));

const screenshots = copyDirectoryFiles(join(rootDir, "screenshots"), join(outputPath, "screenshots"));
if (screenshots.length < 3) {
  terminate(`Expected at least 3 screenshots; found ${screenshots.length}`);
}

// 6. Build and write dossier.json
const dossierBuffer = buildDossier(outputPath, DOSSIER_LIMITS);
writeFileSync(join(outputPath, "dossier.json"), dossierBuffer);

// 7. Output summary diagnostics
const topProtocol = scored.rows[0];
const lastProtocol = scored.rows.at(-1);
const stepLengths = scored.rows.flatMap((r) => r.farm_steps.map((s) => s.trim().length));

process.stdout.write(
  `fathom: ${scored.page.n_protocols} protocols, ${scored.page.n_watchlist} watchlist, ${scored.rows.length} rows, ${scored.page.n_screened_out} screened out, ${scored.page.n_comps} comparables\n` +
    `fathom: implied ${topProtocol?.implied_value_usd ?? 0} down to ${lastProtocol?.implied_value_usd ?? 0}; farm steps ${Math.min(...stepLengths)}-${Math.max(...stepLengths)} chars; dashboard ${dashboardSize} bytes\n` +
    `fathom: wrote board.json, data.js, dashboard/, screenshots/ (${screenshots.length}), dossier.json (${dossierBuffer.length} bytes)\n`,
);
