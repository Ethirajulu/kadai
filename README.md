# Kadai - AI Sales Assistant Platform

A multimodal, multilingual AI sales assistant platform for conversational commerce in India.

## 🚀 Quick Development Setup

### Complete Environment Setup

```bash
# Clone and setup
git clone <repository-url>
cd kadai
pnpm install

# Setup development environment (infrastructure + databases)
pnpm run dev:setup

# Test all connections
pnpm run dev:test

# Check service status
pnpm run dev:status
```

### Individual Service Management

```bash
# MongoDB only
pnpm run mongo:setup
pnpm run mongo:test

# PostgreSQL schema
pnpm run db:migrate

# Start a service
nx serve api-gateway
```

### Available Scripts

- `pnpm run dev:setup` - Complete fresh setup (infrastructure + databases)
- `pnpm run dev:test` - Test all service connections
- `pnpm run dev:status` - Show status of all services
- `pnpm run dev:down` - Stop all services
- `pnpm run dev:cleanup` - Stop and remove all services and volumes

## Architecture

Built as a microservices architecture with:

- **Frontend**: Next.js (Seller Dashboard)
- **Backend**: NestJS services + Python AI service
- **Databases**: PostgreSQL, MongoDB, Redis, Qdrant
- **Infrastructure**: Docker containers with Nx monorepo

## Development

This project uses:

- **Nx Monorepo** for workspace management
- **pnpm** as package manager
- **Node.js 22.16.0** for JavaScript services
- **Python 3.x** for AI services
- **Docker** for infrastructure

For detailed documentation, see the `docs/` folder.

## Services

### Backend Services (NestJS)

- `api-gateway` - Main API gateway (port 3000)
- `user-service` - User management (port 3001)
- `product-service` - Product catalog (port 3002)
- `order-service` - Order processing (port 3003)
- `payment-service` - Payment handling (port 3004)
- `notification-service` - Notifications (port 3005)
- `analytics-service` - Analytics (port 3006)
- `broadcast-service` - Broadcasting (port 3007)

### AI Service (Python)

- `ai-service` - AI processing (port 8000)

### Frontend

- `seller-dashboard` - Seller interface (Next.js)

## Database Connections

### PostgreSQL

- **URL**: `postgresql://kadai:kadai123@localhost:5432/kadai`
- **Usage**: User data, orders, products, payments

### MongoDB

- **URL**: `mongodb://kadai:kadai123@localhost:27017/kadai`
- **Usage**: Chat logs, conversation histories, session data

### Redis

- **URL**: `redis://localhost:6379`
- **Usage**: Caching, session management

### Qdrant

- **URL**: `http://localhost:6333`
- **Usage**: Vector storage for AI embeddings
