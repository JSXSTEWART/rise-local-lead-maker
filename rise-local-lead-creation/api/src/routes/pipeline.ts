import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { getSupabase, getPool } from '../integrations/supabase.js';
import { validateBody } from '../middleware/validate.js';
import { createError } from '../middleware/error-handler.js';
import Anthropic from '@anthropic-ai/sdk';

export const pipelineRouter = Router();

// Helper to format date for MySQL
function mysqlDateTime(date = new Date()): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

// Raw database lead type (snake_case)
interface DbLead {
  id: number;
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  phone?: string;
  website?: string;
  linkedin_url?: string;
  location?: string;
  industry?: string;
  company_size?: string;
  status?: string;
  pipeline_stage?: string;
  pipeline_updated_at?: string;
  qualification_score?: number;
  qualification_grade?: string;
  metadata?: any;
  created_at?: string;
}

interface DbInteraction {
  id: number;
  lead_id: number;
  type: string;
  subject?: string;
  content?: string;
  outcome?: string;
  scheduled_at?: string;
  completed_at?: string;
  created_by?: string;
  created_at?: string;
  metadata?: any;
  leads?: { company?: string };
}

interface DbProposal {
  id: number;
  lead_id: number;
  title: string;
  content: string;
  services?: any;
  pricing?: any;
  ai_generated?: boolean;
  status: string;
  sent_at?: string;
  viewed_at?: string;
  responded_at?: string;
  created_at?: string;
}

const PIPELINE_STAGES = ['new', 'contacted', 'responded', 'meeting', 'proposal', 'negotiating', 'won', 'lost'] as const;

// Validation schemas
const updatePipelineStageSchema = z.object({
  stage: z.enum(PIPELINE_STAGES),
  note: z.string().optional(),
});

const createInteractionSchema = z.object({
  leadId: z.number(),
  type: z.enum(['note', 'call', 'email_sent', 'email_received', 'meeting', 'proposal', 'stage_change', 'other']),
  subject: z.string().optional(),
  content: z.string(),
  outcome: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
});

const createTaskSchema = z.object({
  leadId: z.number(),
  title: z.string(),
  description: z.string().optional(),
  type: z.enum(['call', 'email', 'meeting', 'follow_up', 'proposal', 'other']),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
  dueDate: z.string().datetime(),
  assignedTo: z.string().optional(),
});

const generateProposalSchema = z.object({
  leadId: z.number(),
  services: z.array(z.string()).optional(),
  proposalType: z.string().optional(),
  customContext: z.string().optional(),
  customNotes: z.string().optional(),
  estimatedValue: z.number().optional(),
  tone: z.enum(['professional', 'friendly', 'persuasive']).default('professional'),
});

const sendEmailSchema = z.object({
  leadId: z.number().optional(),
  templateId: z.number().optional(),
  to: z.string().email().optional(),
  subject: z.string(),
  body: z.string(),
  scheduleAt: z.string().datetime().optional(),
});

// GET /api/pipeline - Get pipeline overview with leads by stage
pipelineRouter.get('/', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabase();

    const { data: leadsData, error } = await supabase
      .from('leads')
      .select('id, company, first_name, last_name, email, phone, website, location, industry, status, pipeline_stage, qualification_score, qualification_grade, metadata, created_at, pipeline_updated_at')
      .order('pipeline_updated_at', { ascending: false });

    if (error) throw createError('Failed to fetch pipeline', 500, 'DATABASE_ERROR', error);

    const leads = (leadsData || []) as unknown as DbLead[];

    // Group leads by pipeline stage
    const pipeline: Record<string, DbLead[]> = {};
    PIPELINE_STAGES.forEach(stage => {
      pipeline[stage] = [];
    });

    leads.forEach(lead => {
      const stage = lead.pipeline_stage || 'new';
      if (pipeline[stage]) {
        pipeline[stage].push(lead);
      }
    });

    // Get stage counts
    const stageCounts: Record<string, number> = {};
    PIPELINE_STAGES.forEach(stage => {
      stageCounts[stage] = pipeline[stage].length;
    });

    res.json({
      success: true,
      data: {
        pipeline,
        stageCounts,
        totalLeads: leads?.length || 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// PUT /api/pipeline/:id/stage - Update lead pipeline stage
pipelineRouter.put(
  '/:id/stage',
  validateBody(updatePipelineStageSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const leadId = parseInt(req.params.id);
      const { stage, note } = req.body;
      const supabase = getSupabase();

      // Get current lead info
      const { data: leadData, error: fetchError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (fetchError || !leadData) {
        throw createError('Lead not found', 404, 'NOT_FOUND');
      }

      const lead = leadData as unknown as DbLead;
      const previousStage = lead.pipeline_stage || 'new';

      // Update lead stage
      const { error: updateError } = await supabase
        .from('leads')
        .update({
          pipeline_stage: stage,
          pipeline_updated_at: mysqlDateTime(),
        })
        .eq('id', leadId);

      if (updateError) throw createError('Failed to update stage', 500, 'DATABASE_ERROR', updateError);

      // Log stage change as interaction
      await supabase.from('lead_interactions').insert({
        lead_id: leadId,
        type: 'stage_change',
        subject: `Stage changed: ${previousStage} → ${stage}`,
        content: note || `Pipeline stage updated from ${previousStage} to ${stage}`,
        created_by: 'user',
      });

      res.json({
        success: true,
        data: { leadId, previousStage, newStage: stage },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/pipeline/templates - Get email templates
pipelineRouter.get('/templates', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT * FROM email_templates WHERE is_active = 1 ORDER BY category'
    );

    res.json({ success: true, data: rows });
  } catch (error) {
    next(error);
  }
});

// GET /api/pipeline/stats/overview - Get pipeline statistics
pipelineRouter.get('/stats/overview', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabase();

    // Get stage counts
    const { data: leadsData } = await supabase.from('leads').select('pipeline_stage, qualification_grade');
    const leads = (leadsData || []) as unknown as DbLead[];

    const stageCounts: Record<string, number> = {};
    const gradeCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0, F: 0 };

    PIPELINE_STAGES.forEach(stage => stageCounts[stage] = 0);

    leads.forEach(lead => {
      const stage = lead.pipeline_stage || 'new';
      stageCounts[stage] = (stageCounts[stage] || 0) + 1;
      if (lead.qualification_grade) {
        gradeCounts[lead.qualification_grade] = (gradeCounts[lead.qualification_grade] || 0) + 1;
      }
    });

    // Get recent activity
    const { data: recentActivity } = await supabase
      .from('lead_interactions')
      .select('*, leads(company)')
      .order('created_at', { ascending: false })
      .limit(10);

    // Get pending tasks count
    const { count: pendingTasks } = await supabase
      .from('lead_tasks')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    // Get proposals stats
    const { data: proposalsData } = await supabase.from('lead_proposals').select('status');
    const proposals = (proposalsData || []) as unknown as DbProposal[];
    const proposalStats = {
      draft: proposals.filter(p => p.status === 'draft').length,
      sent: proposals.filter(p => p.status === 'sent').length,
      accepted: proposals.filter(p => p.status === 'accepted').length,
    };

    res.json({
      success: true,
      data: {
        stageCounts,
        gradeCounts,
        totalLeads: leads?.length || 0,
        pendingTasks: pendingTasks || 0,
        proposalStats,
        recentActivity: recentActivity || [],
        conversionRate: leads?.length ?
          Math.round((stageCounts.won / leads.length) * 100) : 0,
      },
    });
  } catch (error) {
    next(error);
  }
});

// GET /api/pipeline/:id - Get lead details with interactions
pipelineRouter.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const leadId = parseInt(req.params.id);
    const supabase = getSupabase();

    // Get lead details
    const { data: lead, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !lead) {
      throw createError('Lead not found', 404, 'NOT_FOUND');
    }

    // Get interactions
    const { data: interactions } = await supabase
      .from('lead_interactions')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    // Get proposals
    const { data: proposals } = await supabase
      .from('lead_proposals')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    // Get tasks
    const { data: tasks } = await supabase
      .from('lead_tasks')
      .select('*')
      .eq('lead_id', leadId)
      .order('due_date', { ascending: true });

    res.json({
      success: true,
      data: {
        lead,
        interactions: interactions || [],
        proposals: proposals || [],
        tasks: tasks || [],
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/pipeline/interactions - Create new interaction
pipelineRouter.post(
  '/interactions',
  validateBody(createInteractionSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadId, type, subject, content, outcome, scheduledAt } = req.body;
      const supabase = getSupabase();

      const insertData: Record<string, any> = {
        lead_id: leadId,
        type,
        created_by: 'user',
      };
      if (subject) insertData.subject = subject;
      if (content) insertData.content = content;
      if (outcome) insertData.outcome = outcome;
      if (scheduledAt) insertData.scheduled_at = scheduledAt;

      const { data, error } = await supabase
        .from('lead_interactions')
        .insert(insertData)
        .select()
        .single();

      if (error) throw createError('Failed to create interaction', 500, 'DATABASE_ERROR', error);

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/pipeline/interactions/:leadId - Get interactions for a lead
pipelineRouter.get('/interactions/:leadId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const leadId = parseInt(req.params.leadId);
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('lead_interactions')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) throw createError('Failed to fetch interactions', 500, 'DATABASE_ERROR', error);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// POST /api/pipeline/tasks - Create new task
pipelineRouter.post(
  '/tasks',
  validateBody(createTaskSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadId, title, description, type, priority, dueDate, assignedTo } = req.body;
      const supabase = getSupabase();

      const { data, error } = await supabase
        .from('lead_tasks')
        .insert({
          lead_id: leadId,
          title,
          description,
          type,
          priority,
          due_date: dueDate,
          assigned_to: assignedTo,
        })
        .select()
        .single();

      if (error) throw createError('Failed to create task', 500, 'DATABASE_ERROR', error);

      res.json({ success: true, data });
    } catch (error) {
      next(error);
    }
  }
);

// PUT /api/pipeline/tasks/:id - Update task status
pipelineRouter.put('/tasks/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const taskId = parseInt(req.params.id);
    const { status } = req.body;
    const supabase = getSupabase();

    const updateData: any = { status };
    if (status === 'completed') {
      updateData.completed_at = new Date().toISOString();
    }

    const { data, error } = await supabase
      .from('lead_tasks')
      .update(updateData)
      .eq('id', taskId)
      .select()
      .single();

    if (error) throw createError('Failed to update task', 500, 'DATABASE_ERROR', error);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// GET /api/pipeline/tasks - Get all pending tasks
pipelineRouter.get('/tasks/pending', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('lead_tasks')
      .select('*, leads(company, first_name, last_name)')
      .in('status', ['pending', 'in_progress'])
      .order('due_date', { ascending: true });

    if (error) throw createError('Failed to fetch tasks', 500, 'DATABASE_ERROR', error);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// POST /api/pipeline/proposals/generate - Generate AI proposal
pipelineRouter.post(
  '/proposals/generate',
  validateBody(generateProposalSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadId, services, proposalType, customContext, customNotes, estimatedValue, tone } = req.body;
      const supabase = getSupabase();

      // Get lead info
      const { data: leadData, error: leadError } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (leadError || !leadData) {
        throw createError('Lead not found', 404, 'NOT_FOUND');
      }

      const lead = leadData as unknown as DbLead;

      // Convert proposalType to services if services not provided
      const serviceTypeMap: Record<string, string[]> = {
        website: ['Website Design', 'Website Development', 'Responsive Design', 'SEO Setup'],
        seo: ['SEO Audit', 'Keyword Research', 'On-Page SEO', 'Link Building', 'Content Strategy'],
        marketing: ['Digital Marketing Strategy', 'Social Media Management', 'PPC Advertising', 'Email Marketing'],
        custom: ['Custom Solutions', 'Consulting', 'Implementation'],
      };
      const resolvedServices = services || serviceTypeMap[proposalType || 'custom'] || ['Consulting Services'];

      // Generate proposal using Anthropic
      const anthropic = new Anthropic();

      const prompt = `Generate a professional business proposal for the following lead:

Company: ${lead.company || 'Unknown Company'}
Contact: ${lead.first_name || ''} ${lead.last_name || ''}
Industry: ${lead.industry || 'General Business'}
Location: ${lead.location || 'Not specified'}
Website: ${lead.website || 'Not available'}
Estimated Project Value: $${estimatedValue || 5000}

Services to propose: ${resolvedServices.join(', ')}

${customContext ? `Additional context: ${customContext}` : ''}
${customNotes ? `Additional notes: ${customNotes}` : ''}

Tone: ${tone}

Please generate a complete proposal with:
1. Executive Summary
2. Understanding of Their Business
3. Proposed Solutions (for each service)
4. Pricing Tiers (Basic, Standard, Premium with placeholder prices)
5. Timeline
6. Next Steps
7. Terms and Conditions summary

Format the response as JSON with the following structure:
{
  "title": "Proposal title",
  "executiveSummary": "...",
  "businessUnderstanding": "...",
  "solutions": [{"service": "...", "description": "...", "benefits": [...]}],
  "pricing": {"basic": {...}, "standard": {...}, "premium": {...}},
  "timeline": "...",
  "nextSteps": [...],
  "terms": "..."
}`;

      const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      });

      const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

      // Parse JSON from response
      let proposalData;
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        proposalData = jsonMatch ? JSON.parse(jsonMatch[0]) : { content: responseText };
      } catch {
        proposalData = { content: responseText };
      }

      // Save proposal to database
      const { data: proposal, error: saveError } = await supabase
        .from('lead_proposals')
        .insert({
          lead_id: leadId,
          title: proposalData.title || `Proposal for ${lead.company}`,
          content: JSON.stringify(proposalData),
          services: JSON.stringify(services),
          pricing: proposalData.pricing ? JSON.stringify(proposalData.pricing) : null,
          ai_generated: true,
          status: 'draft',
        })
        .select()
        .single();

      if (saveError) throw createError('Failed to save proposal', 500, 'DATABASE_ERROR', saveError);

      // Log interaction
      await supabase.from('lead_interactions').insert({
        lead_id: leadId,
        type: 'proposal',
        subject: `AI Proposal Generated: ${proposalData.title || 'New Proposal'}`,
        content: `Generated proposal for services: ${resolvedServices.join(', ')}`,
        created_by: 'ai',
      });

      res.json({
        success: true,
        data: {
          proposal,
          proposalContent: proposalData,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/pipeline/proposals/:leadId - Get proposals for a lead
pipelineRouter.get('/proposals/:leadId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const leadId = parseInt(req.params.leadId);
    const supabase = getSupabase();

    const { data, error } = await supabase
      .from('lead_proposals')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false });

    if (error) throw createError('Failed to fetch proposals', 500, 'DATABASE_ERROR', error);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// PUT /api/pipeline/proposals/:id - Update proposal status
pipelineRouter.put('/proposals/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const proposalId = parseInt(req.params.id);
    const { status, content } = req.body;
    const supabase = getSupabase();

    const updateData: any = {};
    if (status) {
      updateData.status = status;
      if (status === 'sent') updateData.sent_at = new Date().toISOString();
      if (status === 'viewed') updateData.viewed_at = new Date().toISOString();
      if (status === 'accepted' || status === 'rejected') updateData.responded_at = new Date().toISOString();
    }
    if (content) updateData.content = content;

    const { data, error } = await supabase
      .from('lead_proposals')
      .update(updateData)
      .eq('id', proposalId)
      .select()
      .single();

    if (error) throw createError('Failed to update proposal', 500, 'DATABASE_ERROR', error);

    res.json({ success: true, data });
  } catch (error) {
    next(error);
  }
});

// POST /api/pipeline/email/compose - Compose email with template
pipelineRouter.post('/email/compose', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { leadId, templateId, templateType } = req.body;
    const supabase = getSupabase();

    // Get lead info
    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !leadData) {
      throw createError('Lead not found', 404, 'NOT_FOUND');
    }

    const lead = leadData as unknown as DbLead;

    let template: any = null;
    const pool = getPool();
    if (templateId) {
      const [rows] = await pool.execute(
        'SELECT * FROM email_templates WHERE id = ? LIMIT 1',
        [templateId]
      );
      template = (rows as any[])[0] || null;
    } else if (templateType) {
      const [rows] = await pool.execute(
        'SELECT * FROM email_templates WHERE category = ? AND is_active = 1 LIMIT 1',
        [templateType]
      );
      template = (rows as any[])[0] || null;
    }

    // Replace variables in template
    const variables: Record<string, string> = {
      first_name: lead.first_name || 'there',
      last_name: lead.last_name || '',
      company: lead.company || 'your company',
      industry: lead.industry || 'your industry',
      location: lead.location || 'your area',
      sender_name: 'Your Name',
    };

    let subject = template?.subject || '';
    let body = template?.body || '';

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{${key}}}`, 'g');
      subject = subject.replace(regex, value);
      body = body.replace(regex, value);
    });

    res.json({
      success: true,
      data: {
        lead,
        template,
        composedEmail: {
          to: lead.email,
          subject,
          body,
        },
        availableVariables: Object.keys(variables),
      },
    });
  } catch (error) {
    next(error);
  }
});

// POST /api/pipeline/email/send - Log sent email (actual sending would need SMTP)
pipelineRouter.post(
  '/email/send',
  validateBody(sendEmailSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadId, to, subject, body, scheduleAt } = req.body;
      const supabase = getSupabase();

      let interaction = null;

      // Log the email as an interaction only if leadId is provided
      if (leadId) {
        const insertData: Record<string, any> = {
          lead_id: leadId,
          type: 'email_sent',
          subject,
          content: body,
          created_by: 'user',
        };
        if (scheduleAt) insertData.scheduled_at = scheduleAt;
        if (!scheduleAt) insertData.completed_at = mysqlDateTime();

        const { data, error } = await supabase
          .from('lead_interactions')
          .insert(insertData)
          .select()
          .single();

        if (error) throw createError('Failed to log email', 500, 'DATABASE_ERROR', error);
        interaction = data;

        // Update pipeline stage if currently 'new'
        const { data: leadStage } = await supabase
          .from('leads')
          .select('pipeline_stage')
          .eq('id', leadId)
          .single();

        const stageData = leadStage as unknown as { pipeline_stage?: string } | null;
        if (stageData?.pipeline_stage === 'new') {
          await supabase
            .from('leads')
            .update({
              pipeline_stage: 'contacted',
              pipeline_updated_at: mysqlDateTime(),
            })
            .eq('id', leadId);
        }
      }

      res.json({
        success: true,
        data: { interaction, to, subject },
        message: 'Email logged successfully. Note: Actual email sending requires SMTP configuration.',
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/pipeline/email/generate - Generate AI email
pipelineRouter.post('/email/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { leadId, purpose, context } = req.body;
    const supabase = getSupabase();

    // Get lead info
    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .select('*')
      .eq('id', leadId)
      .single();

    if (leadError || !leadData) {
      throw createError('Lead not found', 404, 'NOT_FOUND');
    }

    const lead = leadData as unknown as DbLead;

    // Get recent interactions for context
    const { data: interactionsData } = await supabase
      .from('lead_interactions')
      .select('*')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .limit(5);

    const interactions = (interactionsData || []) as unknown as DbInteraction[];

    const anthropic = new Anthropic();

    const prompt = `Generate a professional email for the following lead:

Company: ${lead.company || 'Unknown Company'}
Contact: ${lead.first_name || ''} ${lead.last_name || ''}
Industry: ${lead.industry || 'General Business'}
Location: ${lead.location || 'Not specified'}
Current Pipeline Stage: ${lead.pipeline_stage || 'new'}

Purpose of email: ${purpose || 'initial outreach'}
${context ? `Additional context: ${context}` : ''}

Recent interactions:
${interactions.map(i => `- ${i.type}: ${i.subject || i.content?.substring(0, 100)}`).join('\n') || 'No previous interactions'}

Generate a personalized, professional email. Include:
1. A compelling subject line
2. Personalized opening
3. Value proposition
4. Clear call to action
5. Professional sign-off

Format response as JSON:
{
  "subject": "...",
  "body": "..."
}`;

    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseText = message.content[0].type === 'text' ? message.content[0].text : '';

    let emailData;
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      emailData = jsonMatch ? JSON.parse(jsonMatch[0]) : { subject: 'Follow up', body: responseText };
    } catch {
      emailData = { subject: 'Follow up', body: responseText };
    }

    res.json({
      success: true,
      data: {
        lead,
        generatedEmail: emailData,
      },
    });
  } catch (error) {
    next(error);
  }
});

export default pipelineRouter;
