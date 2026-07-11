const { ROLES } = require('../constants/roles');

const AUTHENTICATABLE_ROLES = Object.freeze(Object.values(ROLES));

function buildLoginUserQuery(identifier) {
  const rawIdentifier = String(identifier || '').trim();
  const normalizedIdentifier = rawIdentifier.toLowerCase();

  return {
    role: { $in: AUTHENTICATABLE_ROLES },
    $or: [
      { email: normalizedIdentifier },
      { loginId: rawIdentifier },
      { loginId: normalizedIdentifier },
      { uniqueUsername: rawIdentifier },
      { uniqueUsername: normalizedIdentifier },
    ],
  };
}

module.exports = {
  AUTHENTICATABLE_ROLES,
  buildLoginUserQuery,
};
