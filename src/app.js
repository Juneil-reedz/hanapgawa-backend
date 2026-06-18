const cors = require('cors');
const express = require('express');
const { rateLimit } = require('express-rate-limit');
const helmet = require('helmet');
const morgan = require('morgan');

const { env } = require('./config/env');
const { errorHandler } = require('./middleware/error-handler');
const { initFirebase } = require('./lib/firebase');
const { apiRoutes } = require('./routes');
const { getPostgresPool } = require('./db/postgres');

initFirebase();

// Run schema migrations once on startup (non-blocking)
setTimeout(async () => {
  try {
    const pool = getPostgresPool();
    if (pool) {
      const { ensureAuthSchema } = require('./repositories/user-repository');
      await ensureAuthSchema(pool);
    }
  } catch (e) {
    console.error('[Startup] Schema migration failed:', e.message);
  }
}, 2000);

const app = express();

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  if (origin === env.clientOrigin) {
    return true;
  }

  // Allow localhost on any port for local development
  if (/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return true;
  }

  if (env.nodeEnv !== 'production') {
    return /^http:\/\/192\.168\.\d+\.\d+:\d+$/.test(origin);
  }

  return false;
}

// General rate limit: 300 requests per 5 minutes per IP
const generalLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many requests, please slow down.' } },
});

// Stricter limit for auth endpoints: 20 per 15 minutes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: { message: 'Too many login attempts, please try again later.' } },
});

app.use(helmet());
app.use(
  cors({
    origin(origin, callback) {
      callback(null, isAllowedOrigin(origin));
    },
    credentials: true,
  }),
);
app.use(express.json({ limit: '250mb' }));
app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));

app.get('/', (_req, res) => {
  res.json({
    name: 'HanapGawa Backend API',
    version: '0.1.0',
    docsHint: `${env.apiPrefix}/health`,
  });
});

app.use(`${env.apiPrefix}/auth`, authLimiter);
app.use(env.apiPrefix, generalLimiter, apiRoutes);
app.use(errorHandler);

module.exports = { app };
