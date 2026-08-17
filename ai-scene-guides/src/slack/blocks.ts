import type { CandidateMessage, ConversationPlanRecord } from '../types.js';

type SlackBlock = Record<string, unknown>;

const FAIL_REASONS = [
  'unsupported_or_incorrect_fact',
  'stale_or_weak_source',
  'reddit_overstates_consensus',
  'wrong_timing_or_trigger',
  'wrong_genre_or_room',
  'unnatural_voice',
  'personas_too_similar',
  'repetitive_or_low_value',
  'fake_firsthand_or_identity',
  'missing_ai_disclosure',
  'spoiler_failure',
  'excessive_volume_or_chain',
  'human_interruption_failure',
  'safety_or_moderation',
  'other',
] as const;

export function buildPlanParentBlocks(plan: ConversationPlanRecord): {
  text: string;
  blocks: SlackBlock[];
} {
  const segment = plan.draft.dataSegment.toUpperCase();
  const text = `[${segment}] AI Scene Guide plan ${plan.id.slice(0, 8)} — ${plan.draft.genreId} ${plan.draft.triggerType}`;
  const blocks: SlackBlock[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `AI Scene Guide plan (${segment})`, emoji: true },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Plan ID*\n\`${plan.id}\`` },
        { type: 'mrkdwn', text: `*Status*\n${plan.status}` },
        { type: 'mrkdwn', text: `*Genre / room*\n${plan.draft.genreId} / ${plan.draft.roomId}` },
        { type: 'mrkdwn', text: `*Trigger*\n${plan.draft.triggerType}` },
        { type: 'mrkdwn', text: `*Objective*\n${plan.draft.objective}` },
        { type: 'mrkdwn', text: `*Messages*\n${plan.candidates.length}` },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Why generated*\n${plan.draft.whyGenerated}\n\n*AI disclosure*\nAll guides labeled *AI Scene Guide* (never human-impersonating).`,
      },
    },
    {
      type: 'actions',
      block_id: `plan_actions_${plan.id}`,
      elements: [
        {
          type: 'button',
          action_id: 'shadow_fail_plan',
          text: { type: 'plain_text', text: 'FAIL PLAN' },
          style: 'danger',
          value: plan.id,
        },
        {
          type: 'button',
          action_id: 'shadow_simulate_human',
          text: { type: 'plain_text', text: 'SIMULATE HUMAN MESSAGE' },
          value: plan.id,
        },
      ],
    },
  ];
  return { text, blocks };
}

export function buildCandidateBlocks(
  plan: ConversationPlanRecord,
  candidate: CandidateMessage,
): { text: string; blocks: SlackBlock[] } {
  const outcome = candidate.publisherDecision;
  const blocked = outcome === 'rejected' || outcome === 'suppressed';
  const header = blocked
    ? `BLOCKED — WOULD NOT PUBLISH (${outcome})`
    : `CANDIDATE — ${outcome.toUpperCase()}`;
  const verifierSummary = candidate.verifier.checks
    .map((c) => `${c.ok ? '✓' : '✗'} ${c.code}`)
    .join(' · ');
  const spoiler = candidate.message.containsSetlistSpoiler
    ? '\n_Spoiler-protected setlist content_'
    : '';

  const text = `${header}: ${candidate.message.text}`;
  const blocks: SlackBlock[] = [
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*${header}*\n*AI Scene Guide* · intent \`${candidate.message.intent}\` · conf ${candidate.message.confidence}\n\n>${candidate.message.text}${spoiler}`,
      },
    },
    {
      type: 'section',
      fields: [
        { type: 'mrkdwn', text: `*Candidate*\n\`${candidate.id}\`` },
        { type: 'mrkdwn', text: `*Publish at*\n${candidate.intendedPublishAt}` },
        {
          type: 'mrkdwn',
          text: `*Cited facts*\n${candidate.message.citedFactIds.map((id) => `\`${id}\``).join(', ') || '_none_'}`,
        },
        {
          type: 'mrkdwn',
          text: `*Suppression*\n${candidate.suppressionReason ?? '_n/a_'}`,
        },
      ],
    },
    {
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Verifier: ${verifierSummary}` }],
    },
    {
      type: 'actions',
      block_id: `cand_actions_${candidate.id}`,
      elements: [
        {
          type: 'button',
          action_id: 'shadow_pass',
          text: { type: 'plain_text', text: 'PASS' },
          style: 'primary',
          value: JSON.stringify({ planId: plan.id, candidateId: candidate.id }),
        },
        {
          type: 'button',
          action_id: 'shadow_fail',
          text: { type: 'plain_text', text: 'FAIL' },
          style: 'danger',
          value: JSON.stringify({ planId: plan.id, candidateId: candidate.id }),
        },
        {
          type: 'button',
          action_id: 'shadow_flag',
          text: { type: 'plain_text', text: 'FLAG' },
          value: JSON.stringify({ planId: plan.id, candidateId: candidate.id }),
        },
        {
          type: 'button',
          action_id: 'shadow_add_note',
          text: { type: 'plain_text', text: 'ADD NOTE' },
          value: JSON.stringify({ planId: plan.id, candidateId: candidate.id }),
        },
      ],
    },
  ];
  return { text, blocks };
}

export function buildFailReasonModal(payload: {
  planId: string;
  candidateId?: string;
  action: 'fail' | 'flag';
}): Record<string, unknown> {
  return {
    type: 'modal',
    callback_id: `shadow_${payload.action}_reason`,
    private_metadata: JSON.stringify(payload),
    title: { type: 'plain_text', text: payload.action === 'fail' ? 'Fail reason' : 'Flag reason' },
    submit: { type: 'plain_text', text: 'Submit' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'reason',
        label: { type: 'plain_text', text: 'Reason' },
        element: {
          type: 'static_select',
          action_id: 'reason_select',
          options: FAIL_REASONS.map((r) => ({
            text: { type: 'plain_text', text: r.slice(0, 75) },
            value: r,
          })),
        },
      },
      {
        type: 'input',
        block_id: 'note',
        optional: true,
        label: { type: 'plain_text', text: 'Note' },
        element: { type: 'plain_text_input', action_id: 'note_input', multiline: true },
      },
    ],
  };
}

export { FAIL_REASONS };
