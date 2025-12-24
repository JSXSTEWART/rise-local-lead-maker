# Integrating Zapier MCP Tools into Rise MCP Server

## Overview

The Zapier integration adds 5 new MCP tools to the Rise Local Lead Maker system for workflow automation:

1. `rise_zapier_webhook_lead` - Process incoming leads
2. `rise_zapier_webhook_container` - Provision LLM containers
3. `rise_zapier_webhook_status` - Send status notifications
4. `rise_zapier_multi_ai_webhook` - Multi-AI provider analysis
5. `rise_zapier_bulk_operation` - Batch operations

## Integration Steps

### 1. Update MCP Server index.js

Add the following import at the top of `mcp-server/index.js`:

```javascript
import { zapierTools, handleZapierTool } from './zapier-integration.js';
```

### 2. Register Zapier Tools

In the `server.setRequestHandler(ListToolsRequestSchema)` section, add Zapier tools:

```javascript
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      // ... existing tools ...
      ...zapierTools,  // Add this line
    ]
  };
});
```

### 3. Handle Zapier Tool Calls

In the `server.setRequestHandler(CallToolRequestSchema)` section, add Zapier handler:

```javascript
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    // ... existing tool handlers ...

    // Add Zapier tools handler
    if (name.startsWith('rise_zapier_')) {
      const result = await handleZapierTool(name, args || {});
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }

    // ... rest of handlers ...
  } catch (error) {
    // ... error handling ...
  }
});
```

### 4. Environment Variables

Add to `.env`:

```bash
# Zapier Integration
ZAPIER_WEBHOOK_SECRET=your-webhook-secret-here
```

Generate webhook secret:
```bash
openssl rand -hex 32
```

### 5. Restart MCP Server

```bash
cd mcp-server
npm start
```

## Usage Examples

### Example 1: Zapier → Lead Creation → Auto-Enrich

**Zapier Setup:**
1. Trigger: Webhook by Zapier
2. Action: Call MCP tool via Claude API
3. Tool: `rise_zapier_webhook_lead`

**Tool Call:**
```json
{
  "email": "john@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "company": "Acme Corp",
  "phone": "+1-555-0100",
  "autoEnrich": true,
  "zapierSignature": "sha256_signature_here"
}
```

**Response:**
```json
{
  "success": true,
  "leadId": "abc123",
  "enriched": true,
  "data": { ... enrichment data ... }
}
```

### Example 2: WHMCS Order → Container Provisioning

**Zapier Setup:**
1. Trigger: New WHMCS Order (via Webhook)
2. Action: Call MCP tool
3. Tool: `rise_zapier_webhook_container`

**Tool Call:**
```json
{
  "tenantId": "customer-xyz",
  "model": "llama3-8b",
  "engine": "vllm",
  "gpuCount": 1,
  "maxModelLen": 8192,
  "subdomain": "customer-xyz.api.yourdomain.com"
}
```

### Example 3: Enrichment Complete → Notify Zapier

**Tool Call from Claude:**
```json
{
  "webhookUrl": "https://hooks.zapier.com/hooks/catch/...",
  "event": "lead_enriched",
  "leadId": "abc123",
  "status": "Enrichment completed successfully",
  "data": {
    "score": 85,
    "grade": "A",
    "insights": "..."
  }
}
```

**Zapier receives webhook and can:**
- Send email notification
- Update CRM
- Trigger follow-up workflow

### Example 4: Multi-AI Deep Enrichment

**Tool Call:**
```json
{
  "leadId": "abc123",
  "analysisType": "deep_enrich",
  "providers": ["anthropic", "gemini"],
  "webhookUrl": "https://hooks.zapier.com/hooks/catch/..."
}
```

**Result:**
- Runs analysis with both AI providers
- Compares insights
- Sends consolidated results to Zapier webhook

### Example 5: Bulk Lead Import from Google Sheets

**Zapier Setup:**
1. Trigger: New/Updated Rows in Google Sheets
2. Action: Call MCP bulk operation
3. Tool: `rise_zapier_bulk_operation`

**Tool Call:**
```json
{
  "operation": "create_leads",
  "data": [
    {
      "email": "lead1@example.com",
      "company": "Company A"
    },
    {
      "email": "lead2@example.com",
      "company": "Company B"
    }
  ],
  "webhookUrl": "https://hooks.zapier.com/hooks/catch/..."
}
```

## Security

### Webhook Signature Verification

All Zapier tools support optional signature verification:

**Generate Signature (Zapier side):**
```python
import hmac
import hashlib
import json

secret = "your-webhook-secret"
payload = json.dumps(data, sort_keys=True)
signature = hmac.new(
    secret.encode(),
    payload.encode(),
    hashlib.sha256
).hexdigest()
```

**Include in Tool Call:**
```json
{
  "email": "...",
  "zapierSignature": "sha256_signature_here"
}
```

The MCP server automatically verifies the signature if `ZAPIER_WEBHOOK_SECRET` is set.

## Zapier Zap Templates

### Template 1: Form Submission → Lead Creation

**Trigger:** Webhook Catch
**Actions:**
1. Parse form data
2. Call `rise_zapier_webhook_lead` tool
3. Send confirmation email

### Template 2: Lead Qualified → Send to CRM

**Trigger:** Schedule (check for new qualified leads)
**Actions:**
1. Call `rise_zapier_bulk_operation` with operation="qualify"
2. Filter by grade (A or B)
3. Create records in Salesforce/HubSpot

### Template 3: Container Provisioned → Onboard Customer

**Trigger:** Webhook from WHMCS
**Actions:**
1. Call `rise_zapier_webhook_container` tool
2. Send welcome email with API credentials
3. Create support ticket
4. Add to customer success dashboard

## Troubleshooting

### Tool Not Found

**Error:** `Unknown Zapier tool`

**Solution:** Ensure `zapier-integration.js` is imported and tools are registered in `index.js`

### Signature Verification Failed

**Error:** `Invalid webhook signature`

**Solutions:**
1. Check `ZAPIER_WEBHOOK_SECRET` matches in both systems
2. Ensure payload is JSON-stringified with sorted keys
3. Verify HMAC-SHA256 algorithm is used

### Connection Timeout

**Error:** `fetch failed` or timeout

**Solutions:**
1. Check `RISE_API_URL` is correct in `.env`
2. Ensure Rise API is running (`curl http://localhost:3001/health`)
3. Verify firewall allows connections

## Advanced: Custom Zapier Actions

You can add more Zapier tools by extending `zapier-integration.js`:

```javascript
export const zapierTools = [
  // ... existing tools ...
  {
    name: 'rise_zapier_custom_action',
    description: 'Your custom action',
    inputSchema: {
      type: 'object',
      properties: {
        // your properties
      },
      required: ['field1'],
    },
  },
];

// Add handler in handleZapierTool()
case 'rise_zapier_custom_action':
  return await handleCustomAction(args);
```

## Support

- **GitHub Issues:** https://github.com/JSXSTEWART/rise-local-lead-maker/issues
- **MCP Protocol:** https://modelcontextprotocol.io/
- **Zapier Platform:** https://zapier.com/platform
