const assert = require('node:assert/strict');
const { describe, it } = require('node:test');

const { AUTHENTICATABLE_ROLES, buildLoginUserQuery } = require('../src/services/auth.service');
const { ROLES } = require('../src/constants/roles');

describe('auth service', () => {
  it('only looks up login users with a valid role', () => {
    const query = buildLoginUserQuery(' Student-01 ');

    assert.deepEqual(query.role, { $in: AUTHENTICATABLE_ROLES });
    assert.ok(AUTHENTICATABLE_ROLES.includes(ROLES.STUDENT));
    assert.ok(AUTHENTICATABLE_ROLES.includes(ROLES.PROCTOR));
  });

  it('normalizes email-style identifiers while keeping raw login ids', () => {
    const query = buildLoginUserQuery(' Student@Example.COM ');

    assert.deepEqual(query.$or, [
      { email: 'student@example.com' },
      { loginId: 'Student@Example.COM' },
      { loginId: 'student@example.com' },
      { uniqueUsername: 'Student@Example.COM' },
      { uniqueUsername: 'student@example.com' },
    ]);
  });
});
