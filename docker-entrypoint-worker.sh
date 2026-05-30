#!/bin/sh
set -e

echo "[worker] Starting Kafka worker…"
exec node_modules/.bin/tsx lib/kafka/worker.ts