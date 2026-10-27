/**
 * Run: node --experimental-strip-types --test packages/synth-shared/src/emailConfirm.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isEmailNotConfirmedError, EMAIL_CONFIRM_RESEND_COOLDOWN_SEC, EMAIL_CONFIRM_POLL_MS } from './emailConfirm.ts';

test('recognizes the Supabase "Email not confirmed" error by message or code', () => {
  assert.equal(isEmailNotConfirmedError(new Error('Email not confirmed')), true);
  assert.equal(isEmailNotConfirmedError({ code: 'email_not_confirmed', message: 'x' }), true);
  assert.equal(isEmailNotConfirmedError({ message: 'EMAIL NOT CONFIRMED' }), true);
});

test('other errors and empty values are not treated as unconfirmed', () => {
  assert.equal(isEmailNotConfirmedError(new Error('Invalid login credentials')), false);
  assert.equal(isEmailNotConfirmedError(null), false);
  assert.equal(isEmailNotConfirmedError('Email not confirmed'), false);
});

test('resend cooldown matches Supabase (60s) and polling stays under the sign-in rate limit', () => {
  assert.equal(EMAIL_CONFIRM_RESEND_COOLDOWN_SEC, 60);
  // Supabase allows ~30 sign-in attempts per 5 minutes per IP.
  assert.ok((5 * 60 * 1000) / EMAIL_CONFIRM_POLL_MS <= 30);
});
