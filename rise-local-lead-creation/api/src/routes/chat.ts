import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';
import { getSupabase } from '../integrations/supabase.js';
import { validateBody } from '../middleware/validate.js';
import { createError } from '../middleware/error-handler.js';
import { env } from '../config/env.js';

export const chatRouter = Router();

const chatSchema = z.object({
  message: z.string().min(1).max(2000),
  context: z.object({
    leadId: z.string().optional(),
    leadData: z.record(z.unknown()).optional(),
  }).optional(),
});

// Initialize Anthropic client
const getAnthropicClient = () => {
  if (!env.ANTHROPIC_API_KEY) {
    throw createError('Anthropic API key not configured', 500, 'CONFIG_ERROR');
  }
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
};

// POST /api/chat - Chat with AI assistant
chatRouter.post(
  '/',
  validateBody(chatSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { message, context } = req.body;
      const anthropic = getAnthropicClient();

      // Get lead stats for context
      const supabase = getSupabase();
      const { data: stats } = await supabase
        .from('leads')
        .select('status, source, company, location');

      const leadCount = stats?.length || 0;
      const statusCounts = stats?.reduce((acc: any, l: any) => {
        acc[l.status] = (acc[l.status] || 0) + 1;
        return acc;
      }, {}) || {};

      const sourceCounts = stats?.reduce((acc: any, l: any) => {
        acc[l.source || 'unknown'] = (acc[l.source || 'unknown'] || 0) + 1;
        return acc;
      }, {}) || {};

      // Build system prompt
      let systemPrompt = `You are an AI assistant for Rise Lead Scraper, a lead generation and management tool. You help users:
- Find and scrape business leads from Google Places
- Analyze and enrich lead data
- Understand their lead database
- Provide insights about leads and businesses

Current Database Stats:
- Total leads: ${leadCount}
- By Status: ${JSON.stringify(statusCounts)}
- By Source: ${JSON.stringify(sourceCounts)}

Available actions users can take:
- Search Google Places for businesses (e.g., "dentists in Austin TX")
- Scrape websites for contact info
- Enrich leads with additional data
- Export leads to CSV
- Filter and search leads

Be helpful, concise, and actionable. If the user asks about scraping, provide example queries they could use.`;

      // Add lead context if provided
      if (context?.leadData) {
        systemPrompt += `\n\nCurrent Lead Being Viewed:\n${JSON.stringify(context.leadData, null, 2)}`;
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: [
          { role: 'user', content: message }
        ],
      });

      const assistantMessage = response.content[0].type === 'text'
        ? response.content[0].text
        : 'Unable to generate response';

      res.json({
        success: true,
        data: {
          message: assistantMessage,
          usage: {
            inputTokens: response.usage.input_tokens,
            outputTokens: response.usage.output_tokens,
          },
        },
      });
    } catch (error: any) {
      if (error.status === 401) {
        next(createError('Invalid Anthropic API key', 401, 'AUTH_ERROR'));
      } else {
        next(error);
      }
    }
  }
);

// POST /api/chat/analyze-lead - Get AI analysis of a lead
chatRouter.post(
  '/analyze-lead',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { leadId } = req.body;

      if (!leadId) {
        throw createError('Lead ID required', 400, 'VALIDATION_ERROR');
      }

      const anthropic = getAnthropicClient();
      const supabase = getSupabase();

      // Fetch lead
      const { data: lead, error } = await supabase
        .from('leads')
        .select('*')
        .eq('id', leadId)
        .single();

      if (error || !lead) {
        throw createError('Lead not found', 404, 'NOT_FOUND');
      }

      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: 'You are a business analyst helping qualify leads. Provide actionable insights about the business, potential value, and suggested outreach strategies. Be concise but thorough.',
        messages: [
          {
            role: 'user',
            content: `Analyze this lead and provide insights:\n\n${JSON.stringify(lead, null, 2)}\n\nProvide:\n1. Business Overview (2-3 sentences)\n2. Lead Quality Score (1-10) with reasoning\n3. Best Contact Approach\n4. Key Talking Points\n5. Potential Concerns`
          }
        ],
      });

      const analysis = response.content[0].type === 'text'
        ? response.content[0].text
        : 'Unable to analyze lead';

      res.json({
        success: true,
        data: {
          leadId,
          analysis,
          analyzedAt: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
