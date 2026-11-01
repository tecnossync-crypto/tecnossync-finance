#!/usr/bin/env bash
# Publica la última versión de main en el servidor:  ./deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.production ] || { echo "Falta .env.production (copia .env.production.example)"; exit 1; }
source deploy/compose.sh

if [ -n "${PROXY_NETWORK:-}" ] && ! docker network inspect "$PROXY_NETWORK" >/dev/null 2>&1; then
  echo "No existe la red $PROXY_NETWORK (mírala con: docker network ls)"; exit 1
fi

git pull --ff-only origin main
"${COMPOSE[@]}" up -d --build --remove-orphans
docker image prune -f >/dev/null
docker builder prune -f >/dev/null   # el disco del servidor es justo

echo "Esperando a la API..."
for i in $(seq 1 30); do
  if "${COMPOSE[@]}" exec -T api wget -qO- http://127.0.0.1:4100/api/health >/dev/null 2>&1; then
    echo "✓ Cuadre está arriba"; exit 0
  fi
  sleep 2
done
echo "La API no respondió; revisa: ${COMPOSE[*]} logs api"; exit 1
