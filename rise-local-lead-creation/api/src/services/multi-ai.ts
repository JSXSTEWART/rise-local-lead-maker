import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env.js';
import type { Lead } from '../types/index.js';

// Initialize clients
function getAnthropic(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) {
    throw new Error('Anthropic API key not configured');
  }
  return new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
}

function getGemini() {
  if (!env.GEMINI_API_KEY) {
    throw new Error('Gemini API key not configured');
  }
  const client = new GoogleGenerativeAI(env.GEMINI_API_KEY);
  return client.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
}

export interface MultiAIResult {
  claude: {
    response: any;
    reasoning?: string;
  };
  gemini: {
    response: any;
    reasoning?: string;
  };
  consensus?: any;
  synthesis?: string;
  confidence: number;
  processingTime: number;
}

export interface DeepEnrichmentResult {
  lead: Lead;
  combinedScore: number;
  confidence: number;
  insights: {
    shared: string[];      // Insights both AIs agree on
    claudeUnique: string[]; // Insights only Claude identified
    geminiUnique: string[]; // Insights only Gemini identified
  };
  recommendations: {
    priority: string[];    // High-confidence recommendations
    exploratory: string[]; // Lower-confidence suggestions
  };
  outreachStrategy: {
    approach: string;
    timing: string;
    channels: string[];
    messageThemes: string[];
  };
  riskFactors: string[];
  opportunitySignals: string[];
}

/**
 * Run both AIs in parallel on the same prompt and synthesize results
 */
export async function multiAIAnalyze(
  prompt: string,
  options: { synthesize?: boolean; temperature?: number } = {}
): Promise<MultiAIResult> {
  const startTime = Date.now();
  const { synthesize = true } = options;

  // Run both AIs in parallel
  const [claudeResult, geminiResult] = await Promise.allSettled([
    callClaude(prompt),
    callGemini(prompt),
  ]);

  const claudeResponse = claudeResult.status === 'fulfilled' ? claudeResult.value : null;
  const geminiResponse = geminiResult.status === 'fulfilled' ? geminiResult.value : null;

  let synthesis: string | undefined;
  let confidence = 0;

  if (synthesize && claudeResponse && geminiResponse) {
    // Have Claude synthesize both responses
    const synthesisResult = await synthesizeResponses(claudeResponse, geminiResponse, prompt);
    synthesis = synthesisResult.synthesis;
    confidence = synthesisResult.confidence;
  } else if (claudeResponse || geminiResponse) {
    confidence = 0.5; // Only one AI responded
  }

  return {
    claude: {
      response: claudeResponse,
      reasoning: claudeResult.status === 'rejected' ? claudeResult.reason?.message : undefined,
    },
    gemini: {
      response: geminiResponse,
      reasoning: geminiResult.status === 'rejected' ? geminiResult.reason?.message : undefined,
    },
    synthesis,
    confidence,
    processingTime: Date.now() - startTime,
  };
}

/**
 * Both AIs debate/analyze from different perspectives, then reach consensus
 */
export async function multiAIConsensus(
  topic: string,
  context: Record<string, any>
): Promise<MultiAIResult> {
  const startTime = Date.now();

  const basePrompt = `Analyze the following topic and provide your perspective.

Topic: ${topic}

Context:
${JSON.stringify(context, null, 2)}

Provide your analysis as JSON:
{
  "position": "Your main conclusion or recommendation",
  "confidence": 0.0-1.0,
  "keyPoints": ["point1", "point2", "point3"],
  "concerns": ["concern1", "concern2"],
  "recommendation": "Your specific recommendation"
}`;

  // Get both perspectives
  const [claudeResult, geminiResult] = await Promise.allSettled([
    callClaude(basePrompt),
    callGemini(basePrompt),
  ]);

  const claudeResponse = claudeResult.status === 'fulfilled' ? parseJSON(claudeResult.value) : null;
  const geminiResponse = geminiResult.status === 'fulfilled' ? parseJSON(geminiResult.value) : null;

  // Find consensus
  let consensus: any;
  let confidence = 0;

  if (claudeResponse && geminiResponse) {
    consensus = await findConsensus(claudeResponse, geminiResponse, topic);

    // Calculate confidence based on agreement
    const claudeConf = claudeResponse.confidence || 0.5;
    const geminiConf = geminiResponse.confidence || 0.5;

    if (claudeResponse.position === geminiResponse.position) {
      confidence = (claudeConf + geminiConf) / 2 + 0.2; // Boost for agreement
    } else {
      confidence = Math.min(claudeConf, geminiConf) * 0.7; // Reduce for disagreement
    }
    confidence = Math.min(1, Math.max(0, confidence));
  }

  return {
    claude: { response: claudeResponse },
    gemini: { response: geminiResponse },
    consensus,
    confidence,
    processingTime: Date.now() - startTime,
  };
}

/**
 * Deep lead enrichment using both AIs collaboratively
 */
export async function deepEnrichLead(lead: Lead): Promise<DeepEnrichmentResult> {
  const startTime = Date.now();

  const leadContext = `
Lead Information:
- Company: ${lead.company || 'Unknown'}
- Industry: ${lead.industry || 'Unknown'}
- Location: ${lead.location || 'Unknown'}
- Website: ${lead.website || 'N/A'}
- Email: ${lead.email || 'N/A'}
- Phone: ${lead.phone || 'N/A'}
- Rating: ${(lead.metadata as any)?.rating || 'N/A'}
- Reviews: ${(lead.metadata as any)?.reviewCount || 'N/A'}
- Source: ${lead.source || 'Unknown'}
`;

  // Phase 1: Independent analysis from both AIs
  const analysisPrompt = `${leadContext}

Analyze this business lead for B2B sales potential. Provide detailed JSON:
{
  "score": 1-10,
  "confidence": 0.0-1.0,
  "insights": ["insight1", "insight2", "insight3", "insight4", "insight5"],
  "recommendations": ["rec1", "rec2", "rec3"],
  "risks": ["risk1", "risk2"],
  "opportunities": ["opp1", "opp2"],
  "outreachApproach": "recommended approach",
  "bestChannels": ["channel1", "channel2"],
  "messageThemes": ["theme1", "theme2"]
}`;

  const [claudeAnalysis, geminiAnalysis] = await Promise.allSettled([
    callClaude(analysisPrompt),
    callGemini(analysisPrompt),
  ]);

  const claudeData = claudeAnalysis.status === 'fulfilled' ? parseJSON(claudeAnalysis.value) : null;
  const geminiData = geminiAnalysis.status === 'fulfilled' ? parseJSON(geminiAnalysis.value) : null;

  // Phase 2: Synthesis - find shared insights and unique perspectives
  const sharedInsights: string[] = [];
  const claudeUnique: string[] = [];
  const geminiUnique: string[] = [];

  if (claudeData?.insights && geminiData?.insights) {
    // Find overlapping themes (simplified matching)
    for (const cInsight of claudeData.insights) {
      const hasMatch = geminiData.insights.some((gInsight: string) =>
        similarText(cInsight, gInsight)
      );
      if (hasMatch) {
        sharedInsights.push(cInsight);
      } else {
        claudeUnique.push(cInsight);
      }
    }
    for (const gInsight of geminiData.insights) {
      const hasMatch = claudeData.insights.some((cInsight: string) =>
        similarText(gInsight, cInsight)
      );
      if (!hasMatch) {
        geminiUnique.push(gInsight);
      }
    }
  }

  // Calculate combined score
  const claudeScore = claudeData?.score || 5;
  const geminiScore = geminiData?.score || 5;
  const claudeConf = claudeData?.confidence || 0.5;
  const geminiConf = geminiData?.confidence || 0.5;

  // Weighted average based on confidence
  const totalConf = claudeConf + geminiConf;
  const combinedScore = Math.round(
    (claudeScore * claudeConf + geminiScore * geminiConf) / totalConf
  );

  // Merge recommendations
  const allRecs = [
    ...(claudeData?.recommendations || []),
    ...(geminiData?.recommendations || []),
  ];
  const uniqueRecs = [...new Set(allRecs)];

  // Priority recs are those mentioned by both or with high confidence
  const priorityRecs = uniqueRecs.slice(0, 3);
  const exploratoryRecs = uniqueRecs.slice(3);

  // Merge risks and opportunities
  const risks = [...new Set([
    ...(claudeData?.risks || []),
    ...(geminiData?.risks || []),
  ])];

  const opportunities = [...new Set([
    ...(claudeData?.opportunities || []),
    ...(geminiData?.opportunities || []),
  ])];

  // Outreach strategy synthesis
  const channels = [...new Set([
    ...(claudeData?.bestChannels || []),
    ...(geminiData?.bestChannels || []),
  ])];

  const messageThemes = [...new Set([
    ...(claudeData?.messageThemes || []),
    ...(geminiData?.messageThemes || []),
  ])];

  // Calculate overall confidence
  const scoreAgreement = 1 - Math.abs(claudeScore - geminiScore) / 10;
  const overallConfidence = (claudeConf + geminiConf) / 2 * scoreAgreement;

  return {
    lead,
    combinedScore,
    confidence: Math.round(overallConfidence * 100) / 100,
    insights: {
      shared: sharedInsights,
      claudeUnique,
      geminiUnique,
    },
    recommendations: {
      priority: priorityRecs,
      exploratory: exploratoryRecs,
    },
    outreachStrategy: {
      approach: claudeData?.outreachApproach || geminiData?.outreachApproach || 'Standard outreach',
      timing: determineBestTiming(lead),
      channels,
      messageThemes,
    },
    riskFactors: risks,
    opportunitySignals: opportunities,
  };
}

/**
 * Generate outreach content using both AIs
 */
export async function generateMultiAIOutreach(
  lead: Lead,
  style: 'formal' | 'casual' | 'consultative' = 'consultative'
): Promise<{
  subject: string;
  body: string;
  alternateSubjects: string[];
  followUpIdeas: string[];
  confidence: number;
}> {
  const prompt = `Generate a ${style} cold outreach email for this lead:

Company: ${lead.company}
Industry: ${lead.industry}
Location: ${lead.location}
Contact Email: ${lead.email}

Create a compelling outreach email. Return JSON:
{
  "subject": "email subject line",
  "body": "email body text",
  "alternateSubjects": ["alt1", "alt2"],
  "followUpIdeas": ["idea1", "idea2"],
  "confidence": 0.0-1.0
}`;

  const [claudeResult, geminiResult] = await Promise.allSettled([
    callClaude(prompt),
    callGemini(prompt),
  ]);

  const claudeEmail = claudeResult.status === 'fulfilled' ? parseJSON(claudeResult.value) : null;
  const geminiEmail = geminiResult.status === 'fulfilled' ? parseJSON(geminiResult.value) : null;

  // Pick the best email (higher confidence) or merge
  if (claudeEmail && geminiEmail) {
    const useClaudeBody = (claudeEmail.confidence || 0.5) >= (geminiEmail.confidence || 0.5);

    return {
      subject: useClaudeBody ? claudeEmail.subject : geminiEmail.subject,
      body: useClaudeBody ? claudeEmail.body : geminiEmail.body,
      alternateSubjects: [
        ...(claudeEmail.alternateSubjects || []),
        ...(geminiEmail.alternateSubjects || []),
        // Include the other AI's subject as an alternate
        useClaudeBody ? geminiEmail.subject : claudeEmail.subject,
      ].slice(0, 4),
      followUpIdeas: [...new Set([
        ...(claudeEmail.followUpIdeas || []),
        ...(geminiEmail.followUpIdeas || []),
      ])],
      confidence: Math.max(claudeEmail.confidence || 0.5, geminiEmail.confidence || 0.5),
    };
  }

  const result = claudeEmail || geminiEmail;
  return {
    subject: result?.subject || 'Introduction',
    body: result?.body || 'Email generation failed',
    alternateSubjects: result?.alternateSubjects || [],
    followUpIdeas: result?.followUpIdeas || [],
    confidence: result?.confidence || 0.3,
  };
}

/**
 * Competitive analysis using both AIs
 */
export async function multiAICompetitorAnalysis(
  company: string,
  industry: string,
  website?: string
): Promise<{
  competitors: string[];
  marketPosition: string;
  strengths: string[];
  weaknesses: string[];
  opportunities: string[];
  threats: string[];
  confidence: number;
}> {
  const prompt = `Analyze the competitive landscape for:
Company: ${company}
Industry: ${industry}
Website: ${website || 'N/A'}

Provide competitive analysis as JSON:
{
  "competitors": ["competitor1", "competitor2", "competitor3"],
  "marketPosition": "description of market position",
  "strengths": ["strength1", "strength2"],
  "weaknesses": ["weakness1", "weakness2"],
  "opportunities": ["opp1", "opp2"],
  "threats": ["threat1", "threat2"],
  "confidence": 0.0-1.0
}`;

  const result = await multiAIAnalyze(prompt, { synthesize: false });

  const claudeData = parseJSON(result.claude.response);
  const geminiData = parseJSON(result.gemini.response);

  // Merge results
  return {
    competitors: [...new Set([
      ...(claudeData?.competitors || []),
      ...(geminiData?.competitors || []),
    ])].slice(0, 5),
    marketPosition: claudeData?.marketPosition || geminiData?.marketPosition || 'Unknown',
    strengths: [...new Set([
      ...(claudeData?.strengths || []),
      ...(geminiData?.strengths || []),
    ])],
    weaknesses: [...new Set([
      ...(claudeData?.weaknesses || []),
      ...(geminiData?.weaknesses || []),
    ])],
    opportunities: [...new Set([
      ...(claudeData?.opportunities || []),
      ...(geminiData?.opportunities || []),
    ])],
    threats: [...new Set([
      ...(claudeData?.threats || []),
      ...(geminiData?.threats || []),
    ])],
    confidence: result.confidence,
  };
}

// Helper functions

async function callClaude(prompt: string): Promise<string> {
  const anthropic = getAnthropic();
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const textContent = message.content.find((block) => block.type === 'text');
  if (!textContent || textContent.type !== 'text') {
    throw new Error('No text response from Claude');
  }
  return textContent.text;
}

async function callGemini(prompt: string): Promise<string> {
  const gemini = getGemini();
  const result = await gemini.generateContent(prompt);
  return result.response.text();
}

function parseJSON(text: string | null): any {
  if (!text) return null;
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (e) {
    console.warn('Failed to parse JSON from AI response');
  }
  return null;
}

async function synthesizeResponses(
  claudeResponse: string,
  geminiResponse: string,
  originalPrompt: string
): Promise<{ synthesis: string; confidence: number }> {
  const anthropic = getAnthropic();

  const synthesisPrompt = `You received two AI analyses for the same prompt. Synthesize them into a unified response.

Original Prompt: ${originalPrompt}

Claude's Response:
${claudeResponse}

Gemini's Response:
${geminiResponse}

Create a synthesis that:
1. Combines the best insights from both
2. Resolves any contradictions
3. Provides a confidence score

Return JSON:
{
  "synthesis": "unified analysis combining both perspectives",
  "agreements": ["points both AIs agreed on"],
  "disagreements": ["points where they differed"],
  "confidence": 0.0-1.0
}`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2048,
    messages: [{ role: 'user', content: synthesisPrompt }],
  });

  const textContent = message.content.find((block) => block.type === 'text');
  const result = parseJSON(textContent?.type === 'text' ? textContent.text : '');

  return {
    synthesis: result?.synthesis || 'Synthesis failed',
    confidence: result?.confidence || 0.5,
  };
}

async function findConsensus(
  claudeAnalysis: any,
  geminiAnalysis: any,
  topic: string
): Promise<any> {
  const anthropic = getAnthropic();

  const consensusPrompt = `Find consensus between two AI analyses on: ${topic}

Claude's Position: ${claudeAnalysis.position}
Claude's Key Points: ${JSON.stringify(claudeAnalysis.keyPoints)}
Claude's Concerns: ${JSON.stringify(claudeAnalysis.concerns)}

Gemini's Position: ${geminiAnalysis.position}
Gemini's Key Points: ${JSON.stringify(geminiAnalysis.keyPoints)}
Gemini's Concerns: ${JSON.stringify(geminiAnalysis.concerns)}

Find the consensus position. Return JSON:
{
  "consensusPosition": "the agreed-upon conclusion",
  "sharedPoints": ["points both agree on"],
  "unresolvedDifferences": ["areas of disagreement"],
  "finalRecommendation": "unified recommendation",
  "confidence": 0.0-1.0
}`;

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 1024,
    messages: [{ role: 'user', content: consensusPrompt }],
  });

  const textContent = message.content.find((block) => block.type === 'text');
  return parseJSON(textContent?.type === 'text' ? textContent.text : '');
}

function similarText(text1: string, text2: string): boolean {
  // Simple similarity check - could be enhanced with embeddings
  const words1 = new Set(text1.toLowerCase().split(/\s+/));
  const words2 = new Set(text2.toLowerCase().split(/\s+/));

  let overlap = 0;
  for (const word of words1) {
    if (words2.has(word) && word.length > 3) {
      overlap++;
    }
  }

  const similarity = overlap / Math.min(words1.size, words2.size);
  return similarity > 0.3;
}

function determineBestTiming(lead: Lead): string {
  // Simple heuristic based on location/industry
  const location = (lead.location || '').toLowerCase();

  if (location.includes('europe') || location.includes('uk')) {
    return 'Morning (9-11 AM local time)';
  } else if (location.includes('asia') || location.includes('pacific')) {
    return 'Early afternoon (1-3 PM local time)';
  }

  return 'Mid-morning (10 AM - 12 PM local time)';
}

export function isMultiAIConfigured(): boolean {
  return Boolean(env.ANTHROPIC_API_KEY && env.GEMINI_API_KEY);
}

export function getAvailableAIs(): string[] {
  const available: string[] = [];
  if (env.ANTHROPIC_API_KEY) available.push('claude');
  if (env.GEMINI_API_KEY) available.push('gemini');
  return available;
}
