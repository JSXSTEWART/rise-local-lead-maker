import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { env } from '../config/env';
import { Lead } from '../types/lead';

export interface QualificationCriteria {
  minCompanySize?: string;
  targetIndustries?: string[];
  targetLocations?: string[];
  mustHaveWebsite?: boolean;
  mustHaveEmail?: boolean;
  mustHavePhone?: boolean;
  minRating?: number;
  customCriteria?: string;
}

export interface QualificationResult {
  lead: Lead;
  score: number; // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  qualified: boolean;
  factors: QualificationFactor[];
  aiInsights?: string;
  recommendations?: string[];
  buyerPersonaMatch?: number;
  nextBestAction?: string;
}

export interface QualificationFactor {
  name: string;
  score: number;
  weight: number;
  reason: string;
}

export interface BatchQualificationResult {
  results: QualificationResult[];
  summary: {
    total: number;
    qualified: number;
    averageScore: number;
    gradeDistribution: Record<string, number>;
    topRecommendations: string[];
  };
}

// Rule-based scoring factors
function calculateDataCompleteness(lead: Lead): QualificationFactor {
  const fields = [
    lead.email,
    lead.phone,
    lead.website,
    lead.company,
    lead.firstName,
    lead.lastName,
    lead.title,
    lead.industry,
    lead.location,
    lead.linkedinUrl,
  ];

  const filledCount = fields.filter(Boolean).length;
  const percentage = (filledCount / fields.length) * 100;

  return {
    name: 'Data Completeness',
    score: percentage,
    weight: 0.15,
    reason: `${filledCount}/${fields.length} fields populated`,
  };
}

function calculateContactQuality(lead: Lead): QualificationFactor {
  let score = 0;
  const reasons: string[] = [];

  if (lead.email) {
    score += 40;
    // Corporate email is better than personal
    if (lead.email && !lead.email.match(/@(gmail|yahoo|hotmail|outlook)/i)) {
      score += 10;
      reasons.push('corporate email');
    } else {
      reasons.push('personal email');
    }
  }

  if (lead.phone) {
    score += 30;
    reasons.push('has phone');
  }

  if (lead.linkedinUrl) {
    score += 20;
    reasons.push('has LinkedIn');
  }

  return {
    name: 'Contact Quality',
    score: Math.min(100, score),
    weight: 0.2,
    reason: reasons.join(', ') || 'no contact info',
  };
}

function calculateBusinessPresence(lead: Lead): QualificationFactor {
  let score = 0;
  const reasons: string[] = [];

  if (lead.website) {
    score += 40;
    reasons.push('has website');
  }

  const metadata = lead.metadata as Record<string, any> || {};

  if (metadata.rating) {
    const rating = parseFloat(metadata.rating);
    if (rating >= 4.5) {
      score += 30;
      reasons.push(`excellent rating (${rating})`);
    } else if (rating >= 4.0) {
      score += 20;
      reasons.push(`good rating (${rating})`);
    } else if (rating >= 3.5) {
      score += 10;
      reasons.push(`average rating (${rating})`);
    }
  }

  if (metadata.reviewCount) {
    const reviews = parseInt(metadata.reviewCount);
    if (reviews >= 100) {
      score += 20;
      reasons.push(`high review count (${reviews})`);
    } else if (reviews >= 50) {
      score += 15;
      reasons.push(`moderate reviews (${reviews})`);
    } else if (reviews >= 10) {
      score += 10;
      reasons.push(`some reviews (${reviews})`);
    }
  }

  if (metadata.socialLinks && Object.keys(metadata.socialLinks).length > 0) {
    score += 10;
    reasons.push('social presence');
  }

  return {
    name: 'Business Presence',
    score: Math.min(100, score),
    weight: 0.2,
    reason: reasons.join(', ') || 'minimal online presence',
  };
}

function calculateIndustryFit(
  lead: Lead,
  criteria: QualificationCriteria
): QualificationFactor {
  if (!criteria.targetIndustries || criteria.targetIndustries.length === 0) {
    return {
      name: 'Industry Fit',
      score: 50, // Neutral score when no criteria
      weight: 0.15,
      reason: 'no target industries specified',
    };
  }

  const leadIndustry = (lead.industry || '').toLowerCase();
  const metadata = lead.metadata as Record<string, any> || {};
  const types = (metadata.types || []) as string[];

  for (const target of criteria.targetIndustries) {
    const targetLower = target.toLowerCase();
    if (
      leadIndustry.includes(targetLower) ||
      types.some((t) => t.toLowerCase().includes(targetLower))
    ) {
      return {
        name: 'Industry Fit',
        score: 100,
        weight: 0.15,
        reason: `matches target industry: ${target}`,
      };
    }
  }

  return {
    name: 'Industry Fit',
    score: 20,
    weight: 0.15,
    reason: `industry "${lead.industry || 'unknown'}" not in target list`,
  };
}

function calculateLocationFit(
  lead: Lead,
  criteria: QualificationCriteria
): QualificationFactor {
  if (!criteria.targetLocations || criteria.targetLocations.length === 0) {
    return {
      name: 'Location Fit',
      score: 50,
      weight: 0.1,
      reason: 'no target locations specified',
    };
  }

  const leadLocation = (lead.location || '').toLowerCase();

  for (const target of criteria.targetLocations) {
    if (leadLocation.includes(target.toLowerCase())) {
      return {
        name: 'Location Fit',
        score: 100,
        weight: 0.1,
        reason: `matches target location: ${target}`,
      };
    }
  }

  return {
    name: 'Location Fit',
    score: 20,
    weight: 0.1,
    reason: `location "${lead.location || 'unknown'}" not in target list`,
  };
}

function calculateRequirementsMet(
  lead: Lead,
  criteria: QualificationCriteria
): QualificationFactor {
  const requirements: string[] = [];
  const met: string[] = [];
  const failed: string[] = [];

  if (criteria.mustHaveEmail) {
    requirements.push('email');
    if (lead.email) met.push('email');
    else failed.push('email');
  }

  if (criteria.mustHavePhone) {
    requirements.push('phone');
    if (lead.phone) met.push('phone');
    else failed.push('phone');
  }

  if (criteria.mustHaveWebsite) {
    requirements.push('website');
    if (lead.website) met.push('website');
    else failed.push('website');
  }

  if (criteria.minRating) {
    requirements.push(`rating >= ${criteria.minRating}`);
    const metadata = lead.metadata as Record<string, any> || {};
    if (metadata.rating >= criteria.minRating) {
      met.push('rating');
    } else {
      failed.push('rating');
    }
  }

  if (requirements.length === 0) {
    return {
      name: 'Requirements',
      score: 50,
      weight: 0.2,
      reason: 'no specific requirements',
    };
  }

  const score = (met.length / requirements.length) * 100;

  return {
    name: 'Requirements',
    score,
    weight: 0.2,
    reason:
      failed.length > 0
        ? `missing: ${failed.join(', ')}`
        : `all requirements met: ${met.join(', ')}`,
  };
}

function calculateGrade(score: number): 'A' | 'B' | 'C' | 'D' | 'F' {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'F';
}

export function qualifyLead(
  lead: Lead,
  criteria: QualificationCriteria = {}
): QualificationResult {
  const factors: QualificationFactor[] = [
    calculateDataCompleteness(lead),
    calculateContactQuality(lead),
    calculateBusinessPresence(lead),
    calculateIndustryFit(lead, criteria),
    calculateLocationFit(lead, criteria),
    calculateRequirementsMet(lead, criteria),
  ];

  // Calculate weighted score
  const totalWeight = factors.reduce((sum, f) => sum + f.weight, 0);
  const weightedScore = factors.reduce(
    (sum, f) => sum + f.score * f.weight,
    0
  );
  const score = Math.round(weightedScore / totalWeight);

  const grade = calculateGrade(score);
  const qualified = score >= 50 && grade !== 'F' && grade !== 'D';

  return {
    lead,
    score,
    grade,
    qualified,
    factors,
    nextBestAction: getNextBestAction(lead, factors),
  };
}

function getNextBestAction(
  lead: Lead,
  factors: QualificationFactor[]
): string {
  // Find the lowest scoring factor
  const sortedFactors = [...factors].sort((a, b) => a.score - b.score);
  const weakest = sortedFactors[0];

  switch (weakest.name) {
    case 'Data Completeness':
      return 'Enrich lead data with Clay or manual research';
    case 'Contact Quality':
      if (!lead.email) return 'Find email address';
      if (!lead.phone) return 'Find phone number';
      return 'Verify contact information';
    case 'Business Presence':
      return 'Research company online presence and reviews';
    case 'Industry Fit':
      return 'Verify if business matches target industries';
    case 'Location Fit':
      return 'Confirm business location';
    case 'Requirements':
      return `Gather missing requirements: ${weakest.reason.replace('missing: ', '')}`;
    default:
      return 'Review lead details';
  }
}

export async function qualifyLeadWithAI(
  lead: Lead,
  criteria: QualificationCriteria = {},
  provider: 'anthropic' | 'gemini' = 'anthropic'
): Promise<QualificationResult> {
  // First get rule-based qualification
  const baseResult = qualifyLead(lead, criteria);

  // Then enhance with AI insights
  const prompt = `Analyze this business lead and provide qualification insights:

Lead Data:
- Company: ${lead.company || 'Unknown'}
- Industry: ${lead.industry || 'Unknown'}
- Location: ${lead.location || 'Unknown'}
- Website: ${lead.website || 'None'}
- Phone: ${lead.phone ? 'Available' : 'Not available'}
- Email: ${lead.email ? 'Available' : 'Not available'}
- Rating: ${(lead.metadata as any)?.rating || 'Unknown'}
- Reviews: ${(lead.metadata as any)?.reviewCount || 'Unknown'}

Current Score: ${baseResult.score}/100 (${baseResult.grade})

Qualification Criteria:
${criteria.targetIndustries ? `- Target Industries: ${criteria.targetIndustries.join(', ')}` : ''}
${criteria.targetLocations ? `- Target Locations: ${criteria.targetLocations.join(', ')}` : ''}
${criteria.customCriteria || ''}

Provide a JSON response with:
{
  "insights": "A 2-3 sentence analysis of this lead's potential",
  "recommendations": ["Array of 2-3 actionable recommendations"],
  "buyerPersonaMatch": 0-100 score of how well this matches an ideal buyer,
  "adjustedScore": Your suggested score adjustment (-10 to +10),
  "reasoning": "Brief explanation for score adjustment"
}`;

  try {
    let aiResponse: any;

    if (provider === 'anthropic' && env.ANTHROPIC_API_KEY) {
      const anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type === 'text') {
        const jsonMatch = content.text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          aiResponse = JSON.parse(jsonMatch[0]);
        }
      }
    } else if (provider === 'gemini' && env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
      const result = await model.generateContent(prompt);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        aiResponse = JSON.parse(jsonMatch[0]);
      }
    }

    if (aiResponse) {
      const adjustedScore = Math.max(
        0,
        Math.min(100, baseResult.score + (aiResponse.adjustedScore || 0))
      );

      return {
        ...baseResult,
        score: adjustedScore,
        grade: calculateGrade(adjustedScore),
        qualified: adjustedScore >= 50,
        aiInsights: aiResponse.insights,
        recommendations: aiResponse.recommendations,
        buyerPersonaMatch: aiResponse.buyerPersonaMatch,
      };
    }
  } catch (error) {
    console.error('[Qualification] AI enhancement failed:', error);
  }

  return baseResult;
}

export async function qualifyLeadsBatch(
  leads: Lead[],
  criteria: QualificationCriteria = {},
  useAI: boolean = false,
  aiProvider: 'anthropic' | 'gemini' = 'anthropic'
): Promise<BatchQualificationResult> {
  const results: QualificationResult[] = [];

  for (const lead of leads) {
    const result = useAI
      ? await qualifyLeadWithAI(lead, criteria, aiProvider)
      : qualifyLead(lead, criteria);
    results.push(result);

    // Rate limiting for AI calls
    if (useAI) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  // Calculate summary
  const qualified = results.filter((r) => r.qualified).length;
  const averageScore =
    results.reduce((sum, r) => sum + r.score, 0) / results.length;

  const gradeDistribution: Record<string, number> = {
    A: 0,
    B: 0,
    C: 0,
    D: 0,
    F: 0,
  };
  results.forEach((r) => gradeDistribution[r.grade]++);

  // Collect top recommendations
  const recommendationCounts: Record<string, number> = {};
  results.forEach((r) => {
    (r.recommendations || []).forEach((rec) => {
      recommendationCounts[rec] = (recommendationCounts[rec] || 0) + 1;
    });
  });
  const topRecommendations = Object.entries(recommendationCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([rec]) => rec);

  return {
    results,
    summary: {
      total: leads.length,
      qualified,
      averageScore: Math.round(averageScore),
      gradeDistribution,
      topRecommendations,
    },
  };
}

export const leadQualification = {
  qualifyLead,
  qualifyLeadWithAI,
  qualifyLeadsBatch,
};
