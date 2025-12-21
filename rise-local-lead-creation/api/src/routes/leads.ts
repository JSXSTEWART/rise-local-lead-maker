import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getSupabase, getLeads, createLead, updateLead } from '../integrations/supabase.js';
import { validateBody, validateQuery, paginationSchema } from '../middleware/validate.js';
import { createError } from '../middleware/error-handler.js';
import type { Lead } from '../types/lead.js';

export const leadsRouter = Router();

// Validation schemas
const createLeadSchema = z.object({
  email: z.string().email().optional(),
  firstName: z.string().optional(),
  lastName: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  phone: z.string().optional(),
  website: z.string().url().optional().or(z.string().optional()),
  linkedinUrl: z.string().url().optional(),
  location: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.string().optional(),
  source: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

const updateLeadSchema = createLeadSchema.partial();

const getLeadsQuerySchema = paginationSchema.extend({
  status: z.enum(['new', 'enriching', 'enriched', 'failed']).optional(),
  source: z.string().optional(),
  industry: z.string().optional(),
});

const bulkCreateSchema = z.object({
  leads: z.array(createLeadSchema).min(1).max(1000),
});

// GET /api/leads - List leads with pagination and filters
leadsRouter.get(
  '/',
  validateQuery(getLeadsQuerySchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, limit, status, source, industry } = req.query as unknown as z.infer<typeof getLeadsQuerySchema>;

      const supabase = getSupabase();
      let query = supabase
        .from('leads')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);

      if (status) {
        query = query.eq('status', status);
      }
      if (source) {
        query = query.eq('source', source);
      }
      if (industry) {
        query = query.ilike('industry', `%${industry}%`);
      }

      const { data, count, error } = await query;

      if (error) {
        throw createError('Failed to fetch leads', 500, 'DATABASE_ERROR', error);
      }

      res.json({
        success: true,
        data: {
          leads: data,
          pagination: {
            page,
            limit,
            total: count || 0,
            totalPages: Math.ceil((count || 0) / limit),
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/leads/stats - Get lead statistics
leadsRouter.get('/stats', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabase();

    // Get all leads for status counts
    const statusResult = await supabase.from('leads').select('status').execute<Lead[]>();
    const statusCounts: Record<string, number> = {
      new: 0,
      enriching: 0,
      enriched: 0,
      failed: 0,
    };
    statusResult.data?.forEach((lead) => {
      if (statusCounts[lead.status] !== undefined) {
        statusCounts[lead.status]++;
      }
    });

    // Get all leads for source counts
    const sourceResult = await supabase.from('leads').select('source').execute<Lead[]>();
    const sourceCounts: Record<string, number> = {};
    sourceResult.data?.forEach((lead) => {
      const src = lead.source || 'unknown';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    });

    const { count: totalCount } = await getSupabase()
      .from('leads')
      .select('*', { count: 'exact', head: true })
      .execute<Lead[]>();

    res.json({
      success: true,
      data: {
        total: totalCount || 0,
        byStatus: statusCounts,
        bySource: sourceCounts,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/leads/:id - Get single lead
leadsRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { data, error } = await getSupabase()
      .from('leads')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw createError('Lead not found', 404, 'NOT_FOUND');
    }

    res.json({
      success: true,
      data: data,
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/leads - Create new lead
leadsRouter.post(
  '/',
  validateBody(createLeadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const leadData: Lead = {
        ...req.body,
        status: 'new',
      };

      const lead = await createLead(leadData);

      res.status(201).json({
        success: true,
        data: lead,
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/leads/bulk - Bulk create leads
leadsRouter.post(
  '/bulk',
  validateBody(bulkCreateSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leads } = req.body as { leads: Lead[] };

      const leadsWithStatus = leads.map((lead) => ({
        ...lead,
        status: 'new' as const,
      }));

      const { data, error } = await getSupabase()
        .from('leads')
        .insert(leadsWithStatus)
        .select();

      if (error) {
        throw createError('Failed to create leads', 500, 'DATABASE_ERROR', error);
      }

      res.status(201).json({
        success: true,
        data: {
          created: data?.length || 0,
          leads: data,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/leads/:id - Update lead
leadsRouter.put(
  '/:id',
  validateBody(updateLeadSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { id } = req.params;
      const updates = req.body;

      const lead = await updateLead(id, updates);

      res.json({
        success: true,
        data: lead,
      });
    } catch (error) {
      next(error);
    }
  }
);

// DELETE /api/leads/:id - Delete lead
leadsRouter.delete('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { id } = req.params;

    const { error } = await getSupabase().from('leads').delete().eq('id', id);

    if (error) {
      throw createError('Failed to delete lead', 500, 'DATABASE_ERROR', error);
    }

    res.json({
      success: true,
      message: 'Lead deleted successfully',
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/leads/search - Search leads
leadsRouter.post(
  '/search',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { query, fields = ['company', 'email', 'location'] } = req.body;

      if (!query) {
        throw createError('Search query is required', 400, 'VALIDATION_ERROR');
      }

      let searchQuery = getSupabase().from('leads').select('*');

      // Build OR conditions for search
      const orConditions = fields
        .map((field: string) => `${field}.ilike.%${query}%`)
        .join(',');

      const { data, error } = await searchQuery.or(orConditions).limit(100);

      if (error) {
        throw createError('Search failed', 500, 'DATABASE_ERROR', error);
      }

      res.json({
        success: true,
        data: {
          query,
          results: data,
          count: data?.length || 0,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/leads/deduplicate - Find and merge duplicates
leadsRouter.post('/deduplicate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { data: leads, error } = await getSupabase()
      .from('leads')
      .select('*')
      .order('created_at', { ascending: true });

    if (error) {
      throw createError('Failed to fetch leads', 500, 'DATABASE_ERROR', error);
    }

    const emailMap = new Map<string, any[]>();
    const duplicates: { original: any; duplicates: any[] }[] = [];

    leads?.forEach((lead: any) => {
      if (lead.email) {
        const existing = emailMap.get(lead.email.toLowerCase());
        if (existing) {
          existing.push(lead);
        } else {
          emailMap.set(lead.email.toLowerCase(), [lead]);
        }
      }
    });

    emailMap.forEach((group) => {
      if (group.length > 1) {
        duplicates.push({
          original: group[0],
          duplicates: group.slice(1),
        });
      }
    });

    res.json({
      success: true,
      data: {
        totalLeads: leads?.length || 0,
        duplicateGroups: duplicates.length,
        duplicateCount: duplicates.reduce((sum, g) => sum + g.duplicates.length, 0),
        duplicates,
      },
    });
  } catch (error) {
    next(error);
  }
});
