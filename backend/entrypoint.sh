#!/bin/sh
set -e

echo "waiting for database at ${DB_HOST:-postgres}:${DB_PORT:-5432}..."
until nc -z -v -w1 "${DB_HOST:-postgres}" "${DB_PORT:-5432}"; do
  sleep 1
done

echo "running migrations..."
./migrate

if [ "${AUTO_SEED:-false}" = "true" ]; then
  echo "seeding (idempotent)..."
  ./seed
fi

echo "starting server..."
exec ./server
