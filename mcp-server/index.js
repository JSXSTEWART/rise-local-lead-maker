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

// Helper function for memory/session commands
function runMemoryCommand(action, ...args) {
  try {
    const cmd = `${MEMORY_SCRIPT} ${action} ${args.map(a => `"${a}"`).join(' ')}`;
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch (error) {
    return `Error: ${error.message}`;
  }
}

// Helper function to make API calls
async function callAPI(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };
  if (body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(`${RISE_API_URL}${endpoint}`, options);
  return response.json();
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
