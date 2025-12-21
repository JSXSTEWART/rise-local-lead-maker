#!/bin/bash
# Rise API Health Check Script

API_URL="http://localhost:3001/health"
LOG_FILE="/var/log/rise-api/healthcheck.log"

RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL" --connect-timeout 5)

if [ "$RESPONSE" != "200" ]; then
    echo "[$(date)] Health check failed (HTTP $RESPONSE). Restarting service..." >> "$LOG_FILE"
    systemctl restart rise-api
    echo "[$(date)] Service restarted" >> "$LOG_FILE"
else
    # Only log every hour to avoid log spam
    MINUTE=$(date +%M)
    if [ "$MINUTE" == "00" ]; then
        echo "[$(date)] Health check OK" >> "$LOG_FILE"
    fi
fi
