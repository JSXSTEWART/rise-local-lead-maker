# 📦 Rise Local Lead Maker - cPanel Deployment Package

**Complete production deployment package for acme.zonedock.com**

## 🎯 Quick Start

**For experienced developers (automated setup):**
```bash
bash deploy/setup.sh && cp deploy/.env.production rise-local-lead-creation/api/.env && nano rise-local-lead-creation/api/.env && pm2 restart rise-api && bash deploy/verify.sh
```

**For step-by-step guidance:**
See [📖 README.md](./README.md) or [🚀 DEPLOY_CPANEL.md](./DEPLOY_CPANEL.md)

---

## 📂 Files in This Deployment Package

| File | Size | Purpose | For Whom |
|------|------|---------|----------|
| **[README.md](./README.md)** | 12KB | Start here - overview and quick start | Everyone |
| **[DEPLOY_CPANEL.md](./DEPLOY_CPANEL.md)** | 18KB | Complete step-by-step guide (9 sections) | First-time deployers |
| **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** | 8KB | Quick commands and troubleshooting | Experienced users |
| **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** | 16KB | Interactive checklist for deployment | Project managers |
| **[ecosystem.config.js](./ecosystem.config.js)** | 1.5KB | PM2 process manager config | Automation |
| **[setup.sh](./setup.sh)** | 6.5KB | Automated setup script (executable) | Automation |
| **[verify.sh](./verify.sh)** | 10KB | Deployment verification script (executable) | Testing |
| **[.env.production](./env.production)** | 4KB | Environment variables template | Configuration |
| **[init-db.sql](./init-db.sql)** | 8.5KB | MySQL database schema | Database setup |
| **[htaccess-template](./htaccess-template)** | 3KB | Apache reverse proxy config | Web server setup |
| **[INDEX.md](./INDEX.md)** | This file | Navigation guide | Everyone |

**Total Package Size:** ~90KB (all text files, version control friendly)

---

## 📚 Reading Guide

### 🟢 I want to deploy immediately
1. Read: [README.md](./README.md) (5 min)
2. Run: `bash deploy/setup.sh` (10 min)
3. Configure: Edit `.env` file (5 min)
4. Verify: `bash deploy/verify.sh` (2 min)

**Total time:** ~20-30 minutes

### 🟠 I want to understand the process
1. Read: [README.md](./README.md)
2. Read: [DEPLOY_CPANEL.md](./DEPLOY_CPANEL.md) (30-40 min)
3. Follow section-by-section
4. Use [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md) to track progress

**Total time:** 1.5-2 hours

### 🟡 I need specific help
1. Check: [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for your issue
2. Search: Find the relevant command section
3. Or read: Specific section in [DEPLOY_CPANEL.md](./DEPLOY_CPANEL.md#troubleshooting)

---

## 🔄 Deployment Overview

```
┌─────────────────────────────────────────────┐
│ 1. SSH to cPanel Server (acme.zonedock.com) │
└────────────────┬────────────────────────────┘
                 │
         ┌───────▼────────┐
         │ Clone Repository │
         └───────┬────────┘
                 │
    ┌────────────┴──────────────┐
    │                           │
    ▼                           ▼
┌──────────┐         ┌──────────────────┐
│ Run      │         │ Manual Steps for │
│ setup.sh │         │ Database & Env   │
│          │         │                  │
│ ✅ Auto │         │ ⚙️ Configuration │
└────┬─────┘         └────┬─────────────┘
     │                    │
     └────────┬───────────┘
              │
         ┌────▼─────┐
         │ Verify   │
         │ Deployment
         │ (verify.sh)
         └────┬─────┘
              │
         ✅ LIVE! 🚀
```

---

## 🛠️ File Usage Reference

### Automation Scripts (Run These)
- **`setup.sh`** - Run ONCE after cloning repo
  ```bash
  bash deploy/setup.sh
  ```
  Handles: npm install, TypeScript build, PM2 setup, logs

- **`verify.sh`** - Run after setup to verify everything works
  ```bash
  bash deploy/verify.sh
  ```
  Tests: Database, API endpoints, Google Sheets, web server

### Configuration Files (Edit These)
- **`.env.production`** - Template for production environment
  ```bash
  cp deploy/.env.production rise-local-lead-creation/api/.env
  nano rise-local-lead-creation/api/.env  # Edit with your credentials
  ```

- **`ecosystem.config.js`** - PM2 process configuration
  - Pre-configured for 2 cluster instances
  - Adjust if needed (CPU cores, memory limits, etc.)

- **`htaccess-template`** - Apache reverse proxy
  ```bash
  cp deploy/htaccess-template ~/public_html/.htaccess
  ```

### Database Files (Initialize Once)
- **`init-db.sql`** - MySQL schema and tables
  ```bash
  mysql -h localhost -u apex2600_riselocal -p apex2600_riselocal < deploy/init-db.sql
  ```

---

## 📋 Key Information

### Server Details
- **Host:** acme.zonedock.com
- **SSH Port:** 22
- **cPanel Admin Port:** 7080
- **cPanel User Port:** 2087
- **Username:** apex2600
- **Database:** apex2600_riselocal
- **API Port:** 3001

### Database Credentials
- **Host:** localhost
- **User:** apex2600_riselocal
- **Password:** Riseleads2025!Secure
- **Database:** apex2600_riselocal

### API Access
- **Local:** http://localhost:3001/
- **Domain:** https://acme.zonedock.com/
- **Reverse Proxy:** Apache (recommended) or Nginx

---

## ✅ Deployment Phases

| # | Phase | Duration | Status |
|---|-------|----------|--------|
| 1 | Repository & Dependencies | 5-10 min | Automated (setup.sh) |
| 2 | Configuration & Environment | 5-10 min | Manual (.env editing) |
| 3 | Database Setup | 2-5 min | Automated (init-db.sql) |
| 4 | PM2 Process Manager | 2-3 min | Automated (setup.sh) |
| 5 | Web Server Configuration | 5-10 min | Manual (.htaccess or nginx) |
| 6 | Testing & Verification | 2-5 min | Automated (verify.sh) |
| 7 | Security & Hardening | 5-10 min | Manual (permissions, SSL) |
| 8 | Final Verification | 5 min | Automated (verify.sh) |

**Total Estimated Time:** 30-60 minutes

---

## 🚨 Critical Checklist

Before you start, ensure you have:

- [ ] SSH access to acme.zonedock.com
- [ ] cPanel username: apex2600
- [ ] cPanel password for database access
- [ ] Node.js v18+ (or can install via cPanel)
- [ ] ~500MB free disk space
- [ ] Git installed (or can use File Manager)

Before you go live, ensure:

- [ ] All tests pass: `bash deploy/verify.sh`
- [ ] SSL certificate installed
- [ ] `.env` file has 600 permissions
- [ ] PM2 process running: `pm2 status`
- [ ] Can access: https://acme.zonedock.com/
- [ ] Database is backed up

---

## 🔧 Common Commands

```bash
# View deployment files
ls -lh deploy/

# Run automated setup
bash deploy/setup.sh

# Configure environment
nano rise-local-lead-creation/api/.env

# Start application
pm2 restart rise-api

# Verify deployment
bash deploy/verify.sh

# Check API
curl https://acme.zonedock.com/

# View logs
pm2 logs rise-api

# Import test leads
curl -X POST https://acme.zonedock.com/api/leads/import/csv \
  -H 'Content-Type: application/json' \
  -d '{"leads":[{"email":"test@example.com","first_name":"Test","last_name":"User"}]}'

# Export to Google Sheets
curl -X POST https://acme.zonedock.com/api/sync/export \
  -H 'Content-Type: application/json' \
  -d '{"status":"new"}'
```

---

## 🆘 Need Help?

1. **First Time?** → Read [README.md](./README.md)
2. **Step-by-Step?** → Follow [DEPLOY_CPANEL.md](./DEPLOY_CPANEL.md)
3. **Quick Answer?** → Check [QUICK_REFERENCE.md](./QUICK_REFERENCE.md)
4. **Tracking Progress?** → Use [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)
5. **Verifying?** → Run `bash deploy/verify.sh`

---

## 📚 API Endpoints

After deployment, access these endpoints:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | API health check |
| `/api/leads` | GET | List all leads |
| `/api/leads/:id` | GET | Get lead by ID |
| `/api/leads` | POST | Create new lead |
| `/api/leads/import/csv` | POST | Import leads from CSV |
| `/api/leads/import/file` | POST | Import from CSV file upload |
| `/api/leads/export` | GET | Export leads as CSV/JSON |
| `/api/enrich/:id` | POST | Enrich lead with Clay/AI |
| `/api/sync/export` | POST | Export to Google Sheets |
| `/api/leads/qualify` | POST | AI-powered lead qualification |

**Documentation:** See API source code at `rise-local-lead-creation/api/src/routes/`

---

## 🔐 Security Notes

- **Database Password:** Riseleads2025!Secure (change after deployment if needed)
- **API Keys:** Store in `.env` file with 600 permissions
- **CORS:** Configure `CORS_ORIGIN` in `.env` to your domain
- **Rate Limiting:** Enabled by default, adjust if needed
- **SSL:** Install via cPanel AutoSSL before going live
- **Backups:** Set up automated backups (see README.md Phase 8)

---

## 📈 What's Included

✅ **Production-Ready:**
- Express.js API server (Node.js)
- MySQL database schema with indexes
- PM2 process management
- Google Sheets auto-export scheduler
- CSV import/export functionality
- Multi-AI enrichment (Clay, Anthropic, Gemini)
- Rate limiting & CORS protection

✅ **Easy Deployment:**
- Automated setup script
- Environment configuration template
- Database initialization SQL
- Verification testing script
- Comprehensive documentation

✅ **Monitoring:**
- PM2 process monitoring
- Application logging
- API usage tracking
- Enrichment success metrics

---

## 🎯 Next Steps (After Deployment)

1. **Verify:** Run `bash deploy/verify.sh` to confirm everything works
2. **Test:** Import sample leads and run enrichment
3. **Monitor:** Check `pm2 logs rise-api` daily for first week
4. **Backup:** Set up automated database backups
5. **Integrate:** Connect to CRM or email tools if needed

---

## 📞 Support Resources

- **PM2 Docs:** https://pm2.keymetrics.io/docs/
- **Node.js cPanel:** https://docs.cpanel.net/nodejs/
- **MySQL Docs:** https://dev.mysql.com/doc/refman/8.0/en/
- **Google Sheets API:** https://developers.google.com/sheets/api

---

## 📝 File Manifest

```
deploy/
├── INDEX.md                    ← You are here
├── README.md                   ← Start here (overview)
├── DEPLOY_CPANEL.md            ← Full guide (step-by-step)
├── QUICK_REFERENCE.md          ← Commands & troubleshooting
├── DEPLOYMENT_CHECKLIST.md     ← Interactive checklist
├── ecosystem.config.js         ← PM2 config
├── setup.sh                    ← Automated setup
├── verify.sh                   ← Verification testing
├── .env.production             ← Config template
├── init-db.sql                 ← Database schema
└── htaccess-template           ← Apache config
```

---

**Version:** 1.0.0  
**Updated:** 2024-12-22  
**Status:** ✅ Production Ready

---

## 🚀 Ready to Deploy?

1. **SSH to server:** `ssh apex2600@acme.zonedock.com`
2. **Clone repo:** `git clone https://github.com/JSXSTEWART/rise-local-lead-maker.git`
3. **Run setup:** `bash rise-local-lead-maker/deploy/setup.sh`
4. **Configure:** Edit `.env` file with your credentials
5. **Verify:** `bash rise-local-lead-maker/deploy/verify.sh`

**Estimated time: 30-60 minutes**

Happy deploying! 🎉
