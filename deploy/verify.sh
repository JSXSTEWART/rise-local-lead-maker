#!/bin/bash
# Deployment Verification Script
# Tests all endpoints and verifies production deployment
# Usage: bash deploy/verify.sh

set -e

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Configuration
API_URL="${API_URL:-http://localhost:3001}"
DOMAIN="${DOMAIN:-acme.zonedock.com}"
TEST_EMAIL="test-$(date +%s)@example.com"

# Counters
PASSED=0
FAILED=0
WARNINGS=0

# Helper functions
pass() {
    echo -e "${GREEN}✓${NC} $1"
    ((PASSED++))
}

fail() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED++))
}

warn() {
    echo -e "${YELLOW}!${NC} $1"
    ((WARNINGS++))
}

section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# ============================================================================
# 1. ENVIRONMENT & PROCESSES
# ============================================================================
section "1. CHECKING ENVIRONMENT & PROCESSES"

# Check PM2
if command -v pm2 &> /dev/null; then
    pass "PM2 is installed"
    
    if pm2 list | grep -q "rise-api"; then
        STATUS=$(pm2 list | grep "rise-api" | awk '{print $9}' | head -1)
        if [ "$STATUS" = "online" ]; then
            pass "PM2 process 'rise-api' is running"
        else
            fail "PM2 process 'rise-api' is not running (status: $STATUS)"
        fi
    else
        fail "PM2 process 'rise-api' not found"
    fi
else
    fail "PM2 is not installed"
fi

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    pass "Node.js installed: $NODE_VERSION"
else
    fail "Node.js not found"
fi

# Check npm
if command -v npm &> /dev/null; then
    pass "npm installed: $(npm --version)"
else
    fail "npm not found"
fi

# Check .env file
API_DIR="${HOME}/rise-local-lead-maker/rise-local-lead-creation/api"
if [ -f "$API_DIR/.env" ]; then
    pass ".env file exists at $API_DIR/.env"
    
    # Check required variables
    if grep -q "DB_HOST" "$API_DIR/.env"; then
        pass "DB_HOST configured"
    else
        fail "DB_HOST not configured in .env"
    fi
    
    if grep -q "GOOGLE_SHEETS_ID" "$API_DIR/.env"; then
        pass "GOOGLE_SHEETS_ID configured"
    else
        warn "GOOGLE_SHEETS_ID not configured (Sheets export will fail)"
    fi
else
    fail ".env file not found at $API_DIR/.env"
fi

# ============================================================================
# 2. DATABASE CONNECTIVITY
# ============================================================================
section "2. TESTING DATABASE CONNECTIVITY"

if command -v mysql &> /dev/null; then
    if mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure apex2600_riselocal -e "SELECT 1" &>/dev/null; then
        pass "MySQL connection successful"
        
        # Check tables
        TABLES=$(mysql -h localhost -u apex2600_riselocal -pRiseleads2025\!Secure apex2600_riselocal -e "SHOW TABLES;" 2>/dev/null | wc -l)
        if [ "$TABLES" -gt 1 ]; then
            pass "Database tables exist ($((TABLES-1)) tables)"
        else
            fail "No tables found in database"
        fi
    else
        fail "Cannot connect to MySQL database"
    fi
else
    warn "mysql client not installed - skipping database test"
fi

# ============================================================================
# 3. API ENDPOINT TESTS
# ============================================================================
section "3. TESTING API ENDPOINTS"

# Test root endpoint
echo "Testing: GET $API_URL/"
RESPONSE=$(curl -sSf "$API_URL/" 2>/dev/null || echo "")
if echo "$RESPONSE" | jq . &>/dev/null 2>&1; then
    pass "GET / returns valid JSON"
else
    fail "GET / request failed or returned invalid JSON"
fi

# Test leads endpoint
echo "Testing: GET $API_URL/api/leads"
RESPONSE=$(curl -sSf "$API_URL/api/leads" 2>/dev/null || echo "")
if echo "$RESPONSE" | jq . &>/dev/null 2>&1; then
    pass "GET /api/leads returns valid JSON"
else
    fail "GET /api/leads request failed"
fi

# Test CSV import endpoint
echo "Testing: POST $API_URL/api/leads/import/csv"
RESPONSE=$(curl -sSf -X POST "$API_URL/api/leads/import/csv" \
    -H 'Content-Type: application/json' \
    -d '{
        "leads": [
            {"email": "'$TEST_EMAIL'", "first_name": "Test", "last_name": "User", "company": "Test Corp"}
        ]
    }' 2>/dev/null || echo "")

if echo "$RESPONSE" | jq . &>/dev/null 2>&1; then
    SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)
    if [ "$SUCCESS" = "true" ]; then
        pass "POST /api/leads/import/csv working"
    else
        fail "CSV import returned: $(echo "$RESPONSE" | jq -r '.error' 2>/dev/null)"
    fi
else
    fail "POST /api/leads/import/csv failed"
fi

# ============================================================================
# 4. GOOGLE SHEETS INTEGRATION
# ============================================================================
section "4. TESTING GOOGLE SHEETS INTEGRATION"

if grep -q "ENABLE_SHEETS_EXPORT_SCHEDULER=true" "$API_DIR/.env" 2>/dev/null; then
    pass "Sheets export scheduler is enabled"
    
    # Test export endpoint
    echo "Testing: POST $API_URL/api/sync/export"
    RESPONSE=$(curl -sSf -X POST "$API_URL/api/sync/export" \
        -H 'Content-Type: application/json' \
        -d '{"status":"enriched"}' 2>/dev/null || echo "")
    
    if echo "$RESPONSE" | jq . &>/dev/null 2>&1; then
        SUCCESS=$(echo "$RESPONSE" | jq -r '.success' 2>/dev/null)
        if [ "$SUCCESS" = "true" ]; then
            EXPORTED=$(echo "$RESPONSE" | jq -r '.data.exported' 2>/dev/null)
            pass "Google Sheets export working ($EXPORTED leads exported)"
        else
            ERROR=$(echo "$RESPONSE" | jq -r '.error' 2>/dev/null)
            fail "Sheets export failed: $ERROR"
        fi
    else
        fail "POST /api/sync/export failed"
    fi
else
    warn "Sheets export scheduler not enabled - test skipped"
fi

# ============================================================================
# 5. PERFORMANCE & LOGS
# ============================================================================
section "5. CHECKING PERFORMANCE & LOGS"

# Check PM2 logs for errors
if command -v pm2 &> /dev/null && pm2 list | grep -q "rise-api"; then
    ERROR_COUNT=$(pm2 logs rise-api --err --lines 50 2>/dev/null | grep -i "error" | wc -l)
    if [ "$ERROR_COUNT" -eq 0 ]; then
        pass "No errors in recent PM2 logs"
    else
        warn "Found $ERROR_COUNT error(s) in recent logs (check with: pm2 logs rise-api)"
    fi
    
    # Get memory usage
    MEMORY=$(pm2 monit 2>/dev/null | grep "rise-api" | awk '{print $NF}' | head -1)
    if [ ! -z "$MEMORY" ]; then
        pass "Process memory usage: $MEMORY"
    fi
fi

# ============================================================================
# 6. WEB SERVER CONFIGURATION
# ============================================================================
section "6. CHECKING WEB SERVER CONFIGURATION"

# Check Apache
if [ -d "/etc/apache2" ]; then
    if apache2ctl -M 2>/dev/null | grep -q "proxy"; then
        pass "Apache mod_proxy is enabled"
    else
        warn "Apache mod_proxy not enabled - reverse proxy may not work"
    fi
    
    if [ -f "/home/apex2600/public_html/.htaccess" ]; then
        if grep -q "ProxyPass\|RewriteRule.*proxy" "/home/apex2600/public_html/.htaccess" 2>/dev/null; then
            pass ".htaccess reverse proxy is configured"
        else
            warn ".htaccess exists but reverse proxy rules not found"
        fi
    else
        warn ".htaccess not found - see deploy/DEPLOY_CPANEL.md for setup"
    fi
else
    # Check Nginx
    if [ -d "/etc/nginx" ]; then
        pass "Nginx detected"
    else
        warn "No Apache or Nginx detected - configure web server manually"
    fi
fi

# Test domain access
echo "Testing: GET https://$DOMAIN/"
RESPONSE=$(curl -sSf -k "https://$DOMAIN/" 2>/dev/null || echo "")
if [ ! -z "$RESPONSE" ]; then
    pass "Domain $DOMAIN is accessible"
else
    warn "Could not access https://$DOMAIN/ (may not be configured yet)"
fi

# ============================================================================
# 7. VERIFICATION SUMMARY
# ============================================================================
section "VERIFICATION SUMMARY"

TOTAL=$((PASSED + FAILED + WARNINGS))
echo ""
echo -e "Tests Run: ${BLUE}$TOTAL${NC}"
echo -e "Passed:    ${GREEN}$PASSED${NC}"
echo -e "Failed:    ${RED}$FAILED${NC}"
echo -e "Warnings:  ${YELLOW}$WARNINGS${NC}"
echo ""

if [ $FAILED -eq 0 ]; then
    if [ $WARNINGS -eq 0 ]; then
        echo -e "${GREEN}✓ ALL CHECKS PASSED - Deployment is ready!${NC}"
    else
        echo -e "${YELLOW}⚠ Deployment is working with $WARNINGS warning(s)${NC}"
    fi
else
    echo -e "${RED}✗ Found $FAILED critical issue(s) - Please fix before production${NC}"
fi

echo ""
echo "Next Steps:"
if [ $FAILED -gt 0 ]; then
    echo "  1. Fix the failed checks above"
    echo "  2. Run this script again to verify"
fi
echo "  2. Run: pm2 logs rise-api (to monitor application)"
echo "  3. Check: https://$DOMAIN/ (to verify web access)"
echo "  4. Review: deploy/DEPLOY_CPANEL.md (for more details)"
echo ""

# Exit with appropriate code
[ $FAILED -eq 0 ] && exit 0 || exit 1
