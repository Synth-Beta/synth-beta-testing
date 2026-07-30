import type { NotesExtraction } from './extractNotes.js';
import type { PmTask } from './tasks.js';
import { formatTaskLine } from './tasks.js';

export function notesProposalBlocks(params: {
  meetingNoteId: string;
  extraction: NotesExtraction;
  previewLines: string[];
}) {
  const title = params.extraction.meeting_title || 'Meeting notes';
  const items = params.extraction.action_items || [];
  const listText =
    params.previewLines.length > 0
      ? params.previewLines.join('\n')
      : '_No action items found._';

  return [
    {
      type: 'header',
      text: { type: 'plain_text', text: `Proposed tasks: ${title}`.slice(0, 150), emoji: true },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `Found *${items.length}* action item(s). Confirm to create them in the org todo repo.`,
      },
    },
    {
      type: 'section',
      text: { type: 'mrkdwn', text: listText.slice(0, 2900) },
    },
    {
      type: 'actions',
      block_id: `notes_${params.meetingNoteId}`,
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
    },
  ];
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
