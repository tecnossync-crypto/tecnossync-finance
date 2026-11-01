#!/usr/bin/env bash
# Respaldo de la base de datos y los comprobantes. Guarda 14 días en el servidor
# y, si BACKUP_S3_BUCKET está definido, copia cada respaldo a S3.
# Cron diario (2:30 a. m.):  30 2 * * * /home/ubuntu/tecnossync-finance/deploy/backup.sh >> /home/ubuntu/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
source deploy/compose.sh

STAMP=$(date +%Y%m%d-%H%M)
mkdir -p backups

"${COMPOSE[@]}" exec -T db pg_dump -U cuadre -d cuadre --format=custom > "backups/db-$STAMP.dump"
"${COMPOSE[@]}" exec -T api tar -czf - -C /data uploads > "backups/uploads-$STAMP.tar.gz"

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  aws s3 cp "backups/db-$STAMP.dump" "s3://$BACKUP_S3_BUCKET/db/" --only-show-errors
  aws s3 cp "backups/uploads-$STAMP.tar.gz" "s3://$BACKUP_S3_BUCKET/uploads/" --only-show-errors
fi

find backups -type f -mtime +14 -delete
echo "$(date -Is) respaldo $STAMP listo"
