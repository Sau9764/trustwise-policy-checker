/**
 * IP-based API rate limiter middleware.
 * Limits the number of requests per client IP within a sliding window.
 * Uses express-rate-limit; key is derived from req.ip (set correctly when trust proxy is enabled).
 */

import rateLimit from 'express-rate-limit';

const RATE_LIMIT_WINDOW_MS = parseInt(process.env['RATE_LIMIT_WINDOW_MS'] ?? '60000', 10); // 1 minute default
const RATE_LIMIT_MAX_PER_WINDOW = parseInt(process.env['RATE_LIMIT_MAX_PER_WINDOW'] ?? '60', 10); // 60 requests per window default

const rateLimiterConfig = {
  windowMs: RATE_LIMIT_WINDOW_MS,
  max: RATE_LIMIT_MAX_PER_WINDOW,
  message: {
    error: 'Too Many Requests',
    message: `Rate limit exceeded. Maximum ${RATE_LIMIT_MAX_PER_WINDOW} requests per ${RATE_LIMIT_WINDOW_MS / 1000} seconds per IP.`,
    retryAfter: Math.ceil(RATE_LIMIT_WINDOW_MS / 1000),
  },
  standardHeaders: true,
  legacyHeaders: false,
};

/**
 * Rate limiter applied to /api/* routes.
 * Identifies clients by IP (req.ip; use app.set('trust proxy', 1) behind a reverse proxy).
 */
export const apiRateLimiter = rateLimit(rateLimiterConfig);
