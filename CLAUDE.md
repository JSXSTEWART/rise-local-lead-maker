# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Rise Local Lead Maker is a lead generation and enrichment system built with TypeScript/Node.js. It combines local business scraping (Google Places), multi-provider data enrichment (Clay, Anthropic, Gemini), lead qualification scoring, and integrations with MySQL, Google Sheets, and MCP (Model Context Protocol).

**Key Components:**
- **API Server**: Express/TypeScript backend with MySQL persistence
- **GUI**: Single-page application at `/gui/index.html` (vanilla JS)
- **MCP Server**: Claude integration layer with 40+ tools
- **Agent Scripts**: Automated workflows for enrichment, reporting, and monitoring
- **Systemd Service**: `rise-api.service` manages API lifecycle

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

### Systemd Service Management
```bash
systemctl status rise-api    # Check API status
systemctl restart rise-api   # Restart API (required after code changes in production)
systemctl stop rise-api      # Stop API
systemctl start rise-api     # Start API
journalctl -u rise-api -f    # Follow API logs
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
./scripts/backup.sh                    # MySQL backup with 30-day rotation
./scripts/healthcheck.sh               # Health monitoring with auto-restart
./scripts/agent-memory/session-logger.sh   # Session logging for agent workflows
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

**Multi-Provider Enrichment:** The enrichment pipeline (`src/services/enrichment-pipeline.ts`) orchestrates Anthropic Claude and Google Gemini for AI-powered insights. Providers can be toggled per request.

**⚠️ Clay Integration Status (Dec 2025):** Clay.io has deprecated their public REST API (all `/v1/*` endpoints return 404). The integration code remains but is non-functional. Clay now only supports webhook-based integrations. The system gracefully falls back to AI providers when Clay fails.

**Validation:** All API inputs use Zod schemas with the validation middleware. Configuration is validated at startup.

**Lead Lifecycle:** Leads flow through statuses: `new` → `enriching` → `enriched` (or `failed`)

**Qualification Scoring:** Weighted multi-factor scoring (0-100) produces letter grades (A-F) with AI-enhanced insights.

### MCP Server Tools
The MCP server (`mcp-server/index.js`) exposes 40+ tools to Claude, organized into categories:

**Lead Management:** `rise_list_leads`, `rise_get_lead`, `rise_create_lead`, `rise_search_leads`, `rise_get_stats`, `rise_bulk_create_leads`

**Enrichment:** `rise_enrich_lead`, `rise_batch_enrich`, `rise_enrichment_stats`

**Qualification:** `rise_qualify_lead`, `rise_batch_qualify`, `rise_qualification_stats`

**Scraping:** `rise_scrape_google`, `rise_scrape_website`, `rise_bulk_scrape_google`

**Multi-AI Features:** `rise_multi_ai_status`, `rise_multi_ai_analyze`, `rise_multi_ai_consensus`, `rise_multi_ai_deep_enrich`, `rise_multi_ai_outreach`, `rise_multi_ai_competitor`, `rise_multi_ai_batch_deep_enrich`

**Session Management:** `rise_session_start`, `rise_session_log`, `rise_session_end`, `rise_session_status`, `rise_session_resume`, `rise_session_context`

**Export:** `rise_export_leads`

Configuration in `.mcp.json` points to `http://localhost:3001`.

## API Endpoints

| Prefix | Purpose |
|--------|---------|
| `GET /health` | API health status with capabilities object (shows configured providers) |
| `/api/leads` | CRUD, search, stats, bulk create (up to 1,000), deduplication |
| `/api/scraper` | Google Places search, nearby discovery, bulk queries, website scraping |
| `/api/enrichment` | Single/batch enrichment, process new, retry failed |
| `/api/qualify` | Single/batch qualification, stats, recommendations |
| `/api/sync` | Google Sheets bidirectional sync |
| `/api/pipeline` | Lead pipeline stages, email generation, proposal creation |
| `/api/multi-ai` | Multi-provider AI analysis, consensus, deep enrichment, competitor analysis |
| `/api/chat` | Conversational AI interface for lead analysis |

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

## Important Implementation Notes

### Database Connection
MySQL connection pool is configured with automatic reconnection (`src/integrations/supabase.ts`):
- Keep-alive enabled with 60-second idle timeout
- 10-second connect timeout
- Automatic reconnection on connection loss (5-second retry)
- Graceful shutdown handlers (SIGTERM/SIGINT) in `src/index.ts`
- Startup connection test validates DB before accepting requests

### GUI Architecture
The GUI (`/gui/index.html`) is a single-page vanilla JavaScript application:
- **No build step required** - edit HTML directly
- **Cache-busting enabled** - meta tags force browser refresh
- **API Response Handling:** Use utility functions (`getLeadsFromResponse`, `normalizeLead`, `validateResponse`)
- **Security:** All user input uses `sanitizeHTML()` for XSS protection
- **Data Normalization:** Handles both snake_case (DB) and camelCase (GUI) formats
- **Error Handling:** 30-second timeout on all API calls with AbortController

### Multi-AI System
Routes in `/api/routes/multi-ai.ts` enable parallel AI analysis:
- **Providers:** Anthropic Claude + Google Gemini work in parallel
- **Capabilities:** Analysis, consensus, deep enrichment, competitor research
- **Use Case:** Compare AI outputs for higher quality insights
- **Configuration:** Check capabilities via `/health` endpoint before use

### Production Deployment
This system runs as a systemd service (`rise-api.service`):
- **Code changes** require: `npm run build` (in api/) then `systemctl restart rise-api`
- **GUI changes** are instant (static file)
- **Database changes** should include migration scripts in `/scripts/`
- **Backups** run via cron: `./scripts/backup.sh` (30-day retention)
- **Health checks** auto-restart on failure: `./scripts/healthcheck.sh`

### Agent Scripts
Located in `/scripts/agents/` - automated workflows for:
- `hourly-enrichment.sh` - Process new leads automatically
- `daily-lead-expansion.sh` - Smart lead discovery from enriched data
- `weekly-report.sh` - Generate analytics reports
- `data-quality-monitor.sh` - Validate data integrity
- Session logging via `/scripts/agent-memory/session-logger.sh`

### Working with the Codebase
**When editing TypeScript API code:**
1. Make changes in `rise-local-lead-creation/api/src/`
2. Run `npm run typecheck` to validate
3. Run `npm run build` to compile
4. Restart systemd service: `systemctl restart rise-api`
5. Check logs: `journalctl -u rise-api -f`

**When editing GUI:**
1. Edit `/gui/index.html` directly
2. Hard refresh browser (Ctrl+Shift+R) to clear cache
3. No build/restart needed

**When editing MCP tools:**
1. Edit `/mcp-server/index.js`
2. Restart MCP server
3. Test with Claude desktop app

**Configuration changes:**
- All API keys in `.env` file only (never in GUI localStorage)
- Settings page shows read-only server capabilities
- Restart API after `.env` changes
