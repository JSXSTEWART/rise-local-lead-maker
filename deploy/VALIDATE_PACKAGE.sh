#!/bin/bash
# Validate cPanel Deployment Package
# Run this locally to verify all files are present and correct

echo "═══════════════════════════════════════════════════════════════════"
echo "Rise Local Lead Maker - cPanel Deployment Package Validation"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PASS=0
FAIL=0

# Function to check file
check_file() {
    local file="$1"
    local type="$2"
    local path="$DEPLOY_DIR/$file"
    
    if [ -f "$path" ]; then
        if [ "$type" = "exec" ]; then
            if [ -x "$path" ]; then
                echo "✓ $file ($(wc -l < "$path" | tr -d ' ') lines, executable)"
                ((PASS++))
            else
                echo "✗ $file (exists but NOT executable)"
                ((FAIL++))
            fi
        else
            echo "✓ $file ($(wc -l < "$path" | tr -d ' ') lines)"
            ((PASS++))
        fi
    else
        echo "✗ $file (MISSING)"
        ((FAIL++))
    fi
}

# Validate all files
echo "Checking Deployment Files:"
echo "─────────────────────────"
check_file "INDEX.md" "doc"
check_file "README.md" "doc"
check_file "DEPLOY_CPANEL.md" "doc"
check_file "QUICK_REFERENCE.md" "doc"
check_file "DEPLOYMENT_CHECKLIST.md" "doc"
check_file "ecosystem.config.js" "config"
check_file "setup.sh" "exec"
check_file "verify.sh" "exec"
check_file ".env.production" "config"
check_file "init-db.sql" "sql"
check_file "htaccess-template" "config"

echo ""
echo "Checking Deploy Directory Structure:"
echo "────────────────────────────────────"

if [ -d "$DEPLOY_DIR" ]; then
    echo "✓ deploy/ directory exists"
    ((PASS++))
else
    echo "✗ deploy/ directory missing"
    ((FAIL++))
fi

# Check file sizes
echo ""
echo "Checking File Sizes:"
echo "───────────────────"
total_size=$(du -sh "$DEPLOY_DIR" 2>/dev/null | cut -f1)
echo "Total deployment package size: $total_size"

# Check for required content
echo ""
echo "Checking File Content:"
echo "─────────────────────"

if grep -q "ecosystem.config.js" "$DEPLOY_DIR/README.md"; then
    echo "✓ README.md references ecosystem.config.js"
    ((PASS++))
else
    echo "✗ README.md missing key references"
    ((FAIL++))
fi

if grep -q "pm2 start" "$DEPLOY_DIR/DEPLOY_CPANEL.md"; then
    echo "✓ DEPLOY_CPANEL.md contains PM2 instructions"
    ((PASS++))
else
    echo "✗ DEPLOY_CPANEL.md incomplete"
    ((FAIL++))
fi

if grep -q "CREATE TABLE IF NOT EXISTS" "$DEPLOY_DIR/init-db.sql"; then
    echo "✓ init-db.sql contains database schema"
    ((PASS++))
else
    echo "✗ init-db.sql incomplete"
    ((FAIL++))
fi

if grep -q "npm install" "$DEPLOY_DIR/setup.sh"; then
    echo "✓ setup.sh contains installation steps"
    ((PASS++))
else
    echo "✗ setup.sh incomplete"
    ((FAIL++))
fi

if grep -q "pm2" "$DEPLOY_DIR/verify.sh" && grep -q "curl" "$DEPLOY_DIR/verify.sh"; then
    echo "✓ verify.sh contains verification steps"
    ((PASS++))
else
    echo "✗ verify.sh incomplete"
    ((FAIL++))
fi

if grep -q "ProxyPass" "$DEPLOY_DIR/htaccess-template"; then
    echo "✓ htaccess-template contains proxy configuration"
    ((PASS++))
else
    echo "✗ htaccess-template incomplete"
    ((FAIL++))
fi

# Summary
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "Validation Summary"
echo "═══════════════════════════════════════════════════════════════════"

TOTAL=$((PASS + FAIL))
echo ""
echo "Total Checks: $TOTAL"
echo "Passed: $PASS ✓"
echo "Failed: $FAIL ✗"
echo ""

if [ $FAIL -eq 0 ]; then
    echo "✅ Package validation PASSED - All files present and correct!"
    echo ""
    echo "You're ready to deploy. Next steps:"
    echo "  1. SSH to acme.zonedock.com: ssh apex2600@acme.zonedock.com"
    echo "  2. Clone repo: git clone https://github.com/JSXSTEWART/rise-local-lead-maker.git"
    echo "  3. Run setup: bash rise-local-lead-maker/deploy/setup.sh"
    echo "  4. Configure: Edit .env file with your credentials"
    echo "  5. Verify: bash rise-local-lead-maker/deploy/verify.sh"
    exit 0
else
    echo "❌ Package validation FAILED - Please fix the issues above"
    exit 1
fi
