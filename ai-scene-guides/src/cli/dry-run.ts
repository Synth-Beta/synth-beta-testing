#!/usr/bin/env node
import { listFixtureScenarios } from '../adapters/fixture.js';
import { runFixturePipeline } from '../pipeline/run.js';

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

async function main() {
  const fixture = arg('--fixture', 'upcoming-indie')!;
  const simulateHuman = process.argv.includes('--simulate-human');

  if (fixture === 'list') {
    console.log(listFixtureScenarios().join('\n'));
    return;
  }

  const result = await runFixturePipeline({ fixtureScenario: fixture, simulateHuman });

  console.log(JSON.stringify(result, null, 2));
  console.log('\n--- summary ---');
  console.log(`planId=${result.id} status=${result.status} trigger=${result.draft.triggerType}`);
  console.log(`objective=${result.draft.objective} segment=${result.draft.dataSegment}`);
  console.log(`candidates=${result.candidates.length}`);
  for (const c of result.candidates) {
    console.log(
      `  [${c.publisherDecision}] ${c.message.disclosureLabel} — ${c.message.text}`,
    );
    if (c.suppressionReason) console.log(`    reason: ${c.suppressionReason}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
