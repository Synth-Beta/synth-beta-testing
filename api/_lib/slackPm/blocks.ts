import type { NotesExtraction } from './extractNotes.js';
import type { PmTask } from './tasks.js';
import { formatTaskLine } from './tasks.js';

/** Proposal with a people-picker per task so the team can assign before Create. */
export function notesProposalBlocks(params: {
  meetingNoteId: string;
  extraction: NotesExtraction;
}) {
  const title = params.extraction.meeting_title || 'Meeting notes';
  const items = (params.extraction.action_items || []).slice(0, 12);
  const blocks: Record<string, unknown>[] = [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Proposed tasks: ${title}`.slice(0, 150), emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          `Found *${(params.extraction.action_items || []).length}* action item(s). ` +
          `Assignees are auto-matched from the notes when possible — adjust if needed, then *Create tasks*.`,
      },
    },
  ];

  items.forEach((item, index) => {
    const assignee =
      item.assignee_slack_user_id ||
      (item.assignee_hint && /^[UW][A-Z0-9]+$/i.test(item.assignee_hint)
        ? item.assignee_hint.toUpperCase()
        : null);
    const who = assignee
      ? ` · <@${assignee}>`
      : item.assignee_hint
        ? ` · _suggested: ${item.assignee_hint}_`
        : ' · _unassigned_';
    const project = item.project_hint ? ` · #${item.project_hint}` : '';
    const due = item.due_hint ? ` · due ${item.due_hint}` : '';

    const accessory: Record<string, unknown> = {
      type: 'users_select',
      action_id: 'pm_notes_assign',
      placeholder: { type: 'plain_text', text: 'Assign to…' },
    };
    if (assignee) accessory.initial_user = assignee;

    blocks.push({
      type: 'section',
      block_id: `asg_${params.meetingNoteId}_${index}`,
      text: {
        type: 'mrkdwn',
        text: `*${index + 1}.* ${item.title}${who}${project}${due}`.slice(0, 2900),
      },
      accessory,
    });
  });

  if ((params.extraction.action_items || []).length > items.length) {
    blocks.push({
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: `_Showing first ${items.length} — remaining will be created unassigned (edit with \`/task assign\`)._`,
        },
      ],
    });
  }

  blocks.push({
    type: 'actions',
    block_id: `notes_actions_${params.meetingNoteId}`,
    elements: [
      {
        type: 'button',
        action_id: 'pm_notes_confirm',
        text: { type: 'plain_text', text: 'Create tasks', emoji: true },
        style: 'primary',
        value: params.meetingNoteId,
      },
      {
        type: 'button',
        action_id: 'pm_notes_discard',
        text: { type: 'plain_text', text: 'Discard', emoji: true },
        style: 'danger',
        value: params.meetingNoteId,
      },
    ],
  });

  blocks.push({
    type: 'context',
    elements: [
      {
        type: 'mrkdwn',
        text: 'After create, reassign anytime: `/task assign @person T-XXXX` or `/task assign @person "Title"`',
      },
    ],
  });

  return blocks;
}

export function notesModalView(privateMetadata: string) {
  return {
    type: 'modal',
    callback_id: 'pm_notes_modal',
    private_metadata: privateMetadata,
    title: { type: 'plain_text', text: 'Upload meeting notes' },
    submit: { type: 'plain_text', text: 'Extract tasks' },
    close: { type: 'plain_text', text: 'Cancel' },
    blocks: [
      {
        type: 'input',
        block_id: 'notes_title',
        optional: true,
        label: { type: 'plain_text', text: 'Meeting title' },
        element: {
          type: 'plain_text_input',
          action_id: 'title',
          placeholder: { type: 'plain_text', text: 'Optional' },
        },
      },
      {
        type: 'input',
        block_id: 'notes_body',
        label: { type: 'plain_text', text: 'Notes / transcript' },
        hint: {
          type: 'plain_text',
          text: 'Paste here, then click Extract tasks (Slack limit ~3000 characters).',
        },
        element: {
          type: 'plain_text_input',
          action_id: 'body',
          multiline: true,
          max_length: 3000,
          placeholder: { type: 'plain_text', text: 'Paste meeting notes here…' },
        },
      },
    ],
  };
}

export function taskListMrkdwn(tasks: PmTask[]): string {
  if (!tasks.length) return '_No open tasks._';
  return tasks.map((t) => formatTaskLine(t)).join('\n');
}
