import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { leadQualification, qualifyLead, qualifyLeadWithAI, qualifyLeadsBatch } from '../services/lead-qualification.js';
import { getSupabase } from '../integrations/supabase.js';
import { validateBody } from '../middleware/validate.js';
import { createError } from '../middleware/error-handler.js';
import type { Lead } from '../types/lead.js';

export const qualificationRouter = Router();

// Qualification criteria schema
const qualificationCriteriaSchema = z.object({
  minCompanySize: z.string().optional(),
  targetIndustries: z.array(z.string()).optional(),
  targetLocations: z.array(z.string()).optional(),
  mustHaveWebsite: z.boolean().optional(),
  mustHaveEmail: z.boolean().optional(),
  mustHavePhone: z.boolean().optional(),
  minRating: z.number().min(0).max(5).optional(),
  customCriteria: z.string().optional(),
});

const qualifyLeadSchema = z.object({
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
  criteria: qualificationCriteriaSchema.optional(),
  useAI: z.boolean().optional().default(false),
  aiProvider: z.enum(['anthropic', 'gemini']).optional().default('anthropic'),
});

const qualifyBatchSchema = z.object({
  leadIds: z.array(z.string()).optional(),
  status: z.enum(['new', 'enriching', 'enriched', 'failed']).optional(),
  criteria: qualificationCriteriaSchema.optional(),
  useAI: z.boolean().optional().default(false),
  aiProvider: z.enum(['anthropic', 'gemini']).optional().default('anthropic'),
  limit: z.number().min(1).max(500).optional().default(100),
});

const qualifyByIdSchema = z.object({
  criteria: qualificationCriteriaSchema.optional(),
  useAI: z.boolean().optional().default(false),
  aiProvider: z.enum(['anthropic', 'gemini']).optional().default('anthropic'),
});

// POST /api/qualify - Qualify a single lead (pass lead data directly)
qualificationRouter.post(
  '/',
  validateBody(qualifyLeadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { lead, criteria, useAI, aiProvider } = req.body;

      console.log(`[Qualification] Qualifying lead: ${lead.company || lead.email || 'Unknown'}`);

      const result = useAI
        ? await qualifyLeadWithAI(lead, criteria, aiProvider)
        : qualifyLead(lead, criteria);

      res.json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/qualify/batch - Qualify multiple leads (MUST be before /:id)
qualificationRouter.post(
  '/batch',
  validateBody(qualifyBatchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadIds, status, criteria, useAI, aiProvider, limit } = req.body;

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
            summary: {
              total: 0,
              qualified: 0,
              averageScore: 0,
              gradeDistribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
              topRecommendations: [],
            },
          },
        });
      }

      console.log(`[Qualification] Batch qualifying ${leads.length} leads`);

      const batchResult = await qualifyLeadsBatch(leads as Lead[], criteria, useAI, aiProvider);

      // Update leads with qualification scores
      for (const result of batchResult.results) {
        if (result.lead.id) {
          await getSupabase()
            .from('leads')
            .update({
              metadata: {
                ...((result.lead.metadata as Record<string, unknown>) || {}),
                qualificationScore: result.score,
                qualificationGrade: result.grade,
                qualified: result.qualified,
                qualifiedAt: new Date().toISOString(),
              },
            })
            .eq('id', result.lead.id);
        }
      }

      res.json({
        success: true,
        data: batchResult,
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/qualify/qualified - Get all qualified leads
qualificationRouter.get(
  '/qualified',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const minScore = parseInt(req.query.minScore as string) || 50;
      const limit = parseInt(req.query.limit as string) || 100;

      const { data: leads, error } = await getSupabase()
        .from('leads')
        .select('*')
        .gte('metadata->qualificationScore', minScore)
        .order('metadata->qualificationScore', { ascending: false })
        .limit(limit);

      if (error) {
        throw createError('Failed to fetch qualified leads', 500, 'DATABASE_ERROR', error);
      }

      res.json({
        success: true,
        data: {
          leads,
          count: leads?.length || 0,
          minScore,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/qualify/stats - Get qualification statistics
qualificationRouter.get(
  '/stats',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const { data: leads, error } = await getSupabase()
        .from('leads')
        .select('metadata');

      if (error) {
        throw createError('Failed to fetch leads', 500, 'DATABASE_ERROR', error);
      }

      let qualified = 0;
      let unqualified = 0;
      let notScored = 0;
      let totalScore = 0;
      let scoredCount = 0;
      const gradeDistribution: Record<string, number> = {
        A: 0,
        B: 0,
        C: 0,
        D: 0,
        F: 0,
      };

      leads?.forEach((lead: any) => {
        const metadata = lead.metadata || {};
        if (metadata.qualificationScore !== undefined) {
          scoredCount++;
          totalScore += metadata.qualificationScore;
          if (metadata.qualified) {
            qualified++;
          } else {
            unqualified++;
          }
          if (metadata.qualificationGrade) {
            gradeDistribution[metadata.qualificationGrade]++;
          }
        } else {
          notScored++;
        }
      });

      res.json({
        success: true,
        data: {
          total: leads?.length || 0,
          scored: scoredCount,
          notScored,
          qualified,
          unqualified,
          qualificationRate: scoredCount > 0 ? Math.round((qualified / scoredCount) * 100) : 0,
          averageScore: scoredCount > 0 ? Math.round(totalScore / scoredCount) : 0,
          gradeDistribution,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/qualify/:id - Qualify a lead by ID from database (MUST be LAST - catches all)
qualificationRouter.post(
  '/:id',
  validateBody(qualifyByIdSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const { criteria, useAI, aiProvider } = req.body;

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

      console.log(`[Qualification] Qualifying lead by ID: ${id}`);

      const result = useAI
        ? await qualifyLeadWithAI(lead, criteria, aiProvider)
        : qualifyLead(lead, criteria);

      // Update lead with qualification score
      await getSupabase()
        .from('leads')
        .update({
          metadata: {
            ...((lead.metadata as Record<string, unknown>) || {}),
            qualificationScore: result.score,
            qualificationGrade: result.grade,
            qualified: result.qualified,
            qualifiedAt: new Date().toISOString(),
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
