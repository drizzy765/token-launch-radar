// Fathom v2. Read the sealed snapshot, score it, and write the board the gate reads.
// Local run: MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { explainBoardProblem, loadSnapshot, scoreBoard, toBoardJson, toDataScript } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

const root = dirname(fileURLToPath(import.meta.url));

const dossierCaps = {
  text_max_bytes: 65_536,
  screenshots: { max: 4, max_bytes: 524_288 },
  dashboard: { max_files: 400, max_bytes: 4_194_304 },
};

function flag(name: string, fallback: string): string {
  const exact = `--${name}`;
  const prefix = `${exact}=`;
  for (let i = 2; i < process.argv.length; i += 1) {
    const arg = process.argv[i] ?? "";
    if (arg === exact) return process.argv[i + 1] ?? fallback;
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
  }
  return fallback;
}

function snapshotPath(raw: string): string {
  return raw.endsWith(".json") ? raw : join(raw, "snapshot.json");
}

function copyFlat(fromDir: string, toDir: string): string[] {
  mkdirSync(toDir, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(fromDir).filter((entry) => !entry.startsWith(".")).sort()) {
    const from = join(fromDir, name);
    if (!statSync(from).isFile()) continue;
    writeFileSync(join(toDir, name), readFileSync(from));
    copied.push(name);
  }
  return copied;
}

function dashboardBytes(dir: string): number {
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
    if (/https?:\/\//i.test(buf.toString("utf8"))) throw new Error(`dashboard/${name} contains a network address`);
    if (name.endsWith(".html")) html += 1;
    if (name.endsWith(".css")) css += 1;
    if (name.endsWith(".js")) js += 1;
  }
  if (html < 1 || css < 1 || js < 1) throw new Error("dashboard needs one html, one css, and one js file");
  if (bytes > 65_536) throw new Error(`dashboard source is ${bytes} bytes, over 64KB`);
  return bytes;
}

function halt(message: string): never {
  process.stderr.write(`fathom: ${message}\n`);
  process.exit(1);
}

const input = snapshotPath(flag("input", "/input"));
if (!existsSync(input)) halt(`no snapshot at ${input}`);

const output = flag("output", process.env.MAKEFUN_OUTPUT_DIR ?? "/output");
const snapshot = loadSnapshot(readFileSync(input, "utf8"));
const scored = scoreBoard(snapshot);
const problem = explainBoardProblem(scored.rows, snapshot.watchlist);
if (problem) halt(problem);

const dashBytes = dashboardBytes(join(root, "dashboard"));
mkdirSync(output, { recursive: true });
writeFileSync(join(output, "board.json"), toBoardJson(scored.rows));
writeFileSync(join(output, "data.js"), toDataScript(scored.page));
copyFlat(join(root, "dashboard"), join(output, "dashboard"));
const shots = copyFlat(join(root, "screenshots"), join(output, "screenshots"));
if (shots.length < 3) halt(`screenshots/ has ${shots.length} images; need the board, a detail view, and a filtered view`);

const dossier = buildDossier(output, dossierCaps);
writeFileSync(join(output, "dossier.json"), dossier);

const top = scored.rows[0];
const last = scored.rows.at(-1);
const lengths = scored.rows.flatMap((row) => row.farm_steps.map((step) => step.trim().length));
process.stdout.write(
  `fathom: ${scored.page.n_protocols} protocols, ${scored.page.n_watchlist} watchlist, ${scored.rows.length} rows, ${scored.page.n_screened_out} screened out, ${scored.page.n_comps} comparables\n` +
    `fathom: implied ${top?.implied_value_usd ?? 0} down to ${last?.implied_value_usd ?? 0}; farm steps ${Math.min(...lengths)}-${Math.max(...lengths)} chars; dashboard ${dashBytes} bytes\n` +
    `fathom: wrote board.json, data.js, dashboard/, screenshots/ (${shots.length}), dossier.json (${dossier.length} bytes)\n`,
);
