# Rise Local Lead Maker

Lead generation and enrichment system with **WHMCS LLM Container Provisioning**

## Components

1. **Lead Management System** - Core lead generation, enrichment, and qualification
2. **WHMCS LLM Provisioning** - Automated LLM container deployment for customers (NEW)

---

## WHMCS LLM Container Provisioning

Automated deployment of customer-provisioned LLM inference containers through WHMCS billing.

**Quick Start:**
```bash
./scripts/setup-whmcs-llm.sh
```

**Features:**
- ✅ Multi-LLM support (Llama 3, Mistral, CodeLlama, Gemma)
- ✅ GPU management with NVIDIA Container Toolkit
- ✅ Usage-based billing (GPU hours, tokens, requests)
- ✅ Zapier integration via MCP webhook tools
- ✅ Multi-tenant isolation with SSL
- ✅ OpenAI-compatible API endpoints

**Documentation:** [README_WHMCS.md](./README_WHMCS.md)

---

## Lead Management System (Original)
