/**
 * Run: node --experimental-strip-types --test packages/synth-shared/src/onboardingRules.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateOnboardingProfile, pickPreselected, normalizeBirthday, isPlaceholderName } from './onboardingRules.ts';

const now = new Date('2026-10-24T12:00:00Z');
const valid = { name: 'Tej', username: 'tej_p', birthday: '1995-05-01', acquisitionSource: 'Instagram' };

test('valid profile passes with no city, gender, bio or photo', () => {
  assert.deepEqual(validateOnboardingProfile(valid, now), { ok: true, errors: {} });
});

test('name is required', () => {
  const r = validateOnboardingProfile({ ...valid, name: '   ' }, now);
  assert.equal(r.ok, false);
  assert.ok(r.errors.name);
});

test('username must be 3-30 lowercase letters, numbers, _ or .', () => {
  assert.ok(validateOnboardingProfile({ ...valid, username: 'ab' }, now).errors.username);
  assert.ok(validateOnboardingProfile({ ...valid, username: 'Bad Name!' }, now).errors.username);
  assert.ok(validateOnboardingProfile({ ...valid, username: 'a'.repeat(31) }, now).errors.username);
  assert.equal(validateOnboardingProfile({ ...valid, username: 'ok.name_1' }, now).errors.username, undefined);
});

test('birthday required, valid date, 13+ and believable', () => {
  assert.ok(validateOnboardingProfile({ ...valid, birthday: '' }, now).errors.birthday);
  assert.ok(validateOnboardingProfile({ ...valid, birthday: 'nope' }, now).errors.birthday);
  assert.ok(validateOnboardingProfile({ ...valid, birthday: '2016-01-01' }, now).errors.birthday);
  assert.ok(validateOnboardingProfile({ ...valid, birthday: '1890-01-01' }, now).errors.birthday);
  assert.equal(validateOnboardingProfile({ ...valid, birthday: '2013-10-24' }, now).errors.birthday, undefined);
});

test('how did you hear is required', () => {
  assert.ok(validateOnboardingProfile({ ...valid, acquisitionSource: null }, now).errors.acquisitionSource);
});

test('bio is optional but capped at 120', () => {
  assert.equal(validateOnboardingProfile({ ...valid, bio: '' }, now).ok, true);
  assert.ok(validateOnboardingProfile({ ...valid, bio: 'x'.repeat(121) }, now).errors.bio);
});

test('pickPreselected uses server flags, else the first 3', () => {
  const flagged = [{ id: 'a' }, { id: 'b', preselected: true }, { id: 'c', preselected: true }, { id: 'd' }];
  assert.deepEqual(pickPreselected(flagged), ['b', 'c']);
  const plain = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }];
  assert.deepEqual(pickPreselected(plain), ['a', 'b', 'c']);
  assert.deepEqual(pickPreselected([]), []);
});

test('birthday accepts common typed formats and normalizes to YYYY-MM-DD', () => {
  assert.equal(normalizeBirthday('2000-1-5'), '2000-01-05');
  assert.equal(normalizeBirthday('2000/01/05'), '2000-01-05');
  assert.equal(normalizeBirthday('01/05/2000'), '2000-01-05');
  assert.equal(normalizeBirthday(' 1995-05-01 '), '1995-05-01');
  assert.equal(normalizeBirthday('garbage'), 'garbage');
  assert.equal(validateOnboardingProfile({ ...valid, birthday: '1995/5/1' }, now).ok, true);
  assert.equal(validateOnboardingProfile({ ...valid, birthday: '05/01/1995' }, now).ok, true);
});

test('isPlaceholderName treats signup-trigger seeds as blank', () => {
  assert.equal(isPlaceholderName(''), true);
  assert.equal(isPlaceholderName(null), true);
  assert.equal(isPlaceholderName('Synth User'), true);
  assert.equal(isPlaceholderName('tejpatel1510', 'tejpatel1510@gmail.com'), true);
  assert.equal(isPlaceholderName('Tej Patel', 'tejpatel1510@gmail.com'), false);
  assert.equal(isPlaceholderName('Tej'), false);
});
