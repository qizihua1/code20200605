#!/bin/bash
set -e

echo "=== Initializing database... ==="

# Generate Prisma client
npx prisma generate

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Warning: DATABASE_URL not set. Skipping migration."
  exit 0
fi

# Run migration
npx prisma migrate deploy

echo "=== Database initialization completed ==="
