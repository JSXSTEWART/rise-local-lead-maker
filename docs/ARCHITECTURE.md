# WHMCS LLM Container Provisioning - Architecture Overview

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CUSTOMER ORDERING FLOW                           │
└─────────────────────────────────────────────────────────────────────────┘

    Customer              WHMCS                Portainer           Docker/K8s
       │                    │                      │                   │
       │  1. Order LLM      │                      │                   │
       │─────────────────>  │                      │                   │
       │                    │                      │                   │
       │  2. Payment OK     │                      │                   │
       │<─────────────────  │                      │                   │
       │                    │                      │                   │
       │                    │  3. Deploy Stack     │                   │
       │                    │─────────────────────>│                   │
       │                    │                      │                   │
       │                    │                      │  4. Create Container│
       │                    │                      │──────────────────>│
       │                    │                      │                   │
       │                    │                      │  5. Container Running│
       │                    │                      │<──────────────────│
       │                    │                      │                   │
       │                    │  6. Stack ID         │                   │
       │                    │<─────────────────────│                   │
       │                    │                      │                   │
       │  7. API Key & URL  │                      │                   │
       │<─────────────────  │                      │                   │
       │                    │                      │                   │

┌─────────────────────────────────────────────────────────────────────────┐
│                         RUNTIME ARCHITECTURE                            │
└─────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │   Internet   │
                              └──────┬───────┘
                                     │
                                     │ HTTPS
                                     ▼
                         ┌───────────────────────┐
                         │   Traefik Gateway     │
                         │  (SSL Termination)    │
                         │  (Rate Limiting)      │
                         └───────┬───────────────┘
                                 │
                 ┌───────────────┼───────────────┐
                 │               │               │
                 ▼               ▼               ▼
         ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
         │  Tenant A    │ │  Tenant B    │ │  Tenant C    │
         │  vLLM        │ │  Ollama      │ │  vLLM        │
         │  Llama3-8B   │ │  Mistral-7B  │ │  Llama3-70B  │
         │  1x GPU      │ │  CPU Only    │ │  2x GPU      │
         └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
                │                │                │
                └────────────────┼────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  DCGM-Exporter          │
                    │  (GPU Metrics)          │
                    └─────────┬───────────────┘
                              │
                              ▼
                    ┌─────────────────────────┐
                    │  Prometheus             │
                    │  (Metrics Storage)      │
                    └─────────┬───────────────┘
                              │
                  ┌───────────┼───────────────┐
                  │           │               │
                  ▼           ▼               ▼
           ┌──────────┐ ┌──────────┐ ┌──────────────┐
           │ Grafana  │ │  WHMCS   │ │   Zapier     │
           │Dashboard │ │ Billing  │ │ Automation   │
           └──────────┘ └──────────┘ └──────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      ZAPIER AUTOMATION FLOWS                            │
└─────────────────────────────────────────────────────────────────────────┘

Flow 1: Lead Generation → Enrichment
────────────────────────────────────
  Form Submit → Zapier Webhook → MCP Tool → Rise API → Enrich Lead
                                   │
                                   └──> Send Email Notification

Flow 2: WHMCS Order → Container Provision
──────────────────────────────────────────
  New Order → Zapier Webhook → MCP Tool → Portainer API → Deploy Container
                                   │
                                   └──> Send Welcome Email

Flow 3: Enrichment Complete → CRM Update
─────────────────────────────────────────
  Lead Enriched → Rise API → Zapier Webhook → Update Salesforce
                                   │
                                   └──> Create Follow-up Task

Flow 4: Multi-AI Analysis
──────────────────────────
  Zapier Trigger → MCP Tool → Rise API ──┬──> Anthropic Claude
                                          │
                                          └──> Google Gemini
                       │
                       └──> Compare Results → Send to Zapier

┌─────────────────────────────────────────────────────────────────────────┐
│                         BILLING DATA FLOW                               │
└─────────────────────────────────────────────────────────────────────────┘

   Container Runtime
         │
         │ GPU Metrics
         ▼
   DCGM-Exporter ────┐
         │           │
         │           │ Scrape every 15s
         │           │
         ▼           ▼
   Prometheus  ←─────┘
         │
         │ Recording Rules:
         │ - GPU utilization → GPU hours
         │ - VRAM usage → GB-hours
         │ - Token count → Total tokens
         │ - Request count → API requests
         │
         ▼
   WHMCS Module
         │
         │ Daily Cron Job
         │
         ▼
   Calculate Usage:
   - GPU Hours × $2.00/hr
   - Tokens × $0.0001
   - Requests × $0.001
         │
         ▼
   Generate Invoice
         │
         ▼
   Send to Customer

┌─────────────────────────────────────────────────────────────────────────┐
│                    DEPLOYMENT OPTIONS MATRIX                            │
└─────────────────────────────────────────────────────────────────────────┘

┌─────────────┬──────────────┬─────────────┬─────────────────┐
│ Option      │ Environment  │ Complexity  │ Best For        │
├─────────────┼──────────────┼─────────────┼─────────────────┤
│ Minimal     │ cPanel/PM2   │ Low         │ Testing/Dev     │
│             │ Ollama CPU   │             │ Small scale     │
│             │ No GPU       │             │                 │
├─────────────┼──────────────┼─────────────┼─────────────────┤
│ Standard    │ Docker       │ Medium      │ Small-Med Biz   │
│             │ Compose      │             │ 10-50 tenants   │
│             │ 1-2 GPU      │             │                 │
├─────────────┼──────────────┼─────────────┼─────────────────┤
│ Professional│ Docker       │ Medium-High │ Med-Large Biz   │
│             │ Swarm/K3s    │             │ 50-200 tenants  │
│             │ 4-8 GPU      │             │                 │
├─────────────┼──────────────┼─────────────┼─────────────────┤
│ Enterprise  │ Kubernetes   │ High        │ Large Scale     │
│             │ Multi-node   │             │ 200+ tenants    │
│             │ GPU cluster  │             │ Multi-region    │
└─────────────┴──────────────┴─────────────┴─────────────────┘

┌─────────────────────────────────────────────────────────────────────────┐
│                      SECURITY ARCHITECTURE                              │
└─────────────────────────────────────────────────────────────────────────┘

Internet Traffic
      │
      │ ① SSL/TLS Termination
      ▼
  Traefik Gateway
      │
      │ ② Rate Limiting (100 req/sec)
      │
      │ ③ API Key Validation
      ▼
  Docker Network: llm-network (isolated)
      │
      ├──> Tenant A Container (port 8000)
      │    └── Volume: /data/model (isolated)
      │
      ├──> Tenant B Container (port 8000)
      │    └── Volume: /data/model (isolated)
      │
      └──> Tenant C Container (port 8000)
           └── Volume: /data/model (isolated)

Additional Security:
- ④ Resource Quotas (CPU/GPU/Memory)
- ⑤ Network Policies (K8s only)
- ⑥ Webhook Signatures (Zapier)
- ⑦ Secrets Management (Vault optional)

┌─────────────────────────────────────────────────────────────────────────┐
│                    COMPONENT VERSIONS & TECH STACK                      │
└─────────────────────────────────────────────────────────────────────────┘

Infrastructure:
├─ Docker 20.10+
├─ Docker Compose 2.0+
├─ Kubernetes 1.25+ (optional)
└─ NVIDIA Container Toolkit 1.18+

LLM Inference:
├─ vLLM v0.11.0 (OpenAI-compatible)
├─ Ollama latest (lightweight)
└─ TGI 3.3.5 (HuggingFace)

Orchestration:
├─ Portainer CE 2.33+
└─ KubeAI 0.23.1 (K8s only)

Gateway & Routing:
└─ Traefik v3.6

Monitoring:
├─ Prometheus latest
├─ DCGM-Exporter 4.4.1-4.6.0
└─ Grafana latest

WHMCS:
├─ WHMCS 8.13+
├─ PHP 8.1+
└─ MySQL 8.0+

Integration:
├─ Rise API (Node.js/Express)
├─ MCP Server (Model Context Protocol)
└─ Zapier Platform

┌─────────────────────────────────────────────────────────────────────────┐
│                         COST BREAKDOWN EXAMPLE                          │
└─────────────────────────────────────────────────────────────────────────┘

Scenario: Medium Business with 3 Customers

Customer A: Llama 3 8B (1x GPU)
├─ GPU Hours: 200 hrs/month × $2.00 = $400
├─ Tokens: 5M × $0.0001 = $500
└─ Requests: 50K × $0.001 = $50
    Total: $950/month

Customer B: Mistral 7B (CPU only)
├─ GPU Hours: 0 hrs × $2.00 = $0
├─ Tokens: 2M × $0.0001 = $200
└─ Requests: 20K × $0.001 = $20
    Total: $220/month

Customer C: Llama 3 70B (2x GPU)
├─ GPU Hours: 400 hrs/month × $2.00 = $800
├─ Tokens: 10M × $0.0001 = $1,000
└─ Requests: 100K × $0.001 = $100
    Total: $1,900/month

Monthly Revenue: $950 + $220 + $1,900 = $3,070
Server Cost: $500-800/month (Linode/AWS GPU instance)
Net Profit: $2,270-2,570/month

ROI: 300-500%

┌─────────────────────────────────────────────────────────────────────────┐
│                      QUICK REFERENCE COMMANDS                           │
└─────────────────────────────────────────────────────────────────────────┘

# Setup
./scripts/setup-whmcs-llm.sh              # Quick setup
./scripts/install-nvidia-toolkit.sh       # GPU support

# Docker Management
docker compose -f docker/compose/traefik.yml up -d
docker compose -f docker/compose/vllm-stack.yml up -d
docker logs -f tenant-id-vllm

# Monitoring
curl http://localhost:9090/api/v1/query?query=DCGM_FI_DEV_GPU_UTIL
curl http://localhost:9400/metrics

# Testing
curl https://tenant.api.domain.com/v1/models
curl https://tenant.api.domain.com/v1/chat/completions \
  -H "Authorization: Bearer KEY" \
  -d '{"model":"llama3","messages":[{"role":"user","content":"Hi"}]}'

# WHMCS
tail -f /var/www/whmcs/logs/module.log
mysql -u whmcs -p whmcs_db

# Troubleshooting
nvidia-smi                                # Check GPU
docker network inspect llm-network        # Network status
kubectl get pods -n llm-tenants           # K8s pods
