# WHMCS LLM Container Provisioning System

## Overview

This system provides automated deployment and management of customer-provisioned LLM (Large Language Model) inference containers through WHMCS billing integration. It combines WHMCS provisioning, Portainer orchestration, multi-LLM support, GPU management, usage-based billing, and Zapier automation.

## Quick Start

### 1. Install Dependencies

```bash
# NVIDIA Container Toolkit (if using GPUs)
./scripts/install-nvidia-toolkit.sh

# Portainer
docker volume create portainer_data
docker run -d -p 9443:9443 --name portainer --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```

### 2. Deploy Infrastructure

```bash
# Start Traefik API gateway
cd docker/compose
docker compose -f traefik.yml up -d

# Start monitoring (optional, requires GPU)
docker compose -f monitoring-stack.yml up -d
```

### 3. Install WHMCS Module

```bash
cp -r whmcs-module/modules/servers/llmcontainer /var/www/whmcs/modules/servers/
chown -R www-data:www-data /var/www/whmcs/modules/servers/llmcontainer
```

### 4. Configure WHMCS

1. Setup → Servers → Add New Server
2. Type: `LLM Container Provisioning`
3. Hostname: Portainer server
4. Port: 9443, Username/Password: Portainer admin

## Architecture

See full documentation in [WHMCS_LLM_PROVISIONING.md](./docs/WHMCS_LLM_PROVISIONING.md)

## Features

- **Multi-LLM Support**: Llama 3, Mistral, CodeLlama, Gemma
- **Multiple Engines**: vLLM (high-perf), Ollama (lightweight), TGI
- **GPU Management**: Resource allocation, monitoring, billing
- **Multi-Tenancy**: Isolated containers with SSL subdomains
- **Usage Billing**: GPU hours, tokens, API requests via Prometheus
- **Zapier Integration**: 5 MCP webhook tools for automation
- **cPanel/LiteSpeed**: Compatible with shared hosting environments

## Directory Structure

```
whmcs-module/              # WHMCS provisioning module
├── modules/servers/llmcontainer/
│   ├── llmcontainer.php   # Main module
│   ├── lib/
│   │   ├── PortainerClient.php       # API client
│   │   └── LLMMetricsProvider.php    # Billing metrics
│   ├── templates/         # Client area templates
│   ├── hooks.php          # Automation hooks
│   └── whmcs.json         # Module metadata

docker/                    # Container configurations
├── compose/
│   ├── vllm-stack.yml     # High-performance vLLM
│   ├── ollama-stack.yml   # Lightweight Ollama
│   ├── traefik.yml        # API gateway
│   └── monitoring-stack.yml # Prometheus + Grafana
├── prometheus/
│   ├── prometheus.yml     # Scrape config
│   └── rules/
│       └── billing.yml    # GPU billing rules

mcp-server/
├── index.js               # Main MCP server
└── zapier-integration.js  # Zapier webhook tools

docs/
└── WHMCS_LLM_PROVISIONING.md  # Complete documentation
```

## MCP Zapier Tools

```javascript
// Process incoming lead from Zapier
rise_zapier_webhook_lead({ email, firstName, company, autoEnrich: true })

// Provision container from Zapier
rise_zapier_webhook_container({ tenantId, model: 'llama3-8b', gpuCount: 1 })

// Send status to Zapier webhook
rise_zapier_webhook_status({ webhookUrl, event: 'lead_enriched', status: 'complete' })

// Multi-AI analysis
rise_zapier_multi_ai_webhook({ leadId, analysisType: 'deep_enrich' })

// Bulk operations
rise_zapier_bulk_operation({ operation: 'enrich', data: [leadIds] })
```

## Environment Variables

```bash
# Portainer
PORTAINER_URL=https://portainer.yourdomain.com
PORTAINER_USERNAME=admin
PORTAINER_PASSWORD=secure-password

# HuggingFace
HF_TOKEN=your-token

# Traefik
ACME_EMAIL=admin@yourdomain.com
TRAEFIK_DASHBOARD_DOMAIN=traefik.yourdomain.com

# Zapier
ZAPIER_WEBHOOK_SECRET=webhook-secret

# Monitoring
PROMETHEUS_URL=http://localhost:9090
```

## Usage Examples

### Python Client

```python
from openai import OpenAI

client = OpenAI(
    base_url="https://tenant-id.api.yourdomain.com/v1",
    api_key="your-api-key"
)

response = client.chat.completions.create(
    model="llama3",
    messages=[{"role": "user", "content": "Hello!"}]
)
```

### cURL

```bash
curl https://tenant-id.api.yourdomain.com/v1/chat/completions \
  -H "Authorization: Bearer API-KEY" \
  -d '{"model": "llama3", "messages": [{"role": "user", "content": "Hi"}]}'
```

## Billing

### GPU Hours Formula
```
GPU_Hours = (GPU_Utilization × Runtime_Hours) / 100
Cost = GPU_Hours × $2.00/hour
```

### Market Pricing (Dec 2025)
- H100 80GB: $2.74-$4.47/hour
- A100 80GB: $1.76-$2.17/hour
- RTX 4090: $0.34-$0.39/hour

## Support

- **Documentation**: [docs/WHMCS_LLM_PROVISIONING.md](./docs/WHMCS_LLM_PROVISIONING.md)
- **GitHub Issues**: https://github.com/JSXSTEWART/rise-local-lead-maker/issues
- **WHMCS Docs**: https://developers.whmcs.com/provisioning-modules/
