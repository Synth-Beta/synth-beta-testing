/**
 * Run: node --experimental-strip-types --test packages/synth-shared/src/profileSaveError.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeProfileSaveError } from './profileSaveError.ts';

test('taken username says so', () => {
  const r = describeProfileSaveError({ code: '23505', message: 'duplicate key value violates unique constraint "users_username_key"' });
  assert.equal(r.code, '23505');
  assert.match(r.message, /username is taken/i);
});

test('check constraint names the field', () => {
  const r = describeProfileSaveError({
    code: '23514',
    message: 'new row for relation "users" violates check constraint "users_gender_check"',
  });
  assert.equal(r.code, '23514');
  assert.match(r.message, /gender/i);
});

test('missing required column names the field', () => {
  const r = describeProfileSaveError({ code: '23502', message: 'null value in column "location_city" of relation "users" violates not-null constraint' });
  assert.match(r.message, /city/i);
});

test('bad birthday format', () => {
  assert.match(describeProfileSaveError({ code: '22007', message: 'invalid input syntax for type date' }).message, /birthday/i);
  assert.match(describeProfileSaveError({ code: '22008', message: 'date/time field value out of range' }).message, /birthday/i);
});

test('expired session asks to sign in again', () => {
  assert.match(describeProfileSaveError({ code: 'PGRST301', message: 'JWT expired' }).message, /sign in again/i);
  assert.match(describeProfileSaveError({ code: '42501', message: 'permission denied for table users' }).message, /sign in again/i);
  assert.equal(describeProfileSaveError({ code: 'PGRST301', message: 'JWT expired' }).code, 'PGRST301');
});

test('network failure says connection', () => {
  const r = describeProfileSaveError(new TypeError('Failed to fetch'));
  assert.equal(r.code, 'network');
  assert.match(r.message, /connection/i);
});

test('unknown error keeps a code for support and never leaks raw SQL', () => {
  const r = describeProfileSaveError({ code: 'XX000', message: 'internal error at line 12 of trigger fn_sync' });
  assert.equal(r.code, 'XX000');
  assert.match(r.message, /XX000/);
  assert.doesNotMatch(r.message, /trigger|line 12/);
  const bare = describeProfileSaveError('boom');
  assert.equal(bare.code, 'unknown');
});
