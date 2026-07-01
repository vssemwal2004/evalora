function findUnsafeKey(value, path = []) {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const nested = findUnsafeKey(value[index], [...path, String(index)]);
      if (nested) return nested;
    }
    return null;
  }

  for (const key of Object.keys(value)) {
    if (key.startsWith('$') || key.includes('.')) {
      return [...path, key].join('.');
    }

    const nested = findUnsafeKey(value[key], [...path, key]);
    if (nested) return nested;
  }

  return null;
}

function rejectUnsafeRequestKeys(req, res, next) {
  const unsafeBodyKey = findUnsafeKey(req.body);
  if (unsafeBodyKey) {
    return res.status(400).json({ message: `Invalid request key: ${unsafeBodyKey}` });
  }

  const unsafeQueryKey = findUnsafeKey(req.query);
  if (unsafeQueryKey) {
    return res.status(400).json({ message: `Invalid query key: ${unsafeQueryKey}` });
  }

  return next();
}

module.exports = {
  rejectUnsafeRequestKeys,
};
