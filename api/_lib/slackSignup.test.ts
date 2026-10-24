/**
 * Run: node --experimental-strip-types --test api/_lib/slackSignup.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alertSignupIfNeeded, SLACK_SIGNUP_ALERT_META_KEY } from './slackSignup.ts';

// One users row; update(...).filter(flag is null) only matches while the flag is empty,
// like Postgres re-checking the WHERE under the row lock.
function fakeSupabase() {
  const row: { permissions_metadata: Record<string, unknown> } = { permissions_metadata: {} };
  const client = {
    from: () => ({
      update: (patch: { permissions_metadata: Record<string, unknown> }) => {
        let onlyIfUnflagged = false;
        const q = {
          eq: () => q,
          filter: () => ((onlyIfUnflagged = true), q),
          select: async () => {
            await new Promise((r) => setTimeout(r, 1));
            if (onlyIfUnflagged && row.permissions_metadata[SLACK_SIGNUP_ALERT_META_KEY]) return { data: [], error: null };
            row.permissions_metadata = patch.permissions_metadata;
            return { data: [{ user_id: 'u1' }], error: null };
          },
          then: (resolve: (v: unknown) => void) => {
            row.permissions_metadata = patch.permissions_metadata;
            resolve({ error: null });
          },
        };
        return q;
      },
    }),
  };
  return { client: client as never, row };
}

const signup = { user_id: 'u1', username: 'carolyn', permissions_metadata: {} };

test('three simultaneous signup triggers post exactly one Slack alert', async () => {
  const { client } = fakeSupabase();
  let posts = 0;
  const post = async () => ((posts += 1), { ok: true as const });
  const results = await Promise.all([1, 2, 3].map(() => alertSignupIfNeeded(signup, { supabase: client, post })));
  assert.equal(posts, 1);
  assert.equal(results.filter((r) => r.posted).length, 1);
});

test('a failed Slack post releases the claim so a later trigger retries', async () => {
  const { client, row } = fakeSupabase();
  const failed = await alertSignupIfNeeded(signup, {
    supabase: client,
    post: async () => ({ ok: false as const, error: 'boom' }),
  });
  assert.equal(failed.skipped, 'slack_failed');
  assert.equal(row.permissions_metadata[SLACK_SIGNUP_ALERT_META_KEY], undefined);

  const retry = await alertSignupIfNeeded(signup, { supabase: client, post: async () => ({ ok: true as const }) });
  assert.equal(retry.posted, true);
});
