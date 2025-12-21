import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

// Helper for optional strings that can be empty
const optionalString = z.string().optional().transform(v => v === '' ? undefined : v);
const optionalEmail = z.string().email().optional().or(z.literal('')).transform(v => v === '' ? undefined : v);

const envSchema = z.object({
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // MySQL Database
  DB_HOST: z.string().default('localhost'),
  DB_USER: z.string().min(1),
  DB_PASSWORD: z.string().min(1),
  DB_NAME: z.string().min(1),

  // Google Sheets
  GOOGLE_SERVICE_ACCOUNT_EMAIL: optionalEmail,
  GOOGLE_PRIVATE_KEY: optionalString,
  GOOGLE_SHEETS_ID: optionalString,

  // Google Places API (for local lead scraping)
  GOOGLE_PLACES_API_KEY: optionalString,

  // Clay
  CLAY_API_KEY: optionalString,
  CLAY_TABLE_ID: optionalString,

  // Gemini
  GEMINI_API_KEY: optionalString,

  // Anthropic
  ANTHROPIC_API_KEY: optionalString,

  // Supabase (optional)
  SUPABASE_URL: optionalString,
  SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    throw new Error('Invalid environment configuration');
  }

  return parsed.data;
}

export const env = loadEnv();
export type Env = z.infer<typeof envSchema>;
