#!/usr/bin/env node
import { seedPersonas } from '../seed/personas.js';
import { writeFileSync, mkdirSync } from 'fs';
import { resolve } from 'path';

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

const genre = arg('--genre', 'indie')!;
const count = Number(arg('--count', '75'));
const seed = Number(arg('--seed', '42'));
const outDir = arg('--out', resolve(process.cwd(), 'state'));

const { personas, warnings } = seedPersonas({ genreId: genre, count, seed });

mkdirSync(outDir!, { recursive: true });
const outPath = resolve(outDir!, `personas-${genre}-${seed}.json`);
writeFileSync(
  outPath,
  JSON.stringify(
    {
      genre,
      seed,
      count: personas.length,
      generatedAt: new Date().toISOString(),
      warnings,
      personas,
    },
    null,
    2,
  ),
);

console.log(`Seeded ${personas.length} AI Scene Guide personas for ${genre} (seed=${seed})`);
console.log(`Wrote ${outPath}`);
if (warnings.length) {
  console.log('Warnings:');
  for (const w of warnings) console.log(`  - ${w}`);
}
console.log('No Auth credentials, followers, or social graph created.');
