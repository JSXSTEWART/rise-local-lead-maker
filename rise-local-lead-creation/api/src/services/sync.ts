import type { Lead } from '../types/index.js';
import {
  upsertLeads,
  getLeads,
  syncLeadsFromSheet,
  writeLeadsToSheet,
  getClayTableRows,
  isClayConfigured,
} from '../integrations/index.js';
import { env } from '../config/env.js';

export async function syncFromGoogleSheets(): Promise<{
  imported: number;
  leads: Lead[];
}> {
  if (!env.GOOGLE_SHEETS_ID) {
    throw new Error('Google Sheets not configured');
  }

  const sheetLeads = await syncLeadsFromSheet();

  const leadsToUpsert: Lead[] = sheetLeads.map((l) => ({
    ...l,
    status: l.status || 'new',
    source: 'google_sheets',
  })) as Lead[];

  const upserted = await upsertLeads(leadsToUpsert);

  return {
    imported: upserted.length,
    leads: upserted,
  };
}

export async function syncFromClay(): Promise<{
  imported: number;
  leads: Lead[];
}> {
  if (!isClayConfigured()) {
    throw new Error('Clay not configured');
  }

  const clayLeads = await getClayTableRows();

  const leadsToUpsert: Lead[] = clayLeads.map((l) => ({
    ...l,
    status: 'new',
    source: 'clay',
  }));

  const upserted = await upsertLeads(leadsToUpsert);

  return {
    imported: upserted.length,
    leads: upserted,
  };
}

export async function exportToGoogleSheets(
  status?: Lead['status']
): Promise<{ exported: number }> {
  if (!env.GOOGLE_SHEETS_ID) {
    throw new Error('Google Sheets not configured');
  }

  let leads: Lead[];
  if (status) {
    const { getLeadsByStatus } = await import('../integrations/supabase.js');
    leads = await getLeadsByStatus(status);
  } else {
    leads = await getLeads(1000);
  }

  await writeLeadsToSheet(leads, 'Enriched Leads');

  return { exported: leads.length };
}

export async function syncAll(): Promise<{
  googleSheets: { imported: number } | null;
  clay: { imported: number } | null;
  errors: string[];
}> {
  const errors: string[] = [];
  let googleSheetsResult = null;
  let clayResult = null;

  // Sync from Google Sheets
  if (env.GOOGLE_SHEETS_ID) {
    try {
      googleSheetsResult = await syncFromGoogleSheets();
    } catch (error) {
      errors.push(`Google Sheets sync failed: ${(error as Error).message}`);
    }
  }

  // Sync from Clay
  if (isClayConfigured()) {
    try {
      clayResult = await syncFromClay();
    } catch (error) {
      errors.push(`Clay sync failed: ${(error as Error).message}`);
    }
  }

  return {
    googleSheets: googleSheetsResult,
    clay: clayResult,
    errors,
  };
}
