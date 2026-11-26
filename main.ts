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

interface CliOptions {
  inputPath: string;
  outputPath: string;
}

function terminate(msg: string, code = 1): never {
  process.stderr.write(`fathom: error: ${msg}\n`);
  process.exit(code);
}

/** Parse and validate CLI arguments with clear error handling and usage help */
function parseArgs(): CliOptions {
  const args = process.argv.slice(2);
  let rawInput: string | undefined;
  let rawOutput: string | undefined;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i] ?? "";

    if (arg === "--input") {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        terminate("Option '--input' requires a path to snapshot.json or a directory containing it");
      }
      rawInput = next;
      i += 1;
    } else if (arg.startsWith("--input=")) {
      const val = arg.slice("--input=".length);
      if (!val) {
        terminate("Option '--input' requires a non-empty path");
      }
      rawInput = val;
    } else if (arg === "--output") {
      const next = args[i + 1];
      if (!next || next.startsWith("--")) {
        terminate("Option '--output' requires a directory path");
      }
      rawOutput = next;
      i += 1;
    } else if (arg.startsWith("--output=")) {
      const val = arg.slice("--output=".length);
      if (!val) {
        terminate("Option '--output' requires a non-empty directory path");
      }
      rawOutput = val;
    } else if (arg === "--help" || arg === "-h") {
      process.stdout.write(
        "Usage: node main.ts [--input <snapshot.json|dir>] [--output <outdir>]\n\n" +
          "Options:\n" +
          "  --input <path>   Path to DefiLlama snapshot.json or folder (default: /input)\n" +
          "  --output <path>  Output directory for generated dossier and assets\n" +
          "                   (default: $MAKEFUN_OUTPUT_DIR or /output)\n" +
          "  --help, -h       Show this help message\n",
      );
      process.exit(0);
    } else if (arg.startsWith("-")) {
      terminate(`Unrecognized option '${arg}'. Run with --help for available options.`);
    }
  }

  const inputTarget = rawInput ?? "/input";
  const inputPath = inputTarget.endsWith(".json") ? inputTarget : join(inputTarget, "snapshot.json");
  const outputPath = rawOutput ?? (process.env.MAKEFUN_OUTPUT_DIR || "/output");

  return { inputPath, outputPath };
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
  if (!existsSync(dir)) {
    terminate(`Dashboard directory not found at ${dir}`);
  }

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
      terminate(`Forbidden network URL detected in dashboard asset '${name}' (must be fully offline)`);
    }
    if (name.endsWith(".html")) htmlCount += 1;
    if (name.endsWith(".css")) cssCount += 1;
    if (name.endsWith(".js")) jsCount += 1;
  }

  if (htmlCount < 1 || cssCount < 1 || jsCount < 1) {
    terminate("Dashboard bundle missing required files: must include at least one .html, one .css, and one .js file");
  }
  if (totalBytes > 65_536) {
    terminate(`Dashboard assets exceed 64KB size limit: ${totalBytes} bytes`);
  }
  return totalBytes;
}

// Stage 1: Resolve and parse input snapshot
// Locates and loads the DefiLlama protocol snapshot from CLI flags or environment defaults,
// parsing the protocol universe, TVL records, and targeted competition watchlist.
const { inputPath, outputPath } = parseArgs();

if (!existsSync(inputPath)) {
  terminate(`Snapshot file not found at ${inputPath} (use --input <snapshot.json|dir> or mount /input)`);
}

let snapshotRaw: string;
try {
  snapshotRaw = readFileSync(inputPath, "utf8");
} catch (err) {
  const detail = err instanceof Error ? err.message : String(err);
  terminate(`Failed to read snapshot file: ${detail}`);
}

let snapshot;
try {
  snapshot = loadSnapshot(snapshotRaw);
} catch (err) {
  const detail = err instanceof Error ? err.message : String(err);
  terminate(`Failed to parse snapshot JSON: ${detail}`);
}

// Stage 2: Score candidate protocols and assemble radar board
// Filters out already-tokenized and excluded categories, calculates category valuation multiples,
// computes growth/age/breadth adjustment factors, and synthesizes actionable farming plans.
const scored = scoreBoard(snapshot);

// Stage 3: Verify gate requirements locally
// Runs automated gate verification before file generation: checks watchlist coverage,
// strictly descending implied valuation ordering, row bounds (100-4000), and farm step constraints.
const validationIssue = explainBoardProblem(scored.rows, snapshot.watchlist);
if (validationIssue) {
  terminate(`Board rejected by validation gate: ${validationIssue}`);
}

// Stage 4: Validate dashboard assets
// Verifies that dashboard UI files (HTML, CSS, JS) comply with competition rules:
// strictly local assets without external network/CDN calls, and total payload size <= 64KB.
const dashboardSize = validateDashboardAssets(join(rootDir, "dashboard"));

// Stage 5: Emit outputs
// Writes the core artifacts to the target output directory:
// - board.json: structured radar rows with valuation metrics and farming steps
// - data.js: window-injected payload for the standalone dashboard viewer
// - dashboard/: static viewer bundle
// - screenshots/: proof-of-work interface captures
mkdirSync(outputPath, { recursive: true });
writeFileSync(join(outputPath, "board.json"), toBoardJson(scored.rows));
writeFileSync(join(outputPath, "data.js"), toDataScript(scored.page));
copyDirectoryFiles(join(rootDir, "dashboard"), join(outputPath, "dashboard"));

const screenshots = copyDirectoryFiles(join(rootDir, "screenshots"), join(outputPath, "screenshots"));
if (screenshots.length < 3) {
  terminate(`Expected at least 3 screenshots; found ${screenshots.length}`);
}

// Stage 6: Build and write dossier.json
// Packages the output directory into a sealed Makefun dossier meeting byte and file count limits.
const dossierBuffer = buildDossier(outputPath, DOSSIER_LIMITS);
writeFileSync(join(outputPath, "dossier.json"), dossierBuffer);

// Stage 7: Output summary diagnostics
// Emits diagnostic metrics detailing candidate counts, valuation ranges, farm plan constraints,
// generated file sizes, followed by a final completion summary line.
const topProtocol = scored.rows[0];
const lastProtocol = scored.rows.at(-1);
const stepLengths = scored.rows.flatMap((r) => r.farm_steps.map((s) => s.trim().length));

process.stdout.write(
  `fathom: ${scored.page.n_protocols} protocols, ${scored.page.n_watchlist} watchlist, ${scored.rows.length} rows, ${scored.page.n_screened_out} screened out, ${scored.page.n_comps} comparables\n` +
    `fathom: implied ${topProtocol?.implied_value_usd ?? 0} down to ${lastProtocol?.implied_value_usd ?? 0}; farm steps ${Math.min(...stepLengths)}-${Math.max(...stepLengths)} chars; dashboard ${dashboardSize} bytes\n` +
    `fathom: wrote board.json, data.js, dashboard/, screenshots/ (${screenshots.length}), dossier.json (${dossierBuffer.length} bytes)\n` +
    `fathom: pipeline finished successfully\n`,
);
