# Docker Deployment Guide - Rise Local Lead Maker

This guide covers deploying Rise Local Lead Maker using Docker containers.

## Quick Start

### Prerequisites

- Docker 20.10+ installed and running
- Docker Compose v2.0+ (or docker-compose v1.27+)
- 2GB free disk space
- Ports 3001 (API) and 3306 (MySQL) available

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/JSXSTEWART/rise-local-lead-maker.git
   cd rise-local-lead-maker
   ```

2. **Create environment file**
   ```bash
   cp .env.example .env
   nano .env  # Edit with your credentials
   ```

   **Required variables:**
   - `DB_PASSWORD` - MySQL user password
   - `MYSQL_ROOT_PASSWORD` - MySQL root password

   **Optional variables:** (API keys for enrichment features)
   - `ANTHROPIC_API_KEY`
   - `GEMINI_API_KEY`
   - `GOOGLE_PLACES_API_KEY`
   - `CLAY_API_KEY`

3. **Run automated setup**
   ```bash
   bash deploy/setup.sh docker
   ```

   Or **run manually:**
   ```bash
   docker compose build
   docker compose up -d
   ```

4. **Verify deployment**
   ```bash
   curl http://localhost:3001/health
   ```

## Architecture

The Docker deployment consists of two services:

### API Service
- **Container**: `rise-api`
- **Image**: Built from `rise-local-lead-creation/api/Dockerfile`
- **Port**: 3001 (mapped to host)
- **Health Check**: HTTP GET /health every 30s
- **Features**:
  - Multi-stage build (builder + production)
  - Node.js 20 Alpine base
  - Non-root user for security
  - Auto-restart on failure

### MySQL Service
- **Container**: `rise-mysql`
- **Image**: mysql:8.0
- **Port**: 3306 (mapped to host)
- **Storage**: Named volume `mysql-data`
- **Initialization**: Runs `scripts/init-db.sql` on first start
- **Health Check**: mysqladmin ping every 10s

## Docker Compose Files

### compose.yaml (Production)
- Production-optimized build
- Healthchecks enabled
- Auto-restart on failure
- Persistent MySQL data volume

### compose.debug.yaml (Development)
- Hot reload with tsx watch
- Source code mounted as volume
- Debug port 9229 exposed
- Faster iteration cycle

## Common Commands

### Starting Services
```bash
# Start all services
docker compose up -d

# Start with logs visible
docker compose up

# Start specific service
docker compose up -d api
```

### Viewing Logs
```bash
# Follow all logs
docker compose logs -f

# Follow API logs only
docker compose logs -f api

# View last 100 lines
docker compose logs --tail=100 api
```

### Managing Services
```bash
# Stop services (keeps containers)
docker compose stop

# Start stopped services
docker compose start

# Restart services
docker compose restart

# Stop and remove containers
docker compose down

# Stop and remove containers + volumes
docker compose down -v
```

### Building Images
```bash
# Rebuild all images
docker compose build

# Rebuild without cache
docker compose build --no-cache

# Rebuild specific service
docker compose build api
```

### Development Mode
```bash
# Use debug compose file
docker compose -f compose.debug.yaml up -d

# View logs with source changes
docker compose -f compose.debug.yaml logs -f api
```

### Database Access
```bash
# Access MySQL shell
docker compose exec mysql mysql -u rise -p

# Run SQL file
docker compose exec -T mysql mysql -u rise -p rise_leads < backup.sql

# Backup database
docker compose exec mysql mysqldump -u rise -p rise_leads > backup.sql
```

### Inspect Containers
```bash
# List running containers
docker compose ps

# View container resource usage
docker compose stats

# Execute command in API container
docker compose exec api sh

# View API container details
docker inspect rise-api
```

## Environment Variables

### Server Configuration
- `NODE_ENV` - Environment (production/development)
- `PORT` - API port (default: 3001)

### Database
- `DB_HOST` - MySQL host (use "mysql" for Docker)
- `DB_USER` - Database user (default: rise)
- `DB_PASSWORD` - Database password (required)
- `DB_NAME` - Database name (default: rise_leads)
- `MYSQL_ROOT_PASSWORD` - MySQL root password (required)

### API Keys (Optional)
- `ANTHROPIC_API_KEY` - Claude AI for enrichment
- `GEMINI_API_KEY` - Google Gemini for enrichment
- `GOOGLE_PLACES_API_KEY` - Local business scraping
- `CLAY_API_KEY` - Data enrichment service
- `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Sheets integration
- `GOOGLE_PRIVATE_KEY` - Sheets integration
- `GOOGLE_SHEETS_ID` - Target spreadsheet

## Networking

### Internal Network
Services communicate via the `rise-network` bridge network:
- API → MySQL: `mysql:3306`
- Health checks use internal networking

### External Access
- API: `http://localhost:3001`
- MySQL: `localhost:3306` (for external tools)

## Data Persistence

### MySQL Volume
- **Name**: `mysql-data` (production) or `mysql-data-dev` (debug)
- **Location**: Docker managed volume
- **Backup**: Use `docker compose exec` + `mysqldump`

### Viewing Volume Location
```bash
docker volume inspect rise-local-lead-maker_mysql-data
```

## Troubleshooting

### API Won't Start
```bash
# Check logs
docker compose logs api

# Common issues:
# 1. Port 3001 already in use
lsof -i :3001

# 2. Database not ready
docker compose logs mysql

# 3. Missing environment variables
docker compose config
```

### Database Connection Error
```bash
# Verify MySQL is running
docker compose ps mysql

# Check health status
docker inspect rise-mysql | grep -A5 Health

# Test connection manually
docker compose exec mysql mysql -u rise -p

# Verify .env credentials match
cat .env | grep DB_
```

### Build Failures
```bash
# Clear Docker cache
docker compose build --no-cache

# Check Dockerfile syntax
docker build --check rise-local-lead-creation/api/

# View build output
docker compose build --progress=plain
```

### Container Keeps Restarting
```bash
# View exit reason
docker compose ps -a

# Check last logs before crash
docker compose logs --tail=50 api

# Disable restart to debug
docker compose up --no-start
docker compose start api
docker compose logs -f api
```

### Port Already in Use
```bash
# Find process using port 3001
lsof -i :3001

# Kill process
kill -9 <PID>

# Or change port in .env
echo "PORT=3002" >> .env
docker compose restart api
```

## Performance Tuning

### API Service
- **Instances**: Single container by default
- **Memory**: No limit (add to compose.yaml if needed)
- **CPU**: No limit (add to compose.yaml if needed)

### MySQL Service
- **Memory**: Increase for large datasets
  ```yaml
  mysql:
    deploy:
      resources:
        limits:
          memory: 2G
  ```

### Build Performance
- Use `.dockerignore` (already included)
- Layer caching for npm dependencies
- Multi-stage build reduces final image size

## Security Considerations

### Production Checklist
- [ ] Change default passwords in .env
- [ ] Restrict MySQL port to localhost only
- [ ] Use secrets management for API keys
- [ ] Enable firewall rules
- [ ] Set up SSL/TLS reverse proxy (Nginx/Traefik)
- [ ] Regular security updates
- [ ] Backup strategy implemented

### Container Security
- API runs as non-root user (uid 1001)
- Minimal Alpine base image
- No unnecessary packages installed
- Health checks detect compromised containers

## Upgrading

### Update to Latest Code
```bash
git pull origin main
docker compose build
docker compose up -d
```

### Database Migrations
```bash
# Run migration SQL
docker compose exec -T mysql mysql -u rise -p rise_leads < migration.sql
```

### Rollback
```bash
# Stop and remove current containers
docker compose down

# Checkout previous version
git checkout <previous-commit>

# Rebuild and start
docker compose build
docker compose up -d
```

## Development Workflow

### Hot Reload Mode
```bash
# Start in development mode
docker compose -f compose.debug.yaml up

# Edit source files in rise-local-lead-creation/api/src/
# Changes auto-reload via tsx watch

# Debug with Chrome DevTools
# Open: chrome://inspect
# Connect to: localhost:9229
```

### Running Tests
```bash
# Execute in running container
docker compose exec api npm test

# Or start fresh container
docker compose run --rm api npm test
```

## Integration with CI/CD

### GitHub Actions Example
```yaml
name: Deploy
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build and Deploy
        run: |
          docker compose build
          docker compose up -d
      - name: Health Check
        run: |
          sleep 30
          curl -f http://localhost:3001/health
```

## Support

### Documentation
- [Main README](../README.md)
- [cPanel Deployment](./DEPLOY_CPANEL.md)
- [Quick Reference](./QUICK_REFERENCE.md)

### Logs Location
- **Container logs**: `docker compose logs`
- **MySQL logs**: Inside container at `/var/log/mysql/`
- **API logs**: stdout/stderr captured by Docker

### Common Issues
1. **npm install fails**: Network issue or registry down
2. **TypeScript compilation fails**: Check package.json and tsconfig.json
3. **Database schema missing**: init-db.sql not executed
4. **API returns 502**: Check if API container is running

---

**Version**: 1.0.0  
**Last Updated**: 2024-12-22  
**Minimum Docker Version**: 20.10  
**Minimum Compose Version**: 2.0
