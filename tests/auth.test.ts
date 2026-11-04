import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { hashPassword, verifyPassword, validatePasswordForRole } from '../server/password.js';

describe('password', () => {
  it('hashes and verifies', () => {
    const hash = hashPassword('secret-password-1');
    assert.ok(verifyPassword('secret-password-1', hash));
    assert.equal(verifyPassword('wrong', hash), false);
  });

  it('validates seller PIN', () => {
    assert.equal(validatePasswordForRole('seller', '1234'), null);
    assert.ok(validatePasswordForRole('seller', '12'));
    assert.ok(validatePasswordForRole('manager', '1234'));
  });
});
