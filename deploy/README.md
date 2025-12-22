# 🚀 Rise Local Lead Maker - cPanel Deployment Package

Complete production deployment guide for deploying the Rise Local Lead Maker API to cPanel hosting at **acme.zonedock.com**.

## 📦 What's Included

This deployment package contains everything needed to run the API on your cPanel server:

| File | Purpose |
|------|---------|
| **DEPLOY_CPANEL.md** | Complete step-by-step deployment guide (13 sections) |
| **QUICK_REFERENCE.md** | Quick commands and troubleshooting |
| **ecosystem.config.js** | PM2 process manager configuration |
| **setup.sh** | Automated setup script (handles most of the work) |
| **verify.sh** | Deployment verification and testing script |
| **.env.production** | Environment variables template |
| **init-db.sql** | Database schema and tables |

## ⚡ Quick Start (Recommended)

Run this **one command** on your cPanel server to deploy everything:

```bash
cd ~ && git clone https://github.com/JSXSTEWART/rise-local-lead-maker.git && \
cd rise-local-lead-maker && \
bash deploy/setup.sh && \
cp deploy/.env.production rise-local-lead-creation/api/.env && \
nano rise-local-lead-creation/api/.env && \
pm2 restart rise-api
```

**Then verify:**
```bash
bash deploy/verify.sh
```

## 📋 Prerequisites

Before deploying, ensure you have:

- ✅ SSH access to acme.zonedock.com (port 22)
- ✅ cPanel access with username: **apex2600**
- ✅ Node.js v18+ installed (install via cPanel > Manage Node.js)
- ✅ MySQL 8.0 with database: **apex2600_riselocal**
- ✅ Git installed (or cPanel File Manager)
- ✅ ~500MB free disk space

### Check Prerequisites

```bash
# SSH to your server
ssh apex2600@acme.zonedock.com

# Verify Node.js
node --version    # Should be v18+
npm --version     # Should be v9+

# Verify MySQL
mysql --version   # Should be v8+

# Verify git
git --version     # Should be installed
```

## 🔧 Deployment Steps

### Step 1: Clone Repository
```bash
cd ~
git clone https://github.com/JSXSTEWART/rise-local-lead-maker.git
cd rise-local-lead-maker
```

### Step 2: Run Setup Script
```bash
bash deploy/setup.sh
```

This will:
- ✅ Install Node.js dependencies
- ✅ Build TypeScript to JavaScript
- ✅ Install and configure PM2
- ✅ Test database connection
- ✅ Set up logs directory

### Step 3: Configure Environment Variables
```bash
# Copy the template
cp deploy/.env.production rise-local-lead-creation/api/.env

# Edit with your credentials (nano or your preferred editor)
nano rise-local-lead-creation/api/.env
```

**Critical variables to configure:**
```bash
# Database (usually already correct)
DB_HOST=localhost
DB_USER=apex2600_riselocal
DB_PASSWORD=Riseleads2025!Secure
DB_NAME=apex2600_riselocal

# Google Sheets (IMPORTANT - see DEPLOY_CPANEL.md for details)
GOOGLE_SHEETS_ID=1CUl-ZdHFK6llBRkTp4JMX_639ro0shciPpmlXWrVx7s
GOOGLE_SERVICE_ACCOUNT_EMAIL=210870422605-compute@developer.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# API Keys (fill in from your service accounts)
CLAY_API_KEY=YOUR_KEY_HERE
ANTHROPIC_API_KEY=YOUR_KEY_HERE
```

### Step 4: Start the Application
```bash
pm2 restart rise-api
```

### Step 5: Configure Web Server

**For Apache (recommended for cPanel):**
```bash
# Create .htaccess in public_html
cat > ~/public_html/.htaccess << 'EOF'
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]
  RewriteRule ^(.*)$ http://localhost:3001/$1 [P,L]
</IfModule>
EOF

# Enable Apache modules (via cPanel or SSH)
a2enmod rewrite
a2enmod proxy
a2enmod proxy_http
systemctl restart apache2
```

**For Nginx (alternative):**
See DEPLOY_CPANEL.md section "Web Server Configuration" for details.

### Step 6: Verify Deployment
```bash
bash deploy/verify.sh
```

This will test:
- ✅ PM2 process status
- ✅ Database connectivity
- ✅ API endpoints
- ✅ Google Sheets integration
- ✅ Web server configuration

## 🌐 Access Your API

After deployment, your API is accessible at:

| Endpoint | URL |
|----------|-----|
| **Root** | https://acme.zonedock.com/ |
| **Leads** | https://acme.zonedock.com/api/leads |
| **Import** | https://acme.zonedock.com/api/leads/import/csv |
| **Export** | https://acme.zonedock.com/api/sync/export |

### Test Endpoints

```bash
# Test root endpoint
curl https://acme.zonedock.com/

# List leads
curl https://acme.zonedock.com/api/leads | jq .

# Import a lead (CSV format)
curl -X POST https://acme.zonedock.com/api/leads/import/csv \
  -H 'Content-Type: application/json' \
  -d '{
    "leads": [{
      "email": "test@example.com",
      "first_name": "Test",
      "last_name": "User",
      "company": "Test Corp"
    }]
  }'

# Export to Google Sheets
curl -X POST https://acme.zonedock.com/api/sync/export \
  -H 'Content-Type: application/json' \
  -d '{"status":"enriched"}'
```

## 🛠️ Essential Commands

### Monitor Application
```bash
pm2 status              # Check process status
pm2 logs rise-api       # View real-time logs
pm2 logs rise-api --err # View errors only
pm2 monit               # CPU/Memory dashboard
```

### Manage Application
```bash
pm2 restart rise-api    # Restart (after config changes)
pm2 reload rise-api     # Graceful restart (no downtime)
pm2 stop rise-api       # Stop the application
pm2 start rise-api      # Start the application
```

### Database Management
```bash
# Connect to database
mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure apex2600_riselocal

# View leads
SELECT email, first_name, company, status FROM leads;

# Check enrichment logs
SELECT * FROM enrichment_logs ORDER BY created_at DESC LIMIT 10;
```

### Logs
```bash
# PM2 application logs
cat /home/apex2600/logs/pm2/rise-api-out.log
cat /home/apex2600/logs/pm2/rise-api-error.log

# Follow logs in real-time
tail -f /home/apex2600/logs/pm2/rise-api-out.log
```

## 🐛 Troubleshooting

### PM2 Process Won't Start
```bash
# Check error
pm2 logs rise-api --err

# Rebuild application
cd ~/rise-local-lead-maker/rise-local-lead-creation/api
npm run build

# Restart
pm2 restart rise-api
```

### Database Connection Error
```bash
# Test MySQL connection
mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure apex2600_riselocal -e "SELECT 1;"

# Verify .env
cat ~/rise-local-lead-maker/rise-local-lead-creation/api/.env | grep DB_
```

### 502 Bad Gateway
```bash
# Ensure PM2 is running
pm2 status

# Test API locally
curl http://localhost:3001/

# Check Apache modules
apache2ctl -M | grep proxy

# Check error log
tail -f /var/log/apache2/error.log
```

### Permissions Denied Error
```bash
# Fix file permissions
chmod +x ~/rise-local-lead-maker/deploy/setup.sh
chmod +x ~/rise-local-lead-maker/deploy/verify.sh

# Fix .env permissions
chmod 600 ~/rise-local-lead-maker/rise-local-lead-creation/api/.env
```

## 📊 File Structure

```
~/rise-local-lead-maker/
├── deploy/                       ← Deployment files
│   ├── DEPLOY_CPANEL.md         ← Full guide (13 sections)
│   ├── QUICK_REFERENCE.md       ← Quick reference
│   ├── README.md                ← This file
│   ├── ecosystem.config.js      ← PM2 config
│   ├── setup.sh                 ← Auto setup script
│   ├── verify.sh                ← Verification script
│   ├── .env.production          ← Template
│   └── init-db.sql              ← Database schema
├── rise-local-lead-creation/
│   └── api/
│       ├── .env                 ← Production config (create from template)
│       ├── package.json         ← Node dependencies
│       ├── tsconfig.json        ← TypeScript config
│       ├── dist/                ← Compiled code (auto-generated)
│       └── src/                 ← Source code
├── scripts/
│   ├── init-db.sql              ← Database init (older version)
│   └── healthcheck.sh           ← Health check script
└── logs/
    └── pm2/                     ← PM2 logs
```

## 🔐 Security Checklist

- [ ] .env file has 600 permissions: `chmod 600 .env`
- [ ] Database password is strong (already set to Riseleads2025!Secure)
- [ ] SSL certificate installed (via cPanel AutoSSL)
- [ ] CORS origin restricted to your domain: `CORS_ORIGIN=https://acme.zonedock.com`
- [ ] Rate limiting enabled in .env
- [ ] PM2 logs don't expose sensitive data
- [ ] Database backups scheduled
- [ ] Git credentials not in .env (use SSH key)

## 📈 Maintenance & Updates

### Regular Backups
```bash
# Backup database
mysqldump -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure \
  apex2600_riselocal > ~/backups/backup_$(date +%Y%m%d_%H%M%S).sql

# Or set up cPanel automated backups
# Go to: cPanel > Backup > Configure Backup
```

### Update Application
```bash
cd ~/rise-local-lead-maker
git pull origin main
cd rise-local-lead-creation/api
npm install --omit=dev
npm run build
pm2 restart rise-api
```

### Monitor Performance
```bash
# Check PM2 memory usage
pm2 monit

# Review logs for errors
pm2 logs rise-api --err

# Check database size
mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure apex2600_riselocal \
  -e "SELECT 
    table_name,
    ROUND(((data_length + index_length) / 1024 / 1024), 2) as 'Size (MB)'
  FROM information_schema.tables
  WHERE table_schema = 'apex2600_riselocal';"
```

## 📞 Support

### Check Documentation
1. **Full Guide:** `cat deploy/DEPLOY_CPANEL.md`
2. **Quick Reference:** `cat deploy/QUICK_REFERENCE.md`
3. **Logs:** `pm2 logs rise-api`
4. **Verification:** `bash deploy/verify.sh`

### Common Issues

| Issue | Solution |
|-------|----------|
| PM2 won't start | Check logs: `pm2 logs rise-api --err` |
| Database error | Verify .env: `grep DB_ rise-local-lead-creation/api/.env` |
| 502 Bad Gateway | Check reverse proxy: `curl http://localhost:3001/` |
| Google Sheets fails | Verify credentials: `grep GOOGLE_ rise-local-lead-creation/api/.env` |
| Port 3001 in use | Find process: `lsof -i :3001` and `kill -9 <PID>` |

## 🎯 What's Next?

After successful deployment:

1. **Test Endpoints:** Run curl commands above to verify API
2. **Import Data:** Upload CSV or use import endpoint
3. **Enable Scheduler:** Google Sheets auto-export every 5 minutes
4. **Monitor:** Check `pm2 logs rise-api` for real-time activity
5. **Backup:** Set up automated database backups
6. **Scale:** Increase PM2 instances if high traffic: edit ecosystem.config.js

## 📚 Additional Resources

- **PM2 Documentation:** https://pm2.keymetrics.io/docs/usage/
- **Node.js cPanel:** https://docs.cpanel.net/nodejs/
- **MySQL Best Practices:** https://dev.mysql.com/doc/refman/8.0/en/
- **Google Sheets API:** https://developers.google.com/sheets/api

## 📝 Deployment Checklist

- [ ] SSH access verified
- [ ] Node.js v18+ installed
- [ ] MySQL database created
- [ ] Repository cloned
- [ ] setup.sh executed successfully
- [ ] .env.production copied and configured
- [ ] Database schema initialized
- [ ] PM2 process running
- [ ] Web server reverse proxy configured
- [ ] SSL certificate installed
- [ ] verify.sh passes all tests
- [ ] API accessible via https://acme.zonedock.com/
- [ ] Test leads imported successfully
- [ ] Google Sheets export working
- [ ] Logs show no errors

---

**Version:** 1.0.0  
**Last Updated:** 2024-12-22  
**Status:** ✅ Production Ready

For questions or issues, check the troubleshooting section or review the full guide in `deploy/DEPLOY_CPANEL.md`.
