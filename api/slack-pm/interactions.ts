/**
 * Slack interactivity for Synth PM (buttons + notes modal).
 *
 * Interactivity Request URL: https://join.getsynth.app/api/slack-pm/interactions
 *
 * Critical: view_submission must be acknowledged within ~3s.
 * Heavy work (OpenAI extract) runs after ack via waitUntil.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { waitUntil } from '@vercel/functions';
import {
  ensureWorkspace,
  getSlackConfig,
  getSupabaseService,
  slackApi,
  upsertMember,
} from '../_lib/slackPm/client.js';
import { createProject, createTask, findProject, formatTaskLine } from '../_lib/slackPm/tasks.js';
import { resolveAssigneeHint, type NotesExtraction } from '../_lib/slackPm/extractNotes.js';
import { processNotesText } from '../_lib/slackPm/processNotes.js';
import {
  bufferIncomingMessage,
  headerValue,
  parseFormBody,
  verifySlackSignature,
} from '../_lib/slackPm/verify.js';

export const config = {
  api: { bodyParser: false },
  maxDuration: 60,
};

function sendJson(res: VercelResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

function sendText(res: VercelResponse, status: number, body: string) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain');
  res.end(body);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const { signingSecret } = getSlackConfig();
    if (!signingSecret) {
      return sendText(res, 500, 'Slack PM not configured');
    }

    const rawBody = await bufferIncomingMessage(req);
    const ok = verifySlackSignature({
      signingSecret,
      signature: headerValue(req.headers, 'x-slack-signature'),
      timestamp: headerValue(req.headers, 'x-slack-request-timestamp'),
      rawBody,
    });
    if (!ok) {
      console.warn('[slack-pm/interactions] bad signature', { bodyLen: rawBody.length });
      return sendText(res, 401, 'Unauthorized');
    }

    const form = parseFormBody(rawBody);
    if (!form.payload) {
      return sendText(res, 400, 'Missing payload');
    }

    const payload = JSON.parse(form.payload) as {
      type: string;
      user: { id: string };
      team: { id: string; domain?: string };
      channel?: { id: string };
      container?: { channel_id?: string };
      view?: {
        callback_id?: string;
        private_metadata?: string;
        state?: { values?: Record<string, Record<string, { value?: string }>> };
      };
      actions?: { action_id: string; value?: string }[];
      response_url?: string;
    };

    // Modal submit — validate fast, ack immediately, extract in background
    if (payload.type === 'view_submission' && payload.view?.callback_id === 'pm_notes_modal') {
      const values = payload.view.state?.values || {};
      const title = values.notes_title?.title?.value || null;
      const body = values.notes_body?.body?.value || '';
      if (!body.trim()) {
        return sendJson(res, 200, {
          response_action: 'errors',
          errors: { notes_body: 'Paste some meeting notes first.' },
        });
      }

      let channelId = '';
      try {
        const meta = JSON.parse(payload.view.private_metadata || '{}') as { channel_id?: string };
        channelId = meta.channel_id || '';
      } catch {
        channelId = '';
      }

      const userId = payload.user.id;
      const teamId = payload.team.id;
      const teamDomain = payload.team.domain;
      const notesBody = body;
      const notesTitle = title;
      const targetChannel = channelId || userId;

      waitUntil(
        (async () => {
          const supabase = getSupabaseService();
          if (!supabase) {
            await slackApi('chat.postMessage', {
              channel: userId,
              text: 'Database not configured — cannot extract tasks.',
            });
            return;
          }

          const workspace = await ensureWorkspace(supabase, teamId, teamDomain);
          await upsertMember(supabase, workspace.id, userId);

          await slackApi('chat.postEphemeral', {
            channel: targetChannel,
            user: userId,
            text: 'Extracting action items from your meeting notes…',
          }).catch(() =>
            slackApi('chat.postMessage', {
              channel: userId,
              text: 'Extracting action items from your meeting notes…',
            }),
          );

          const result = await processNotesText({
            supabase,
            workspaceId: workspace.id,
            slackUserId: userId,
            channelId: targetChannel,
            title: notesTitle,
            notes: notesBody,
          });

          await slackApi('chat.postMessage', {
            channel: targetChannel,
            text: result.text,
            blocks: result.blocks,
          });
        })().catch(async (err) => {
          console.error('[slack-pm/interactions] notes extract', err);
          await slackApi('chat.postMessage', {
            channel: payload.user.id,
            text: `Notes extraction failed: ${(err as Error).message || 'unknown error'}`,
          });
        }),
      );

      // Ack within Slack's 3s window
      return sendJson(res, 200, { response_action: 'clear' });
    }

    const supabase = getSupabaseService();
    if (!supabase) return sendText(res, 500, 'Database not configured');

    const workspace = await ensureWorkspace(supabase, payload.team.id, payload.team.domain);
    await upsertMember(supabase, workspace.id, payload.user.id);

    if (payload.type === 'block_actions' && payload.actions?.[0]) {
      const action = payload.actions[0];
      const noteId = action.value;
      if (!noteId) return sendText(res, 200, '');

      // Ack buttons immediately; do DB work in background when heavy
      if (action.action_id === 'pm_notes_discard') {
        waitUntil(
          (async () => {
            await supabase
              .from('pm_meeting_notes')
              .update({ status: 'discarded' })
              .eq('id', noteId)
              .eq('workspace_id', workspace.id);
            if (payload.response_url) {
              await fetch(payload.response_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  replace_original: true,
                  text: 'Discarded proposed tasks from meeting notes.',
                }),
              });
            }
          })().catch((err) => console.error('[slack-pm/interactions] discard', err)),
        );
        return sendText(res, 200, '');
      }

      if (action.action_id === 'pm_notes_confirm') {
        const responseUrl = payload.response_url;
        const userId = payload.user.id;
        waitUntil(
          (async () => {
            const { data: note } = await supabase
              .from('pm_meeting_notes')
              .select('*')
              .eq('id', noteId)
              .eq('workspace_id', workspace.id)
              .maybeSingle();

            if (!note || note.status === 'confirmed') return;

            const extraction = (note.extraction || {
              meeting_title: null,
              action_items: [],
            }) as NotesExtraction;

            const { data: members } = await supabase
              .from('pm_members')
              .select('slack_user_id, display_name, real_name')
              .eq('workspace_id', workspace.id);

            const createdLines: string[] = [];
            for (const item of extraction.action_items || []) {
              let projectId: string | null = null;
              if (item.project_hint) {
                let project = await findProject(supabase, workspace.id, item.project_hint);
                if (!project) {
                  project = await createProject(supabase, {
                    workspaceId: workspace.id,
                    name: item.project_hint,
                    createdBy: userId,
                  });
                }
                projectId = project.id;
              }

              const assigneeId = resolveAssigneeHint(item.assignee_hint, members || []);
              if (assigneeId) await upsertMember(supabase, workspace.id, assigneeId);

              const task = await createTask(supabase, {
                workspaceId: workspace.id,
                title: item.title,
                assigneeSlackUserId: assigneeId,
                createdBy: userId,
                projectId,
                dueAt: item.due_hint ? `${item.due_hint}T17:00:00.000Z` : null,
                source: 'meeting',
                meetingNoteId: note.id,
              });
              createdLines.push(formatTaskLine(task));

              for (const sub of item.subtasks || []) {
                if (!sub.trim()) continue;
                const subTask = await createTask(supabase, {
                  workspaceId: workspace.id,
                  title: sub.trim(),
                  parentTaskId: task.id,
                  projectId,
                  assigneeSlackUserId: assigneeId,
                  createdBy: userId,
                  source: 'meeting',
                  meetingNoteId: note.id,
                });
                createdLines.push(formatTaskLine(subTask));
              }
            }

            await supabase
              .from('pm_meeting_notes')
              .update({ status: 'confirmed' })
              .eq('id', note.id);

            const msg =
              createdLines.length > 0
                ? `*Created ${createdLines.length} task(s) from meeting notes*\n${createdLines.join('\n')}`
                : 'No tasks created.';

            const channelId = payload.channel?.id || payload.container?.channel_id;

            if (channelId) {
              await slackApi('chat.postMessage', {
                channel: channelId,
                text: msg,
              });
            }

            if (responseUrl) {
              await fetch(responseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  delete_original: true,
                }),
              }).catch(() => undefined);
            }
          })().catch((err) => console.error('[slack-pm/interactions] confirm', err)),
        );
        return sendText(res, 200, '');
      }
    }

    return sendText(res, 200, '');
  } catch (err) {
    console.error('[slack-pm/interactions]', err);
    return sendText(res, 200, '');
  }
}
