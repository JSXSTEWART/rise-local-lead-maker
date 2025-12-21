#!/bin/bash
# Rise API Database Backup Script

BACKUP_DIR="/backup/rise-leads"
DATE=$(date +%Y%m%d_%H%M%S)
DB_USER="root"
DB_NAME="rise_leads"

# Create backup directory if not exists
mkdir -p "$BACKUP_DIR"

# Perform backup
echo "[$(date)] Starting backup of $DB_NAME..."
mysqldump -u "$DB_USER" "$DB_NAME" | gzip > "$BACKUP_DIR/rise_leads_$DATE.sql.gz"

if [ $? -eq 0 ]; then
    echo "[$(date)] Backup completed: rise_leads_$DATE.sql.gz"
else
    echo "[$(date)] Backup failed!"
    exit 1
fi

# Keep only last 30 days of backups
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
echo "[$(date)] Old backups cleaned up"

# Show backup stats
echo "[$(date)] Current backups:"
ls -lh "$BACKUP_DIR"/*.sql.gz 2>/dev/null | tail -5
