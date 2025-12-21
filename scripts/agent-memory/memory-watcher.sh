#!/bin/bash
# Background Memory Watcher - Monitors system and agent activity
# Run with: nohup ./memory-watcher.sh &

MEMORY_DIR="/opt/rise-local-lead-maker/scripts/agent-memory"
WATCH_LOG="$MEMORY_DIR/watcher.log"
PID_FILE="$MEMORY_DIR/.watcher.pid"
INTERVAL=60  # Check every 60 seconds

log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$WATCH_LOG"
}

cleanup() {
    log "Watcher stopping..."
    rm -f "$PID_FILE"
    exit 0
}

trap cleanup SIGINT SIGTERM

# Check if already running
if [[ -f "$PID_FILE" ]]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo "Watcher already running with PID $OLD_PID"
        exit 1
    fi
fi

echo $$ > "$PID_FILE"
log "Watcher started with PID $$"

while true; do
    # Monitor API health
    API_STATUS=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health 2>/dev/null)
    if [[ "$API_STATUS" != "200" ]]; then
        log "WARN: API health check failed (HTTP $API_STATUS)"
    fi

    # Monitor MySQL
    if ! mysqladmin ping -h localhost -u root --silent 2>/dev/null; then
        log "WARN: MySQL not responding"
    fi

    # Monitor MCP server processes
    MCP_COUNT=$(pgrep -f "mcp-server/index.js" | wc -l)
    if [[ "$MCP_COUNT" -eq 0 ]]; then
        log "WARN: No MCP server processes running"
    fi

    # Check disk space
    DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
    if [[ "$DISK_USAGE" -gt 90 ]]; then
        log "WARN: Disk usage at ${DISK_USAGE}%"
    fi

    # Log active session status
    if [[ -f "$MEMORY_DIR/.current_session" ]]; then
        SESSION=$(cat "$MEMORY_DIR/.current_session")
        log "INFO: Active session: $SESSION"
    fi

    # Rotate watcher log if too large (>10MB)
    if [[ -f "$WATCH_LOG" ]] && [[ $(stat -f%z "$WATCH_LOG" 2>/dev/null || stat -c%s "$WATCH_LOG" 2>/dev/null) -gt 10485760 ]]; then
        mv "$WATCH_LOG" "$WATCH_LOG.old"
        log "Log rotated"
    fi

    sleep $INTERVAL
done
