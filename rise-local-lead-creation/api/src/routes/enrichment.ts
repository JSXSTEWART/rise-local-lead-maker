import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  enrichLead,
  enrichLeadBatch,
  processNewLeads,
  retryFailedLeads,
  getEnrichmentStats,
} from '../services/enrichment-pipeline.js';
import { getSupabase } from '../integrations/supabase.js';
import { validateBody } from '../middleware/validate.js';
import { createError } from '../middleware/error-handler.js';
import type { Lead } from '../types/lead.js';

export const enrichmentRouter = Router();

// Enrichment config schema
const enrichmentConfigSchema = z.object({
  useClay: z.boolean().optional().default(true),
  useGemini: z.boolean().optional().default(true),
  useAnthropic: z.boolean().optional().default(true),
  scrapeWebsite: z.boolean().optional().default(true),
  customPrompt: z.string().optional(),
});

const enrichLeadSchema = z.object({
  lead: z.object({
    id: z.string().optional(),
    email: z.string().optional(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    company: z.string().optional(),
    title: z.string().optional(),
    phone: z.string().optional(),
    website: z.string().optional(),
    linkedinUrl: z.string().optional(),
    location: z.string().optional(),
    industry: z.string().optional(),
    companySize: z.string().optional(),
    source: z.string().optional(),
    status: z.enum(['new', 'enriching', 'enriched', 'failed']).default('new'),
    metadata: z.record(z.unknown()).optional(),
  }),
  config: enrichmentConfigSchema.optional(),
});

const enrichBatchSchema = z.object({
  leadIds: z.array(z.string()).optional(),
  status: z.enum(['new', 'enriching', 'enriched', 'failed']).optional(),
  config: enrichmentConfigSchema.optional(),
  limit: z.number().min(1).max(500).optional().default(100),
});

const enrichByIdSchema = z.object({
  config: enrichmentConfigSchema.optional(),
});

// POST /api/enrichment - Enrich a single lead (pass lead data directly)
enrichmentRouter.post(
  '/',
  validateBody(enrichLeadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { lead, config } = req.body;

      console.log(`[Enrichment] Enriching lead: ${lead.company || lead.email || 'Unknown'}`);

      const result = await enrichLead(lead as Lead, config);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/enrichment/batch - Enrich multiple leads (MUST be before /:id)
enrichmentRouter.post(
  '/batch',
  validateBody(enrichBatchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadIds, status, config, limit } = req.body;

      const supabase = getSupabase();
      let query = supabase.from('leads').select('*').limit(limit);

      if (leadIds && leadIds.length > 0) {
        query = query.in('id', leadIds);
      }

      if (status) {
        query = query.eq('status', status);
      }

      const { data: leads, error } = await query;

      if (error) {
        throw createError('Failed to fetch leads', 500, 'DATABASE_ERROR', error);
      }

      if (!leads || leads.length === 0) {
        return res.json({
          success: true,
          data: {
            results: [],
            stats: {
              total: 0,
              successful: 0,
              failed: 0,
              withClay: 0,
              withAI: 0,
            },
          },
        });
      }

      console.log(`[Enrichment] Batch enriching ${leads.length} leads`);

      const results = await enrichLeadBatch(leads as Lead[], config);
      const stats = getEnrichmentStats(results);

      res.json({
        success: true,
        data: {
          results,
          stats,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/enrichment/process-new - Process all new leads (MUST be before /:id)
enrichmentRouter.post(
  '/process-new',
  validateBody(enrichmentConfigSchema.optional()),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = req.body || {};

      console.log('[Enrichment] Processing all new leads');

      const results = await processNewLeads(config);
      const stats = getEnrichmentStats(results);

      res.json({
        success: true,
        data: {
          results,
          stats,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/enrichment/retry-failed - Retry all failed leads (MUST be before /:id)
enrichmentRouter.post(
  '/retry-failed',
  validateBody(enrichmentConfigSchema.optional()),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const config = req.body || {};

      console.log('[Enrichment] Retrying all failed leads');

      const results = await retryFailedLeads(config);
      const stats = getEnrichmentStats(results);

      res.json({
        success: true,
        data: {
          results,
          stats,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/enrichment/:id - Enrich a lead by ID from database (MUST be LAST - catches all)
enrichmentRouter.post(
  '/:id',
  validateBody(enrichByIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { config } = req.body;

      // Fetch lead from database
      const supabase = getSupabase();
      const { data: lead, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !lead) {
        throw createError('Lead not found', 404, 'NOT_FOUND');
      }

      console.log(`[Enrichment] Enriching lead by ID: ${id}`);

      const result = await enrichLead(lead as Lead, config);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/enrichment/stats - Get enrichment statistics
enrichmentRouter.get(
  '/stats',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const supabase = getSupabase();
      const { data: leads, error } = await supabase
        .from('leads')
        .select('status, metadata');

      if (error) {
        throw createError('Failed to fetch leads', 500, 'DATABASE_ERROR', error);
      }

      let enriched = 0;
      let enriching = 0;
      let failed = 0;
      let pending = 0;
      let withClay = 0;
      let withAI = 0;

      leads?.forEach((lead: any) => {
        switch (lead.status) {
          case 'enriched':
            enriched++;
            break;
          case 'enriching':
            enriching++;
            break;
          case 'failed':
            failed++;
            break;
          default:
            pending++;
        }

        const metadata = lead.metadata || {};
        if (metadata.enrichments) {
          if (metadata.enrichments.clay) withClay++;
          if (metadata.enrichments.anthropic || metadata.enrichments.gemini) withAI++;
        }
      });

      res.json({
        success: true,
        data: {
          total: leads?.length || 0,
          enriched,
          enriching,
          failed,
          pending,
          enrichmentRate: leads?.length ? Math.round((enriched / leads.length) * 100) : 0,
          withClay,
          withAI,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
