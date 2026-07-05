const crypto = require('crypto');
const env = require('../config/env');

const REGION = 'auto';
const SERVICE = 's3';
const MAX_UPLOAD_BYTES = {
  identity: 2 * 1024 * 1024,
  snapshot: 2 * 1024 * 1024,
  clip: 75 * 1024 * 1024,
  recording: 512 * 1024 * 1024,
};

function isConfigured() {
  return Boolean(env.r2.accountId && env.r2.bucket && env.r2.accessKeyId && env.r2.secretAccessKey);
}

function hmac(key, value, encoding) {
  return crypto.createHmac('sha256', key).update(value).digest(encoding);
}

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function awsEncode(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function safeSegment(value) {
  return String(value || 'file')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'file';
}

function extensionFromContentType(contentType) {
  if (contentType === 'image/jpeg') return 'jpg';
  if (contentType === 'image/png') return 'png';
  if (contentType === 'image/webp') return 'webp';
  if (contentType === 'video/webm') return 'webm';
  if (contentType === 'video/mp4') return 'mp4';
  return 'bin';
}

function getSigningKey(dateStamp) {
  const kDate = hmac(`AWS4${env.r2.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, REGION);
  const kService = hmac(kRegion, SERVICE);
  return hmac(kService, 'aws4_request');
}

function buildObjectKey({ category, ownerId, assignmentId, filename, contentType }) {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const random = crypto.randomBytes(8).toString('hex');
  const extension = extensionFromContentType(contentType);
  const base = safeSegment(filename).replace(/\.[a-z0-9]+$/, '');

  return [
    'evidence',
    safeSegment(category),
    `${yyyy}-${mm}-${dd}`,
    safeSegment(ownerId),
    safeSegment(assignmentId),
    `${Date.now()}-${random}-${base}.${extension}`,
  ].join('/');
}

function publicUrlForKey(key) {
  if (!env.r2.publicUrl) return '';
  return `${env.r2.publicUrl.replace(/\/+$/, '')}/${key.split('/').map(awsEncode).join('/')}`;
}

function createPresignedPutUrl({ key, expiresSeconds }) {
  if (!isConfigured()) {
    throw new Error('Cloudflare R2 is not configured.');
  }

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const host = `${env.r2.accountId}.r2.cloudflarestorage.com`;
  const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
  const canonicalUri = `/${env.r2.bucket}/${key.split('/').map(awsEncode).join('/')}`;
  const query = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${env.r2.accessKeyId}/${credentialScope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(Math.min(Math.max(Number(expiresSeconds || env.r2.presignExpiresSeconds), 60), 3600)),
    'X-Amz-SignedHeaders': 'host',
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((name) => `${awsEncode(name)}=${awsEncode(query[name])}`)
    .join('&');
  const canonicalRequest = ['PUT', canonicalUri, canonicalQuery, `host:${host}\n`, 'host', 'UNSIGNED-PAYLOAD'].join('\n');
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, credentialScope, sha256(canonicalRequest)].join('\n');
  const signature = hmac(getSigningKey(dateStamp), stringToSign, 'hex');

  return `https://${host}${canonicalUri}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}

function createEvidenceUpload({ category, ownerId, assignmentId, filename, contentType, size }) {
  const maxBytes = MAX_UPLOAD_BYTES[category] || MAX_UPLOAD_BYTES.snapshot;
  if (Number(size || 0) <= 0 || Number(size) > maxBytes) {
    throw new Error(`Upload must be between 1 byte and ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }

  const key = buildObjectKey({ category, ownerId, assignmentId, filename, contentType });
  return {
    key,
    uploadUrl: createPresignedPutUrl({ key }),
    publicUrl: publicUrlForKey(key),
    maxBytes,
    expiresSeconds: Math.min(Math.max(Number(env.r2.presignExpiresSeconds || 600), 60), 3600),
  };
}

module.exports = {
  createEvidenceUpload,
  isConfigured,
};
