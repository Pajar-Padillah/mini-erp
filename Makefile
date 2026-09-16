.PHONY: up down migrate-up migrate-down seed test backend-run frontend-run

N ?= 1

up:
	docker compose up --build

down:
	docker compose down

DB_DSN ?= host=localhost user=erp password=erp dbname=mini_erp port=5544 sslmode=disable

migrate-up:
	cd backend && DB_DSN="$(DB_DSN)" go run ./cmd/migrate

migrate-down:
	cd backend && DB_DSN="$(DB_DSN)" go run ./cmd/migrate -down -steps=$(N)

seed:
	cd backend && DB_DSN="$(DB_DSN)" go run ./cmd/seed

backend-run:
	cd backend && DB_DSN="$(DB_DSN)" AUTO_MIGRATE=true go run ./cmd/server

frontend-run:
	cd frontend && npm run dev

test:
	cd backend && TEST_DB_DSN="host=localhost user=erp password=erp dbname=mini_erp_test port=5544 sslmode=disable" go test ./...
