import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectUrlFor, hashSecret, makeLinkCode, normalizeCode, partnerKeyEnv } from './partnerLink.ts';

test('link codes are 8 unambiguous characters and random', () => {
  const codes = new Set(Array.from({ length: 500 }, makeLinkCode));
  assert.equal(codes.size, 500);
  for (const code of codes) assert.match(code, /^[A-HJ-NP-Z2-9]{8}$/);
});

test('typed codes are normalized before hashing', () => {
  assert.equal(normalizeCode(' abcd-2345 '), 'ABCD2345');
  assert.equal(normalizeCode(42), '');
  assert.equal(hashSecret(normalizeCode('abcd 2345')), hashSecret('ABCD2345'));
});

test('per-partner env key names', () => {
  assert.equal(partnerKeyEnv('pickfive', 'INBOUND'), 'PARTNER_PICKFIVE_INBOUND_KEY');
  assert.equal(partnerKeyEnv('some-partner', 'OUTBOUND'), 'PARTNER_SOME_PARTNER_OUTBOUND_KEY');
});

test('connect url gets the code; only https partner pages', () => {
  assert.equal(connectUrlFor('https://pickfive.example/connect/synth', 'ABCD2345'), 'https://pickfive.example/connect/synth?code=ABCD2345');
  assert.equal(connectUrlFor('https://pickfive.example/c?ref=synth', 'ABCD2345'), 'https://pickfive.example/c?ref=synth&code=ABCD2345');
  assert.equal(connectUrlFor(null, 'ABCD2345'), null);
  assert.equal(connectUrlFor('http://pickfive.example/c', 'ABCD2345'), null);
  assert.equal(connectUrlFor('not a url', 'ABCD2345'), null);
});
