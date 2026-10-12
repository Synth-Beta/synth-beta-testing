import { test } from 'node:test';
import assert from 'node:assert/strict';
import { signInWithPartnerFallback, PARTNER_ACCOUNT_EXISTS_MESSAGE } from './partnerSignIn.ts';

const INVALID = { message: 'Invalid login credentials', code: 'invalid_credentials' };

function fakeClient(signIn: () => { data?: unknown; error: unknown }) {
  const calls: string[] = [];
  return {
    calls,
    auth: {
      signInWithPassword: async () => (calls.push('signIn'), signIn()),
      setSession: async (s: unknown) => (calls.push(`setSession:${JSON.stringify(s)}`), { error: null }),
      signOut: async () => (calls.push('signOut'), { error: null }),
    },
  };
}

const okFetch = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test('Synth login succeeds: partner is never tried', async () => {
  const synth = fakeClient(() => ({ error: null }));
  const partner = fakeClient(() => ({ error: null }));
  const result = await signInWithPartnerFallback({ synth, partner, email: 'a@b.co', password: 'x', exchangeUrl: '/x' });
  assert.deepEqual(result, { error: null, via: 'synth' });
  assert.deepEqual(partner.calls, []);
});

test('non-credential errors are not retried against the partner', async () => {
  const synth = fakeClient(() => ({ error: { message: 'Email not confirmed' } }));
  const partner = fakeClient(() => ({ error: null }));
  const result = await signInWithPartnerFallback({ synth, partner, email: 'a@b.co', password: 'x', exchangeUrl: '/x' });
  assert.equal(result.via, null);
  assert.deepEqual(partner.calls, []);
});

test('wrong password in both apps reports the Synth error', async () => {
  const synth = fakeClient(() => ({ error: INVALID }));
  const partner = fakeClient(() => ({ error: INVALID }));
  const result = await signInWithPartnerFallback({ synth, partner, email: 'a@b.co', password: 'x', exchangeUrl: '/x' });
  assert.equal(result.error, INVALID);
});

test('Pick Five login is exchanged for a Synth session and the partner session dropped', async () => {
  const synth = fakeClient(() => ({ error: INVALID }));
  const partner = fakeClient(() => ({ data: { session: { access_token: 'pf-token' } }, error: null }));
  const result = await signInWithPartnerFallback({
    synth,
    partner,
    email: 'a@b.co',
    password: 'x',
    exchangeUrl: '/api/partner/exchange',
    fetchImpl: okFetch(200, { access_token: 'syn-a', refresh_token: 'syn-r', created: true }),
  });
  assert.deepEqual(result, { error: null, via: 'partner' });
  assert.ok(synth.calls.includes('setSession:{"access_token":"syn-a","refresh_token":"syn-r"}'));
  assert.ok(partner.calls.includes('signOut'));
});

test('existing separate Synth account is not merged', async () => {
  const synth = fakeClient(() => ({ error: INVALID }));
  const partner = fakeClient(() => ({ data: { session: { access_token: 'pf-token' } }, error: null }));
  const result = await signInWithPartnerFallback({
    synth, partner, email: 'a@b.co', password: 'x', exchangeUrl: '/x', fetchImpl: okFetch(409, { error: 'account_exists' }),
  });
  assert.equal(result.error?.message, PARTNER_ACCOUNT_EXISTS_MESSAGE);
  assert.ok(!synth.calls.some((c) => c.startsWith('setSession')));
});

test('no partner configured: plain Synth sign-in', async () => {
  const synth = fakeClient(() => ({ error: INVALID }));
  const result = await signInWithPartnerFallback({ synth, partner: null, email: 'a@b.co', password: 'x', exchangeUrl: '/x' });
  assert.equal(result.error, INVALID);
});
