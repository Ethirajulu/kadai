#!/bin/sh

case "$1" in
  up|"")
    echo "Starting infrastructure services..."
    docker compose -f docker-compose.infra.yml up -d
    ;;
  down)
    echo "Stopping infrastructure services..."
    docker compose -f docker-compose.infra.yml down
    ;;
  cleanup)
    echo "Stopping and removing infrastructure services and volumes..."
    docker compose -f docker-compose.infra.yml down -v
    ;;
  *)
    echo "Usage: $0 [up|down|cleanup]"
    exit 1
    ;;
esac 