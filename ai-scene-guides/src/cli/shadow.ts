#!/usr/bin/env node
/**
 * Local shadow dry-run — builds Slack Block Kit payloads without posting
 * unless AI_SCENE_GUIDES_MODE=shadow_slack and --post with credentials.
 */
import { runFixturePipeline } from '../pipeline/run.js';
import { buildPlanParentBlocks, buildCandidateBlocks } from '../slack/blocks.js';
import { getShadowSlackConfig, loadEnvSettings } from '../config.js';
import { postSlackMessage } from '../slack/client.js';

function arg(name: string, fallback?: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return fallback;
  return process.argv[idx + 1] ?? fallback;
}

async function main() {
  const fixture = arg('--fixture', 'upcoming-indie')!;
  const simulateHuman = process.argv.includes('--simulate-human');
  const forcePost = process.argv.includes('--post');

  const plan = await runFixturePipeline({ fixtureScenario: fixture, simulateHuman });
  const parent = buildPlanParentBlocks(plan);
  console.log('=== parent card ===');
  console.log(JSON.stringify(parent, null, 2));

  for (const c of plan.candidates) {
    console.log(`=== candidate ${c.id} ===`);
    console.log(JSON.stringify(buildCandidateBlocks(plan, c), null, 2));
  }

  const settings = loadEnvSettings();
  const slack = getShadowSlackConfig();
  if (forcePost && settings.mode === 'shadow_slack' && slack) {
    const parentRes = await postSlackMessage({
      token: slack.botToken,
      channel: slack.feedChannelId,
      blocks: parent.blocks,
      text: parent.text,
    });
    console.log('Posted parent', parentRes.ts);
    for (const c of plan.candidates) {
      const card = buildCandidateBlocks(plan, c);
      await postSlackMessage({
        token: slack.botToken,
        channel: slack.feedChannelId,
        threadTs: parentRes.ts,
        blocks: card.blocks,
        text: card.text,
      });
    }
  } else {
    console.log(
      '\n(Dry Slack delivery — pass --post with AI_SCENE_GUIDES_MODE=shadow_slack and Slack env to deliver)',
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
