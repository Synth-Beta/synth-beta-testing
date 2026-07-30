import type { SupabaseClient } from '@supabase/supabase-js';
import { notesProposalBlocks } from './blocks.js';
import { extractActionItemsFromNotes, resolveAssigneeHint } from './extractNotes.js';
import { findProject } from './tasks.js';

export async function processNotesText(params: {
  supabase: SupabaseClient;
  workspaceId: string;
  slackUserId: string;
  channelId: string;
  title: string | null;
  notes: string;
}): Promise<{ response_type: 'ephemeral' | 'in_channel'; text?: string; blocks?: unknown[] }> {
  const { supabase, workspaceId, slackUserId, channelId, notes } = params;

  const { data: members } = await supabase
    .from('pm_members')
    .select('slack_user_id, display_name, real_name')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true);

  const extraction = await extractActionItemsFromNotes(notes, members || []);
  if (params.title) extraction.meeting_title = params.title;

  const previewLines: string[] = [];
  for (const item of extraction.action_items) {
    const assigneeId = resolveAssigneeHint(item.assignee_hint, members || []);
    const who = assigneeId
      ? `<@${assigneeId}>`
      : item.assignee_hint
        ? `_${item.assignee_hint}_`
        : '_unassigned_';
    const project = item.project_hint ? ` · #${item.project_hint}` : '';
    previewLines.push(`• ${item.title} (${who})${project}`);
  }

  const { data: note, error } = await supabase
    .from('pm_meeting_notes')
    .insert({
      workspace_id: workspaceId,
      title: extraction.meeting_title,
      raw_text: notes,
      channel_id: channelId,
      slack_user_id: slackUserId,
      extraction,
      status: 'proposed',
    })
    .select('id')
    .single();
  if (error) throw error;

  // Warm project lookups into extraction for confirm step
  for (const item of extraction.action_items) {
    if (!item.project_hint) continue;
    await findProject(supabase, workspaceId, item.project_hint);
  }

  return {
    response_type: 'in_channel',
    blocks: notesProposalBlocks({
      meetingNoteId: note.id,
      extraction,
      previewLines,
    }),
    text: `Proposed ${extraction.action_items.length} task(s) from meeting notes.`,
  };
}
