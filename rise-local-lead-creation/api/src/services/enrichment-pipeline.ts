import type { Lead, EnrichmentResult, EnrichmentConfig } from '../types/index.js';
import {
  updateLead,
  getLeadsByStatus,
  isClayConfigured,
  enrichWithClay,
  isGeminiConfigured,
  enrichWithGemini,
  isAnthropicConfigured,
  enrichWithAnthropic,
} from '../integrations/index.js';
import { scrapeWebsite, ScrapedContact } from './web-scraper.js';

// Email pattern generator for discovering emails
function generateEmailPatterns(firstName: string, lastName: string, domain: string): string[] {
  const f = firstName.toLowerCase().replace(/[^a-z]/g, '');
  const l = lastName.toLowerCase().replace(/[^a-z]/g, '');
  if (!f || !l || !domain) return [];

  return [
    `${f}@${domain}`,
    `${f}.${l}@${domain}`,
    `${f}${l}@${domain}`,
    `${f[0]}${l}@${domain}`,
    `${f}_${l}@${domain}`,
    `${f}-${l}@${domain}`,
    `${l}@${domain}`,
    `${l}.${f}@${domain}`,
    `${f[0]}.${l}@${domain}`,
    `info@${domain}`,
    `contact@${domain}`,
    `hello@${domain}`,
    `sales@${domain}`,
  ];
}

// Extract domain from URL or email
function extractDomain(urlOrEmail: string | null | undefined): string | null {
  if (!urlOrEmail) return null;
  try {
    if (urlOrEmail.includes('@')) {
      return urlOrEmail.split('@')[1];
    }
    const url = urlOrEmail.startsWith('http') ? urlOrEmail : `https://${urlOrEmail}`;
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

export async function enrichLead(
  lead: Lead,
  config: EnrichmentConfig = {}
): Promise<EnrichmentResult> {
  const result: EnrichmentResult = {
    lead,
    enrichments: {},
    success: true,
    errors: [],
  };

  // Mark lead as enriching
  if (lead.id) {
    await updateLead(lead.id, { status: 'enriching' });
  }

  try {
    // 1. Website Scraping (if website exists and scraping enabled)
    if ((config.scrapeWebsite ?? true) && lead.website) {
      try {
        console.log(`[Enrichment] Scraping website: ${lead.website}`);
        const scraped: ScrapedContact = await scrapeWebsite(lead.website);
        result.enrichments.websiteScrape = scraped;

        // Update lead with scraped data (only if not already set)
        if (!lead.email && scraped.emails.length > 0) {
          lead.email = scraped.emails[0];
        }
        if (!lead.phone && scraped.phones.length > 0) {
          lead.phone = scraped.phones[0];
        }
        if (!lead.linkedinUrl && scraped.socialLinks.linkedin) {
          lead.linkedinUrl = scraped.socialLinks.linkedin;
        }
        if (!lead.location && scraped.address) {
          lead.location = scraped.address;
        }

        // Store all scraped data in metadata
        lead.metadata = {
          ...lead.metadata,
          allEmails: scraped.emails,
          allPhones: scraped.phones,
          socialLinks: scraped.socialLinks,
        };
      } catch (error) {
        result.errors?.push(`WebScrape: ${(error as Error).message}`);
      }
    }

    // 2. Email Discovery (generate potential email patterns)
    if (!lead.email && lead.firstName && lead.lastName) {
      const domain = extractDomain(lead.website) || extractDomain(lead.email);
      if (domain) {
        const potentialEmails = generateEmailPatterns(lead.firstName, lead.lastName, domain);
        result.enrichments.emailPatterns = potentialEmails;
        lead.metadata = {
          ...lead.metadata,
          potentialEmails,
        };
      }
    }

    // 3. Clay enrichment
    if ((config.useClay ?? true) && isClayConfigured()) {
      try {
        result.enrichments.clay = await enrichWithClay(lead);

        // Update lead with Clay data
        if (result.enrichments.clay.companyData) {
          lead.industry = result.enrichments.clay.companyData.industry || lead.industry;
          lead.companySize = result.enrichments.clay.companyData.employeeCount?.toString();
        }
        if (result.enrichments.clay.personData) {
          lead.title = result.enrichments.clay.personData.title || lead.title;
          if (!lead.email && result.enrichments.clay.personData.email) {
            lead.email = result.enrichments.clay.personData.email;
          }
        }
      } catch (error) {
        result.errors?.push(`Clay: ${(error as Error).message}`);
      }
    }

    // 4. AI Enrichment - prefer Anthropic, fallback to Gemini
    if ((config.useAnthropic ?? true) && isAnthropicConfigured()) {
      try {
        result.enrichments.anthropic = await enrichWithAnthropic(lead, config.customPrompt);
      } catch (error) {
        result.errors?.push(`Anthropic: ${(error as Error).message}`);
      }
    } else if ((config.useGemini ?? true) && isGeminiConfigured()) {
      try {
        result.enrichments.gemini = await enrichWithGemini(lead, config.customPrompt);
      } catch (error) {
        result.errors?.push(`Gemini: ${(error as Error).message}`);
      }
    }

    // Update lead with enrichment status
    lead.enrichedAt = new Date();
    lead.status = 'enriched';
    lead.metadata = {
      ...lead.metadata,
      enrichments: result.enrichments,
      enrichedAt: new Date().toISOString(),
      enrichmentSources: Object.keys(result.enrichments),
    };

    if (lead.id) {
      await updateLead(lead.id, {
        status: 'enriched',
        enrichedAt: lead.enrichedAt,
        metadata: lead.metadata,
        industry: lead.industry,
        companySize: lead.companySize,
        title: lead.title,
        email: lead.email,
        phone: lead.phone,
        linkedinUrl: lead.linkedinUrl,
        location: lead.location,
      });
    }

    result.lead = lead;
  } catch (error) {
    result.success = false;
    result.errors?.push(`Pipeline: ${(error as Error).message}`);

    if (lead.id) {
      await updateLead(lead.id, { status: 'failed' });
    }
  }

  return result;
}

// Process array in chunks with concurrency control
async function processInParallel<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 3,
  delayMs: number = 100
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    const chunkResults = await Promise.all(chunk.map(processor));
    results.push(...chunkResults);

    // Delay between chunks to avoid rate limits
    if (i + concurrency < items.length) {
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return results;
}

export interface BatchEnrichmentProgress {
  total: number;
  completed: number;
  successful: number;
  failed: number;
  currentLead?: string;
}

export async function enrichLeadBatch(
  leads: Lead[],
  config: EnrichmentConfig = {},
  onProgress?: (progress: BatchEnrichmentProgress) => void
): Promise<EnrichmentResult[]> {
  const progress: BatchEnrichmentProgress = {
    total: leads.length,
    completed: 0,
    successful: 0,
    failed: 0,
  };

  // Use parallel processing with concurrency of 3
  const results = await processInParallel(
    leads,
    async (lead) => {
      progress.currentLead = lead.company || lead.email || `Lead ${lead.id}`;
      const result = await enrichLead(lead, config);

      progress.completed++;
      if (result.success) {
        progress.successful++;
      } else {
        progress.failed++;
      }

      if (onProgress) {
        onProgress({ ...progress });
      }

      return result;
    },
    3, // concurrency
    200 // delay between chunks
  );

  return results;
}

export async function processNewLeads(
  config: EnrichmentConfig = {}
): Promise<EnrichmentResult[]> {
  const newLeads = await getLeadsByStatus('new');
  console.log(`Processing ${newLeads.length} new leads`);

  return enrichLeadBatch(newLeads, config);
}

export async function retryFailedLeads(
  config: EnrichmentConfig = {}
): Promise<EnrichmentResult[]> {
  const failedLeads = await getLeadsByStatus('failed');
  console.log(`Retrying ${failedLeads.length} failed leads`);

  return enrichLeadBatch(failedLeads, config);
}

export function getEnrichmentStats(results: EnrichmentResult[]): {
  total: number;
  successful: number;
  failed: number;
  withClay: number;
  withAI: number;
} {
  return {
    total: results.length,
    successful: results.filter((r) => r.success).length,
    failed: results.filter((r) => !r.success).length,
    withClay: results.filter((r) => r.enrichments.clay).length,
    withAI: results.filter((r) => r.enrichments.anthropic || r.enrichments.gemini).length,
  };
}
