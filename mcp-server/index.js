#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { execSync } from 'child_process';

const RISE_API_URL = process.env.RISE_API_URL || 'http://localhost:3001';
const MEMORY_SCRIPT = '/opt/rise-local-lead-maker/scripts/agent-memory/session-logger.sh';
const DEFAULT_TIMEOUT = 30000; // 30 seconds
const MAX_RETRIES = 3;

// Helper function for memory/session commands with input sanitization
function runMemoryCommand(action, ...args) {
  try {
    // Sanitize inputs to prevent shell injection
    const sanitizedArgs = args.map(a =>
      String(a || '').replace(/[`$\\!]/g, '').slice(0, 1000)
    );
    const cmd = `${MEMORY_SCRIPT} ${action} ${sanitizedArgs.map(a => `"${a}"`).join(' ')}`;
    return execSync(cmd, { encoding: 'utf8', timeout: 5000 }).trim();
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Format qualification factors for readable output
function formatQualificationResult(result) {
  if (!result?.success || !result?.data) return result;

  const data = result.data;

  // Format factors array if present
  if (data.factors && Array.isArray(data.factors)) {
    data.formattedFactors = data.factors.map(f => ({
      factor: f.name,
      score: `${Math.round(f.score)}/100`,
      weight: `${Math.round(f.weight * 100)}%`,
      reason: f.reason
    }));

    // Create human-readable summary
    data.factorsSummary = data.factors.map(f =>
      `• ${f.name}: ${Math.round(f.score)}/100 (weight: ${Math.round(f.weight * 100)}%) - ${f.reason}`
    ).join('\n');
  }

  // Format batch results if present
  if (data.results && Array.isArray(data.results)) {
    data.results = data.results.map(r => {
      if (r.factors && Array.isArray(r.factors)) {
        r.formattedFactors = r.factors.map(f => ({
          factor: f.name,
          score: `${Math.round(f.score)}/100`,
          weight: `${Math.round(f.weight * 100)}%`,
          reason: f.reason
        }));
        r.factorsSummary = r.factors.map(f =>
          `• ${f.name}: ${Math.round(f.score)}/100 (weight: ${Math.round(f.weight * 100)}%) - ${f.reason}`
        ).join('\n');
      }
      return r;
    });
  }

  return result;
}

// Enhanced API call with retry logic and timeout
async function callAPI(endpoint, method = 'GET', body = null, options = {}) {
  const { timeout = DEFAULT_TIMEOUT, retries = MAX_RETRIES } = options;

  const fetchOptions = {
    method,
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(timeout),
  };

  if (body) {
    fetchOptions.body = JSON.stringify(body);
  }

  let lastError;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(`${RISE_API_URL}${endpoint}`, fetchOptions);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const error = new Error(errorData.error?.message || `HTTP ${response.status}`);
        error.status = response.status;

        // Don't retry client errors (4xx)
        if (response.status >= 400 && response.status < 500) {
          throw error;
        }

        lastError = error;
      } else {
        return await response.json();
      }
    } catch (error) {
      lastError = error;

      // Don't retry if it's a client error or abort
      if (error.name === 'AbortError' || error.status < 500) {
        throw error;
      }

      // Exponential backoff before retry
      if (attempt < retries - 1) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 10000);
        console.error(`[MCP] Retry ${attempt + 1}/${retries} for ${endpoint} after ${delay}ms`);
        await sleep(delay);
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}

// Create server
const server = new Server(
  { name: 'rise-leads', version: '1.0.0' },
  { capabilities: { tools: {} } }
);

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'rise_health',
      description: 'Check the Rise API health status',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'rise_list_leads',
      description: 'List leads with optional filtering. Returns paginated results.',
      inputSchema: {
        type: 'object',
        properties: {
          page: { type: 'number', description: 'Page number (default: 1)' },
          limit: { type: 'number', description: 'Items per page (default: 20)' },
          status: { type: 'string', enum: ['new', 'enriching', 'enriched', 'failed'], description: 'Filter by status' },
          source: { type: 'string', description: 'Filter by source' },
        },
      },
    },
    {
      name: 'rise_get_lead',
      description: 'Get a specific lead by ID',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Lead ID' },
        },
        required: ['id'],
      },
    },
    {
      name: 'rise_create_lead',
      description: 'Create a new lead',
      inputSchema: {
        type: 'object',
        properties: {
          email: { type: 'string', description: 'Email address' },
          firstName: { type: 'string', description: 'First name' },
          lastName: { type: 'string', description: 'Last name' },
          company: { type: 'string', description: 'Company name' },
          title: { type: 'string', description: 'Job title' },
          phone: { type: 'string', description: 'Phone number' },
          website: { type: 'string', description: 'Website URL' },
          linkedinUrl: { type: 'string', description: 'LinkedIn profile URL' },
          location: { type: 'string', description: 'Location' },
          industry: { type: 'string', description: 'Industry' },
          source: { type: 'string', description: 'Lead source' },
        },
        required: ['email'],
      },
    },
    {
      name: 'rise_search_leads',
      description: 'Search leads by keyword across multiple fields',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          fields: { type: 'array', items: { type: 'string' }, description: 'Fields to search (default: all)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'rise_get_stats',
      description: 'Get lead statistics (total count, by status, by source)',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'rise_enrich_lead',
      description: 'Trigger enrichment for a specific lead',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Lead ID to enrich' },
          useClay: { type: 'boolean', description: 'Use Clay for enrichment (default: true)' },
          useAI: { type: 'boolean', description: 'Use AI for analysis (default: true)' },
          aiProvider: { type: 'string', enum: ['anthropic', 'gemini'], description: 'AI provider (default: anthropic)' },
        },
        required: ['id'],
      },
    },
    {
      name: 'rise_qualify_lead',
      description: 'Qualify a specific lead with scoring',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Lead ID to qualify' },
          useAI: { type: 'boolean', description: 'Use AI for enhanced qualification (default: false)' },
        },
        required: ['id'],
      },
    },
    {
      name: 'rise_scrape_google',
      description: 'Scrape leads from Google Places',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query (e.g., "plumbers in Austin TX")' },
          location: { type: 'string', description: 'Location to search' },
          radius: { type: 'number', description: 'Search radius in meters (default: 5000)' },
          type: { type: 'string', description: 'Place type (e.g., restaurant, plumber)' },
        },
        required: ['query'],
      },
    },
    {
      name: 'rise_scrape_website',
      description: 'Scrape contact info from a website',
      inputSchema: {
        type: 'object',
        properties: {
          url: { type: 'string', description: 'Website URL to scrape' },
        },
        required: ['url'],
      },
    },
    // Memory/Session tools
    {
      name: 'rise_session_start',
      description: 'Start a new agent session for logging and memory',
      inputSchema: {
        type: 'object',
        properties: {
          description: { type: 'string', description: 'Session description' },
        },
      },
    },
    {
      name: 'rise_session_log',
      description: 'Log an action in the current session',
      inputSchema: {
        type: 'object',
        properties: {
          level: { type: 'string', enum: ['INFO', 'WARN', 'ERROR', 'TASK'], description: 'Log level' },
          message: { type: 'string', description: 'Log message' },
        },
        required: ['message'],
      },
    },
    {
      name: 'rise_session_end',
      description: 'End the current session with a summary',
      inputSchema: {
        type: 'object',
        properties: {
          summary: { type: 'string', description: 'Session summary' },
        },
      },
    },
    {
      name: 'rise_session_status',
      description: 'Get current session status and recent actions',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'rise_session_resume',
      description: 'Resume a previous session by ID',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID to resume (defaults to most recent)' },
        },
      },
    },
    {
      name: 'rise_session_context',
      description: 'Save context for session resumption',
      inputSchema: {
        type: 'object',
        properties: {
          context: { type: 'string', description: 'Context to save for later resumption' },
        },
        required: ['context'],
      },
    },
    // Batch operation tools
    {
      name: 'rise_bulk_create_leads',
      description: 'Create multiple leads at once (up to 100)',
      inputSchema: {
        type: 'object',
        properties: {
          leads: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                email: { type: 'string' },
                company: { type: 'string' },
                phone: { type: 'string' },
                website: { type: 'string' },
                location: { type: 'string' },
                industry: { type: 'string' },
                source: { type: 'string' },
              },
            },
            description: 'Array of leads to create',
          },
        },
        required: ['leads'],
      },
    },
    {
      name: 'rise_batch_enrich',
      description: 'Enrich multiple leads in batch',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max number of leads to enrich (default: 10)' },
          status: { type: 'string', enum: ['new', 'failed'], description: 'Filter by status (default: new)' },
        },
      },
    },
    {
      name: 'rise_batch_qualify',
      description: 'Qualify multiple leads in batch',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max number of leads to qualify (default: 50)' },
          minScore: { type: 'number', description: 'Minimum score threshold (default: 0)' },
        },
      },
    },
    {
      name: 'rise_export_leads',
      description: 'Export leads to JSON format',
      inputSchema: {
        type: 'object',
        properties: {
          status: { type: 'string', enum: ['new', 'enriching', 'enriched', 'failed'], description: 'Filter by status' },
          limit: { type: 'number', description: 'Max number of leads to export (default: 100)' },
          format: { type: 'string', enum: ['json', 'csv'], description: 'Export format (default: json)' },
        },
      },
    },
    {
      name: 'rise_bulk_scrape_google',
      description: 'Run multiple Google Places searches',
      inputSchema: {
        type: 'object',
        properties: {
          queries: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                query: { type: 'string' },
                location: { type: 'string' },
              },
              required: ['query'],
            },
            description: 'Array of search queries (max 20)',
          },
        },
        required: ['queries'],
      },
    },
    {
      name: 'rise_enrichment_stats',
      description: 'Get enrichment statistics and success rates',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'rise_qualification_stats',
      description: 'Get qualification score distribution and stats',
      inputSchema: { type: 'object', properties: {} },
    },
    // Multi-AI Tools - Claude and Gemini working together
    {
      name: 'rise_multi_ai_status',
      description: 'Check multi-AI configuration status and available capabilities',
      inputSchema: { type: 'object', properties: {} },
    },
    {
      name: 'rise_multi_ai_analyze',
      description: 'Run parallel analysis using both Claude and Gemini, then synthesize results',
      inputSchema: {
        type: 'object',
        properties: {
          prompt: { type: 'string', description: 'The analysis prompt to send to both AIs' },
          synthesize: { type: 'boolean', description: 'Whether to synthesize results (default: true)' },
        },
        required: ['prompt'],
      },
    },
    {
      name: 'rise_multi_ai_consensus',
      description: 'Have both AIs analyze a topic and find consensus',
      inputSchema: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: 'The topic to analyze' },
          context: { type: 'object', description: 'Additional context as key-value pairs' },
        },
        required: ['topic'],
      },
    },
    {
      name: 'rise_multi_ai_deep_enrich',
      description: 'Deep lead enrichment using both Claude and Gemini collaboratively. Returns combined insights, shared/unique perspectives, and outreach strategy.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Lead ID to deep enrich' },
        },
        required: ['id'],
      },
    },
    {
      name: 'rise_multi_ai_outreach',
      description: 'Generate outreach email using both AIs, picking the best result',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Lead ID to generate outreach for' },
          style: { type: 'string', enum: ['formal', 'casual', 'consultative'], description: 'Email style (default: consultative)' },
        },
        required: ['id'],
      },
    },
    {
      name: 'rise_multi_ai_competitor',
      description: 'Analyze competitors using both AIs for comprehensive market intelligence',
      inputSchema: {
        type: 'object',
        properties: {
          company: { type: 'string', description: 'Company name to analyze' },
          industry: { type: 'string', description: 'Industry sector' },
          website: { type: 'string', description: 'Company website (optional)' },
        },
        required: ['company', 'industry'],
      },
    },
    {
      name: 'rise_multi_ai_batch_deep_enrich',
      description: 'Deep enrich multiple leads using both AIs',
      inputSchema: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max leads to process (default: 10)' },
          status: { type: 'string', enum: ['new', 'enriched'], description: 'Filter by status (default: enriched)' },
        },
      },
    },
  ],
}));

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    let result;

    switch (name) {
      case 'rise_health':
        result = await callAPI('/health');
        break;

      case 'rise_list_leads':
        const params = new URLSearchParams();
        if (args.page) params.set('page', args.page.toString());
        if (args.limit) params.set('limit', args.limit.toString());
        if (args.status) params.set('status', args.status);
        if (args.source) params.set('source', args.source);
        result = await callAPI(`/api/leads?${params.toString()}`);
        break;

      case 'rise_get_lead':
        result = await callAPI(`/api/leads/${args.id}`);
        break;

      case 'rise_create_lead':
        result = await callAPI('/api/leads', 'POST', args);
        break;

      case 'rise_search_leads':
        result = await callAPI('/api/leads/search', 'POST', {
          query: args.query,
          fields: args.fields,
        });
        break;

      case 'rise_get_stats':
        result = await callAPI('/api/leads/stats');
        break;

      case 'rise_enrich_lead':
        result = await callAPI(`/api/enrichment/${args.id}`, 'POST', {
          useClay: args.useClay ?? true,
          useAI: args.useAI ?? true,
          aiProvider: args.aiProvider ?? 'anthropic',
        });
        break;

      case 'rise_qualify_lead':
        result = await callAPI(`/api/qualify/${args.id}`, 'POST', {
          useAI: args.useAI ?? false,
        });
        result = formatQualificationResult(result);
        break;

      case 'rise_scrape_google':
        result = await callAPI('/api/scraper/google', 'POST', {
          query: args.query,
          location: args.location,
          radius: args.radius ?? 5000,
          type: args.type,
        });
        break;

      case 'rise_scrape_website':
        result = await callAPI('/api/scraper/website/single', 'POST', {
          url: args.url,
        });
        break;

      // Memory/Session tool handlers
      case 'rise_session_start':
        result = { output: runMemoryCommand('start', args.description || 'New session') };
        break;

      case 'rise_session_log':
        result = { output: runMemoryCommand('log', args.level || 'INFO', args.message) };
        break;

      case 'rise_session_end':
        result = { output: runMemoryCommand('end', args.summary || 'Session completed') };
        break;

      case 'rise_session_status':
        result = { output: runMemoryCommand('status') };
        break;

      case 'rise_session_resume':
        result = { output: runMemoryCommand('resume', args.sessionId || '') };
        break;

      case 'rise_session_context':
        result = { output: runMemoryCommand('context', args.context) };
        break;

      // Batch operation handlers
      case 'rise_bulk_create_leads':
        if (!args.leads || !Array.isArray(args.leads)) {
          throw new Error('leads array is required');
        }
        if (args.leads.length > 100) {
          throw new Error('Maximum 100 leads per batch');
        }
        result = await callAPI('/api/leads/bulk', 'POST', {
          leads: args.leads,
        }, { timeout: 60000 });
        break;

      case 'rise_batch_enrich':
        result = await callAPI('/api/enrichment/batch', 'POST', {
          limit: args.limit ?? 10,
          status: args.status ?? 'new',
        }, { timeout: 120000 });
        break;

      case 'rise_batch_qualify':
        result = await callAPI('/api/qualify/batch', 'POST', {
          limit: args.limit ?? 50,
        }, { timeout: 60000 });
        result = formatQualificationResult(result);
        break;

      case 'rise_export_leads':
        const exportParams = new URLSearchParams();
        exportParams.set('limit', (args.limit ?? 100).toString());
        if (args.status) exportParams.set('status', args.status);
        const leadsData = await callAPI(`/api/leads?${exportParams.toString()}`);

        if (args.format === 'csv' && leadsData.success) {
          const leads = leadsData.data.leads || [];
          const headers = ['id', 'email', 'company', 'phone', 'website', 'location', 'industry', 'status', 'source'];
          const csv = [
            headers.join(','),
            ...leads.map(l => headers.map(h => `"${String(l[h] || '').replace(/"/g, '""')}"`).join(','))
          ].join('\n');
          result = { success: true, data: { format: 'csv', content: csv, count: leads.length } };
        } else {
          result = leadsData;
        }
        break;

      case 'rise_bulk_scrape_google':
        if (!args.queries || !Array.isArray(args.queries)) {
          throw new Error('queries array is required');
        }
        if (args.queries.length > 20) {
          throw new Error('Maximum 20 queries per batch');
        }
        result = await callAPI('/api/scraper/google/bulk', 'POST', {
          queries: args.queries,
          saveToDatabase: true,
        }, { timeout: 120000 });
        break;

      case 'rise_enrichment_stats':
        result = await callAPI('/api/enrichment/stats');
        break;

      case 'rise_qualification_stats':
        result = await callAPI('/api/qualify/stats');
        break;

      // Multi-AI tool handlers
      case 'rise_multi_ai_status':
        result = await callAPI('/api/multi-ai/status');
        break;

      case 'rise_multi_ai_analyze':
        result = await callAPI('/api/multi-ai/analyze', 'POST', {
          prompt: args.prompt,
          synthesize: args.synthesize ?? true,
        }, { timeout: 120000 });
        break;

      case 'rise_multi_ai_consensus':
        result = await callAPI('/api/multi-ai/consensus', 'POST', {
          topic: args.topic,
          context: args.context || {},
        }, { timeout: 120000 });
        break;

      case 'rise_multi_ai_deep_enrich':
        result = await callAPI(`/api/multi-ai/deep-enrich/${args.id}`, 'POST', {}, { timeout: 180000 });
        // Format the result for better readability
        if (result?.success && result?.data) {
          const d = result.data;
          result.formattedSummary = `
Deep Enrichment Results for: ${d.lead?.company || 'Unknown'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Score: ${d.combinedScore}/10 (Confidence: ${Math.round(d.confidence * 100)}%)

SHARED INSIGHTS (Both AIs agree):
${d.insights?.shared?.map(i => `  • ${i}`).join('\n') || '  None'}

CLAUDE'S UNIQUE INSIGHTS:
${d.insights?.claudeUnique?.map(i => `  • ${i}`).join('\n') || '  None'}

GEMINI'S UNIQUE INSIGHTS:
${d.insights?.geminiUnique?.map(i => `  • ${i}`).join('\n') || '  None'}

PRIORITY RECOMMENDATIONS:
${d.recommendations?.priority?.map(r => `  ★ ${r}`).join('\n') || '  None'}

OUTREACH STRATEGY:
  Approach: ${d.outreachStrategy?.approach || 'N/A'}
  Timing: ${d.outreachStrategy?.timing || 'N/A'}
  Channels: ${d.outreachStrategy?.channels?.join(', ') || 'N/A'}

RISK FACTORS:
${d.riskFactors?.map(r => `  ⚠ ${r}`).join('\n') || '  None identified'}

OPPORTUNITY SIGNALS:
${d.opportunitySignals?.map(o => `  ✓ ${o}`).join('\n') || '  None identified'}
`;
        }
        break;

      case 'rise_multi_ai_outreach':
        result = await callAPI('/api/multi-ai/outreach', 'POST', {
          leadId: args.id,
          style: args.style ?? 'consultative',
        }, { timeout: 120000 });
        break;

      case 'rise_multi_ai_competitor':
        result = await callAPI('/api/multi-ai/competitor-analysis', 'POST', {
          company: args.company,
          industry: args.industry,
          website: args.website,
        }, { timeout: 120000 });
        break;

      case 'rise_multi_ai_batch_deep_enrich':
        result = await callAPI('/api/multi-ai/batch-deep-enrich', 'POST', {
          limit: args.limit ?? 10,
          status: args.status ?? 'enriched',
        }, { timeout: 300000 });
        break;

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
    };
  } catch (error) {
    return {
      content: [{ type: 'text', text: `Error: ${error.message}` }],
      isError: true,
    };
  }
});

// Start server
const transport = new StdioServerTransport();
await server.connect(transport);
console.error('Rise MCP Server running...');
