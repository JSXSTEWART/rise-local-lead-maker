import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { env } from '../config/env.js';
import type { Lead, AIEnrichment } from '../types/index.js';

let geminiClient: GoogleGenerativeAI | null = null;
let model: GenerativeModel | null = null;

function getGemini(): GenerativeModel {
  if (!model) {
    if (!env.GEMINI_API_KEY) {
      throw new Error('Gemini API key not configured');
    }

    geminiClient = new GoogleGenerativeAI(env.GEMINI_API_KEY);
    model = geminiClient.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
  }
  return model;
}

const DEFAULT_ENRICHMENT_PROMPT = `Analyze this lead and provide insights for sales outreach.

Lead Information:
- Name: {firstName} {lastName}
- Company: {company}
- Title: {title}
- Industry: {industry}
- Location: {location}
- Website: {website}

Provide:
1. A brief summary of this lead's potential value (2-3 sentences)
2. 3-5 key insights about their likely pain points or needs
3. A lead score from 1-10 based on the information available
4. 2-3 personalized outreach recommendations

Respond in JSON format:
{
  "summary": "...",
  "insights": ["...", "..."],
  "score": 7,
  "recommendations": ["...", "..."]
}`;

export async function enrichWithGemini(
  lead: Lead,
  customPrompt?: string
): Promise<AIEnrichment> {
  const gemini = getGemini();

  const prompt = (customPrompt || DEFAULT_ENRICHMENT_PROMPT)
    .replace('{firstName}', lead.firstName || 'Unknown')
    .replace('{lastName}', lead.lastName || '')
    .replace('{company}', lead.company || 'Unknown')
    .replace('{title}', lead.title || 'Unknown')
    .replace('{industry}', lead.industry || 'Unknown')
    .replace('{location}', lead.location || 'Unknown')
    .replace('{website}', lead.website || 'N/A');

  try {
    const result = await gemini.generateContent(prompt);
    const response = result.response.text();

    // Extract JSON from response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to parse Gemini response as JSON');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    return {
      summary: parsed.summary,
      insights: parsed.insights || [],
      score: parsed.score,
      recommendations: parsed.recommendations || [],
    };
  } catch (error) {
    console.error('Gemini enrichment failed:', error);
    throw error;
  }
}

export async function batchEnrichWithGemini(
  leads: Lead[],
  customPrompt?: string
): Promise<Map<string, AIEnrichment>> {
  const results = new Map<string, AIEnrichment>();

  // Process in batches to avoid rate limits
  const batchSize = 5;
  for (let i = 0; i < leads.length; i += batchSize) {
    const batch = leads.slice(i, i + batchSize);

    const enrichments = await Promise.allSettled(
      batch.map((lead) => enrichWithGemini(lead, customPrompt))
    );

    enrichments.forEach((result, index) => {
      const lead = batch[index];
      if (result.status === 'fulfilled' && lead.email) {
        results.set(lead.email, result.value);
      }
    });

    // Rate limit delay
    if (i + batchSize < leads.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return results;
}

export async function generateOutreachEmail(
  lead: Lead,
  context?: string
): Promise<string> {
  const gemini = getGemini();

  const prompt = `Write a personalized cold outreach email for this lead.

Lead:
- Name: ${lead.firstName} ${lead.lastName}
- Company: ${lead.company}
- Title: ${lead.title}
- Industry: ${lead.industry}

${context ? `Additional context: ${context}` : ''}

Write a short, professional email (under 150 words) that:
1. Has a compelling subject line
2. Opens with something relevant to their role/company
3. Briefly introduces value proposition
4. Ends with a clear, low-pressure CTA

Format:
Subject: ...

Body:
...`;

  const result = await gemini.generateContent(prompt);
  return result.response.text();
}

export function isGeminiConfigured(): boolean {
  return Boolean(env.GEMINI_API_KEY);
}
