// Local copy of the gate the sealed scorer applies to board.json, plus the
// checks that the implied dollars, the confidence label and the chain plan still hold.

import type { LaunchRow } from "./types.ts";
import { impliedDollars, VALUE_CAP } from "./value.ts";

const CONFIDENCE = new Set(["High", "Fair", "Thin", "Unanchored"]);

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
    if (!CONFIDENCE.has(row.confidence)) return `${row.slug} confidence is missing`;
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) return `${row.slug} has ${row.farm_steps.length} farm steps`;
    const chain = row.chains[0] ?? "";
    for (const step of row.farm_steps) {
      const text = step.trim();
      if (text.length < 20 || text.length > 600) return `${row.slug} farm step length ${text.length}`;
      if (!/\$\d/.test(text) || !/\b(?:minute|minutes|hour|hours|day|days)\b/.test(text)) {
        return `${row.slug} farm step lacks a cost or a time`;
      }
      if (chain && !text.includes(chain)) return `${row.slug} farm step does not name ${chain}`;
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
