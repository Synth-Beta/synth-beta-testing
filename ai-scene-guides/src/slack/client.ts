export async function postSlackMessage(options: {
  token: string;
  channel: string;
  text: string;
  blocks?: Record<string, unknown>[];
  threadTs?: string;
}): Promise<{ ts: string; channel: string }> {
  const body: Record<string, unknown> = {
    channel: options.channel,
    text: options.text,
  };
  if (options.blocks) body.blocks = options.blocks;
  if (options.threadTs) body.thread_ts = options.threadTs;

  const res = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string; ts?: string; channel?: string };
  if (!json.ok || !json.ts) {
    throw new Error(`Slack chat.postMessage failed: ${json.error ?? res.status}`);
  }
  return { ts: json.ts, channel: json.channel ?? options.channel };
}

export async function publishAppHome(options: {
  token: string;
  userId: string;
  view: Record<string, unknown>;
}): Promise<void> {
  const res = await fetch('https://slack.com/api/views.publish', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ user_id: options.userId, view: options.view }),
  });
  const json = (await res.json()) as { ok?: boolean; error?: string };
  if (!json.ok) throw new Error(`views.publish failed: ${json.error}`);
}
