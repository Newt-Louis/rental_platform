# THISO Leasing Platform - Makefile
# Convenience commands for Docker operations

.PHONY: help build up down logs shell migrate seed reset clean dev prod

# Default target
help:
	@echo "THISO Leasing Platform - Available Commands"
	@echo "============================================"
	@echo ""
	@echo "Production:"
	@echo "  make build      - Build all Docker images"
	@echo "  make up         - Start all services"
	@echo "  make down       - Stop all services"
	@echo "  make logs       - View logs (follow mode)"
	@echo "  make shell      - Open shell in backend container"
	@echo "  make migrate    - Run database migrations"
	@echo "  make seed       - Seed database with sample data"
	@echo "  make reset      - Reset database (drop + migrate + seed)"
	@echo "  make clean      - Remove all containers and volumes"
	@echo ""
	@echo "Development:"
	@echo "  make dev        - Start in development mode (hot reload)"
	@echo "  make dev-down   - Stop development services"
	@echo ""
	@echo "Utilities:"
	@echo "  make status     - Show container status"
	@echo "  make prisma     - Open Prisma Studio"
	@echo "  make psql       - Connect to PostgreSQL"

# Build images (uses .env.docker — copy to .env to customize)
build:
	docker compose --env-file .env.docker build

# Start production services
up:
	docker compose --env-file .env.docker up -d

# Start with build
prod:
	docker compose --env-file .env.docker up -d --build

# Stop services
down:
	docker compose down

# View logs
logs:
	docker compose logs -f

# Shell into backend
shell:
	docker compose exec backend sh

# Run migrations
migrate:
	docker compose --profile migrate up migrate

# Seed database
seed:
	docker compose exec backend npx prisma db seed

# Reset database (dev only — runs migrate + optional seed)
reset:
	docker compose exec backend sh -c "npx prisma migrate reset --force && if [ \"$$SEED_DATABASE\" = \"true\" ]; then npx prisma db seed; fi"

# Clean everything
clean:
	docker compose down -v --remove-orphans
	docker system prune -f

# Show status
status:
	docker compose ps

# Open Prisma Studio
prisma:
	docker compose exec backend npx prisma studio

# Connect to PostgreSQL
psql:
	docker compose exec postgres psql -U leasing -d leasing_platform

# Development mode
dev:
	docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.dev.yml up --build

# Stop development
dev-down:
	docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.dev.yml down
