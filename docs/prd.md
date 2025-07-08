# Product Requirements Document (PRD): Kadai

**Version:** 1.0  
**Date:** June 8, 2025  
**Author:** Gemini (AI Assistant, in collaboration with User)  
**Status:** Specification for Implementation

---

## Related Documents

- [System Architecture](system_architecture.md)
- [Test-Driven Development (TDD) Plan](tdd.md)

---

## 1. Introduction & Vision

### 1.1 The Problem

Individual sellers and family-run businesses in India heavily rely on WhatsApp and social media for commerce but face challenges:

- Managing high chat volumes.
- Delayed responses due to manual handling.
- Inventory/order/payment tracking chaos.
- Language/dialect diversity and voice/image usage.
- Inaccessible or overly complex CRM/e-commerce solutions.

> **Update (Multichannel):**  
> These challenges are not limited to WhatsApp. Sellers increasingly interact with buyers across **multiple messaging channels** like Instagram DM, Telegram, and Facebook Messenger — leading to fragmented workflows, inconsistent customer experiences, and higher cognitive load.

### 1.2 The Vision

To empower these businesses with **Kadai** — a simple, multimodal, multilingual AI assistant that works across messaging platforms. It enables:

- Voice/image/text-based product input and queries.
- Instant, context-aware responses.
- Seamless UPI ordering and payment.
- Insights and control via a seller dashboard.
- **Unified multichannel experience** — manage inventory, customers, and conversations across WhatsApp, Instagram, Telegram, and more.

### 1.3 Goals & Objectives

**For Sellers:**

- Eliminate missed sales and reduce manual workload.
- Handle voice notes, image queries, and multi-language customers.
- Simplify order management and stock updates.
- Offer a dashboard with basic insights.
- **Single source of truth for inventory across all channels.**

**For the Product:**

- Multilingual, multimodal, AI-first and messaging-native.
- Trusted by non-tech-savvy users in Tier 2/3 India.
- Affordable, reliable, with guardrails and fallback.
- **Channel-agnostic messaging orchestration engine.**

---

## 2. Target Audience

### 2.1 Primary Users

- Solo sellers, small family shops.
- Comfortable with messaging apps, voice notes, images.
- Value simplicity, efficiency, affordability.

### 2.2 Secondary Users

- Messaging-based consumers (general public).
- Prefer fast, native-language, multimedia-based buying.

### 2.3 User Persona Snapshots

- **Priya (Home Baker):** Sends/receives voice notes on WhatsApp and Instagram.
- **Rajesh & Family (Handicrafts):** Receive regional-language queries and product images via Telegram and WhatsApp.
- **Ananya (Fashion Reseller):** Needs quick responses across Instagram and WhatsApp.

---

## 3. MVP Feature Scope (Lean v2.1)

**Core Pillars:**

1. **Inventory & Catalog Management (text/voice)**
2. **Customer Interaction & Product Discovery (text/voice/image)**
3. **Order & Transaction Flow (cart, order, UPI payment)**
4. **Seller Empowerment (dashboard, stats, broadcasts)**

### 3.1 Key MVP Features

1. **Natural Language & Voice Inventory Input (Seller)**
2. **Multilingual Product Discovery via Text/Voice (Customer)**
3. **Image-based Product Search (Tagging & Keyword Match)**
4. **Basic Seller Dashboard (Inventory, Leads, Status)**
5. **Broadcast Tool (Text + Template API Integration)**
6. **Messaging-native Ordering + UPI Payment Link Integration**
7. **Inventory Updates (auto via order + manual via chat)**
8. **Order Status Notifications (Multilingual)**
9. **Quick Reply Templates (Seller defined)**
10. **Automated Reminders (e.g., Payment follow-up)**
11. **Human Handoff Trigger (alert on confusion)**
12. **FAQ Bot with Multilingual Translation Layer**

> **Update (Multichannel Capabilities):**
>
> - All messaging workflows (inventory input, product discovery, ordering, notifications) must work across **WhatsApp, Instagram, Telegram**, and be extensible to other platforms via an abstracted channel adapter.
> - Support for **channel-specific templates** and compliance (e.g., WhatsApp Business API templates, Instagram messaging guidelines).
> - Platform must identify source channel in conversations and maintain unified session handling per customer.

---

## 4. Cross-Cutting AI Capabilities (MVP)

- Language detection (LangDetect)
- Translation (Bhashini/Google)
- Speech-to-text (STT)
- LLM integration (Ollama/Phi-3)
- Guardrails for hallucination prevention
- Feedback loop for fine-tuning
- Multilingual vector search
- **Multichannel-aware NLU context routing**

---

## 5. Tech Stack Overview

> **Note:** This stack will be detailed further in the TDD.

### Backend:

- **NestJS** microservices (no monolith)
- REST APIs exposed via API Gateway
- Internal service-to-service communication with auth + observability

### LLM-related AI services:

- **Python (FastAPI)** for Rasa Action Server & AI orchestration
- Integrations with STT, LangDetect, Translate, LLM (Ollama), Image Tagging

### Frontend:

- **Next.js** (App Router)
- **Tailwind CSS** + **Shadcn UI**
- **React Query** for data fetching/state

### Infra:

- **Dockerized** services
- CI/CD pipelines (GitHub Actions or similar)
- Linters and formatters for code quality
- **Playwright** for end-to-end (E2E) testing

### Data:

- PostgreSQL (structured)
- MongoDB (chat logs, unstructured)
- Vector DB (semantic search)
- Redis (cache)
- Cloud Storage (S3/GCS for images, invoices)

### Multichannel Layer (NEW):

- Unified webhook + adapter layer to normalize inputs from:
  - WhatsApp (WABA)
  - Instagram Messaging API
  - Telegram Bot API
- Channel-aware context handler to ensure continuity and fallback
- Routing abstraction to plug future channels (e.g., Facebook Messenger)

---

## 6. Success Metrics

- X% automation of customer queries across all channels
- Y% increase in order throughput per seller
- < Zs avg. response time to messages
- > 90% accuracy in STT transcription (for supported dialects)
- MVP adoption by 20+ pilot sellers with >70% weekly retention
- **>95% message handling parity across WhatsApp, Instagram, and Telegram**

---

**End of PRD v1.0 (Multichannel Updated)**
