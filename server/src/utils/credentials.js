const crypto = require('crypto');

function generateExamId() {
  const year = new Date().getFullYear();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `EVL-${year}-${random}`;
}

function generateProctorId() {
  const year = new Date().getFullYear();
  const random = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `PRC-${year}-${random}`;
}

function generatePassword(length = 10) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789@#';
  let password = '';

  for (let index = 0; index < length; index += 1) {
    password += alphabet[crypto.randomInt(0, alphabet.length)];
  }

  return password;
}

module.exports = {
  generateExamId,
  generateProctorId,
  generatePassword,
};
