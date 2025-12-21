#!/bin/bash
# Agent Session Logger - Monitors and logs agent actions for memory/resume capability
# Usage: ./session-logger.sh <action> [details]
#   Actions: start, log, end, status, history, resume

MEMORY_DIR="/opt/rise-local-lead-maker/scripts/agent-memory"
SESSIONS_DIR="$MEMORY_DIR/sessions"
CURRENT_SESSION_FILE="$MEMORY_DIR/.current_session"
LOG_FILE="$MEMORY_DIR/agent.log"

mkdir -p "$SESSIONS_DIR"

timestamp() {
    date "+%Y-%m-%d %H:%M:%S"
}

session_id() {
    date "+%Y%m%d_%H%M%S"
}

log_action() {
    local level="$1"
    local message="$2"
    local session=$(cat "$CURRENT_SESSION_FILE" 2>/dev/null || echo "no-session")
    echo "[$(timestamp)] [$session] [$level] $message" >> "$LOG_FILE"

    # Also log to session file if active
    if [[ -f "$CURRENT_SESSION_FILE" ]]; then
        local session_file="$SESSIONS_DIR/${session}.json"
        if [[ -f "$session_file" ]]; then
            # Append to actions array in JSON
            local temp_file=$(mktemp)
            jq --arg ts "$(timestamp)" --arg lvl "$level" --arg msg "$message" \
                '.actions += [{"timestamp": $ts, "level": $lvl, "message": $msg}]' \
                "$session_file" > "$temp_file" && mv "$temp_file" "$session_file"
        fi
    fi
}

start_session() {
    local description="${1:-New agent session}"
    local sid=$(session_id)
    local session_file="$SESSIONS_DIR/${sid}.json"

    echo "$sid" > "$CURRENT_SESSION_FILE"

    cat > "$session_file" << EOF
{
    "session_id": "$sid",
    "started_at": "$(timestamp)",
    "description": "$description",
    "status": "active",
    "ended_at": null,
    "actions": [],
    "summary": null,
    "resume_context": null
}
EOF

    log_action "INFO" "Session started: $description"
    echo "Session started: $sid"
    echo "$sid"
}

end_session() {
    local summary="${1:-Session completed}"
    local session=$(cat "$CURRENT_SESSION_FILE" 2>/dev/null)

    if [[ -z "$session" ]]; then
        echo "No active session"
        return 1
    fi

    local session_file="$SESSIONS_DIR/${session}.json"
    if [[ -f "$session_file" ]]; then
        local temp_file=$(mktemp)
        jq --arg ts "$(timestamp)" --arg sum "$summary" \
            '.ended_at = $ts | .status = "completed" | .summary = $sum' \
            "$session_file" > "$temp_file" && mv "$temp_file" "$session_file"
    fi

    log_action "INFO" "Session ended: $summary"
    rm -f "$CURRENT_SESSION_FILE"
    echo "Session $session ended"
}

get_status() {
    local session=$(cat "$CURRENT_SESSION_FILE" 2>/dev/null)

    if [[ -z "$session" ]]; then
        echo "No active session"
        echo ""
        echo "Recent sessions:"
        ls -t "$SESSIONS_DIR"/*.json 2>/dev/null | head -5 | while read f; do
            jq -r '"  \(.session_id): \(.description) [\(.status)]"' "$f"
        done
        return
    fi

    local session_file="$SESSIONS_DIR/${session}.json"
    if [[ -f "$session_file" ]]; then
        echo "Current session: $session"
        jq -r '"Started: \(.started_at)\nDescription: \(.description)\nActions: \(.actions | length)"' "$session_file"
        echo ""
        echo "Last 5 actions:"
        jq -r '.actions[-5:][] | "  [\(.timestamp)] \(.message)"' "$session_file"
    fi
}

get_history() {
    local count="${1:-10}"
    echo "Last $count log entries:"
    tail -n "$count" "$LOG_FILE" 2>/dev/null || echo "No log entries"
}

resume_session() {
    local session_id="${1:-$(ls -t "$SESSIONS_DIR"/*.json 2>/dev/null | head -1 | xargs -I{} basename {} .json)}"
    local session_file="$SESSIONS_DIR/${session_id}.json"

    if [[ ! -f "$session_file" ]]; then
        echo "Session not found: $session_id"
        return 1
    fi

    echo "$session_id" > "$CURRENT_SESSION_FILE"

    # Update status back to active
    local temp_file=$(mktemp)
    jq '.status = "resumed"' "$session_file" > "$temp_file" && mv "$temp_file" "$session_file"

    log_action "INFO" "Session resumed"

    echo "=== RESUME CONTEXT ==="
    jq -r '"Session: \(.session_id)\nDescription: \(.description)\nStarted: \(.started_at)\nLast Status: \(.status)\n\nActions taken:"' "$session_file"
    jq -r '.actions[] | "  [\(.timestamp)] \(.message)"' "$session_file"

    if jq -e '.resume_context != null' "$session_file" > /dev/null 2>&1; then
        echo ""
        echo "Resume Notes:"
        jq -r '.resume_context' "$session_file"
    fi
}

save_context() {
    local context="$1"
    local session=$(cat "$CURRENT_SESSION_FILE" 2>/dev/null)

    if [[ -z "$session" ]]; then
        echo "No active session"
        return 1
    fi

    local session_file="$SESSIONS_DIR/${session}.json"
    local temp_file=$(mktemp)
    jq --arg ctx "$context" '.resume_context = $ctx' "$session_file" > "$temp_file" && mv "$temp_file" "$session_file"

    log_action "INFO" "Context saved for resume"
    echo "Context saved"
}

case "$1" in
    start)
        start_session "$2"
        ;;
    log)
        log_action "${2:-INFO}" "$3"
        ;;
    end)
        end_session "$2"
        ;;
    status)
        get_status
        ;;
    history)
        get_history "$2"
        ;;
    resume)
        resume_session "$2"
        ;;
    context)
        save_context "$2"
        ;;
    *)
        echo "Agent Session Logger"
        echo "Usage: $0 <command> [args]"
        echo ""
        echo "Commands:"
        echo "  start [description]  - Start a new session"
        echo "  log [level] [msg]    - Log an action (INFO, WARN, ERROR, TASK)"
        echo "  end [summary]        - End current session"
        echo "  status               - Show current session status"
        echo "  history [count]      - Show recent log entries"
        echo "  resume [session_id]  - Resume a previous session"
        echo "  context [text]       - Save resume context"
        ;;
esac
