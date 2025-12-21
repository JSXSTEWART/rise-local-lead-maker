import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  syncFromGoogleSheets,
  syncFromClay,
  exportToGoogleSheets,
  syncAll,
} from '../services/sync.js';
import { validateBody } from '../middleware/validate.js';
import { env } from '../config/env.js';
import { isClayConfigured } from '../integrations/clay.js';

export const syncRouter = Router();

// Export options schema
const exportOptionsSchema = z.object({
  status: z.enum(['new', 'enriching', 'enriched', 'failed']).optional(),
});

// POST /api/sync/sheets - Sync leads from Google Sheets
syncRouter.post(
  '/sheets',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[Sync] Syncing from Google Sheets');

      const result = await syncFromGoogleSheets();

      res.json({
        success: true,
        data: {
          source: 'google_sheets',
          imported: result.imported,
          leads: result.leads,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/sync/clay - Sync leads from Clay
syncRouter.post(
  '/clay',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[Sync] Syncing from Clay');

      const result = await syncFromClay();

      res.json({
        success: true,
        data: {
          source: 'clay',
          imported: result.imported,
          leads: result.leads,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/sync/export - Export leads to Google Sheets
syncRouter.post(
  '/export',
  validateBody(exportOptionsSchema),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { status } = req.body;

      console.log(`[Sync] Exporting leads to Google Sheets${status ? ` (status: ${status})` : ''}`);

      const result = await exportToGoogleSheets(status);

      res.json({
        success: true,
        data: {
          destination: 'google_sheets',
          exported: result.exported,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// POST /api/sync/all - Sync from all configured sources
syncRouter.post(
  '/all',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      console.log('[Sync] Syncing from all sources');

      const result = await syncAll();

      res.json({
        success: true,
        data: {
          googleSheets: result.googleSheets,
          clay: result.clay,
          errors: result.errors,
          summary: {
            totalImported:
              (result.googleSheets?.imported || 0) + (result.clay?.imported || 0),
            sources: [
              result.googleSheets && 'google_sheets',
              result.clay && 'clay',
            ].filter(Boolean),
            hasErrors: result.errors.length > 0,
          },
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// GET /api/sync/status - Get sync status and configuration
syncRouter.get(
  '/status',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const googleSheetsConfigured = !!(
        env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
        env.GOOGLE_PRIVATE_KEY &&
        env.GOOGLE_SHEETS_ID
      );

      res.json({
        success: true,
        data: {
          sources: {
            googleSheets: {
              configured: googleSheetsConfigured,
              sheetId: googleSheetsConfigured ? env.GOOGLE_SHEETS_ID : null,
            },
            clay: {
              configured: isClayConfigured(),
            },
          },
          lastSync: null, // Could be stored in database for tracking
        },
      });
    } catch (error) {
      next(error);
    }
  }
);
