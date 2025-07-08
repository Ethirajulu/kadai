# Technical Design Document (TDD): Kadai

**Version:** 1.0
**Date:** June 8, 2025
**Author:** Gemini (AI Assistant, in collaboration with User)
**Status:** Finalized for MVP Implementation

---

## 1. Introduction

This document specifies the technical architecture, service designs, APIs, AI pipeline orchestration, deployment, and dev practices for the Kadai platform.

> **Update (Multichannel):**
> The design supports seamless integration across WhatsApp, Instagram Messaging, Telegram, and other messaging platforms via a unified multichannel adapter. This ensures consistent conversation logic, product workflows, and AI responses across all channels.

---

## 2. Scope

Covers:

- Core backend microservices (NestJS)
- AI orchestration layer (FastAPI)
- NLP, STT, Translation, LLM workflows
- **Multichannel messaging integration**
- Frontend dashboard (Next.js)
- Deployment, monitoring, security, CI/CD

---

## 3. Component Design

### 3.1 Multichannel Integration Layer

- Webhook receivers for WhatsApp (WABA), Instagram Messaging API, Telegram Bot API
- Adapter normalizes payloads into internal format: sender, message type, media URL, channel ID, metadata
- Routes normalized input to Rasa Action Server
- Sends formatted AI responses back to appropriate channel using corresponding APIs
- Handles retry, message status sync, and channel-specific compliance (e.g., WhatsApp template messaging)

### 3.2 Rasa NLU & Core

- Rasa NLU parses intent/entities (via `/model/parse`)
- Rasa Core handles dialog flow using rules + stories
- NLU and Core operate independently of source channel — channel context is injected as metadata

### 3.3 Rasa Action Server (FastAPI)

Handles:

- Lang detection → translation → NLU handoff
- Voice input: STT → same flow
- Image input: tags → product search
- LLM calls for generation (with guardrails)
- DB calls (Product/Order/User)
- Triggers notifications/broadcast

#### Key Actions:

- `action_orchestrate_input`
- `action_ingest_seller_product_nlp`
- `action_customer_query_product`
- `action_checkout_flow`
- `action_payment_status_handler`

---

## 4. AI Pipeline

### 4.1 Voice Input Flow

1. Channel webhook → voice media URL
2. Action Server → STT Service
3. STT returns transcript
4. LangDetect → Translate → NLU → Rasa Core

### 4.2 Text Input Flow

- Channel webhook → text
- LangDetect → Translate → NLU → Core → Action

### 4.3 Image Input Flow

- Channel webhook → image URL
- Action Server → ImageTag service
- Return tags → ProductService search

### 4.4 LLM Guardrails

- Extracts structured facts (e.g. price)
- Validates against DB source
- Filters length/toxicity
- If violation: fallback template or trimmed reply

---

## 5. Backend Services (NestJS)

### Product Service

- NLP + parsed catalog ingestion
- Product search API (keyword + semantic)
- Stock update

### Order Service

- Session carts
- Create order from cart
- Invoice generation

### Payment Service

- UPI link generation
- Payment callback receiver

### Notification Service

- Triggers customer alerts via multichannel integration
- Handles template messages (text/image)

### Broadcast Service

- Schedules/queues bulk campaigns
- Supports channel-specific delivery (e.g., WhatsApp/Telegram)

### Analytics Service

- Aggregates order/conversation stats
- Pushes to dashboard API
- Stores channel-specific engagement metrics

---

## 6. Frontend (Next.js)

- Seller Dashboard (Tailwind + Shadcn)
- Auth + Catalog + Orders + Stats
- Cross-channel configuration panel (channel tokens, message logs)
- React Query for API calls
- Google Analytics tracking
- Sentry for frontend errors

---

## 7. Data Stores

- **PostgreSQL:** structured data (orders, users)
- **MongoDB:** raw chat logs, errors
- **Vector DB (Chroma):** multilingual semantic search
- **Redis:** session + temporary NLU context
- **RabbitMQ:** queues for broadcast, notifications
- **S3:** media uploads

---

## 8. DevOps & Tooling

- **Nx dev monorepo** for code organization, dependency graph, and CI
- Dockerized services
- CI/CD via GitHub Actions
- Environment configs via dotenv & secrets manager
- Formatters, linters on all services
- Sentry (backend + frontend)
- Google Analytics (dashboard)
- Monitoring via Prometheus/Grafana
- **Playwright** for automated end-to-end (E2E) testing
- When initializing the Nx workspace, always select **pnpm** as the package manager. This ensures all Nx tooling and configuration are set up for pnpm from the start.

  Recommended command:

  ```
  npx create-nx-workspace@latest <workspace-name> --packageManager=pnpm
  ```

  Replace `<workspace-name>` with your desired project name.

---

**End of TDD v1.0 (Multichannel Updated)**
