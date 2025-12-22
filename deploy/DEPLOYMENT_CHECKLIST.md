# 📋 cPanel Deployment Checklist

**Project:** Rise Local Lead Maker  
**Target:** acme.zonedock.com (apex2600)  
**Date Started:** ___________  
**Date Completed:** ___________  

---

## 🔍 Pre-Deployment Verification

- [ ] Have SSH credentials ready
- [ ] Can SSH to acme.zonedock.com on port 22
- [ ] cPanel username: apex2600
- [ ] cPanel password available
- [ ] Node.js v18+ installed on server
- [ ] MySQL 8.0 available
- [ ] Database: apex2600_riselocal created
- [ ] Database user: apex2600_riselocal exists with all privileges
- [ ] ~500MB free disk space available
- [ ] Git installed on server (or ready to use File Manager)

**Status:** ✅ Complete / ❌ Blocked  
**Notes:** _____________________________

---

## 🚀 Phase 1: Repository & Dependencies

### Step 1.1: Clone Repository
```bash
cd ~ && git clone https://github.com/JSXSTEWART/rise-local-lead-maker.git
```
- [ ] Repository cloned successfully
- [ ] Directory ~/rise-local-lead-maker exists

### Step 1.2: Verify Directory Structure
```bash
ls -la ~/rise-local-lead-maker/rise-local-lead-creation/api/
```
- [ ] Dockerfile present
- [ ] package.json present
- [ ] src/ directory present
- [ ] tsconfig.json present

### Step 1.3: Install Global PM2
```bash
npm install -g pm2
```
- [ ] PM2 installed successfully
- [ ] Can run: `pm2 --version`

### Step 1.4: Install Project Dependencies
```bash
cd ~/rise-local-lead-maker/rise-local-lead-creation/api
npm install --omit=dev
```
- [ ] npm packages installed
- [ ] node_modules/ directory created
- [ ] No critical errors during install

### Step 1.5: Install Build Tools & Build
```bash
npm install -D typescript @types/node
npm run build
```
- [ ] TypeScript compiled successfully
- [ ] dist/ directory contains compiled JavaScript
- [ ] dist/index.js exists

**Phase 1 Status:** ✅ Complete / ⚠️ Issues  
**Issues:** _____________________________

---

## 🔧 Phase 2: Configuration & Environment

### Step 2.1: Create Logs Directory
```bash
mkdir -p ~/rise-local-lead-maker/logs
```
- [ ] logs/ directory created

### Step 2.2: Copy Environment Template
```bash
cp ~/rise-local-lead-maker/deploy/.env.production \
   ~/rise-local-lead-maker/rise-local-lead-creation/api/.env
```
- [ ] .env file created
- [ ] Located at: ~/rise-local-lead-maker/rise-local-lead-creation/api/.env

### Step 2.3: Configure Database Credentials
Edit .env and verify:
```bash
nano ~/rise-local-lead-maker/rise-local-lead-creation/api/.env
```
- [ ] DB_HOST=localhost
- [ ] DB_USER=apex2600_riselocal
- [ ] DB_PASSWORD=Riseleads2025!Secure
- [ ] DB_NAME=apex2600_riselocal

### Step 2.4: Configure Google Sheets (if using)
- [ ] GOOGLE_SHEETS_ID configured
- [ ] GOOGLE_SERVICE_ACCOUNT_EMAIL filled in
- [ ] GOOGLE_PRIVATE_KEY included (full multiline key)
- [ ] Sheets document is shared with service account email

### Step 2.5: Configure API Keys
- [ ] CLAY_API_KEY filled in (or leave blank if not using)
- [ ] ANTHROPIC_API_KEY filled in (or leave blank)
- [ ] GOOGLE_GEMINI_API_KEY filled in (or leave blank)
- [ ] GOOGLE_PLACES_API_KEY filled in (or leave blank)

### Step 2.6: Secure .env File
```bash
chmod 600 ~/rise-local-lead-maker/rise-local-lead-creation/api/.env
```
- [ ] File permissions set to 600 (owner read/write only)

**Phase 2 Status:** ✅ Complete / ⚠️ Issues  
**Issues:** _____________________________

---

## 🗄️ Phase 3: Database Setup

### Step 3.1: Test MySQL Connection
```bash
mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure \
  apex2600_riselocal -e "SELECT 1;"
```
- [ ] MySQL connection successful
- [ ] Returns: 1

### Step 3.2: Initialize Database Schema
```bash
mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure \
  apex2600_riselocal < ~/rise-local-lead-maker/deploy/init-db.sql
```
- [ ] Database schema imported
- [ ] No errors during import

### Step 3.3: Verify Tables Created
```bash
mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure \
  apex2600_riselocal -e "SHOW TABLES;"
```
- [ ] leads table created
- [ ] enrichment_logs table created
- [ ] exports table created
- [ ] synced_leads table created
- [ ] api_usage table created

### Step 3.4: Verify Sample Data (Optional)
```bash
mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure \
  apex2600_riselocal -e "SELECT COUNT(*) FROM leads;"
```
- [ ] At least 4 sample leads exist

**Phase 3 Status:** ✅ Complete / ⚠️ Issues  
**Issues:** _____________________________

---

## ⚙️ Phase 4: PM2 Process Manager

### Step 4.1: Copy Ecosystem Config
```bash
cp ~/rise-local-lead-maker/deploy/ecosystem.config.js \
   ~/rise-local-lead-maker/
```
- [ ] ecosystem.config.js copied
- [ ] Located at: ~/rise-local-lead-maker/ecosystem.config.js

### Step 4.2: Start Application with PM2
```bash
cd ~/rise-local-lead-maker
pm2 start ecosystem.config.js --env production
```
- [ ] PM2 process started
- [ ] Can run: `pm2 status`

### Step 4.3: Verify Process Running
```bash
pm2 status
```
- [ ] "rise-api" process shows "online"
- [ ] Status column shows "0" (no errors)
- [ ] CPU and memory show reasonable values

### Step 4.4: Check Logs for Errors
```bash
pm2 logs rise-api --lines 20
```
- [ ] No critical errors in logs
- [ ] Server listening on port 3001
- [ ] Database connected successfully

### Step 4.5: Enable PM2 Autostart
```bash
pm2 startup
pm2 save
```
- [ ] PM2 startup enabled
- [ ] Process will restart on server reboot

**Phase 4 Status:** ✅ Complete / ⚠️ Issues  
**Issues:** _____________________________

---

## 🌐 Phase 5: Web Server Configuration

### Step 5.1: Choose Web Server

#### Option A: Apache (Recommended for cPanel)

**Step 5.1.A: Create .htaccess**
```bash
cp ~/rise-local-lead-maker/deploy/htaccess-template \
   ~/public_html/.htaccess
```
- [ ] .htaccess created at ~/public_html/.htaccess
- [ ] Contains reverse proxy configuration

**Step 5.1.B: Enable Apache Modules**
Via SSH or cPanel:
```bash
sudo a2enmod rewrite
sudo a2enmod proxy
sudo a2enmod proxy_http
sudo systemctl restart apache2
```
- [ ] mod_rewrite enabled
- [ ] mod_proxy enabled
- [ ] mod_proxy_http enabled
- [ ] Apache restarted successfully

**Step 5.1.C: Verify Modules
```bash
apache2ctl -M | grep proxy
```
- [ ] proxy_module (shared) is listed
- [ ] rewrite_module (shared) is listed

#### Option B: Nginx (Alternative)

**Step 5.2.B: Create Nginx Config**
```bash
sudo nano /etc/nginx/sites-available/rise-api
```
Copy from deploy/DEPLOY_CPANEL.md section 6.2

- [ ] Config file created
- [ ] Contains reverse proxy to localhost:3001

**Step 5.2.B: Enable and Restart Nginx**
```bash
sudo ln -s /etc/nginx/sites-available/rise-api /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```
- [ ] Symbolic link created
- [ ] Nginx config test passed
- [ ] Nginx restarted successfully

**Phase 5 Status:** ✅ Complete / ⚠️ Issues  
**Issues:** _____________________________

---

## ✅ Phase 6: Testing & Verification

### Step 6.1: Test Local API
```bash
curl -sSf http://localhost:3001/
```
- [ ] Request successful
- [ ] Returns JSON response
- [ ] No connection errors

### Step 6.2: Test via Domain
```bash
curl -sSf https://acme.zonedock.com/
```
- [ ] Request successful
- [ ] Same JSON response as local test
- [ ] Reverse proxy working

### Step 6.3: Test CSV Import
```bash
curl -X POST http://localhost:3001/api/leads/import/csv \
  -H 'Content-Type: application/json' \
  -d '{"leads":[{"email":"test@example.com","first_name":"Test","last_name":"User"}]}'
```
- [ ] Request successful
- [ ] Returns success: true
- [ ] New lead created in database

### Step 6.4: Test CSV Export
```bash
curl http://localhost:3001/api/leads/export?format=csv
```
- [ ] Request successful
- [ ] Returns CSV formatted data
- [ ] Column headers present

### Step 6.5: Test Google Sheets Export
```bash
curl -X POST http://localhost:3001/api/sync/export \
  -H 'Content-Type: application/json' \
  -d '{"status":"new"}'
```
- [ ] Request successful (or auth error if not configured)
- [ ] Returns success: true (if credentials correct)
- [ ] Leads appear in Google Sheets document (if enabled)

### Step 6.6: Run Verification Script
```bash
bash ~/rise-local-lead-maker/deploy/verify.sh
```
- [ ] Script runs without errors
- [ ] All checks pass (or documented warnings only)
- [ ] No critical failures reported

**Phase 6 Status:** ✅ Complete / ⚠️ Issues  
**Issues:** _____________________________

---

## 🔐 Phase 7: Security & Hardening

### Step 7.1: File Permissions
```bash
chmod 600 ~/rise-local-lead-maker/rise-local-lead-creation/api/.env
chmod 755 ~/rise-local-lead-maker/deploy/setup.sh
chmod 755 ~/rise-local-lead-maker/deploy/verify.sh
```
- [ ] .env has 600 permissions (owner only)
- [ ] Scripts are executable
- [ ] public_html is world-readable but not writable

### Step 7.2: CORS Configuration
Edit .env:
```bash
CORS_ORIGIN=https://acme.zonedock.com
```
- [ ] CORS_ORIGIN configured
- [ ] Only your domain allowed

### Step 7.3: Rate Limiting
Verify in .env:
```bash
RATE_LIMIT_WINDOW=15
RATE_LIMIT_MAX_REQUESTS=100
```
- [ ] Rate limiting enabled
- [ ] Reasonable limits set

### Step 7.4: Database Backup Schedule
Via cPanel or cron:
```bash
# Backup every night at 2 AM
0 2 * * * mysqldump -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure apex2600_riselocal > ~/backups/backup_$(date +\%Y\%m\%d).sql
```
- [ ] Backup schedule created
- [ ] Backups directory exists (~/ or /home/apex2600/backups)

### Step 7.5: SSL Certificate
Via cPanel AutoSSL or manual:
- [ ] SSL certificate installed for acme.zonedock.com
- [ ] HTTPS working (test with curl -k)
- [ ] Mixed content warnings resolved

**Phase 7 Status:** ✅ Complete / ⚠️ Issues  
**Issues:** _____________________________

---

## 📊 Phase 8: Final Verification & Documentation

### Step 8.1: Create Deployment Log
```bash
cat > ~/DEPLOYMENT_LOG.txt << 'EOF'
Rise Local Lead Maker - Deployment Log
Deployed: $(date)
Server: acme.zonedock.com
User: apex2600
Database: apex2600_riselocal
API Port: 3001
Domain: acme.zonedock.com

Key Files:
- API: ~/rise-local-lead-maker/rise-local-lead-creation/api/
- Config: ~/rise-local-lead-maker/rise-local-lead-creation/api/.env
- PM2: ~/rise-local-lead-maker/ecosystem.config.js
- Logs: ~/rise-local-lead-maker/logs/pm2/
- Web: ~/public_html/

Initial Test Status: ✅ Passed
EOF
```
- [ ] Deployment log created
- [ ] Contains key information

### Step 8.2: Run Full Verification
```bash
bash ~/rise-local-lead-maker/deploy/verify.sh > ~/VERIFICATION_RESULTS.txt 2>&1
```
- [ ] Verification script runs
- [ ] Results saved for reference

### Step 8.3: Document Any Custom Changes
- [ ] Custom environment variables documented
- [ ] API key sources documented
- [ ] Custom configurations noted

### Step 8.4: Create Runbook
- [ ] Document regular maintenance tasks
- [ ] Create quick reference for common commands
- [ ] Save in ~/rise-local-lead-maker/RUNBOOK.md

**Phase 8 Status:** ✅ Complete / ⚠️ Issues  
**Issues:** _____________________________

---

## 🎯 Post-Deployment

### Step 9.1: Monitor for 24 Hours
- [ ] Check logs daily: `pm2 logs rise-api`
- [ ] Monitor performance: `pm2 monit`
- [ ] Verify exports: Check Google Sheets for new leads

### Step 9.2: Regular Maintenance
- [ ] Database backups running successfully
- [ ] API logs show no persistent errors
- [ ] Response times reasonable
- [ ] Google Sheets syncing if enabled

### Step 9.3: Document Support Contacts
- [ ] Support email: _____________________
- [ ] On-call phone: _____________________
- [ ] Escalation contact: _____________________

---

## 📋 Summary

**Overall Status:** ✅ Production Ready / ⚠️ With Issues / ❌ Not Ready

**Phases Complete:**
- [x] Phase 1: Repository & Dependencies
- [x] Phase 2: Configuration & Environment
- [x] Phase 3: Database Setup
- [x] Phase 4: PM2 Process Manager
- [x] Phase 5: Web Server Configuration
- [x] Phase 6: Testing & Verification
- [x] Phase 7: Security & Hardening
- [x] Phase 8: Final Verification & Documentation

**Critical Issues Resolved:** _____________________________

**Known Limitations:** _____________________________

**Next Steps:**
1. Monitor API logs for first 24 hours
2. Verify Google Sheets export if enabled
3. Schedule regular database backups
4. Document any custom integrations
5. Plan regular updates/maintenance schedule

---

**Deployment Completed By:** _____________________________  
**Date:** _____________________________  
**Signature:** _____________________________  

---

**For Support:** See deploy/README.md and deploy/QUICK_REFERENCE.md
