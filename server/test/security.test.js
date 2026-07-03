process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-with-enough-length-for-security-tests';

const assert = require('node:assert/strict');
const http = require('node:http');
const { after, before, describe, it } = require('node:test');

const app = require('../src/app');
const User = require('../src/models/User');
const { authenticate } = require('../src/middleware/auth');
const { createCsrfToken } = require('../src/middleware/csrf');
const { generatePassword } = require('../src/utils/credentials');
const { signAuthToken } = require('../src/utils/tokens');

let server;
let baseUrl;

function listen(appInstance) {
  return new Promise((resolve) => {
    const nextServer = http.createServer(appInstance);
    nextServer.listen(0, '127.0.0.1', () => {
      const address = nextServer.address();
      resolve({ nextServer, url: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function request(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { response, body };
}

function createMockResponse() {
  return {
    statusCode: 200,
    payload: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe('security middleware', () => {
  before(async () => {
    const started = await listen(app);
    server = started.nextServer;
    baseUrl = started.url;
  });

  after(async () => {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it('allows safe health checks without CSRF credentials', async () => {
    const { response, body } = await request('/api/health');

    assert.equal(response.status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  });

  it('rejects unsafe cookie-auth requests when CSRF token is missing', async () => {
    const { response, body } = await request('/api/auth/logout', {
      method: 'POST',
      headers: {
        Cookie: 'evalora_token=fake-auth-cookie',
      },
    });

    assert.equal(response.status, 403);
    assert.equal(body.code, 'CSRF_TOKEN_INVALID');
  });

  it('accepts matching CSRF cookie and header before auth validation runs', async () => {
    const csrfToken = createCsrfToken();
    const { response, body } = await request('/api/auth/logout', {
      method: 'POST',
      headers: {
        Cookie: `evalora_token=fake-auth-cookie; evalora_csrf=${csrfToken}`,
        'X-CSRF-Token': csrfToken,
      },
    });

    assert.equal(response.status, 401);
    assert.match(body.message, /Invalid authentication token|Authentication required/);
  });

  it('rejects Mongo operator and dotted request keys', async () => {
    const unsafeBody = await request('/api/auth/logout', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ '$where': 'return true' }),
    });

    assert.equal(unsafeBody.response.status, 400);
    assert.match(unsafeBody.body.message, /Invalid request key/);

    const unsafeQuery = await request('/api/health?profile.name=test');

    assert.equal(unsafeQuery.response.status, 400);
    assert.match(unsafeQuery.body.message, /Invalid query key/);
  });

  it('does not echo unknown route paths in 404 responses', async () => {
    const { response, body } = await request('/missing/<script>alert(1)</script>');

    assert.equal(response.status, 404);
    assert.equal(body.message, 'Route not found.');
  });
});

describe('credential security', () => {
  it('generates strong passwords consistently', () => {
    for (let index = 0; index < 100; index += 1) {
      const password = generatePassword(10);

      assert.ok(password.length >= 10);
      assert.match(password, /[A-Z]/);
      assert.match(password, /[a-z]/);
      assert.match(password, /\d/);
      assert.match(password, /[^A-Za-z0-9]/);
    }
  });
});

describe('auth token invalidation', () => {
  it('rejects a token issued before tokenInvalidBefore', async () => {
    const originalFindById = User.findById;
    const user = {
      _id: '507f1f77bcf86cd799439011',
      role: 'admin',
      status: 'active',
      permissions: [],
      tokenInvalidBefore: new Date(Date.now() + 5000),
    };

    User.findById = () => ({
      select: async () => user,
    });

    try {
      const token = signAuthToken(user);
      const req = {
        headers: { authorization: `Bearer ${token}` },
        cookies: {},
      };
      const res = createMockResponse();
      let nextCalled = false;

      await authenticate(req, res, () => {
        nextCalled = true;
      });

      assert.equal(nextCalled, false);
      assert.equal(res.statusCode, 401);
      assert.equal(res.payload.code, 'SESSION_EXPIRED');
    } finally {
      User.findById = originalFindById;
    }
  });
});
