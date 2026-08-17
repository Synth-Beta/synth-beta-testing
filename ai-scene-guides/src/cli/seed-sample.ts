#!/usr/bin/env tsx
/**
 * Quality sample seed — linked JamBase-grounded conversations with audit records.
 * Usage: npm run seed-sample -- --count 300 --out ./out/quality-sample.csv
 */
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { qualitySeedCsv, runQualitySeed } from '../pipeline/qualitySeed.js';

function arg(name: string, fallback?: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

const count = Number(arg('--count', '300'));
const seed = Number(arg('--seed', '42'));
const out = resolve(arg('--out', `./out/quality-sample-${count}.csv`)!);

const result = runQualitySeed({
  targetMessages: count,
  seed,
  includeHumanInterruptionDemo: true,
});

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, qualitySeedCsv(result.rows), 'utf8');

const unique = result.stats.uniqueTexts;
const dupRate = result.rows.length
  ? (1 - unique / result.rows.length) * 100
  : 0;

console.log(
  JSON.stringify(
    {
      written: result.rows.length,
      conversations: result.conversations,
      rejected: result.rejected,
      uniqueTexts: unique,
      exactDupRatePct: Number(dupRate.toFixed(2)),
      exactDupPrevented: result.stats.exactDupPrevented,
      quietHourPrevented: result.stats.quietHourPrevented,
      genres: result.stats.genres,
      out,
      sample: result.rows.slice(0, 3).map((r) => ({
        conversation_id: r.conversation_id,
        turn: r.turn_number,
        artist: r.artist_name,
        persona: r.persona_name,
        intent: r.intent,
        text: r.content,
      })),
    },
    null,
    2,
  ),
);

if (unique < result.rows.length * 0.9) {
  console.error('FAIL: unique text rate below 90%');
  process.exit(1);
}
if (result.rows.some((r) => !r.event_id || !r.artist_name || !r.venue_name)) {
  console.error('FAIL: missing event grounding on a row');
  process.exit(1);
}
if (result.rows.some((r) => /\b(this act|this bill|the listing)\b/i.test(r.content))) {
  console.error('FAIL: vague referent present');
  process.exit(1);
}
