/**
 * Run: node --experimental-strip-types packages/synth-shared/src/secretAdminAccess.test.ts
 */
import assert from 'node:assert/strict';
import { isSecretAdminMenuAllowed } from './secretAdminAccess.ts';

assert.equal(
  isSecretAdminMenuAllowed({
    email: 'pesceelauren@gmail.com',
    username: 'lauren',
    accountType: 'admin',
  }),
  true,
);

assert.equal(
  isSecretAdminMenuAllowed({
    email: 'PesceeLauren@gmail.com',
    username: '@Lauren',
    accountType: 'admin',
  }),
  true,
);

// Other admins must never pass.
assert.equal(
  isSecretAdminMenuAllowed({
    email: 'sam@example.com',
    username: 'sam',
    accountType: 'admin',
  }),
  false,
);

// Matching identity but not admin.
assert.equal(
  isSecretAdminMenuAllowed({
    email: 'pesceelauren@gmail.com',
    username: 'lauren',
    accountType: 'user',
  }),
  false,
);

// Username squatting while somehow admin.
assert.equal(
  isSecretAdminMenuAllowed({
    email: 'attacker@example.com',
    username: 'lauren',
    accountType: 'admin',
  }),
  false,
);

// Email match alone is not enough.
assert.equal(
  isSecretAdminMenuAllowed({
    email: 'pesceelauren@gmail.com',
    username: 'notlauren',
    accountType: 'admin',
  }),
  false,
);

// Missing fields default deny.
assert.equal(isSecretAdminMenuAllowed({}), false);
assert.equal(
  isSecretAdminMenuAllowed({
    email: 'pesceelauren@gmail.com',
    username: 'lauren',
    accountType: null,
  }),
  false,
);

console.log('secretAdminAccess.test.ts: ok');
