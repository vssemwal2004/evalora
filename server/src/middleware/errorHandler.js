function notFound(req, res) {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
}

function normalizeError(error) {
  if (error.type === 'entity.too.large') {
    return { statusCode: 413, message: 'Request payload is too large.' };
  }

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return { statusCode: 400, message: 'Invalid JSON payload.' };
  }

  if (error.name === 'CastError') {
    return { statusCode: 400, message: 'Invalid identifier provided.' };
  }

  if (error.name === 'ValidationError') {
    return { statusCode: 400, message: error.message || 'Validation failed.' };
  }

  if (error.code === 11000) {
    return { statusCode: 409, message: 'A duplicate record already exists.' };
  }

  return {
    statusCode: error.statusCode || 500,
    message: error.message,
  };
}

function errorHandler(error, _req, res, _next) {
  const normalized = normalizeError(error);
  const statusCode = normalized.statusCode;
  const message = statusCode === 500 ? 'Internal server error.' : normalized.message;

  if (statusCode === 500) {
    console.error(error);
  }

  res.status(statusCode).json({ message });
}

module.exports = {
  notFound,
  errorHandler,
};
