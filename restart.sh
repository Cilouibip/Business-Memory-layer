#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PORT="3000"

if [ ! -f "$ROOT_DIR/package.json" ]; then
  echo "[restart] package.json introuvable dans $ROOT_DIR"
  exit 1
fi

echo "[restart] Arrêt des process node de l'utilisateur $USER..."
NODE_PIDS="$(pgrep -u "$USER" -x node || true)"
if [ -n "$NODE_PIDS" ]; then
  kill $NODE_PIDS || true
  sleep 1

  STILL_RUNNING="$(pgrep -u "$USER" -x node || true)"
  if [ -n "$STILL_RUNNING" ]; then
    echo "[restart] Forçage de l'arrêt des process node restants..."
    kill -9 $STILL_RUNNING || true
  fi
else
  echo "[restart] Aucun process node à arrêter."
fi

echo "[restart] Vérification du port $PORT..."
PORT_PIDS="$(lsof -ti tcp:$PORT || true)"
if [ -n "$PORT_PIDS" ]; then
  kill -9 $PORT_PIDS || true
fi

echo "[restart] Nettoyage lock Next.js..."
rm -f "$ROOT_DIR/.next/dev/lock"

cd "$ROOT_DIR"
echo "[restart] Démarrage Next.js sur localhost:$PORT"
exec npm run dev -- -p "$PORT" --hostname localhost
