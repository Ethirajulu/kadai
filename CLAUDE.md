# CLAUDE.md - AI Development Guide

## Project Overview

**Kadai** is a multimodal, multilingual AI sales assistant platform for conversational commerce in India. Built as a microservices architecture with Next.js frontend and NestJS/Python backends.

### Core Architecture

- **Microservices**: 8 NestJS services + 1 Python AI service
- **Frontend**: Next.js with Tailwind CSS and Shadcn UI
- **Build System**: Nx monorepo with pnpm
- **Runtime**: Node.js 22.16.0, Python 3.x (shared venv)
- **Databases**: PostgreSQL, MongoDB, Redis, Qdrant (vector)
- **Infrastructure**: Docker, CI/CD pipelines

## Repository Structure

```
kadai/
├── apps/                    # Generated applications
│   ├── *-service/          # NestJS microservices (8 services)
│   ├── ai-service/         # Python FastAPI service
│   ├── seller-dashboard/   # Next.js frontend
│   └── *-e2e/             # End-to-end tests
├── libs/                   # Shared libraries
│   ├── shared-types/       # TypeScript types
│   ├── shared-utils/       # Common utilities
│   ├── ui-components/      # React components
│   └── test-db-config/     # Test database setup
├── docs/                   # Documentation
├── .taskmaster/            # Task Master AI management
├── venv/                   # Python virtual environment (shared)
└── [config files]
```

## Essential Commands

### Setup

```bash
nvm use                          # Node.js 22.16.0
source venv/bin/activate         # Python venv (Linux/Mac)
pnpm install                     # Install dependencies
```

### Development

```bash
# Start services
npx nx serve seller-dashboard    # Frontend (port 4200)
npx nx serve user-service        # Backend (port 3001)
npx nx serve ai-service          # AI service (port 8000)

# Run multiple services
npx nx run-many -t serve --projects=ai-service,user-service --parallel=2

# Testing (80% coverage enforced)
npx nx test <project-name>       # Single project
npx nx run-many -t test          # All projects
npx nx test <project-name> --coverage  # With coverage

# Code generation
npx nx g @nx/nest:app <service-name>    # NestJS service
npx nx g @nx/next:app <app-name>        # Next.js app
npx nx g @nx/js:lib <lib-name>          # Shared library
```

### Task Master Integration

```bash
task-master next                 # Get next task
task-master show <id>           # View task details
task-master set-status --id=<id> --status=done  # Mark complete
task-master list                # Show all tasks
```

## Service Architecture

### Services & Ports

```
API Gateway: 3000        User Service: 3001
Product Service: 3002    Order Service: 3003
Payment Service: 3004    Notification Service: 3005
Broadcast Service: 3006  Analytics Service: 3007
AI Service: 8000 (Python)  Seller Dashboard: 4200
```

### Core Services

- **User Service**: Authentication, profiles, seller management
- **Product Service**: Inventory, catalog, search
- **Order Service**: Order processing, tracking
- **Payment Service**: UPI integration, transactions
- **Notification Service**: Cross-platform messaging
- **AI Service**: NLP, translation, language detection

## Development Workflow

### 1. Pre-Task Checklist

- [ ] Run `task-master next` to get assigned task
- [ ] Review task details with `task-master show <id>`
- [ ] Read relevant documentation (see Key Documents below)
- [ ] Check existing codebase for patterns

### 2. Implementation Rules

- **TDD Mandatory**: Red → Green → Refactor
- **80% Test Coverage**: Enforced via Jest
- **Security First**: Review all code for vulnerabilities
- **Simplicity**: Minimal, focused changes
- **Database Isolation**: Unique test DB per run

### 3. Testing Strategy

```bash
# Write failing test first (Red)
npx nx test <service> --testNamePattern="<test-name>"

# Write minimal code (Green)
# Implement feature

# Refactor while keeping tests green
npx nx test <service> --coverage  # Verify 80% coverage
```

## Key Technical Patterns

### TypeScript Imports

```typescript
// Shared libraries
import { User, UserRole } from '@kadai/shared-types';
import { TestDbConfig } from '@kadai/test-db-config';
import { utils } from '@kadai/shared-utils';
import { Button } from '@kadai/ui-components';
```

### Entity Pattern

```typescript
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  @IsEmail()
  email: string;

  @Column({ type: 'enum', enum: UserRole })
  role: UserRole;

  @CreateDateColumn()
  createdAt: Date;
}
```

### Python Development

- **Shared Environment**: Use `venv/` at project root
- **Stack**: FastAPI 0.104.1, pytest, black, flake8
- **AI Libraries**: langdetect, googletrans, numpy, scikit-learn

## Key Documents (Read Before Starting)

### Priority 1 - Architecture

- `docs/system_architecture.md`: Microservices structure
- `docs/devops_and_observability.md`: CI/CD, monitoring, testing
- `docs/prd.md`: Product requirements

### Priority 2 - Implementation

- `docs/inter-service-communication.md`: Service communication
- `docs/tdd.md`: Technical design specifications
- `docs/ci-cd-guide.md`: Docker, deployment
- `docs/port-configuration.md`: Service ports

### Priority 3 - Context Analysis

- `.claude/gemini-cli.md`: Large-scale codebase analysis
- `docs/ux/`: Frontend design guidelines (use gemini-cli)

## AI-Specific Features

### Language Processing

- **Multi-language**: Hindi, English, regional languages
- **Voice**: STT/TTS integration
- **Translation**: Google Translate API
- **Intent Recognition**: Rasa NLU/Core
- **Vector Search**: Qdrant for semantic search

### Safety & Compliance

- LLM output filtering and guardrails
- Content moderation
- Prompt injection prevention
- PII protection

## Environment Configuration

### Required APIs

- OpenAI, Anthropic, Google Translate
- WhatsApp Business, Instagram Graph, Telegram Bot
- UPI Gateway, Monitoring services

### Database Setup

- PostgreSQL: Main relational data
- MongoDB: Document storage
- Redis: Cache and sessions
- Qdrant: Vector database for AI

## MCP Integration

### Available Servers

- **task-master-ai**: Task management
- **nx-mcp**: Nx workspace operations
- **context7**: Code examples and documentation

### Usage

- Use `nx-mcp` for Nx-related questions
- Use `context7` for code examples and API documentation
- Use `gemini-cli` for large-scale codebase analysis

## Common Operations

### Adding New Service

```bash
# Generate service
npx nx g @nx/nest:app <service-name>

# Add to port configuration
# Update docker-compose.yml
# Configure database connections
# Add test coverage
```

### Frontend Development

```bash
# Generate React components
npx nx g @nx/react:component <component-name> --project=ui-components

# Review UX guidelines
gemini-cli analyze docs/ux/

# Ensure multilingual support
```

## Task Completion Checklist

- [ ] All tests pass (`npx nx test <service>`)
- [ ] 80% coverage achieved
- [ ] Security review completed
- [ ] Documentation updated
- [ ] Task status updated (`task-master set-status --id=<id> --status=done`)

## Quick Reference

### Debug Ports

API Gateway: 9229, User: 9230, Product: 9231, Order: 9232
Payment: 9233, Notification: 9234, Broadcast: 9235, Analytics: 9236

### File Locations

- Entities: `apps/*/src/app/entities/`
- Tests: `apps/*/src/app/**/*.spec.ts`
- Environment: `.env.example`
- Shared types: `libs/shared-types/src/index.ts`

### Project Status

- **Phase**: Early setup and infrastructure
- **Priority**: Service generation, Docker setup, CI/CD
- **Tasks**: 10 main tasks, 64 subtasks planned
