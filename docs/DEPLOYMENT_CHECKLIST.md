# WHMCS LLM Container Provisioning - Deployment Checklist

## Pre-Deployment Requirements

### Infrastructure
- [ ] Docker installed (20.10+)
- [ ] Docker Compose installed
- [ ] Server with adequate resources:
  - [ ] 8+ GB RAM
  - [ ] 100+ GB storage
  - [ ] (Optional) NVIDIA GPU with 8+ GB VRAM
- [ ] Domain name configured
- [ ] DNS A records pointed to server

### Software Prerequisites
- [ ] WHMCS 8.13+ installed
- [ ] PHP 8.1+ with required extensions
- [ ] MySQL/MariaDB database access
- [ ] (Optional) NVIDIA drivers installed (if using GPU)

### Access & Credentials
- [ ] Root/sudo access to server
- [ ] WHMCS admin credentials
- [ ] HuggingFace account and token (for model downloads)
- [ ] Email for SSL certificates (Let's Encrypt)

---

## Phase 1: Base Infrastructure Setup

### 1. Clone Repository
```bash
cd /opt
git clone https://github.com/JSXSTEWART/rise-local-lead-maker.git
cd rise-local-lead-maker
```
- [ ] Repository cloned
- [ ] Checked out to correct branch

### 2. Configure Environment
```bash
cp .env.whmcs.example .env.whmcs
nano .env.whmcs
```
- [ ] HF_TOKEN set
- [ ] ACME_EMAIL configured
- [ ] PORTAINER credentials set
- [ ] ZAPIER_WEBHOOK_SECRET generated

### 3. Install NVIDIA Toolkit (GPU only)
```bash
sudo ./scripts/install-nvidia-toolkit.sh
```
- [ ] NVIDIA drivers installed
- [ ] Container toolkit installed
- [ ] GPU access verified with test container
- [ ] Skip if CPU-only deployment

### 4. Create Docker Networks
```bash
docker network create llm-network
```
- [ ] Network created

---

## Phase 2: Core Services Deployment

### 5. Deploy Portainer
```bash
docker volume create portainer_data
docker run -d -p 9443:9443 --name portainer --restart=always \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest
```
- [ ] Portainer container running
- [ ] Accessed web UI at https://server-ip:9443
- [ ] Admin account created
- [ ] Docker environment connected

### 6. Deploy Traefik API Gateway
```bash
cd docker/compose
# Edit traefik.yml with your domain
docker compose -f traefik.yml up -d
```
- [ ] Traefik container running
- [ ] Dashboard accessible
- [ ] Let's Encrypt working
- [ ] Test subdomain routing

### 7. Deploy Monitoring Stack (GPU only)
```bash
docker compose -f monitoring-stack.yml up -d
```
- [ ] Prometheus running (http://server-ip:9090)
- [ ] DCGM-Exporter running (GPU metrics visible)
- [ ] Grafana accessible (http://server-ip:3000)
- [ ] Default dashboards imported
- [ ] Skip if CPU-only

---

## Phase 3: WHMCS Module Installation

### 8. Copy WHMCS Module
```bash
cp -r whmcs-module/modules/servers/llmcontainer /var/www/whmcs/modules/servers/
chown -R www-data:www-data /var/www/whmcs/modules/servers/llmcontainer
chmod -R 755 /var/www/whmcs/modules/servers/llmcontainer
```
- [ ] Files copied to WHMCS directory
- [ ] Permissions set correctly
- [ ] Web server user has read access

### 9. Configure WHMCS Server
Access: Setup → Products/Services → Servers → Add New Server

- [ ] Server name: "LLM Container Server"
- [ ] Server type: "LLM Container Provisioning"
- [ ] Hostname: Your Portainer hostname
- [ ] Port: 9443
- [ ] Username: Portainer admin username
- [ ] Password: Portainer admin password
- [ ] Test connection successful

### 10. Create WHMCS Products
Setup → Products/Services → Create New Product

**Product 1: Basic LLM (CPU)**
- [ ] Product name: "LLM Inference - Basic"
- [ ] Module: LLM Container Provisioning
- [ ] Model: llama3-8b
- [ ] GPU Count: 0
- [ ] Pricing configured

**Product 2: GPU LLM**
- [ ] Product name: "LLM Inference - GPU"
- [ ] Module: LLM Container Provisioning
- [ ] Model: llama3-8b
- [ ] GPU Count: 1
- [ ] Pricing configured

### 11. Configure Usage Billing (Optional)
- [ ] Enable usage billing in product
- [ ] Configure metrics:
  - [ ] GPU Hours (rate per hour)
  - [ ] Tokens Processed (rate per 1K tokens)
  - [ ] API Requests (rate per 1K requests)
- [ ] Set billing cycle
- [ ] Test metric collection

---

## Phase 4: Zapier Integration Setup

### 12. Deploy Rise API (if not already running)
```bash
cd rise-local-lead-creation/api
npm install
npm run build
npm start
# Or use systemd/PM2 for production
```
- [ ] API running on port 3001
- [ ] Health check accessible: http://localhost:3001/health

### 13. Configure MCP Server with Zapier Tools
```bash
cd mcp-server
nano index.js
# Follow integration steps in docs/ZAPIER_MCP_INTEGRATION.md
```
- [ ] Zapier integration imported
- [ ] Tools registered
- [ ] Handler added
- [ ] ZAPIER_WEBHOOK_SECRET set in .env
- [ ] MCP server restarted

### 14. Create Zapier Zaps
- [ ] Zap 1: Form → Lead Creation
  - [ ] Webhook trigger configured
  - [ ] rise_zapier_webhook_lead action
  - [ ] Test successful
- [ ] Zap 2: WHMCS Order → Container Provision
  - [ ] WHMCS webhook configured
  - [ ] rise_zapier_webhook_container action
  - [ ] Test successful

---

## Phase 5: Testing & Validation

### 15. Test Lead Creation Flow
```bash
curl -X POST http://localhost:3001/api/leads \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","firstName":"Test","lastName":"User"}'
```
- [ ] Lead created successfully
- [ ] Appears in database
- [ ] Accessible via MCP tool

### 16. Test Container Provisioning
Via WHMCS:
- [ ] Create test order for LLM product
- [ ] Payment processed (or marked paid)
- [ ] Container automatically provisioned
- [ ] Portainer shows new stack
- [ ] Container running and healthy

### 17. Test LLM API Endpoint
```bash
curl https://tenant-test.api.yourdomain.com/v1/models \
  -H "Authorization: Bearer API-KEY"
```
- [ ] API responds
- [ ] Model listed
- [ ] Can send chat completion request
- [ ] Response received

### 18. Verify Monitoring
- [ ] Prometheus shows GPU metrics (if GPU)
- [ ] Grafana dashboards show data
- [ ] Billing metrics recording
- [ ] Alerts configured (optional)

---

## Phase 6: Production Hardening

### 19. Security Configuration
- [ ] SSL certificates working
- [ ] API keys rotated from defaults
- [ ] Rate limiting tested
- [ ] Webhook signatures verified
- [ ] Firewall rules configured:
  - [ ] 80/443 open (web traffic)
  - [ ] 9443 restricted (Portainer admin)
  - [ ] 3306 internal only (MySQL)
  - [ ] 9090/3000 restricted (monitoring)

### 20. Backup Configuration
```bash
# Schedule database backups
crontab -e
# Add: 0 2 * * * /opt/rise-local-lead-maker/scripts/backup.sh
```
- [ ] Database backup scheduled
- [ ] Volume backups configured
- [ ] Backup tested and verified
- [ ] Retention policy set (30 days)

### 21. Monitoring & Alerts
- [ ] Email notifications configured
- [ ] Prometheus alerting rules set
- [ ] Grafana alerts configured
- [ ] Test alert delivery

### 22. Documentation
- [ ] Update internal wiki/docs
- [ ] Document API endpoints for customers
- [ ] Create customer onboarding guide
- [ ] Train support staff

---

## Phase 7: Go-Live

### 23. Soft Launch
- [ ] Enable products for existing customers only
- [ ] Monitor first few orders closely
- [ ] Collect customer feedback
- [ ] Iterate on UX issues

### 24. Public Launch
- [ ] Enable public ordering
- [ ] Marketing materials ready
- [ ] Support team trained
- [ ] Pricing finalized

### 25. Post-Launch Monitoring
Week 1 checks:
- [ ] Daily: Container health status
- [ ] Daily: Billing metrics accuracy
- [ ] Daily: Customer support tickets
- [ ] Weekly: Resource utilization review
- [ ] Weekly: Cost analysis

---

## Troubleshooting Quick Reference

### Container Won't Start
```bash
docker logs <container-name>
nvidia-smi  # Check GPU
docker exec <container> ls /root/.cache/huggingface  # Check models
```

### Portainer API Connection Failed
```bash
curl -k https://localhost:9443/api/status
# Check credentials in WHMCS server config
```

### Metrics Not Showing
```bash
curl http://localhost:9090/api/v1/targets  # Check Prometheus targets
curl http://localhost:9400/metrics  # Check DCGM metrics
```

### Billing Not Recording
```bash
# Check WHMCS cron jobs running
tail -f /var/www/whmcs/logs/module.log
```

---

## Rollback Plan

If issues arise:

1. **Stop new orders:** Disable products in WHMCS
2. **Preserve data:** Backup databases and volumes
3. **Stop containers:** `docker compose down` (keeps data)
4. **Revert changes:** Restore previous WHMCS module
5. **Notify customers:** Send status updates

---

## Success Criteria

Deployment is successful when:
- [ ] Test order completes end-to-end
- [ ] Customer can access API endpoint
- [ ] API responds to requests correctly
- [ ] Billing metrics recording
- [ ] Monitoring shows healthy status
- [ ] No critical errors in logs
- [ ] Support team confident in system

---

## Support Contacts

- **GitHub Issues:** https://github.com/JSXSTEWART/rise-local-lead-maker/issues
- **Documentation:** docs/WHMCS_LLM_PROVISIONING.md
- **Zapier Integration:** docs/ZAPIER_MCP_INTEGRATION.md
