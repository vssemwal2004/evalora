process.env.NODE_ENV = 'test';
process.env.R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '00000000000000000000000000000000';
process.env.R2_BUCKET = process.env.R2_BUCKET || 'evalora-test';
process.env.R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '00000000000000000000000000000000';
process.env.R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '0'.repeat(64);
process.env.R2_PUBLIC_URL = process.env.R2_PUBLIC_URL || 'https://evidence.example.test';

const assert = require('node:assert/strict');
const { afterEach, describe, it } = require('node:test');
const { uploadEvidenceBuffer } = require('../src/services/r2.service');

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe('server-side identity evidence upload', () => {
  it('uploads the photo from the API so browser bucket CORS is not required', async () => {
    let request;
    global.fetch = async (url, options) => {
      request = { url, options };
      return { ok: true, status: 200 };
    };

    const buffer = Buffer.from('identity-photo');
    const result = await uploadEvidenceBuffer({
      category: 'identity',
      ownerId: 'student-1',
      assignmentId: 'assignment-1',
      filename: 'identity.jpg',
      contentType: 'image/jpeg',
      buffer,
    });

    assert.equal(request.options.method, 'PUT');
    assert.equal(request.options.headers['Content-Type'], 'image/jpeg');
    assert.equal(request.options.body, buffer);
    assert.match(request.url, /^https:\/\//);
    assert.match(result.key, /^evidence\/identity\//);
    assert.equal(result.contentType, 'image/jpeg');
    assert.equal(result.size, buffer.length);
  });

  it('returns a safe retryable error when storage is unavailable', async () => {
    global.fetch = async () => {
      throw new TypeError('network failed');
    };

    await assert.rejects(
      uploadEvidenceBuffer({
        category: 'identity',
        ownerId: 'student-1',
        assignmentId: 'assignment-1',
        filename: 'identity.jpg',
        contentType: 'image/jpeg',
        buffer: Buffer.from('identity-photo'),
      }),
      (error) => error.statusCode === 502 && /temporarily unavailable/i.test(error.message)
    );
  });
});
