const mongoose = require('mongoose');
const { z } = require('zod');

const objectIdString = z
  .string()
  .trim()
  .refine((value) => mongoose.isValidObjectId(value), 'Invalid identifier.');

function formatIssues(error) {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body || {});
    if (!result.success) {
      return res.status(400).json({
        message: 'Invalid request payload.',
        issues: formatIssues(result.error),
      });
    }

    req.body = result.data;
    return next();
  };
}

function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query || {});
    if (!result.success) {
      return res.status(400).json({
        message: 'Invalid query parameters.',
        issues: formatIssues(result.error),
      });
    }

    Object.assign(req.query, result.data);
    return next();
  };
}

function validateObjectIdParams(...names) {
  return (req, res, next) => {
    for (const name of names) {
      const result = objectIdString.safeParse(req.params[name]);
      if (!result.success) {
        return res.status(400).json({
          message: `Invalid ${name}.`,
          issues: formatIssues(result.error),
        });
      }

      req.params[name] = result.data;
    }

    return next();
  };
}

module.exports = {
  objectIdString,
  validateBody,
  validateObjectIdParams,
  validateQuery,
  z,
};
