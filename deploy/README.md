# 🚀 Rise Local Lead Maker - Deployment Package

Complete deployment guide for Rise Local Lead Maker API supporting both **cPanel** and **Docker** deployments.

## 📦 Deployment Options

### Option 1: Docker Deployment (Recommended)
**Best for**: Development, testing, and production with container orchestration

- ✅ Fast setup with automated script
- ✅ Isolated environment
- ✅ Easy scaling and updates
- ✅ Works on any platform (Linux, Mac, Windows)
- ✅ Built-in health checks and auto-restart

**Quick Start:**
```bash
git clone https://github.com/JSXSTEWART/rise-local-lead-maker.git
cd rise-local-lead-maker
cp .env.example .env
nano .env  # Edit credentials
bash deploy/setup.sh docker
```

**Documentation**: [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)

---

### Option 2: cPanel Deployment
**Best for**: Shared hosting, traditional web hosting environments

- ✅ Works with cPanel hosting (acme.zonedock.com)
- ✅ Uses PM2 for process management
- ✅ Apache/Nginx reverse proxy support
- ✅ Suitable for shared hosting environments

**Quick Start:**
```bash
ssh apex2600@acme.zonedock.com
cd ~ && git clone https://github.com/JSXSTEWART/rise-local-lead-maker.git
cd rise-local-lead-maker
bash deploy/setup.sh cpanel
```

**Documentation**: [DEPLOY_CPANEL.md](./DEPLOY_CPANEL.md)

---

## 📋 What's Included

| File | Purpose |
|------|---------|
| **DOCKER_DEPLOYMENT.md** | Complete Docker deployment guide |
| **DEPLOY_CPANEL.md** | Complete cPanel deployment guide |
| **QUICK_REFERENCE.md** | Quick commands and troubleshooting |
| **setup.sh** | Automated setup script (supports both modes) |
| **verify.sh** | Deployment verification script |
| **ecosystem.config.js** | PM2 configuration (cPanel mode) |
| **.env.production** | Environment variables template |
| **init-db.sql** | Database schema |

## 🎯 Choose Your Deployment Mode

The `setup.sh` script supports both deployment modes. Run without arguments for interactive selection:

```bash
bash deploy/setup.sh
```

Or specify the mode directly:
```bash
bash deploy/setup.sh docker   # Docker deployment
bash deploy/setup.sh cpanel   # cPanel deployment
```

---

## 🐳 Docker Deployment Details

**See**: [DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md) for complete guide

### Quick Docker Setup
```bash
git clone https://github.com/JSXSTEWART/rise-local-lead-maker.git
cd rise-local-lead-maker
cp .env.example .env
nano .env  # Configure DB_PASSWORD, MYSQL_ROOT_PASSWORD
bash deploy/setup.sh docker
```

### Prerequisites
- Docker 20.10+
- Docker Compose v2.0+
- 2GB free disk space

---

## 🖥️ cPanel Deployment Details

**See**: [DEPLOY_CPANEL.md](./DEPLOY_CPANEL.md) for complete guide

### Quick cPanel Setup
```bash
ssh apex2600@acme.zonedock.com
cd ~ && git clone https://github.com/JSXSTEWART/rise-local-lead-maker.git
cd rise-local-lead-maker
bash deploy/setup.sh cpanel
cp deploy/.env.production rise-local-lead-creation/api/.env
nano rise-local-lead-creation/api/.env  # Configure credentials
pm2 restart rise-api
```

### Prerequisites
- SSH access to cPanel server
- Node.js v18+
- MySQL 8.0
- ~500MB free disk space

---

## 📖 Full Documentation

- **[INDEX.md](./INDEX.md)** - Navigation guide
- **[DOCKER_DEPLOYMENT.md](./DOCKER_DEPLOYMENT.md)** - Docker deployment (30 min read)
- **[DEPLOY_CPANEL.md](./DEPLOY_CPANEL.md)** - cPanel deployment (30-40 min read)
- **[QUICK_REFERENCE.md](./QUICK_REFERENCE.md)** - Commands cheat sheet (5 min)
- **[DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md)** - Interactive checklist

## 🆘 Support

### Common Issues
See [QUICK_REFERENCE.md](./QUICK_REFERENCE.md) for troubleshooting

### Check Prerequisites (cPanel)
```bash
node --version    # Should be v18+
npm --version     # Should be v9+
mysql --version   # Should be v8+
git --version     # Should be installed
```

---

## 🎉 Success!

After deployment, your API will be available at:
- **Docker**: http://localhost:3001
- **cPanel**: https://acme.zonedock.com (via reverse proxy)

Test the API:
```bash
curl http://localhost:3001/health
```

Access the GUI:
```bash
open gui/index.html  # Or navigate in your browser
```

---

**Version**: 1.0.0  
**Last Updated**: 2024-12-22  
**Deployment Modes**: Docker + cPanel

