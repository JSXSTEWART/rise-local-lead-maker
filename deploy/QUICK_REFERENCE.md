# cPanel Deployment Quick Reference

**Environment:** acme.zonedock.com | User: apex2600 | SSH Port: 22

## 🚀 One-Liner Deployment (Run on cPanel Server)

```bash
cd ~ && git clone https://github.com/JSXSTEWART/rise-local-lead-maker.git && cd rise-local-lead-maker && bash deploy/setup.sh
```

## 📋 Manual Deployment Steps

```bash
# 1. Connect via SSH
ssh apex2600@acme.zonedock.com

# 2. Clone repository
cd ~ && git clone https://github.com/JSXSTEWART/rise-local-lead-maker.git
cd rise-local-lead-maker

# 3. Run setup script
bash deploy/setup.sh

# 4. Configure environment (IMPORTANT!)
cp deploy/.env.production rise-local-lead-creation/api/.env
nano rise-local-lead-creation/api/.env
# ^ Fill in: GOOGLE_PRIVATE_KEY and any missing API keys

# 5. Restart application
pm2 restart rise-api

# 6. Verify deployment
bash deploy/verify.sh
```

## 🔍 Essential Commands

| Command | Purpose |
|---------|---------|
| `pm2 status` | Check if rise-api is running |
| `pm2 logs rise-api` | View real-time application logs |
| `pm2 restart rise-api` | Restart the application |
| `pm2 stop rise-api` | Stop the application |
| `curl http://localhost:3001/` | Test API locally |
| `curl https://acme.zonedock.com/` | Test API via domain |

## 🔐 Database Access

```bash
# Connect to database
mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure apex2600_riselocal

# List tables
SHOW TABLES;

# Count leads
SELECT COUNT(*) FROM leads;

# View recent leads
SELECT id, email, first_name, status FROM leads ORDER BY created_at DESC LIMIT 10;
```

## 📤 Testing Endpoints

### Import Leads
```bash
curl -X POST http://localhost:3001/api/leads/import/csv \
  -H 'Content-Type: application/json' \
  -d '{
    "leads": [
      {"email": "john@example.com", "first_name": "John", "last_name": "Doe", "company": "Acme Corp"}
    ]
  }'
```

### Export to Google Sheets
```bash
curl -X POST http://localhost:3001/api/sync/export \
  -H 'Content-Type: application/json' \
  -d '{"status":"enriched"}'
```

### Get Leads
```bash
curl http://localhost:3001/api/leads | jq .
```

## 🐛 Troubleshooting

### PM2 Won't Start
```bash
pm2 delete rise-api
cd ~/rise-local-lead-maker/rise-local-lead-creation/api
npm run build
cd ~/rise-local-lead-maker
pm2 start ecosystem.config.js --env production
pm2 logs rise-api
```

### Database Connection Error
```bash
# Test MySQL connection
mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure apex2600_riselocal -e "SELECT 1;"

# Verify .env credentials
cat rise-local-lead-creation/api/.env | grep DB_
```

### 502 Bad Gateway
```bash
# Ensure PM2 is running
pm2 status

# Ensure API listening on 3001
curl -sSf http://localhost:3001/

# Check Apache reverse proxy
cat /home/apex2600/public_html/.htaccess | grep -i proxy
```

### Google Sheets Export Fails
```bash
# Verify credentials in .env
grep "GOOGLE" rise-local-lead-creation/api/.env

# Check PM2 logs for auth errors
pm2 logs rise-api --err
```

## 📁 File Structure

```
~/rise-local-lead-maker/
├── deploy/
│   ├── ecosystem.config.js      ← PM2 config
│   ├── DEPLOY_CPANEL.md         ← Full guide
│   ├── setup.sh                 ← Auto setup script
│   ├── verify.sh                ← Verification script
│   └── .env.production          ← Template
├── rise-local-lead-creation/api/
│   ├── .env                     ← Production secrets (create from template)
│   ├── dist/                    ← Compiled JavaScript
│   ├── src/                     ← TypeScript source
│   └── package.json
└── logs/
    └── pm2/                     ← PM2 logs
```

## 🔑 Required Environment Variables

Copy and configure these in `rise-local-lead-creation/api/.env`:

```bash
# Database
DB_HOST=localhost
DB_USER=apex2600_riselocal
DB_PASSWORD=Riseleads2025!Secure
DB_NAME=apex2600_riselocal

# Google Sheets (IMPORTANT: Requires full setup)
GOOGLE_SHEETS_ID=1CUl-ZdHFK6llBRkTp4JMX_639ro0shciPpmlXWrVx7s
GOOGLE_SERVICE_ACCOUNT_EMAIL=210870422605-compute@developer.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# APIs (Fill in from your service accounts)
CLAY_API_KEY=YOUR_KEY
ANTHROPIC_API_KEY=YOUR_KEY
GOOGLE_GEMINI_API_KEY=YOUR_KEY
GOOGLE_PLACES_API_KEY=YOUR_KEY

# Scheduler
ENABLE_SHEETS_EXPORT_SCHEDULER=true
SHEETS_EXPORT_INTERVAL_MINUTES=5
SHEETS_EXPORT_STATUS=enriched
```

## ⚙️ Web Server Setup (Choose One)

### Apache (Recommended for cPanel)
1. Login to cPanel
2. Go to: **File Manager** → `/public_html`
3. Create `.htaccess` with reverse proxy rules (see DEPLOY_CPANEL.md)
4. Enable modules: `a2enmod proxy`, `a2enmod proxy_http`, `a2enmod rewrite`

### Nginx (Alternative)
```bash
# Create server config
sudo nano /etc/nginx/sites-available/rise-api

# Add reverse proxy to localhost:3001
# Enable: sudo ln -s /etc/nginx/sites-available/rise-api /etc/nginx/sites-enabled/
# Restart: sudo systemctl restart nginx
```

## 📊 Monitoring

### View Logs
```bash
pm2 logs rise-api              # Real-time logs
pm2 logs rise-api --err        # Errors only
pm2 logs rise-api --lines 100  # Last 100 lines
```

### Monitor Resources
```bash
pm2 monit                      # CPU/Memory dashboard
pm2 list                       # Process status
pm2 info rise-api              # Detailed info
```

### Restart & Manage
```bash
pm2 restart rise-api           # Restart process
pm2 reload rise-api            # Graceful restart
pm2 stop rise-api              # Stop process
pm2 start rise-api             # Start process
pm2 delete rise-api            # Remove from PM2
```

## 🔄 Maintenance

### Update Code
```bash
cd ~/rise-local-lead-maker
git pull origin main
cd rise-local-lead-creation/api
npm install --omit=dev
npm run build
pm2 restart rise-api
```

### Backup Database
```bash
mysqldump -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure apex2600_riselocal > backup_$(date +%Y%m%d).sql
```

### View Database Backups
```bash
ls -lh ~/*.sql   # Show all backups
```

## 📞 Support

1. **Check logs first:** `pm2 logs rise-api`
2. **Run verification:** `bash deploy/verify.sh`
3. **Read full guide:** `cat deploy/DEPLOY_CPANEL.md`
4. **Test locally:** `curl -sSf http://localhost:3001/`

## 📚 Documentation Files

- `deploy/DEPLOY_CPANEL.md` - Complete step-by-step guide
- `deploy/ecosystem.config.js` - PM2 configuration
- `deploy/setup.sh` - Automated setup script
- `deploy/verify.sh` - Deployment verification
- `deploy/.env.production` - Environment template
