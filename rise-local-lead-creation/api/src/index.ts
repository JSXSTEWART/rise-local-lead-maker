import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { leadsRouter } from './routes/leads';
import { scraperRouter } from './routes/scraper';
import { qualificationRouter } from './routes/qualification';
import { enrichmentRouter } from './routes/enrichment';
import { syncRouter } from './routes/sync';
import { chatRouter } from './routes/chat';
import { pipelineRouter } from './routes/pipeline';
import { multiAIRouter } from './routes/multi-ai';
import { errorHandler, notFoundHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import {
  standardRateLimiter,
  scrapingRateLimiter,
  enrichmentRateLimiter,
} from './middleware/rate-limit';
import { optionalAuth, isAuthConfigured } from './middleware/auth';
import { testConnection, closePool } from './integrations/supabase';

const app = express();

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(requestLogger);

// Optional API key authentication (enabled when API_KEYS env var is set)
app.use(optionalAuth);

// Global rate limiting (100 requests/minute)
app.use(standardRateLimiter);

// Health check (no rate limiting)
app.get('/health', (_req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: env.NODE_ENV,
    authEnabled: isAuthConfigured(),
    capabilities: {
      anthropic: !!env.ANTHROPIC_API_KEY,
      gemini: !!env.GEMINI_API_KEY,
      googlePlaces: !!env.GOOGLE_PLACES_API_KEY,
      clay: !!env.CLAY_API_KEY,
      sheets: !!(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY),
    },
  });
});

// API Routes with specific rate limiting for expensive operations
app.use('/api/leads', leadsRouter);
app.use('/api/scraper', scrapingRateLimiter, scraperRouter);
app.use('/api/qualify', qualificationRouter);
app.use('/api/enrichment', enrichmentRateLimiter, enrichmentRouter);
app.use('/api/sync', syncRouter);
app.use('/api/chat', chatRouter);
app.use('/api/pipeline', pipelineRouter);
app.use('/api/multi-ai', enrichmentRateLimiter, multiAIRouter);

// Error handling
app.use(notFoundHandler);
app.use(errorHandler);

const PORT = parseInt(env.PORT, 10);

app.listen(PORT, async () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║         Rise Local Lead Maker API Server                   ║
╠════════════════════════════════════════════════════════════╣
║  Server running on port ${PORT}                              ║
║  Environment: ${env.NODE_ENV.padEnd(43)}║
║  Health check: http://localhost:${PORT}/health               ║
╠════════════════════════════════════════════════════════════╣
║  Endpoints:                                                ║
║  • GET/POST /api/leads          - Lead management          ║
║  • POST /api/scraper/google     - Google Places scraping   ║
║  • POST /api/scraper/website    - Website scraping         ║
║  • POST /api/qualify            - Lead qualification       ║
║  • POST /api/enrichment         - Lead enrichment          ║
║  • POST /api/sync               - Data sync operations     ║
╚════════════════════════════════════════════════════════════╝
  `);

  // Test database connection on startup
  const dbConnected = await testConnection();
  if (!dbConnected) {
    console.error('⚠️  Warning: Database connection failed. Server running but database operations may fail.');
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('\n[Server] SIGTERM received. Closing connections...');
  await closePool();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('\n[Server] SIGINT received. Closing connections...');
  await closePool();
  process.exit(0);
});

export default app;
