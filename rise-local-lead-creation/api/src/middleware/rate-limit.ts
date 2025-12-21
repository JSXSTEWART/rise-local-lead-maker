import { Request, Response, NextFunction } from 'express';

interface RateLimitStore {
  [key: string]: {
    count: number;
    resetTime: number;
  };
}

interface RateLimitOptions {
  windowMs?: number;
  maxRequests?: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
  skip?: (req: Request) => boolean;
}

const stores: { [name: string]: RateLimitStore } = {};

export function rateLimiter(options: RateLimitOptions = {}) {
  const {
    windowMs = 60 * 1000, // 1 minute default
    maxRequests = 100, // 100 requests per window
    message = 'Too many requests, please try again later.',
    keyGenerator = (req: Request) => req.ip || req.socket.remoteAddress || 'unknown',
    skip = () => false,
  } = options;

  const storeName = `rateLimit_${windowMs}_${maxRequests}`;
  if (!stores[storeName]) {
    stores[storeName] = {};
  }
  const store = stores[storeName];

  // Cleanup old entries every minute
  setInterval(() => {
    const now = Date.now();
    for (const key in store) {
      if (store[key].resetTime < now) {
        delete store[key];
      }
    }
  }, 60 * 1000);

  return (req: Request, res: Response, next: NextFunction) => {
    if (skip(req)) {
      return next();
    }

    const key = keyGenerator(req);
    const now = Date.now();

    if (!store[key] || store[key].resetTime < now) {
      store[key] = {
        count: 1,
        resetTime: now + windowMs,
      };
    } else {
      store[key].count++;
    }

    const remaining = maxRequests - store[key].count;
    const resetTime = Math.ceil((store[key].resetTime - now) / 1000);

    // Set rate limit headers
    res.setHeader('X-RateLimit-Limit', maxRequests.toString());
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining).toString());
    res.setHeader('X-RateLimit-Reset', resetTime.toString());

    if (store[key].count > maxRequests) {
      res.setHeader('Retry-After', resetTime.toString());
      return res.status(429).json({
        success: false,
        error: {
          message,
          code: 'RATE_LIMIT_EXCEEDED',
          retryAfter: resetTime,
        },
      });
    }

    next();
  };
}

// Pre-configured rate limiters for different use cases
export const standardRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 100,
});

export const strictRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 20,
  message: 'Rate limit exceeded for this resource. Please wait before retrying.',
});

export const scrapingRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 10, // Scraping is expensive
  message: 'Scraping rate limit exceeded. Please wait before making more requests.',
});

export const enrichmentRateLimiter = rateLimiter({
  windowMs: 60 * 1000, // 1 minute
  maxRequests: 30, // Enrichment uses external APIs
  message: 'Enrichment rate limit exceeded. Please wait before making more requests.',
});
