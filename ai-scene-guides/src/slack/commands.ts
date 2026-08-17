import { isReviewerAllowed } from './verify.js';
import { runFixturePipeline } from '../pipeline/run.js';
import type { ConversationPlanRecord } from '../types.js';

export type ShadowCommand =
  | { type: 'status' }
  | { type: 'pause' }
  | { type: 'resume' }
  | { type: 'kill'; confirm: string }
  | { type: 'sample'; genre: string }
  | { type: 'export' }
  | { type: 'unknown'; raw: string };

export interface ShadowPilotState {
  paused: boolean;
  killed: boolean;
  killActor?: string;
  killReason?: string;
  day: number;
  reviewed: number;
  reviewable: number;
  passed: number;
  failed: number;
  criticalFailures: number;
}

export const defaultPilotState = (): ShadowPilotState => ({
  paused: false,
  killed: false,
  day: 0,
  reviewed: 0,
  reviewable: 0,
  passed: 0,
  failed: 0,
  criticalFailures: 0,
});

let pilotState = defaultPilotState();

export function getPilotState(): ShadowPilotState {
  return { ...pilotState };
}

export function resetPilotState(): void {
  pilotState = defaultPilotState();
}

export function parseShadowCommand(text: string): ShadowCommand {
  const parts = text.trim().split(/\s+/);
  const cmd = (parts[0] || '').toLowerCase();
  if (cmd === 'status') return { type: 'status' };
  if (cmd === 'pause') return { type: 'pause' };
  if (cmd === 'resume') return { type: 'resume' };
  if (cmd === 'kill') return { type: 'kill', confirm: parts.slice(1).join(' ') };
  if (cmd === 'sample') return { type: 'sample', genre: parts[1] || 'indie' };
  if (cmd === 'export') return { type: 'export' };
  return { type: 'unknown', raw: text };
}

export async function handleShadowCommand(options: {
  text: string;
  userId: string;
  allowlist: string[];
}): Promise<{ response: string; samplePlan?: ConversationPlanRecord }> {
  if (!isReviewerAllowed(options.userId, options.allowlist)) {
    return { response: 'Unauthorized: you are not on the AI shadow reviewer allowlist.' };
  }

  const cmd = parseShadowCommand(options.text);
  switch (cmd.type) {
    case 'status': {
      const s = pilotState;
      const rate = s.reviewable ? Math.round((s.passed / s.reviewable) * 100) : 0;
      return {
        response: [
          `*AI Scene Guides shadow status*`,
          `Day ${s.day} · paused=${s.paused} · killed=${s.killed}`,
          `Queue: reviewed ${s.reviewed}/${s.reviewable} · pass rate ~${rate}%`,
          `Critical failures: ${s.criticalFailures}`,
          `Mode is Slack-only — no Synth chat writes.`,
        ].join('\n'),
      };
    }
    case 'pause':
      pilotState.paused = true;
      return { response: 'Shadow generation/delivery paused. Audit records retained.' };
    case 'resume':
      if (pilotState.killed) {
        return { response: 'Cannot resume after kill — restart process and clear kill state.' };
      }
      pilotState.paused = false;
      return { response: 'Shadow generation/delivery resumed.' };
    case 'kill':
      if (cmd.confirm !== 'CONFIRM KILL') {
        return {
          response: 'Type `/synth-shadow kill CONFIRM KILL` to engage the kill switch.',
        };
      }
      pilotState.killed = true;
      pilotState.paused = true;
      pilotState.killActor = options.userId;
      pilotState.killReason = 'slash_command';
      return { response: `Kill switch engaged by <@${options.userId}>. Generation and delivery stopped.` };
    case 'sample': {
      if (pilotState.killed || pilotState.paused) {
        return { response: 'Pilot paused/killed — sample not enqueued.' };
      }
      const genreMap: Record<string, string> = {
        indie: 'upcoming-indie',
        'hip-hop': 'hiphop-setlist-complete',
        edm: 'electronic-no-setlist',
        metal: 'metal-humans-active',
        pop: 'pop-stale-setlist',
      };
      const fixture = genreMap[cmd.genre] ?? 'upcoming-indie';
      const samplePlan = await runFixturePipeline({ fixtureScenario: fixture });
      pilotState.reviewable += samplePlan.candidates.length;
      return {
        response: `Enqueued labeled *fixture* sample for ${cmd.genre} (${fixture}). Plan \`${samplePlan.id}\`.`,
        samplePlan,
      };
    }
    case 'export':
      return {
        response: JSON.stringify(
          {
            exportedAt: new Date().toISOString(),
            state: pilotState,
            note: 'Full CSV/JSON export writes via API route; no credentials included.',
          },
          null,
          2,
        ),
      };
    default:
      return {
        response:
          'Usage: `/synth-shadow status|pause|resume|kill|sample <genre>|export`',
      };
  }
}

export type ShadowReviewLabel = 'pass' | 'fail' | 'flag';

export interface ShadowReviewRecord {
  planId: string;
  candidateMessageId?: string;
  reviewerSlackUserId: string;
  label: ShadowReviewLabel;
  reason?: string;
  note?: string;
  createdAt: string;
}

const reviewHistory: ShadowReviewRecord[] = [];

export function recordReview(review: ShadowReviewRecord): void {
  reviewHistory.push(review);
  pilotState.reviewed += 1;
  if (review.label === 'pass') pilotState.passed += 1;
  if (review.label === 'fail') pilotState.failed += 1;
}

export function getReviewHistory(): ShadowReviewRecord[] {
  return [...reviewHistory];
}

export function buildAppHomeView(state: ShadowPilotState): Record<string, unknown> {
  return {
    type: 'home',
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'AI Scene Guides — Shadow Review' },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `Day *${state.day}* · reviewed *${state.reviewed}* · pass *${state.passed}* · fail *${state.failed}* · critical *${state.criticalFailures}*\nFilters: unreviewed / passed / failed / flagged / suppressed (use thread buttons).`,
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Slack is the only publish destination during the pilot. No Synth production posting.',
          },
        ],
      },
    ],
  };
}
