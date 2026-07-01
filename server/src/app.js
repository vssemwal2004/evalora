const cookieParser = require('cookie-parser');
const cors = require('cors');
const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const env = require('./config/env');
const routes = require('./routes');
const { activityLogger } = require('./middleware/activityLogger');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { globalApiLimiter } = require('./middleware/rateLimit');
const { rejectUnsafeRequestKeys } = require('./middleware/requestSecurity');

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

const allowedOrigins = new Set(env.frontendOrigins);

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }

      const error = new Error('CORS origin is not allowed.');
      error.statusCode = 403;
      return callback(error);
    },
    credentials: true,
  })
);
app.use(express.json({ limit: env.requestBodyLimit }));
app.use(express.urlencoded({ extended: true, limit: env.requestBodyLimit }));
app.use(rejectUnsafeRequestKeys);
app.use(cookieParser());

if (env.nodeEnv !== 'test') {
  app.use(morgan('dev'));
}

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'evalora-api',
    message: 'Backend is running. Open the frontend at the configured client URL.',
    frontendUrl: env.frontendUrl,
    healthUrl: '/api/health',
  });
});

app.use('/api', globalApiLimiter);

app.use('/api', activityLogger, routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
