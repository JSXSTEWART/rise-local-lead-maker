export interface Lead {
  id?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  title?: string;
  phone?: string;
  website?: string;
  linkedinUrl?: string;
  location?: string;
  industry?: string;
  companySize?: string;
  enrichedAt?: Date;
  source?: string;
  status: 'new' | 'enriching' | 'enriched' | 'failed';
  metadata?: Record<string, unknown>;
}

export interface WebsiteScrapeResult {
  emails: string[];
  phones: string[];
  socialLinks: Record<string, string>;
  companyName?: string;
  address?: string;
}

export interface EnrichmentResult {
  lead: Lead;
  enrichments: {
    clay?: ClayEnrichment;
    gemini?: AIEnrichment;
    anthropic?: AIEnrichment;
    websiteScrape?: WebsiteScrapeResult;
    emailPatterns?: string[];
  };
  success: boolean;
  errors?: string[];
}

export interface ClayEnrichment {
  companyData?: {
    name?: string;
    domain?: string;
    industry?: string;
    employeeCount?: number;
    revenue?: string;
    description?: string;
    technologies?: string[];
  };
  personData?: {
    title?: string;
    seniority?: string;
    department?: string;
    email?: string;
    socialProfiles?: Record<string, string>;
  };
  // Table-based enrichment fields (when direct API unavailable)
  tableRowId?: string;
  status?: 'queued_for_enrichment' | 'enriched' | 'failed';
}

export interface AIEnrichment {
  summary?: string;
  insights?: string[];
  score?: number;
  recommendations?: string[];
}

export interface EnrichmentConfig {
  useClay?: boolean;
  useGemini?: boolean;
  useAnthropic?: boolean;
  scrapeWebsite?: boolean;
  customPrompt?: string;
}
