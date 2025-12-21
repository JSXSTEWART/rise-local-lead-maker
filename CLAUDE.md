# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rise Local Lead Maker is a lead generation and enrichment system built with TypeScript/Node.js. It combines local business scraping (Google Places), multi-provider data enrichment (Clay, Anthropic, Gemini), lead qualification scoring, and integrations with MySQL, Google Sheets, and MCP (Model Context Protocol).

## Commands

### API Development (from `rise-local-lead-creation/api/`)
```bash
npm run dev          # Watch mode with tsx
npm run build        # Compile TypeScript to dist/
npm run start        # Run compiled JavaScript
npm run typecheck    # Type checking without compilation
```

### MCP Server (from `mcp-server/`)
```bash
npm start           # Start MCP server
```

### Docker
```bash
# Production - API on port 3001, MySQL on 3306
docker compose up -d                        # Start all services
docker compose -f compose.debug.yaml up     # Development with hot reload + debugging (port 9229)
docker compose down                         # Stop services
docker compose logs -f api                  # Follow API logs
```

### Operational Scripts
```bash
./scripts/backup.sh       # MySQL backup with 30-day rotation
./scripts/healthcheck.sh  # Health monitoring with auto-restart
```

### First-Time Setup
```bash
cp .env.example .env      # Create environment file
# Edit .env with your credentials
docker compose up -d      # Start services (auto-creates database)
```

## Architecture

### Directory Structure
- **rise-local-lead-creation/api/** - Main Express API (TypeScript)
  - `src/config/` - Zod-validated environment configuration
  - `src/integrations/` - Third-party API clients (Supabase, Anthropic, Gemini, Clay, Google Places, Google Sheets)
  - `src/routes/` - API endpoints (leads, scraper, enrichment, qualification, sync)
  - `src/services/` - Business logic (enrichment pipeline, lead qualification, web scraper)
  - `src/middleware/` - Express middleware (validation, error handling, logging)
  - `src/types/` - TypeScript interfaces
- **mcp-server/** - Model Context Protocol server exposing 11 tools to Claude
- **RAG/** - Reference documentation for Supabase/pgvector implementation
- **scripts/** - Operational bash scripts

### Key Patterns

**Database Abstraction:** MySQL is wrapped with a Supabase-compatible query builder API (`src/integrations/supabase.ts`) enabling future PostgreSQL migration.

**Multi-Provider Enrichment:** The enrichment pipeline (`src/services/enrichment-pipeline.ts`) orchestrates Clay.io (person/company data), Anthropic Claude, and Google Gemini. Providers can be toggled per request.

**Validation:** All API inputs use Zod schemas with the validation middleware. Configuration is validated at startup.

**Lead Lifecycle:** Leads flow through statuses: `new` → `enriching` → `enriched` (or `failed`)

**Qualification Scoring:** Weighted multi-factor scoring (0-100) produces letter grades (A-F) with AI-enhanced insights.

### MCP Server Tools
The MCP server (`mcp-server/index.js`) exposes these tools to Claude:
- `rise_health`, `rise_list_leads`, `rise_get_lead`, `rise_create_lead`
- `rise_search_leads`, `rise_get_stats`, `rise_enrich_lead`, `rise_qualify_lead`
- `rise_scrape_google`, `rise_scrape_website`

Configuration in `.mcp.json` points to `http://localhost:3001`.

## API Endpoints

| Prefix | Purpose |
|--------|---------|
| `GET /health` | API health status |
| `/api/leads` | CRUD, search, stats, bulk create (up to 1,000), deduplication |
| `/api/scraper` | Google Places search, nearby discovery, bulk queries, website scraping |
| `/api/enrichment` | Single/batch enrichment, process new, retry failed |
| `/api/qualify` | Single/batch qualification, stats, recommendations |
| `/api/sync` | Google Sheets bidirectional sync |

## Environment Variables

**Required:**
- `PORT`, `NODE_ENV`, `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`

**Optional (by feature):**
- AI: `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
- Enrichment: `CLAY_API_KEY`, `CLAY_TABLE_ID`
- Scraping: `GOOGLE_PLACES_API_KEY`
- Sheets: `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_SHEETS_ID`
- Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## Core Data Types

```typescript
interface Lead {
  id?: string
  email?: string
  firstName?: string
  lastName?: string
  company?: string
  title?: string
  phone?: string
  website?: string
  linkedinUrl?: string
  location?: string
  industry?: string
  companySize?: string
  source?: string
  status: 'new' | 'enriching' | 'enriched' | 'failed'
  metadata?: Record<string, unknown>
}
```

## Batch Limits
- Lead creation: 1,000 per request
- Google Places bulk: 20 queries
- Website scraping: 100 sites
- Default pagination: page=1, limit=20
