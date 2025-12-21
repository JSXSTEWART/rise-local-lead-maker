import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { googlePlaces, scrapeLocalBusinesses, searchNearby } from '../integrations/google-places.js';
import { webScraper, scrapeWebsitesToLeads } from '../services/web-scraper.js';
import { getSupabase } from '../integrations/supabase.js';
import { validateBody } from '../middleware/validate.js';
import { createError } from '../middleware/error-handler.js';

export const scraperRouter = Router();

// Google Places search schema
const googleSearchSchema = z.object({
  query: z.string().min(1).describe('Search query (e.g., "dentists in Austin TX")'),
  location: z.string().optional().describe('Lat,lng format (e.g., "30.2672,-97.7431")'),
  radius: z.number().min(1).max(50000).optional().default(25000),
  type: z.string().optional().describe('Business type filter'),
  minRating: z.number().min(0).max(5).optional(),
  fetchDetails: z.boolean().optional().default(true),
  saveToDatabase: z.boolean().optional().default(true),
});

const nearbySearchSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  businessType: z.string().min(1),
  radiusMeters: z.number().min(100).max(50000).optional().default(10000),
  saveToDatabase: z.boolean().optional().default(true),
});

const websiteScraperSchema = z.object({
  websites: z.array(z.string()).min(1).max(100),
  saveToDatabase: z.boolean().optional().default(true),
});

const bulkGoogleSearchSchema = z.object({
  queries: z.array(
    z.object({
      query: z.string().min(1),
      location: z.string().optional(),
    })
  ).min(1).max(20),
  minRating: z.number().optional(),
  saveToDatabase: z.boolean().optional().default(true),
});

// POST /api/scraper/google - Search Google Places
scraperRouter.post(
  '/google',
  validateBody(googleSearchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { query, location, radius, type, minRating, fetchDetails, saveToDatabase } = req.body;

      console.log(`[Scraper] Google Places search: "${query}"`);

      const leads = await scrapeLocalBusinesses(
        { query, location, radius, type, minRating },
        fetchDetails
      );

      if (saveToDatabase && leads.length > 0) {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('leads')
          .upsert(
            leads.map((lead) => ({
              ...lead,
              email: lead.email || null, // Supabase requires null, not undefined
            })),
            { onConflict: 'website', ignoreDuplicates: true }
          )
          .select();

        if (error) {
          console.error('[Scraper] Failed to save leads:', error);
        }

        res.json({
          success: true,
          data: {
            query,
            found: leads.length,
            saved: data?.length || 0,
            leads,
          },
        });
      } else {
        res.json({
          success: true,
          data: {
            query,
            found: leads.length,
            leads,
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/scraper/google/nearby - Search nearby businesses
scraperRouter.post(
  '/google/nearby',
  validateBody(nearbySearchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { lat, lng, businessType, radiusMeters, saveToDatabase } = req.body;

      console.log(`[Scraper] Nearby search: "${businessType}" at ${lat},${lng}`);

      const leads = await searchNearby(lat, lng, businessType, radiusMeters);

      if (saveToDatabase && leads.length > 0) {
        const supabase = getSupabase();
        const { data, error } = await supabase
          .from('leads')
          .upsert(
            leads.map((lead) => ({
              ...lead,
              email: lead.email || null,
            })),
            { onConflict: 'website', ignoreDuplicates: true }
          )
          .select();

        if (error) {
          console.error('[Scraper] Failed to save leads:', error);
        }

        res.json({
          success: true,
          data: {
            businessType,
            location: { lat, lng },
            radius: radiusMeters,
            found: leads.length,
            saved: data?.length || 0,
            leads,
          },
        });
      } else {
        res.json({
          success: true,
          data: {
            businessType,
            found: leads.length,
            leads,
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/scraper/google/bulk - Bulk Google Places search
scraperRouter.post(
  '/google/bulk',
  validateBody(bulkGoogleSearchSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { queries, minRating, saveToDatabase } = req.body;

      console.log(`[Scraper] Bulk Google search: ${queries.length} queries`);

      const allLeads: any[] = [];
      const results: any[] = [];

      for (const { query, location } of queries) {
        try {
          const leads = await scrapeLocalBusinesses(
            { query, location, minRating },
            true
          );
          allLeads.push(...leads);
          results.push({ query, location, found: leads.length, status: 'success' });

          // Rate limiting between queries
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error: any) {
          results.push({ query, location, found: 0, status: 'error', error: error.message });
        }
      }

      let savedCount = 0;
      if (saveToDatabase && allLeads.length > 0) {
        const { data, error } = await getSupabase()
          .from('leads')
          .upsert(
            allLeads.map((lead) => ({
              ...lead,
              email: lead.email || null,
            })),
            { onConflict: 'website', ignoreDuplicates: true }
          )
          .select();

        if (!error) {
          savedCount = data?.length || 0;
        }
      }

      res.json({
        success: true,
        data: {
          queriesProcessed: queries.length,
          totalFound: allLeads.length,
          saved: savedCount,
          results,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/scraper/website - Scrape websites for contact info
scraperRouter.post(
  '/website',
  validateBody(websiteScraperSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { websites, saveToDatabase } = req.body;

      console.log(`[Scraper] Website scraping: ${websites.length} sites`);

      const leads = await scrapeWebsitesToLeads(websites);

      const successful = leads.filter((l) => l.status !== 'failed');
      const failed = leads.filter((l) => l.status === 'failed');

      if (saveToDatabase && successful.length > 0) {
        const { data, error } = await getSupabase()
          .from('leads')
          .upsert(
            successful.map((lead) => ({
              ...lead,
              email: lead.email || null,
            })),
            { onConflict: 'website', ignoreDuplicates: true }
          )
          .select();

        if (error) {
          console.error('[Scraper] Failed to save leads:', error);
        }

        res.json({
          success: true,
          data: {
            processed: websites.length,
            successful: successful.length,
            failed: failed.length,
            saved: data?.length || 0,
            leads: successful,
            errors: failed.map((l) => ({
              website: l.website,
              error: (l.metadata as any)?.error,
            })),
          },
        });
      } else {
        res.json({
          success: true,
          data: {
            processed: websites.length,
            successful: successful.length,
            failed: failed.length,
            leads: successful,
            errors: failed.map((l) => ({
              website: l.website,
              error: (l.metadata as any)?.error,
            })),
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/scraper/website/single - Scrape single website
scraperRouter.post(
  '/website/single',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { url } = req.body;

      if (!url) {
        throw createError('URL is required', 400, 'VALIDATION_ERROR');
      }

      console.log(`[Scraper] Single website scrape: ${url}`);

      const scrapedData = await webScraper.scrapeWebsite(url);

      res.json({
        success: true,
        data: {
          url,
          ...scrapedData,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
