import { google, sheets_v4 } from 'googleapis';
import { env } from '../config/env.js';
import type { Lead } from '../types/index.js';

let sheetsClient: sheets_v4.Sheets | null = null;

function getSheets(): sheets_v4.Sheets {
  if (!sheetsClient) {
    if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
      throw new Error('Google Sheets credentials not configured');
    }

    const auth = new google.auth.JWT({
      email: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    sheetsClient = google.sheets({ version: 'v4', auth });
  }
  return sheetsClient;
}

const LEAD_HEADERS = [
  'Email', 'First Name', 'Last Name', 'Company', 'Title',
  'Phone', 'Website', 'LinkedIn', 'Location', 'Industry',
  'Company Size', 'Source', 'Status', 'Enriched At'
];

export async function readLeadsFromSheet(
  sheetName = 'Leads',
  range = 'A2:N'
): Promise<Partial<Lead>[]> {
  if (!env.GOOGLE_SHEETS_ID) throw new Error('Google Sheets ID not configured');

  const sheets = getSheets();
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: env.GOOGLE_SHEETS_ID,
    range: `${sheetName}!${range}`,
  });

  const rows = response.data.values || [];
  return rows.map((row) => ({
    email: row[0],
    firstName: row[1],
    lastName: row[2],
    company: row[3],
    title: row[4],
    phone: row[5],
    website: row[6],
    linkedinUrl: row[7],
    location: row[8],
    industry: row[9],
    companySize: row[10],
    source: row[11] || 'google_sheets',
    status: (row[12] as Lead['status']) || 'new',
  }));
}

export async function writeLeadsToSheet(
  leads: Lead[],
  sheetName = 'Enriched Leads'
): Promise<void> {
  if (!env.GOOGLE_SHEETS_ID) throw new Error('Google Sheets ID not configured');

  const sheets = getSheets();

  // Ensure headers exist
  await sheets.spreadsheets.values.update({
    spreadsheetId: env.GOOGLE_SHEETS_ID,
    range: `${sheetName}!A1:N1`,
    valueInputOption: 'RAW',
    requestBody: { values: [LEAD_HEADERS] },
  });

  // Write lead data
  const values = leads.map((lead) => [
    lead.email || '',
    lead.firstName || '',
    lead.lastName || '',
    lead.company || '',
    lead.title || '',
    lead.phone || '',
    lead.website || '',
    lead.linkedinUrl || '',
    lead.location || '',
    lead.industry || '',
    lead.companySize || '',
    lead.source || '',
    lead.status || '',
    lead.enrichedAt?.toISOString() || '',
  ]);

  await sheets.spreadsheets.values.append({
    spreadsheetId: env.GOOGLE_SHEETS_ID,
    range: `${sheetName}!A2:N`,
    valueInputOption: 'RAW',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values },
  });
}

export async function syncLeadsFromSheet(sheetName = 'Leads'): Promise<Partial<Lead>[]> {
  const leads = await readLeadsFromSheet(sheetName);
  console.log(`Synced ${leads.length} leads from Google Sheets`);
  return leads;
}

export async function createSheetIfNotExists(sheetName: string): Promise<void> {
  if (!env.GOOGLE_SHEETS_ID) throw new Error('Google Sheets ID not configured');

  const sheets = getSheets();

  try {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: env.GOOGLE_SHEETS_ID,
      requestBody: {
        requests: [{
          addSheet: { properties: { title: sheetName } }
        }]
      }
    });
  } catch (error: unknown) {
    const err = error as { code?: number };
    if (err.code !== 400) throw error; // Sheet already exists
  }
}
