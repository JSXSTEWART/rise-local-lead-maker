import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  multiAIAnalyze,
  multiAIConsensus,
  deepEnrichLead,
  generateMultiAIOutreach,
  multiAICompetitorAnalysis,
  isMultiAIConfigured,
  getAvailableAIs,
} from '../services/multi-ai.js';
import { getSupabase } from '../integrations/supabase.js';
import { validateBody } from '../middleware/validate.js';
import { createError } from '../middleware/error-handler.js';
import type { Lead } from '../types/lead.js';

export const multiAIRouter = Router();

// Schemas
const analyzeSchema = z.object({
  prompt: z.string().min(1).max(10000),
  synthesize: z.boolean().optional().default(true),
});

const consensusSchema = z.object({
  topic: z.string().min(1).max(1000),
  context: z.record(z.any()).optional().default({}),
});

const deepEnrichSchema = z.object({
  leadId: z.string().optional(),
  lead: z.object({
    company: z.string().optional(),
    industry: z.string().optional(),
    location: z.string().optional(),
    website: z.string().optional(),
    email: z.string().optional(),
    phone: z.string().optional(),
  }).optional(),
});

const outreachSchema = z.object({
  leadId: z.string().optional(),
  lead: z.object({
    company: z.string().optional(),
    industry: z.string().optional(),
    location: z.string().optional(),
    email: z.string().optional(),
  }).optional(),
  style: z.enum(['formal', 'casual', 'consultative']).optional().default('consultative'),
});

const competitorSchema = z.object({
  company: z.string().min(1),
  industry: z.string().min(1),
  website: z.string().optional(),
});

// GET /api/multi-ai/status - Check multi-AI configuration
multiAIRouter.get('/status', (_req: Request, res: Response) => {
  const available = getAvailableAIs();
  res.json({
    success: true,
    data: {
      configured: isMultiAIConfigured(),
      availableAIs: available,
      capabilities: isMultiAIConfigured() ? [
        'analyze',
        'consensus',
        'deep-enrich',
        'outreach',
        'competitor-analysis',
      ] : [],
    },
  });
});

// POST /api/multi-ai/analyze - Run parallel AI analysis
multiAIRouter.post(
  '/analyze',
  validateBody(analyzeSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isMultiAIConfigured()) {
        throw createError('Multi-AI requires both Anthropic and Gemini API keys', 400, 'CONFIG_ERROR');
      }

      const { prompt, synthesize } = req.body;
      console.log('[Multi-AI] Running parallel analysis');

      const result = await multiAIAnalyze(prompt, { synthesize });

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/multi-ai/consensus - Find AI consensus on a topic
multiAIRouter.post(
  '/consensus',
  validateBody(consensusSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isMultiAIConfigured()) {
        throw createError('Multi-AI requires both Anthropic and Gemini API keys', 400, 'CONFIG_ERROR');
      }

      const { topic, context } = req.body;
      console.log(`[Multi-AI] Finding consensus on: ${topic}`);

      const result = await multiAIConsensus(topic, context);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/multi-ai/deep-enrich - Deep lead enrichment with both AIs
multiAIRouter.post(
  '/deep-enrich',
  validateBody(deepEnrichSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isMultiAIConfigured()) {
        throw createError('Multi-AI requires both Anthropic and Gemini API keys', 400, 'CONFIG_ERROR');
      }

      let lead: Lead;

      if (req.body.leadId) {
        // Fetch from database
        const { data, error } = await getSupabase()
          .from('leads')
          .select('*')
          .eq('id', req.body.leadId)
          .single();

        if (error || !data) {
          throw createError('Lead not found', 404, 'NOT_FOUND');
        }
        lead = data as Lead;
      } else if (req.body.lead) {
        lead = req.body.lead as Lead;
      } else {
        throw createError('Either leadId or lead data required', 400, 'VALIDATION_ERROR');
      }

      console.log(`[Multi-AI] Deep enriching: ${lead.company || 'Unknown'}`);

      const result = await deepEnrichLead(lead);

      // Update lead in database if it has an ID
      if (lead.id) {
        await getSupabase()
          .from('leads')
          .update({
            metadata: {
              ...(lead.metadata as Record<string, unknown> || {}),
              multiAIEnrichment: result,
              multiAIEnrichedAt: new Date().toISOString(),
            },
          })
          .eq('id', lead.id);
      }

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/multi-ai/deep-enrich/:id - Deep enrich by lead ID
multiAIRouter.post(
  '/deep-enrich/:id',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isMultiAIConfigured()) {
        throw createError('Multi-AI requires both Anthropic and Gemini API keys', 400, 'CONFIG_ERROR');
      }

      const { id } = req.params;

      const { data: lead, error } = await getSupabase()
        .from('leads')
        .select('*')
        .eq('id', id)
        .single();

      if (error || !lead) {
        throw createError('Lead not found', 404, 'NOT_FOUND');
      }

      console.log(`[Multi-AI] Deep enriching lead ${id}: ${lead.company || 'Unknown'}`);

      const result = await deepEnrichLead(lead as Lead);

      // Update lead metadata
      await getSupabase()
        .from('leads')
        .update({
          metadata: {
            ...(lead.metadata as Record<string, unknown> || {}),
            multiAIEnrichment: result,
            multiAIEnrichedAt: new Date().toISOString(),
          },
        })
        .eq('id', id);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/multi-ai/outreach - Generate outreach with both AIs
multiAIRouter.post(
  '/outreach',
  validateBody(outreachSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isMultiAIConfigured()) {
        throw createError('Multi-AI requires both Anthropic and Gemini API keys', 400, 'CONFIG_ERROR');
      }

      let lead: Lead;

      if (req.body.leadId) {
        const { data, error } = await getSupabase()
          .from('leads')
          .select('*')
          .eq('id', req.body.leadId)
          .single();

        if (error || !data) {
          throw createError('Lead not found', 404, 'NOT_FOUND');
        }
        lead = data as Lead;
      } else if (req.body.lead) {
        lead = req.body.lead as Lead;
      } else {
        throw createError('Either leadId or lead data required', 400, 'VALIDATION_ERROR');
      }

      console.log(`[Multi-AI] Generating outreach for: ${lead.company || 'Unknown'}`);

      const result = await generateMultiAIOutreach(lead, req.body.style);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/multi-ai/competitor-analysis - Analyze competitors
multiAIRouter.post(
  '/competitor-analysis',
  validateBody(competitorSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isMultiAIConfigured()) {
        throw createError('Multi-AI requires both Anthropic and Gemini API keys', 400, 'CONFIG_ERROR');
      }

      const { company, industry, website } = req.body;
      console.log(`[Multi-AI] Analyzing competitors for: ${company}`);

      const result = await multiAICompetitorAnalysis(company, industry, website);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/multi-ai/batch-deep-enrich - Deep enrich multiple leads
multiAIRouter.post(
  '/batch-deep-enrich',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!isMultiAIConfigured()) {
        throw createError('Multi-AI requires both Anthropic and Gemini API keys', 400, 'CONFIG_ERROR');
      }

      const limit = parseInt(req.body.limit) || 10;
      const status = req.body.status || 'enriched';

      const { data: leads, error } = await getSupabase()
        .from('leads')
        .select('*')
        .eq('status', status)
        .limit(limit);

      if (error) {
        throw createError('Failed to fetch leads', 500, 'DATABASE_ERROR', error);
      }

      if (!leads || leads.length === 0) {
        return res.json({
          success: true,
          data: { results: [], processed: 0 },
        });
      }

      console.log(`[Multi-AI] Batch deep enriching ${leads.length} leads`);

      const results: Array<{ leadId: string | number; success: boolean; result?: any; error?: string }> = [];
      for (const leadData of leads) {
        const lead = leadData as Lead & { id: string | number; metadata?: Record<string, unknown> };
        try {
          const result = await deepEnrichLead(lead);
          results.push({ leadId: lead.id, success: true, result });

          // Update lead
          await getSupabase()
            .from('leads')
            .update({
              metadata: {
                ...(lead.metadata || {}),
                multiAIEnrichment: result,
                multiAIEnrichedAt: new Date().toISOString(),
              },
            })
            .eq('id', lead.id);

          // Rate limiting
          await new Promise(resolve => setTimeout(resolve, 500));
        } catch (err) {
          results.push({ leadId: lead.id, success: false, error: (err as Error).message });
        }
      }

      res.json({
        success: true,
        data: {
          results,
          processed: results.length,
          successful: results.filter(r => r.success).length,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
