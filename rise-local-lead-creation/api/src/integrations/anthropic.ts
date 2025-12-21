import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env.js';
import type { Lead, AIEnrichment } from '../types/index.js';

let anthropicClient: Anthropic | null = null;

function getAnthropic(): Anthropic {
  if (!anthropicClient) {
    if (!env.ANTHROPIC_API_KEY) {
      throw new Error('Anthropic API key not configured');
    }

    anthropicClient = new Anthropic({
      apiKey: env.ANTHROPIC_API_KEY,
    });
  }
  return anthropicClient;
}

const DEFAULT_ENRICHMENT_PROMPT = `Analyze this lead and provide actionable sales insights.

Lead Information:
- Name: {firstName} {lastName}
- Company: {company}
- Title: {title}
- Industry: {industry}
- Location: {location}
- Website: {website}
- LinkedIn: {linkedinUrl}

Provide a detailed analysis including:
1. Summary: A concise assessment of this lead's potential (2-3 sentences)
2. Insights: Key observations about their likely needs, pain points, or opportunities
3. Score: Rate this lead 1-10 based on available information quality and fit
4. Recommendations: Specific, actionable outreach strategies

Return your response as valid JSON matching this structure:
{
  "summary": "string",
  "insights": ["string", "string", "string"],
  "score": number,
  "recommendations": ["string", "string"]
}`;

export async function enrichWithAnthropic(
  lead: Lead,
  customPrompt?: string
): Promise<AIEnrichment> {
  const anthropic = getAnthropic();

  const prompt = (customPrompt || DEFAULT_ENRICHMENT_PROMPT)
    .replace('{firstName}', lead.firstName || 'Unknown')
    .replace('{lastName}', lead.lastName || '')
    .replace('{company}', lead.company || 'Unknown')
    .replace('{title}', lead.title || 'Unknown')
    .replace('{industry}', lead.industry || 'Unknown')
    .replace('{location}', lead.location || 'Unknown')
    .replace('{website}', lead.website || 'N/A')
    .replace('{linkedinUrl}', lead.linkedinUrl || 'N/A');

  try {
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const textContent = message.content.find((block) => block.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Anthropic');
    }

    const response = textContent.text;
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse Anthropic response as JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      summary: parsed.summary,
      insights: parsed.insights || [],
      score: parsed.score,
      recommendations: parsed.recommendations || [],
    };
  } catch (error) {
    console.error('Anthropic enrichment failed:', error);
    throw error;
  }
}

export async function batchEnrichWithAnthropic(
  leads: Lead[],
  customPrompt?: string
): Promise<Map<string, AIEnrichment>> {
  const results = new Map<string, AIEnrichment>();

  // Process sequentially to respect rate limits
  for (const lead of leads) {
    try {
      const enrichment = await enrichWithAnthropic(lead, customPrompt);
      if (lead.email) {
        results.set(lead.email, enrichment);
      }
    } catch (error) {
      console.error(`Failed to enrich lead ${lead.email}:`, error);
    }

    // Rate limit delay
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return results;
}

export async function analyzeLeadBatch(leads: Lead[]): Promise<{
  summary: string;
  topLeads: string[];
  commonPatterns: string[];
}> {
  const anthropic = getAnthropic();

  const leadsText = leads
    .map((l) => `- ${l.firstName} ${l.lastName} | ${l.company} | ${l.title}`)
    .join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: `Analyze this batch of leads and identify patterns:

${leadsText}

Provide:
1. A summary of the lead batch (industries, seniority levels, company sizes)
2. Top 3-5 highest potential leads by email
3. Common patterns or segments you notice

Return as JSON:
{
  "summary": "string",
  "topLeads": ["email1", "email2"],
  "commonPatterns": ["pattern1", "pattern2"]
}`,
      },
    ],
  });

  const textContent = message.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Anthropic');
  }

  const jsonMatch = textContent.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('Failed to parse batch analysis response');
  }

  return JSON.parse(jsonMatch[0]);
}

export function isAnthropicConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY);
}
