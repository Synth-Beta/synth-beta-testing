/**
 * Slack slash commands for Synth PM: /task and /notes
 *
 * Request URL: https://join.getsynth.app/api/slack-pm/commands
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
import { HELP_TEXT, parseTaskCommand } from '../_lib/slackPm/parse.js';
import {
  createProject,
  createTask,
  findProject,
  formatTaskLine,
  getTaskByCode,
  listProjects,
  listTasks,
  setTaskStatus,
} from '../_lib/slackPm/tasks.js';
import { notesModalView, taskListMrkdwn } from '../_lib/slackPm/blocks.js';
import {
  bufferIncomingMessage,
  headerValue,
  parseFormBody,
  verifySlackSignature,
} from '../_lib/slackPm/verify.js';
import { processNotesText } from '../_lib/slackPm/processNotes.js';

const NOTES_HELP = `*How to use* \`/notes\`

1. *File:* upload a PDF, DOCX, or TXT in this channel, *then* run \`/notes\` (separate message — do not attach the file to the slash command)
2. *Paste:* \`/notes\` + your transcript/notes in the same command
3. *Modal:* \`/notes modal\`

Supported: pdf, docx, txt, md, csv, rtf`;

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
  const started = Date.now();
  try {
    if (req.method !== 'POST') {
      return sendJson(res, 405, { error: 'Method not allowed' });
    }

    const { signingSecret, botToken } = getSlackConfig();
    if (!signingSecret || !botToken) {
      console.error('[slack-pm/commands] missing SLACK_PM_* env');
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
      console.warn('[slack-pm/commands] bad signature', {
        bodyLen: rawBody.length,
        ms: Date.now() - started,
      });
      return sendText(res, 401, 'Unauthorized');
    }

    const form = parseFormBody(rawBody);
    const command = form.command || '';
    const cmdText = form.text || '';
    const userId = form.user_id;
    const teamId = form.team_id;
    const teamDomain = form.team_domain;
    const channelId = form.channel_id;
    const triggerId = form.trigger_id;
    const responseUrl = form.response_url;

    console.log('[slack-pm/commands]', { command, hasText: Boolean(cmdText.trim()), ms: Date.now() - started });

    if (command === '/notes') {
      const notesArg = cmdText.trim();
      const notesLower = notesArg.toLowerCase();

      if (notesLower === 'help') {
        return sendJson(res, 200, { response_type: 'ephemeral', text: NOTES_HELP });
      }

      if (notesLower === 'modal' || notesLower === 'paste') {
        const meta = JSON.stringify({ channel_id: channelId, user_id: userId, team_id: teamId });
        const opened = await slackApi('views.open', {
          trigger_id: triggerId,
          view: notesModalView(meta),
        });
        if (!opened.ok) {
          return sendJson(res, 200, {
            response_type: 'ephemeral',
            text: `Could not open modal (\`${opened.error || 'unknown'}\`). Paste with \`/notes your text here\` instead.`,
          });
        }
        return sendJson(res, 200, {
          response_type: 'ephemeral',
          text: 'Modal opened — paste short notes there, then *Extract tasks*.',
        });
      }

      // `/notes …plain text…`
      if (notesArg.length > 0) {
        waitUntil(
          (async () => {
            const supabaseBg = getSupabaseService();
            if (!supabaseBg) return;
            const workspace = await ensureWorkspace(supabaseBg, teamId, teamDomain);
            await upsertMember(supabaseBg, workspace.id, userId);
            const result = await processNotesText({
              supabase: supabaseBg,
              workspaceId: workspace.id,
              slackUserId: userId,
              channelId,
              title: null,
              notes: notesArg,
            });
            if (responseUrl) {
              // Clear the private "extracting…" ack; public result goes to the channel
              await fetch(responseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delete_original: true }),
              }).catch(() => undefined);
            }
            await slackApi('chat.postMessage', {
              channel: channelId,
              text: result.text,
              blocks: result.blocks,
            });
          })().catch(async (err) => {
            console.error('[slack-pm/commands] notes text', err);
            if (responseUrl) {
              await fetch(responseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  response_type: 'ephemeral',
                  text: `Notes extraction failed: ${(err as Error).message || 'unknown'}`,
                }),
              });
            }
          }),
        );
        return sendJson(res, 200, {
          response_type: 'ephemeral',
          text: 'Extracting action items from your pasted notes…',
        });
      }

      // Bare `/notes` → latest PDF/DOCX/TXT you uploaded in this channel
      waitUntil(
        (async () => {
          const supabaseBg = getSupabaseService();
          if (!supabaseBg) {
            if (responseUrl) {
              await fetch(responseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  response_type: 'ephemeral',
                  text: 'Database not configured.',
                }),
              });
            }
            return;
          }

          const workspace = await ensureWorkspace(supabaseBg, teamId, teamDomain);
          await upsertMember(supabaseBg, workspace.id, userId);

          try {
            const { loadLatestNotesFileText } = await import('../_lib/slackPm/notesIntake.js');
            const { file, text: notes } = await loadLatestNotesFileText({
              channelId,
              userId,
            });
            const result = await processNotesText({
              supabase: supabaseBg,
              workspaceId: workspace.id,
              slackUserId: userId,
              channelId,
              title: file.name || null,
              notes,
            });
            if (responseUrl) {
              await fetch(responseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delete_original: true }),
              }).catch(() => undefined);
            }
            await slackApi('chat.postMessage', {
              channel: channelId,
              text: `From file *${file.name}*\n${result.text || ''}`,
              blocks: result.blocks,
            });
          } catch (err) {
            if (responseUrl) {
              await fetch(responseUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  response_type: 'ephemeral',
                  text: `${(err as Error).message}\n\n${NOTES_HELP}`,
                }),
              });
            }
          }
        })().catch((err) => console.error('[slack-pm/commands] notes file', err)),
      );

      return sendJson(res, 200, {
        response_type: 'ephemeral',
        text:
          'Looking for your latest notes file in this channel (PDF / DOCX / TXT)… ' +
          'Upload the file here first if you haven’t, then `/notes` again. ' +
          'Or paste text: `/notes …` · Short modal: `/notes modal`',
      });
    }

    const supabase = getSupabaseService();
    if (!supabase) {
      return sendJson(res, 200, { response_type: 'ephemeral', text: 'Database not configured' });
    }

    const workspace = await ensureWorkspace(supabase, teamId, teamDomain);
    await upsertMember(supabase, workspace.id, userId);

    const parsed = parseTaskCommand(cmdText);

    if (parsed.kind === 'help' || parsed.kind === 'unknown') {
      return sendJson(res, 200, {
        response_type: 'ephemeral',
        text: parsed.kind === 'unknown' ? parsed.message : HELP_TEXT,
      });
    }

    if (parsed.kind === 'mine' || parsed.kind === 'list' || parsed.kind === 'org') {
      let projectId: string | null = null;
      if (parsed.kind === 'list' && parsed.projectRef) {
        const project = await findProject(supabase, workspace.id, parsed.projectRef);
        if (!project) {
          return sendJson(res, 200, {
            response_type: 'ephemeral',
            text: `Project not found: ${parsed.projectRef}`,
          });
        }
        projectId = project.id;
      }
      const assignee =
        parsed.kind === 'mine' ? userId : parsed.kind === 'list' ? parsed.personId : null;
      const tasks = await listTasks(supabase, {
        workspaceId: workspace.id,
        assigneeSlackUserId: assignee,
        projectId,
        limit: parsed.kind === 'org' ? 80 : 40,
      });
      const heading =
        parsed.kind === 'mine'
          ? `*Your open tasks* (${tasks.length})`
          : parsed.kind === 'org'
            ? `*Org open tasks* (${tasks.length})`
            : `*Open tasks* (${tasks.length})`;
      return sendJson(res, 200, {
        response_type: 'ephemeral',
        text: `${heading}\n${taskListMrkdwn(tasks)}`,
      });
    }

    if (parsed.kind === 'project_list') {
      const projects = await listProjects(supabase, workspace.id);
      if (!projects.length) {
        return sendJson(res, 200, {
          response_type: 'ephemeral',
          text: 'No projects yet. Create one with `/task project create "Name"`.',
        });
      }
      const lines = projects.map((p) => `\`${p.short_code}\` — *${p.name}*`).join('\n');
      return sendJson(res, 200, { response_type: 'ephemeral', text: `*Projects*\n${lines}` });
    }

    if (parsed.kind === 'project_create') {
      const project = await createProject(supabase, {
        workspaceId: workspace.id,
        name: parsed.name,
        createdBy: userId,
      });
      return sendJson(res, 200, {
        response_type: 'in_channel',
        text: `Created project \`${project.short_code}\` — *${project.name}*`,
      });
    }

    if (parsed.kind === 'assign') {
      let projectId: string | null = null;
      if (parsed.projectRef) {
        let project = await findProject(supabase, workspace.id, parsed.projectRef);
        if (!project) {
          project = await createProject(supabase, {
            workspaceId: workspace.id,
            name: parsed.projectRef,
            createdBy: userId,
          });
        }
        projectId = project.id;
      }
      if (parsed.assigneeId) {
        await upsertMember(supabase, workspace.id, parsed.assigneeId);
      }
      const task = await createTask(supabase, {
        workspaceId: workspace.id,
        title: parsed.title,
        assigneeSlackUserId: parsed.assigneeId,
        createdBy: userId,
        projectId,
        dueAt: parsed.due,
        source: 'manual',
      });
      const line = formatTaskLine(task);
      if (parsed.assigneeId && parsed.assigneeId !== userId) {
        waitUntil(
          slackApi('chat.postMessage', {
            channel: parsed.assigneeId,
            text: `You were assigned ${line}`,
          }).then(() => undefined),
        );
      }
      return sendJson(res, 200, { response_type: 'in_channel', text: `Assigned: ${line}` });
    }

    if (parsed.kind === 'status') {
      const task = await getTaskByCode(supabase, workspace.id, parsed.taskCode);
      if (!task) {
        return sendJson(res, 200, {
          response_type: 'ephemeral',
          text: `Task not found: \`${parsed.taskCode}\``,
        });
      }
      const updated = await setTaskStatus(supabase, task, parsed.status);
      return sendJson(res, 200, {
        response_type: 'in_channel',
        text: `Updated: ${formatTaskLine(updated)}`,
      });
    }

    if (parsed.kind === 'sub') {
      const parent = await getTaskByCode(supabase, workspace.id, parsed.parentCode);
      if (!parent) {
        return sendJson(res, 200, {
          response_type: 'ephemeral',
          text: `Parent task not found: \`${parsed.parentCode}\``,
        });
      }
      const task = await createTask(supabase, {
        workspaceId: workspace.id,
        title: parsed.title,
        parentTaskId: parent.id,
        projectId: parent.project_id,
        assigneeSlackUserId: parent.assignee_slack_user_id,
        createdBy: userId,
        source: 'manual',
      });
      return sendJson(res, 200, {
        response_type: 'in_channel',
        text: `Sub-task under \`${parent.short_code}\`: ${formatTaskLine(task)}`,
      });
    }

    return sendJson(res, 200, { response_type: 'ephemeral', text: HELP_TEXT });
  } catch (err) {
    console.error('[slack-pm/commands]', err);
    return sendJson(res, 200, {
      response_type: 'ephemeral',
      text: `Something went wrong: ${(err as Error).message || 'unknown error'}`,
    });
  }
}
