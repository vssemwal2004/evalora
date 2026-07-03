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

function shuffle(value) {
  const characters = value.split('');
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swapIndex = crypto.randomInt(0, index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join('');
}

function pick(alphabet) {
  return alphabet[crypto.randomInt(0, alphabet.length)];
}

function generatePassword(length = 10) {
  const uppercase = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lowercase = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const special = '@#%!';
  const alphabet = `${uppercase}${lowercase}${digits}${special}`;
  const safeLength = Math.max(Number(length || 10), 10);
  let password = `${pick(uppercase)}${pick(lowercase)}${pick(digits)}${pick(special)}`;

  for (let index = password.length; index < safeLength; index += 1) {
    password += pick(alphabet);
  }

  return shuffle(password);
}

module.exports = {
  generateExamId,
  generateProctorId,
  generatePassword,
};
