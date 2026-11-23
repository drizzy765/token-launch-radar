// Fathom entrypoint. Node 22 reads the sealed snapshot and writes /output.
// Local run: MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { explainBoardProblem, loadSnapshot, scoreBoard, toBoardJson, toDataScript } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const root = dirname(fileURLToPath(import.meta.url));

function option(flag: string, fallback: string): string {
  const pair = `--${flag}`;
  const prefix = `${pair}=`;
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i] ?? "";
    if (arg === pair) return process.argv[i + 1] ?? fallback;
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return fallback;
}

function snapshotFile(raw: string): string {
  return raw.endsWith(".json") ? raw : join(raw, "snapshot.json");
}

function mirrorFlat(fromDir: string, toDir: string): string[] {
  mkdirSync(toDir, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(fromDir).sort()) {
    if (name.startsWith(".")) continue;
    const from = join(fromDir, name);
    if (!statSync(from).isFile()) continue;
    writeFileSync(join(toDir, name), readFileSync(from));
    copied.push(name);
  }
  return copied;
}

function assertDashboard(dir: string): number {
  let bytes = 0;
  let html = 0;
  let css = 0;
  let js = 0;
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue;
    const path = join(dir, name);
    if (!statSync(path).isFile()) continue;
    const buf = readFileSync(path);
    bytes += buf.length;
    const text = buf.toString("utf8");
    if (/https?:\/\//i.test(text)) throw new Error(`dashboard/${name} contains a network address`);
    if (name.endsWith(".html")) html += 1;
    if (name.endsWith(".css")) css += 1;
    if (name.endsWith(".js")) js += 1;
  }
  if (html < 1 || css < 1 || js < 1) throw new Error("dashboard needs one html, one css, and one js file");
  if (bytes > 65_536) throw new Error(`dashboard source is ${bytes} bytes, over 64KB`);
  return bytes;
}

function fail(message: string): never {
  process.stderr.write(`fathom: ${message}\n`);
  process.exit(1);
}

const input = snapshotFile(option("input", "/input"));
if (!existsSync(input)) fail(`no snapshot at ${input}`);

const output = option("output", process.env.MAKEFUN_OUTPUT_DIR ?? "/output");
const snapshot = loadSnapshot(readFileSync(input, "utf8"));
const scored = scoreBoard(snapshot);
const problem = explainBoardProblem(scored.rows, snapshot.watchlist);
if (problem) fail(problem);

const dashBytes = assertDashboard(join(root, "dashboard"));
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "board.json"), toBoardJson(scored.rows));
writeFileSync(join(output, "data.js"), toDataScript(scored.page));
mirrorFlat(join(root, "dashboard"), join(output, "dashboard"));
const shots = mirrorFlat(join(root, "screenshots"), join(output, "screenshots"));
if (shots.length < 3) fail(`screenshots/ has ${shots.length} images; need the board, a detail view, and a filtered view`);

const dossier = buildDossier(output, {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
});
writeFileSync(join(output, "dossier.json"), dossier);

const top = scored.rows[0];
const last = scored.rows[scored.rows.length - 1];
const lens = scored.rows.flatMap((row) => row.farm_steps.map((step) => step.trim().length));
const shortest = Math.min(...lens);
const longest = Math.max(...lens);
process.stdout.write(
  `fathom: ${scored.page.n_protocols} protocols, ${scored.page.n_watchlist} watchlist, ${scored.rows.length} rows, ${scored.page.n_screened_out} screened out, ${scored.page.n_comps} comparables\n` +
    `fathom: implied ${top?.implied_value_usd ?? 0} down to ${last?.implied_value_usd ?? 0}; farm steps ${shortest}-${longest} chars; dashboard ${dashBytes} bytes\n` +
    `fathom: wrote board.json, data.js, dashboard/, screenshots/ (${shots.length}), dossier.json (${dossier.length} bytes)\n`,
);
