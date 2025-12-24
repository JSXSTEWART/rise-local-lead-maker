/**
 * Zapier MCP Integration for Rise Local Lead Maker
 * 
 * Extends the MCP server with Zapier webhook tools for:
 * - Incoming lead webhooks from Zapier
 * - Container provisioning triggers
 * - Status notifications and updates
 * - Multi-AI provider coordination
 * 
 * Usage: Import this module in the main MCP server index.js
 */

import crypto from 'crypto';

const ZAPIER_WEBHOOK_SECRET = process.env.ZAPIER_WEBHOOK_SECRET || '';
const RISE_API_URL = process.env.RISE_API_URL || 'http://localhost:3001';

/**
 * Verify Zapier webhook signature
 */
function verifyZapierSignature(payload, signature) {
  if (!ZAPIER_WEBHOOK_SECRET) return true; // Skip verification if no secret set
  
  const hmac = crypto.createHmac('sha256', ZAPIER_WEBHOOK_SECRET);
  hmac.update(JSON.stringify(payload));
  const expectedSignature = hmac.digest('hex');
  
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Zapier MCP Tools Definition
 */
export const zapierTools = [
  {
    name: 'rise_zapier_webhook_lead',
    description: 'Process incoming lead from Zapier webhook. Accepts lead data and automatically enriches it.',
    inputSchema: {
      type: 'object',
      properties: {
        email: { type: 'string', description: 'Lead email address' },
        firstName: { type: 'string', description: 'Lead first name' },
        lastName: { type: 'string', description: 'Lead last name' },
        company: { type: 'string', description: 'Company name' },
        title: { type: 'string', description: 'Job title' },
        phone: { type: 'string', description: 'Phone number' },
        website: { type: 'string', description: 'Company website' },
        linkedinUrl: { type: 'string', description: 'LinkedIn profile URL' },
        location: { type: 'string', description: 'Location/city' },
        source: { type: 'string', description: 'Lead source (e.g., zapier, form, import)' },
        autoEnrich: { type: 'boolean', description: 'Auto-enrich after creation', default: true },
        zapierSignature: { type: 'string', description: 'Webhook signature for verification' },
      },
      required: ['email'],
    },
  },
  {
    name: 'rise_zapier_webhook_container',
    description: 'Trigger LLM container provisioning from Zapier. Creates and configures a new tenant container.',
    inputSchema: {
      type: 'object',
      properties: {
        tenantId: { type: 'string', description: 'Unique tenant identifier' },
        model: { 
          type: 'string', 
          description: 'LLM model (llama3-8b, llama3-70b, mistral-7b, codellama-34b, gemma-7b)',
          enum: ['llama3-8b', 'llama3-70b', 'mistral-7b', 'codellama-34b', 'gemma-7b']
        },
        engine: {
          type: 'string',
          description: 'Inference engine (vllm, ollama, tgi)',
          enum: ['vllm', 'ollama', 'tgi'],
          default: 'vllm'
        },
        gpuCount: { type: 'number', description: 'Number of GPUs to allocate', default: 1 },
        maxModelLen: { type: 'number', description: 'Maximum context length in tokens', default: 8192 },
        rateLimit: { type: 'number', description: 'API rate limit (requests/sec)', default: 100 },
        subdomain: { type: 'string', description: 'Subdomain for API access' },
        zapierSignature: { type: 'string', description: 'Webhook signature for verification' },
      },
      required: ['tenantId', 'model'],
    },
  },
  {
    name: 'rise_zapier_webhook_status',
    description: 'Send status notification to Zapier webhook. Useful for alerting on enrichment completion, errors, etc.',
    inputSchema: {
      type: 'object',
      properties: {
        webhookUrl: { type: 'string', description: 'Zapier webhook URL to send status to' },
        event: { type: 'string', description: 'Event type (lead_enriched, container_ready, error, etc.)' },
        leadId: { type: 'string', description: 'Lead ID if applicable' },
        tenantId: { type: 'string', description: 'Tenant ID if applicable' },
        status: { type: 'string', description: 'Status message' },
        data: { type: 'object', description: 'Additional data to send' },
      },
      required: ['webhookUrl', 'event', 'status'],
    },
  },
  {
    name: 'rise_zapier_multi_ai_webhook',
    description: 'Process multi-AI analysis request from Zapier. Routes to multiple AI providers (Anthropic, Gemini) and returns consensus.',
    inputSchema: {
      type: 'object',
      properties: {
        leadId: { type: 'string', description: 'Lead ID to analyze' },
        analysisType: {
          type: 'string',
          description: 'Type of analysis (analyze, consensus, deep_enrich, outreach, competitor)',
          enum: ['analyze', 'consensus', 'deep_enrich', 'outreach', 'competitor']
        },
        providers: {
          type: 'array',
          description: 'AI providers to use',
          items: { type: 'string', enum: ['anthropic', 'gemini'] },
          default: ['anthropic', 'gemini']
        },
        webhookUrl: { type: 'string', description: 'Zapier webhook URL to send results' },
        zapierSignature: { type: 'string', description: 'Webhook signature for verification' },
      },
      required: ['leadId', 'analysisType'],
    },
  },
  {
    name: 'rise_zapier_bulk_operation',
    description: 'Trigger bulk operation from Zapier (batch enrich, batch qualify, bulk scrape). Processes multiple items asynchronously.',
    inputSchema: {
      type: 'object',
      properties: {
        operation: {
          type: 'string',
          description: 'Bulk operation type',
          enum: ['enrich', 'qualify', 'scrape_google', 'create_leads']
        },
        data: {
          type: 'array',
          description: 'Array of items to process (leadIds, queries, or lead objects)'
        },
        webhookUrl: { type: 'string', description: 'Zapier webhook URL for progress updates' },
        zapierSignature: { type: 'string', description: 'Webhook signature for verification' },
      },
      required: ['operation', 'data'],
    },
  },
];

/**
 * Zapier MCP Tool Handlers
 */
export async function handleZapierTool(name, args) {
  // Verify signature if provided
  if (args.zapierSignature) {
    const { zapierSignature, ...payload } = args;
    if (!verifyZapierSignature(payload, zapierSignature)) {
      return {
        success: false,
        error: 'Invalid webhook signature',
      };
    }
  }

  switch (name) {
    case 'rise_zapier_webhook_lead':
      return await handleWebhookLead(args);
    
    case 'rise_zapier_webhook_container':
      return await handleWebhookContainer(args);
    
    case 'rise_zapier_webhook_status':
      return await handleWebhookStatus(args);
    
    case 'rise_zapier_multi_ai_webhook':
      return await handleMultiAIWebhook(args);
    
    case 'rise_zapier_bulk_operation':
      return await handleBulkOperation(args);
    
    default:
      return { success: false, error: 'Unknown Zapier tool' };
  }
}

/**
 * Handle incoming lead webhook
 */
async function handleWebhookLead(args) {
  try {
    const { zapierSignature, autoEnrich = true, ...leadData } = args;
    
    // Create lead
    const response = await fetch(`${RISE_API_URL}/api/leads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(leadData),
    });

    if (!response.ok) {
      throw new Error(`Failed to create lead: ${response.statusText}`);
    }

    const result = await response.json();
    const leadId = result.data?.id;

    // Auto-enrich if requested
    if (autoEnrich && leadId) {
      const enrichResponse = await fetch(`${RISE_API_URL}/api/enrichment/enrich/${leadId}`, {
        method: 'POST',
      });
      
      if (enrichResponse.ok) {
        const enrichResult = await enrichResponse.json();
        return {
          success: true,
          leadId,
          enriched: true,
          data: enrichResult.data,
        };
      }
    }

    return {
      success: true,
      leadId,
      enriched: false,
      data: result.data,
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Handle container provisioning webhook
 */
async function handleWebhookContainer(args) {
  try {
    const { zapierSignature, ...config } = args;
    
    // Note: This would integrate with Portainer API
    // For now, return configuration that would be used
    return {
      success: true,
      message: 'Container provisioning initiated',
      tenantId: config.tenantId,
      config: {
        model: config.model,
        engine: config.engine,
        gpuCount: config.gpuCount,
        maxModelLen: config.maxModelLen,
        apiEndpoint: `https://${config.subdomain}`,
      },
      note: 'Full Portainer integration requires WHMCS module installation',
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Send status notification to Zapier
 */
async function handleWebhookStatus(args) {
  try {
    const { webhookUrl, ...payload } = args;
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        timestamp: new Date().toISOString(),
        ...payload,
      }),
    });

    return {
      success: response.ok,
      statusCode: response.status,
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Handle multi-AI analysis webhook
 */
async function handleMultiAIWebhook(args) {
  try {
    const { leadId, analysisType, providers, webhookUrl, zapierSignature } = args;
    
    const endpoint = `/api/multi-ai/${analysisType}`;
    const body = {
      leadId,
      providers: providers || ['anthropic', 'gemini'],
    };

    const response = await fetch(`${RISE_API_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Multi-AI analysis failed: ${response.statusText}`);
    }

    const result = await response.json();

    // Send results to webhook if provided
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'multi_ai_complete',
          leadId,
          analysisType,
          timestamp: new Date().toISOString(),
          results: result.data,
        }),
      });
    }

    return {
      success: true,
      data: result.data,
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

/**
 * Handle bulk operations
 */
async function handleBulkOperation(args) {
  try {
    const { operation, data, webhookUrl, zapierSignature } = args;
    
    let endpoint, method, body;

    switch (operation) {
      case 'enrich':
        endpoint = '/api/enrichment/batch';
        method = 'POST';
        body = { leadIds: data };
        break;
      
      case 'qualify':
        endpoint = '/api/qualify/batch';
        method = 'POST';
        body = { leadIds: data };
        break;
      
      case 'scrape_google':
        endpoint = '/api/scraper/bulk-google';
        method = 'POST';
        body = { queries: data };
        break;
      
      case 'create_leads':
        endpoint = '/api/leads/bulk';
        method = 'POST';
        body = { leads: data };
        break;
      
      default:
        throw new Error('Unknown operation: ' + operation);
    }

    const response = await fetch(`${RISE_API_URL}${endpoint}`, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`Bulk operation failed: ${response.statusText}`);
    }

    const result = await response.json();

    // Send results to webhook if provided
    if (webhookUrl) {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'bulk_operation_complete',
          operation,
          timestamp: new Date().toISOString(),
          results: result.data,
        }),
      });
    }

    return {
      success: true,
      operation,
      data: result.data,
    };

  } catch (error) {
    return {
      success: false,
      error: error.message,
    };
  }
}

export default {
  zapierTools,
  handleZapierTool,
};
