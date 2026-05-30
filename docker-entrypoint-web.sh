#!/bin/sh
set -e

echo "[web] Running Prisma migrations…"
node_modules/.bin/prisma migrate deploy

echo "[web] Starting Next.js server…"
exec node server.js