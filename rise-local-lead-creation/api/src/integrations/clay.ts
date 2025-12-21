import axios, { AxiosInstance, AxiosError } from 'axios';
import { env } from '../config/env.js';
import type { Lead, ClayEnrichment } from '../types/index.js';

const CLAY_API_BASE = 'https://api.clay.com/v1';

let clayClient: AxiosInstance | null = null;

function getClayClient(): AxiosInstance {
  if (!clayClient) {
    if (!env.CLAY_API_KEY) {
      throw new Error('Clay API key not configured');
    }

    clayClient = axios.create({
      baseURL: CLAY_API_BASE,
      headers: {
        'Authorization': `Bearer ${env.CLAY_API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });
  }
  return clayClient;
}

/**
 * Enrichment via Clay's API
 * Note: Clay's /enrich/* endpoints may be deprecated or Enterprise-only.
 * Falls back gracefully if endpoints are unavailable.
 */
export async function enrichWithClay(lead: Lead): Promise<ClayEnrichment> {
  const result: ClayEnrichment = {};

  // Try person enrichment
  try {
    const personData = await enrichPerson(lead);
    if (personData) {
      result.personData = personData;
    }
  } catch (error) {
    handleClayError(error, 'person enrichment');
  }

  // Try company enrichment if we have domain/company name
  if (lead.website || lead.company) {
    try {
      const companyData = await enrichCompany(lead);
      if (companyData) {
        result.companyData = companyData;
      }
    } catch (error) {
      handleClayError(error, 'company enrichment');
    }
  }

  // If we got no data, try table-based approach
  if (!result.personData && !result.companyData && env.CLAY_TABLE_ID) {
    console.log('[Clay] Direct enrichment unavailable, using table-based approach');
    try {
      const rowId = await addLeadToClayTable(lead);
      result.tableRowId = rowId;
      result.status = 'queued_for_enrichment';
    } catch (error) {
      handleClayError(error, 'table insertion');
    }
  }

  return result;
}

function handleClayError(error: unknown, context: string): void {
  const axiosError = error as AxiosError<{ message?: string }>;

  if (axiosError.response) {
    const status = axiosError.response.status;
    const message = axiosError.response.data?.message || axiosError.message;

    if (status === 404 && message?.includes('deprecated')) {
      console.warn(`[Clay] ${context}: API endpoint deprecated. Consider using Clay's webhook integration.`);
    } else if (status === 401 || status === 403) {
      console.warn(`[Clay] ${context}: Authentication failed. Check your CLAY_API_KEY.`);
    } else if (status === 429) {
      console.warn(`[Clay] ${context}: Rate limited. Slow down requests.`);
    } else {
      console.warn(`[Clay] ${context} failed (${status}): ${message}`);
    }
  } else {
    console.warn(`[Clay] ${context} failed:`, (error as Error).message);
  }
}

async function enrichPerson(lead: Lead): Promise<ClayEnrichment['personData'] | null> {
  const client = getClayClient();

  const response = await client.post('/enrich/person', {
    email: lead.email,
    linkedin_url: lead.linkedinUrl,
    first_name: lead.firstName,
    last_name: lead.lastName,
    company: lead.company,
  });

  const data = response.data;
  if (!data || data.success === false) {
    return null;
  }

  return {
    title: data.title,
    seniority: data.seniority,
    department: data.department,
    email: data.email,
    socialProfiles: {
      linkedin: data.linkedin_url,
      twitter: data.twitter_url,
    },
  };
}

async function enrichCompany(lead: Lead): Promise<ClayEnrichment['companyData'] | null> {
  const client = getClayClient();
  const domain = lead.website?.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  const response = await client.post('/enrich/company', {
    domain: domain,
    name: lead.company,
  });

  const data = response.data;
  if (!data || data.success === false) {
    return null;
  }

  return {
    name: data.name,
    domain: data.domain,
    industry: data.industry,
    employeeCount: data.employee_count,
    revenue: data.revenue_range,
    description: data.description,
    technologies: data.technologies || [],
  };
}

export async function addLeadToClayTable(lead: Lead): Promise<string> {
  if (!env.CLAY_TABLE_ID) {
    throw new Error('Clay table ID not configured');
  }

  const client = getClayClient();

  const response = await client.post(`/tables/${env.CLAY_TABLE_ID}/rows`, {
    data: {
      email: lead.email,
      first_name: lead.firstName,
      last_name: lead.lastName,
      company: lead.company,
      title: lead.title,
      linkedin_url: lead.linkedinUrl,
      website: lead.website,
      phone: lead.phone,
      location: lead.location,
      industry: lead.industry,
    },
  });

  return response.data.row_id;
}

export async function getClayTableRows(limit = 100): Promise<Lead[]> {
  if (!env.CLAY_TABLE_ID) {
    throw new Error('Clay table ID not configured');
  }

  const client = getClayClient();

  const response = await client.get(`/tables/${env.CLAY_TABLE_ID}/rows`, {
    params: { limit },
  });

  return response.data.rows.map((row: Record<string, unknown>) => ({
    email: row.email,
    firstName: row.first_name,
    lastName: row.last_name,
    company: row.company,
    title: row.title,
    linkedinUrl: row.linkedin_url,
    website: row.website,
    phone: row.phone,
    location: row.location,
    industry: row.industry,
    status: 'new' as const,
    source: 'clay',
  }));
}

export function isClayConfigured(): boolean {
  return Boolean(env.CLAY_API_KEY);
}

export function hasClayTableAccess(): boolean {
  return Boolean(env.CLAY_API_KEY && env.CLAY_TABLE_ID);
}
