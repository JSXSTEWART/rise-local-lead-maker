# cPanel Deployment Guide - Rise Local Lead Maker

**Target Environment:**
- Host: acme.zonedock.com
- SSH Port: 22
- cPanel Port: 7080 (admin) / 2087 (user)
- Username: apex2600
- Database: apex2600_riselocal

---

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [SSH Access & Repository Clone](#ssh-access--repository-clone)
3. [Node.js & Dependencies](#nodejs--dependencies)
4. [Database Setup](#database-setup)
5. [Environment Configuration](#environment-configuration)
6. [PM2 Process Manager](#pm2-process-manager)
7. [Web Server Configuration](#web-server-configuration)
8. [Testing & Verification](#testing--verification)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### 1. SSH Access
- Have your SSH key pair ready (or use cPanel File Manager as fallback)
- Ensure firewall allows port 22 for SSH
- User: `apex2600` on `acme.zonedock.com`

### 2. cPanel Requirements
- Node.js support (check Manage Node.js in cPanel)
- npm package manager installed
- MySQL/MariaDB service running
- At least 2GB free disk space

### 3. Verify Node.js Installation
```bash
ssh apex2600@acme.zonedock.com
node --version  # Should be v18+ (v20 ideal)
npm --version   # Should be v9+
```

If Node.js is not installed:
1. Login to cPanel at `acme.zonedock.com:2087`
2. Navigate to: **Software > Manage Node.js**
3. Click **Create Application** or **Install Node.js**
4. Select version 20.x (LTS)

---

## SSH Access & Repository Clone

### 1. Connect via SSH
```bash
ssh apex2600@acme.zonedock.com
cd ~
```

### 2. Clone the Repository
```bash
git clone https://github.com/JSXSTEWART/rise-local-lead-maker.git
cd rise-local-lead-maker
```

**Alternative (if git not available):**
- Use cPanel File Manager
- Upload zip file and extract
- Or use SCP to transfer files

### 3. Verify Directory Structure
```bash
ls -la rise-local-lead-creation/api/
# Should show: Dockerfile, package.json, src/, tsconfig.json, etc.
```

---

## Node.js & Dependencies

### 1. Install Global PM2 (Process Manager)
```bash
npm install -g pm2
pm2 completion install  # Enable shell completions (optional)
```

### 2. Install Project Dependencies
```bash
cd rise-local-lead-maker/rise-local-lead-creation/api
npm install --omit=dev
```

### 3. Build TypeScript
```bash
npm install -D typescript @types/node
npm run build
```

### 4. Verify Build
```bash
ls -la dist/
# Should contain: index.js and other compiled files
```

---

## Database Setup

### 1. Create MySQL User (if not exists)
```bash
# Via SSH with mysql client:
mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure apex2600_riselocal

# Or via cPanel:
# 1. Login to cPanel
# 2. Go to: Databases > MySQL Databases
# 3. Create user: apex2600_riselocal with password Riseleads2025!Secure
# 4. Add user to database: apex2600_riselocal with ALL privileges
```

### 2. Initialize Database Schema
```bash
# Copy the init SQL from local repo
cd ~/rise-local-lead-maker
mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure apex2600_riselocal < scripts/init-db.sql
```

### 3. Verify Tables Created
```bash
mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure apex2600_riselocal -e "SHOW TABLES;"
# Should list: leads, enrichment_logs, etc.
```

---

## Environment Configuration

### 1. Create Production .env File
```bash
cd ~/rise-local-lead-maker/rise-local-lead-creation/api
cat > .env << 'EOF'
# Database
DB_HOST=localhost
DB_USER=apex2600_riselocal
DB_PASSWORD=Riseleads2025!Secure
DB_NAME=apex2600_riselocal
DB_PORT=3306

# Server
PORT=3001
NODE_ENV=production

# Google Sheets Integration
GOOGLE_SHEETS_ID=1CUl-ZdHFK6llBRkTp4JMX_639ro0shciPpmlXWrVx7s
GOOGLE_SERVICE_ACCOUNT_EMAIL=210870422605-compute@developer.gserviceaccount.com
GOOGLE_PRIVATE_KEY_ID=22bcce741fd6942cb5b577d9edeb5718a86615bd
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n[FULL_PRIVATE_KEY_FROM_JSON]\n-----END PRIVATE KEY-----\n"

# Clay API
CLAY_API_KEY=05301108e328ab6bf915

# Anthropic AI
ANTHROPIC_API_KEY=sk-ant-api03-[YOUR_KEY]

# Google Gemini
GOOGLE_GEMINI_API_KEY=AIzaSyB3PY1[YOUR_KEY]

# Google Places
GOOGLE_PLACES_API_KEY=AIzaSyB3PY1[YOUR_KEY]

# Sheets Export Scheduler
ENABLE_SHEETS_EXPORT_SCHEDULER=true
SHEETS_EXPORT_INTERVAL_MINUTES=5
SHEETS_EXPORT_STATUS=enriched
EOF
```

**⚠️ IMPORTANT:** 
- Replace `[FULL_PRIVATE_KEY_FROM_JSON]` with actual key from service account JSON
- The key spans multiple lines - include `\n` between lines
- Use a text editor to carefully paste the full key

### 2. Secure .env File
```bash
chmod 600 .env
# Restrict to owner only (user apex2600)
```

### 3. Verify Environment Variables
```bash
cd ~/rise-local-lead-maker/rise-local-lead-creation/api
node -e "require('dotenv').config(); console.log('DB:', process.env.DB_NAME, '| Sheets:', process.env.GOOGLE_SHEETS_ID)"
```

---

## PM2 Process Manager

### 1. Copy Ecosystem Config
```bash
cd ~/rise-local-lead-maker
cp deploy/ecosystem.config.js ./
```

### 2. Start Application with PM2
```bash
cd ~/rise-local-lead-maker
pm2 start ecosystem.config.js --env production --name rise-api
```

### 3. Monitor PM2
```bash
pm2 status           # View process status
pm2 logs             # View realtime logs
pm2 logs rise-api    # View specific app logs
pm2 monit            # Monitor CPU/memory
```

### 4. Enable PM2 Autostart on Reboot
```bash
pm2 startup
# Follow the command output to enable startup
# Usually: sudo env PATH=$PATH:/path/to/node pm2 startup...
```

### 5. Save PM2 Process List
```bash
pm2 save
pm2 startup         # Make it persist on reboot
```

---

## Web Server Configuration

### Option A: Apache with Reverse Proxy (Most Common in cPanel)

#### 1. Create .htaccess File
```bash
cd /home/apex2600/public_html
cat > .htaccess << 'EOF'
<IfModule mod_rewrite.c>
  RewriteEngine On
  
  # Don't rewrite files/directories
  RewriteCond %{REQUEST_FILENAME} -f [OR]
  RewriteCond %{REQUEST_FILENAME} -d
  RewriteRule ^ - [L]
  
  # Reverse proxy to Node.js on localhost:3001
  RewriteRule ^(.*)$ http://localhost:3001/$1 [P,L]
</IfModule>

# Proxy settings
ProxyPreserveHost On
ProxyPass / http://localhost:3001/
ProxyPassReverse / http://localhost:3001/
EOF
```

#### 2. Enable Apache Modules
```bash
# SSH into server and enable modules:
a2enmod rewrite
a2enmod proxy
a2enmod proxy_http
systemctl restart apache2
```

**Or via cPanel:**
1. Go to: Apache Modules
2. Search for: rewrite, proxy, proxy_http
3. Enable each one

---

### Option B: Nginx Reverse Proxy (Alternative)

Create `/etc/nginx/sites-available/rise-api`:
```nginx
server {
    listen 80;
    server_name acme.zonedock.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable:
```bash
ln -s /etc/nginx/sites-available/rise-api /etc/nginx/sites-enabled/
nginx -t
systemctl restart nginx
```

---

## Testing & Verification

### 1. Test API Health
```bash
curl -sSf http://localhost:3001/
# Should return: {"status":"ok","message":"Rise Local Lead Maker API",...}
```

### 2. Test via Domain
```bash
curl -sSf https://acme.zonedock.com/api/leads
# Should return leads list or error (OK if error - means API is running)
```

### 3. Test CSV Import
```bash
curl -X POST http://acme.zonedock.com/api/leads/import/csv \
  -H 'Content-Type: application/json' \
  -d '{
    "leads": [
      {"email": "test@example.com", "first_name": "Test", "last_name": "User"}
    ]
  }'
```

### 4. Test Google Sheets Export
```bash
curl -X POST http://acme.zonedock.com/api/sync/export \
  -H 'Content-Type: application/json' \
  -d '{"status":"enriched"}'
# Should return: {"success":true,"data":{"destination":"google_sheets","exported":N}}
```

### 5. Check PM2 Logs
```bash
pm2 logs rise-api
# Should show startup messages and no errors
```

### 6. Verify Database Connection
```bash
curl -sSf http://acme.zonedock.com/api/leads | jq .
# Should return JSON array (may be empty, that's OK)
```

---

## Troubleshooting

### Issue: PM2 Process Won't Start

**Symptom:** `pm2 status` shows `stopped` or `errored`

**Solution:**
```bash
pm2 logs rise-api --err  # View error logs
pm2 delete rise-api
cd ~/rise-local-lead-maker/rise-local-lead-creation/api
npm run build            # Rebuild
cd ~/rise-local-lead-maker
pm2 start ecosystem.config.js --env production
```

### Issue: Database Connection Error

**Symptom:** `Error: Connection refused 127.0.0.1:3306`

**Solution:**
```bash
# Check MySQL is running
systemctl status mysql

# Test connection directly
mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure apex2600_riselocal -e "SELECT 1"

# Verify credentials in .env
cat rise-local-lead-creation/api/.env | grep DB_
```

### Issue: 502 Bad Gateway (Apache)

**Symptom:** Browser returns 502 when accessing acme.zonedock.com

**Solution:**
```bash
# Check if Node.js is running
pm2 status

# Check Apache error log
tail -f /var/log/apache2/error.log

# Ensure reverse proxy modules enabled
apache2ctl -M | grep proxy

# Manually test local connection
curl -sSf http://localhost:3001/
```

### Issue: Google Sheets Export Fails

**Symptom:** Export endpoint returns 403 or 401

**Solution:**
```bash
# Verify .env has correct credentials
cat rise-local-lead-creation/api/.env | grep GOOGLE_

# Check private key is properly escaped (multiline)
# Use readlink to view raw key
hexdump -C rise-local-lead-creation/api/.env | grep "PRIVATE_KEY"

# Test credentials manually
node -e "
require('dotenv').config({ path: 'rise-local-lead-creation/api/.env' });
console.log('Service Account:', process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL);
console.log('Sheets ID:', process.env.GOOGLE_SHEETS_ID);
"
```

### Issue: npm install Fails

**Symptom:** `npm ERR! code ERESOLVE`

**Solution:**
```bash
# Clear npm cache
npm cache clean --force

# Use legacy peer deps flag
npm install --legacy-peer-deps --omit=dev

# Or upgrade npm
npm install -g npm@latest
npm install --omit=dev
```

### Issue: Port 3001 Already in Use

**Symptom:** PM2 won't start, "EADDRINUSE :::3001"

**Solution:**
```bash
# Kill process on port 3001
lsof -i :3001
kill -9 <PID>

# Or change port in .env
echo "PORT=3002" >> rise-local-lead-creation/api/.env
pm2 restart rise-api
```

---

## Post-Deployment Checklist

- [ ] Repository cloned to `/home/apex2600/rise-local-lead-maker`
- [ ] npm dependencies installed
- [ ] TypeScript built to `/dist` folder
- [ ] Database initialized with tables
- [ ] .env file created with all credentials
- [ ] PM2 running `rise-api` process
- [ ] Apache/Nginx reverse proxy configured
- [ ] Health endpoint responds: GET `/`
- [ ] CSV import works: POST `/api/leads/import/csv`
- [ ] Export to Sheets works: POST `/api/sync/export`
- [ ] Logs show no errors: `pm2 logs rise-api`
- [ ] PM2 set to autostart on reboot: `pm2 startup`

---

## Support & Logs

### View Real-time Logs
```bash
pm2 logs rise-api --lines 100
```

### View Past Logs
```bash
pm2 logs rise-api --lines 1000 --err
```

### View PM2 Monit
```bash
pm2 monit
```

### Restart App
```bash
pm2 restart rise-api
```

### Stop/Start App
```bash
pm2 stop rise-api
pm2 start rise-api
```

### Remove App from PM2
```bash
pm2 delete rise-api
pm2 save
```

---

## Next Steps

1. **Backup Database:** Set up automated MySQL backups via cPanel
2. **SSL Certificate:** Enable HTTPS via cPanel AutoSSL
3. **Monitor:** Set up PM2 Plus or similar for uptime monitoring
4. **Logging:** Configure log rotation in PM2
5. **Scaling:** Adjust cluster instances in ecosystem.config.js based on CPU cores

---

**Questions?** Check logs with `pm2 logs rise-api` or verify .env with `env | grep -i db`
