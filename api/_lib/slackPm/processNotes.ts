import type { SupabaseClient } from '@supabase/supabase-js';
import { notesProposalBlocks } from './blocks.js';
import { syncChannelMembers } from './client.js';
import { extractActionItemsFromNotes } from './extractNotes.js';
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

  // Prefer live channel roster so people pickers + name matching work
  let members = await syncChannelMembers(supabase, workspaceId, channelId);
  if (!members.length) {
    const { data } = await supabase
      .from('pm_members')
      .select('slack_user_id, display_name, real_name')
      .eq('workspace_id', workspaceId)
      .eq('is_active', true);
    members = data || [];
  }

  const extraction = await extractActionItemsFromNotes(notes, members);
  if (params.title) extraction.meeting_title = params.title;

  const assigned = extraction.action_items.filter((i) => i.assignee_slack_user_id).length;

  // Remember this channel for digests if unset
  await supabase
    .from('pm_workspaces')
    .update({ digest_channel_id: channelId })
    .eq('id', workspaceId)
    .is('digest_channel_id', null);

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

  for (const item of extraction.action_items) {
    if (!item.project_hint) continue;
    await findProject(supabase, workspaceId, item.project_hint);
  }

  return {
    response_type: 'in_channel',
    blocks: notesProposalBlocks({
      meetingNoteId: note.id,
      extraction,
    }),
    text:
      `Proposed ${extraction.action_items.length} task(s) from meeting notes` +
      (assigned ? ` · auto-assigned ${assigned}` : '') +
      `. Review assignees, then Create tasks.`,
  };
}
