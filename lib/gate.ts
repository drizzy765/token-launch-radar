// Fathom v3: Pre-submission validation gate.
// Replicates the competition scorer checks for board format, ranking integrity,
// watchlist coverage, farm step constraints, and mathematical identity.

import type { LaunchRow } from "./types.ts";
import { impliedDollars, VALUE_CAP } from "./value.ts";

const VALID_CONFIDENCE = new Set(["High", "Fair", "Thin", "Unanchored"]);
const TIME_UNIT_REGEX = /\b(?:minute|minutes|hour|hours|day|days)\b/;

/**
 * Validates the complete ranked board against competition rules:
 * - 100 to 4,000 rows
 * - Unique, non-empty slug & name
 * - Monotonically non-increasing implied value by rank (ranks 1..N)
 * - Positive whole-dollar implied value <= 100T
 * - 3 to 12 concrete farm steps per row (20-600 characters, mentioning gas cost & time)
 * - Chain name consistency in farm steps
 * - Mathematical identity reproduction in PPM
 * - 100% watchlist coverage
 */
export function explainBoardProblem(rows: LaunchRow[], watchlist: string[]): string | null {
  if (rows.length < 100 || rows.length > 4000) {
    return `Row count ${rows.length} is outside allowed range of 100 to 4000`;
  }

  const seenSlugs = new Set<string>();
  const sortedByRank = [...rows].sort((a, b) => a.rank - b.rank);

  for (let i = 0; i < sortedByRank.length; i += 1) {
    const row = sortedByRank[i]!;
    const expectedRank = i + 1;

    if (row.rank !== expectedRank) {
      return `Row ${row.slug} rank ${row.rank} does not match sequential index ${expectedRank}`;
    }
    if (seenSlugs.has(row.slug)) {
      return `Duplicate protocol slug encountered: ${row.slug}`;
    }
    seenSlugs.add(row.slug);

    if (!row.name || !row.name.trim()) {
      return `Protocol ${row.slug} has empty name`;
    }
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd < 1 || row.implied_value_usd > VALUE_CAP) {
      return `Protocol ${row.slug} implied value ${row.implied_value_usd} is not a valid positive whole dollar integer under ${VALUE_CAP}`;
    }
    if (i > 0 && row.implied_value_usd > sortedByRank[i - 1]!.implied_value_usd) {
      return `Implied value ascended at rank ${row.rank} (${row.slug}: ${row.implied_value_usd} > ${sortedByRank[i - 1]!.implied_value_usd})`;
    }
    if (!VALID_CONFIDENCE.has(row.confidence)) {
      return `Protocol ${row.slug} has invalid confidence label: ${row.confidence}`;
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `Protocol ${row.slug} has ${row.farm_steps.length} farm steps; expected between 3 and 12`;
    }

    const primaryChain = row.chains[0] ?? "";
    for (const step of row.farm_steps) {
      const trimmed = step.trim();
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `Protocol ${row.slug} farm step length ${trimmed.length} is outside allowed range of 20 to 600 chars`;
      }
      if (!/\$\d/.test(trimmed) || !TIME_UNIT_REGEX.test(trimmed)) {
        return `Protocol ${row.slug} farm step lacks required cost or duration: "${trimmed}"`;
      }
      if (primaryChain && !trimmed.includes(primaryChain)) {
        return `Protocol ${row.slug} farm step misses primary chain name ${primaryChain}`;
      }
    }

    // Verify mathematical identity
    const expectedDollars = impliedDollars(row.tvl_usd, [row.multiple_ppm, row.growth_ppm, row.age_ppm, row.chain_ppm]);
    if (expectedDollars !== row.implied_value_usd) {
      return `Protocol ${row.slug} implied value ${row.implied_value_usd} does not equal factor product ${expectedDollars}`;
    }
  }

  // Ensure diversity of valuations across board
  const uniqueValues = new Set(rows.map((row) => row.implied_value_usd));
  if (rows.length >= 2 && uniqueValues.size < 2) {
    return "All rows have identical implied value; ranking requires value differentiation";
  }

  // Ensure full coverage of watchlist
  for (const slug of watchlist) {
    if (!seenSlugs.has(slug)) {
      return `Watchlist protocol slug ${slug} is missing from the ranked board`;
    }
  }

  return null;
}
