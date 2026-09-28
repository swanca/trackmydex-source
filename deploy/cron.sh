#!/bin/sh
# Taches planifiees de TrackMyDex.
#
# Passe par `docker exec` plutot que par l endpoint HTTP /api/cron : pas de
# secret a stocker dans la crontab, pas de dependance au DNS ni au certificat,
# et le job tourne meme si le proxy est en panne. Chaque job prend un verrou
# consultatif Postgres, donc un tick double ou manque est sans consequence.
set -eu
JOB="$1"
LOG=/var/log/trackmydex-cron.log
echo "[$(date -Is)] debut $JOB" >> "$LOG"
if docker exec trackmydex-trackmydex-1 node_modules/.bin/tsx "src/scripts/$JOB" >> "$LOG" 2>&1; then
  echo "[$(date -Is)] fin $JOB" >> "$LOG"
else
  status=$?
  echo "[$(date -Is)] ECHEC $JOB (code $status)" >> "$LOG"
  exit "$status"
fi
