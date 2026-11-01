#!/usr/bin/env bash
# Comando docker compose de Cuadre según .env.production (incluye el modo compartido
# si PROXY_NETWORK está definido). Se usa con `source` desde deploy.sh y backup.sh.
set -a; . ./.env.production; set +a
COMPOSE=(docker compose -f docker-compose.prod.yml)
[ -n "${PROXY_NETWORK:-}" ] && COMPOSE+=(-f docker-compose.shared.yml)
COMPOSE+=(--env-file .env.production)
