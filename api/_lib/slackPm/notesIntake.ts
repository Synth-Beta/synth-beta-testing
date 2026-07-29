import { getSlackConfig, slackApi } from './client.js';

export type SlackFile = {
  id: string;
  name: string;
  mimetype?: string;
  filetype?: string;
  pretty_type?: string;
  url_private_download?: string;
  url_private?: string;
  user?: string;
  channels?: string[];
  groups?: string[];
};

const SUPPORTED_EXT = [
  'pdf',
  'doc',
  'docx',
  'txt',
  'md',
  'markdown',
  'rtf',
  'csv',
  'text',
] as const;

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i + 1).toLowerCase() : '';
}

export function isSupportedNotesFile(file: SlackFile): boolean {
  const name = (file.name || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  const type = (file.filetype || '').toLowerCase();
  const pretty = (file.pretty_type || '').toLowerCase();
  const ext = extOf(name);

  if (SUPPORTED_EXT.includes(ext as (typeof SUPPORTED_EXT)[number])) return true;
  if (type === 'pdf' || mime === 'application/pdf' || pretty === 'pdf') return true;
  if (type === 'docx' || mime.includes('wordprocessingml')) return true;
  if (type === 'doc' || mime === 'application/msword') return true;
  if (mime.startsWith('text/')) return true;
  if (type === 'text' || type === 'plain_text') return true;
  // Slack sometimes stores exports as binary with a .pdf name only
  if (name.includes('standup') && (ext === 'pdf' || !ext)) return true;
  return false;
}

function fileOwnedBy(file: SlackFile, userId: string): boolean {
  return !file.user || file.user === userId;
}

/** Newest supported notes file from this user in the channel. */
export async function findLatestUserNotesFile(params: {
  channelId: string;
  userId: string;
  lookbackMessages?: number;
}): Promise<SlackFile | null> {
  const history = await slackApi<{
    messages?: Array<{
      user?: string;
      subtype?: string;
      files?: SlackFile[];
      upload?: boolean;
    }>;
  }>('conversations.history', {
    channel: params.channelId,
    limit: params.lookbackMessages ?? 100,
  });

  if (!history.ok) {
    console.warn('[slack-pm/notes-file] conversations.history failed', history.error);
    if (history.error === 'not_in_channel' || history.error === 'channel_not_found') {
      throw new Error(
        `I can’t see files here yet — invite me with \`/invite @PM to-do\`, upload the PDF as a normal message, then run \`/notes\` again.`,
      );
    }
  } else {
    for (const msg of history.messages || []) {
      const files = msg.files || [];
      for (const file of files) {
        if (!isSupportedNotesFile(file)) continue;
        // Prefer files this user uploaded (message author or file.user)
        if (msg.user === params.userId || fileOwnedBy(file, params.userId)) {
          return file;
        }
      }
    }
    // Second pass: any supported file in channel (someone else uploaded for the meeting)
    for (const msg of history.messages || []) {
      for (const file of msg.files || []) {
        if (isSupportedNotesFile(file)) return file;
      }
    }
  }

  // Channel-scoped file list
  const listedChannel = await slackApi<{ files?: SlackFile[] }>('files.list', {
    channel: params.channelId,
    user: params.userId,
    count: 20,
  });
  if (listedChannel.ok) {
    const match = (listedChannel.files || []).find((f) => isSupportedNotesFile(f));
    if (match) return match;
  }

  // User’s recent files anywhere the bot can see
  const listedUser = await slackApi<{ files?: SlackFile[] }>('files.list', {
    user: params.userId,
    count: 30,
  });
  if (listedUser.ok) {
    const inChannel = (listedUser.files || []).find((f) => {
      if (!isSupportedNotesFile(f)) return false;
      const chans = [...(f.channels || []), ...(f.groups || [])];
      return chans.length === 0 || chans.includes(params.channelId);
    });
    if (inChannel) return inChannel;
    const any = (listedUser.files || []).find((f) => isSupportedNotesFile(f));
    if (any) return any;
  }

  return null;
}

export async function downloadSlackFile(file: SlackFile): Promise<Buffer> {
  const token = getSlackConfig().botToken;
  if (!token) throw new Error('SLACK_PM_BOT_TOKEN not configured');

  const info = await slackApi<{
    file?: SlackFile;
  }>('files.info', { file: file.id });

  const url =
    info.file?.url_private_download ||
    info.file?.url_private ||
    file.url_private_download ||
    file.url_private;
  if (!url) throw new Error(`No download URL for file ${file.id}`);

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Slack file download failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

async function extractPdf(buf: Buffer): Promise<string> {
  // unpdf works in Node/Vercel (pdf-parse v2 needs DOMMatrix / browser APIs)
  const { extractText } = await import('unpdf');
  const result = await extractText(new Uint8Array(buf), { mergePages: true });
  if (typeof result === 'string') return result.trim();
  if (Array.isArray(result)) return result.join('\n\n').trim();
  if (result && typeof result === 'object' && 'text' in result) {
    const t = (result as { text: string | string[] }).text;
    return (Array.isArray(t) ? t.join('\n\n') : String(t || '')).trim();
  }
  return String(result || '').trim();
}

async function extractDocx(buf: Buffer): Promise<string> {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer: buf });
  return (result.value || '').trim();
}

function extractPlain(buf: Buffer): string {
  return buf.toString('utf8').replace(/\0/g, '').trim();
}

export async function extractTextFromNotesFile(file: SlackFile, buf: Buffer): Promise<string> {
  const name = (file.name || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  const type = (file.filetype || '').toLowerCase();
  const ext = extOf(name);

  let text = '';
  if (ext === 'pdf' || type === 'pdf' || mime === 'application/pdf') {
    text = await extractPdf(buf);
  } else if (
    ext === 'docx' ||
    type === 'docx' ||
    mime.includes('wordprocessingml') ||
    mime.includes('officedocument.wordprocessingml')
  ) {
    text = await extractDocx(buf);
  } else if (ext === 'doc' || type === 'doc' || mime === 'application/msword') {
    throw new Error(
      'Old `.doc` files aren’t supported — save as `.docx` or `.pdf`, or paste plain text with `/notes …`.',
    );
  } else {
    text = extractPlain(buf);
  }

  if (!text) {
    throw new Error(
      `Couldn’t extract text from *${file.name}* (empty or image-only). Try a text PDF/DOCX or paste notes.`,
    );
  }
  return text.slice(0, 50000);
}

export async function loadLatestNotesFileText(params: {
  channelId: string;
  userId: string;
}): Promise<{ file: SlackFile; text: string }> {
  const file = await findLatestUserNotesFile(params);
  if (!file) {
    throw new Error(
      [
        'No PDF/DOCX/TXT file found in this channel.',
        '• Calendar / Granola cards don’t count — upload the actual file with the ＋ paperclip',
        '• Invite me: `/invite @PM to-do`',
        '• Then upload the file as a normal message, then run `/notes`',
        '• Or paste: `/notes …notes…`',
      ].join('\n'),
    );
  }
  const buf = await downloadSlackFile(file);
  const text = await extractTextFromNotesFile(file, buf);
  return { file, text };
}
