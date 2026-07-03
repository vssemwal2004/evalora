const crypto = require('crypto');
const env = require('../config/env');

const PREFIX = 'enc:v1:';

function getKey() {
  return crypto.createHash('sha256').update(String(env.credentialEncryptionSecret || env.jwtSecret)).digest();
}

function toBase64Url(buffer) {
  return Buffer.from(buffer).toString('base64url');
}

function fromBase64Url(value) {
  return Buffer.from(String(value), 'base64url');
}

function isEncryptedValue(value) {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

function encryptSensitiveText(value) {
  if (value === undefined || value === null || value === '') return value;

  const plainText = String(value);
  if (isEncryptedValue(plainText)) return plainText;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIX}${toBase64Url(iv)}:${toBase64Url(tag)}:${toBase64Url(encrypted)}`;
}

function decryptSensitiveText(value) {
  if (!isEncryptedValue(value)) return value;

  const [ivText, tagText, encryptedText] = String(value).slice(PREFIX.length).split(':');
  if (!ivText || !tagText || !encryptedText) return value;

  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', getKey(), fromBase64Url(ivText));
    decipher.setAuthTag(fromBase64Url(tagText));
    return Buffer.concat([decipher.update(fromBase64Url(encryptedText)), decipher.final()]).toString('utf8');
  } catch (_error) {
    return value;
  }
}

function encryptedStringField(options = {}) {
  return {
    type: String,
    select: false,
    ...options,
    set: encryptSensitiveText,
    get: decryptSensitiveText,
  };
}

module.exports = {
  decryptSensitiveText,
  encryptedStringField,
  encryptSensitiveText,
  isEncryptedValue,
};
