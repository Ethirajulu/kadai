# Kadai UX: Page & Flow Inventory

**Version:** 1.0
**Date:** June 8, 2025
**Author:** Gemini (AI Assistant, in collaboration with User)
**Purpose:** List all frontend (dashboard and WhatsApp) screens, views, and flows required for MVP

---

## 1. Seller Dashboard (Next.js)

### 1.1 Auth & Access

- **Login & Signup Page**

  - Email/mobile + OTP login
  - Seller onboarding flow (profile + WABA setup)

### 1.2 Main Application Pages

- **Dashboard Home**

  - Quick stats: new leads, sales today, top products, alerts
  - AI activity log (e.g., flagged issues, handovers)

- **Products / Catalog**

  - Product list with filters/sorting
  - Add/Edit product manually
  - NLP ingestion view (review/edit auto-parsed voice/text entries)
  - Stock updates and variant manager

- **Orders**

  - Order table: ID, status, items, customer info
  - Filters: date, status, customer
  - View invoice / send payment link

- **Broadcasts**

  - Create campaign: product push / custom message
  - Schedule/send now + audience select
  - Message preview using WABA templates

- **Quick Replies**

  - Create/edit reply templates
  - Suggested triggers (e.g., “payment done?”, “sizes available?”)

- **Conversations (Read-only Log)**

  - Timeline of recent chats (from MongoDB logs)
  - Highlighted low-confidence responses or handovers

- **Analytics**

  - Product views, cart adds, order conversions
  - Most queried FAQs / AI accuracy (STT, LLM)

- **Settings**

  - Preferred language, seller business profile
  - WABA template sync, handoff preferences, team users

- **Help & Feedback**

  - Bot issue reporting
  - Feedback submission, support contacts

- **Notifications Center**

  - Alerts: low stock, failed payments, missed handoffs
  - AI confidence issues

---

## 2. WhatsApp Interface (Customer-Facing Flows)

### 2.1 Product Discovery

- Multilingual, text/voice/image product query
- Semantic match → reply via LLM
- Card-style product response with price, variants

### 2.2 Ordering & Payment

- Add to cart via buttons or message
- Confirm → UPI link → payment confirmation
- Order status messages in WhatsApp

### 2.3 Voice Note Input (Seller)

- Voice → STT → NLP → Catalog update
- Confirmation message: parsed info preview + yes/edit option

### 2.4 FAQ / General Query Bot

- Translation pipeline → Rasa → matched answer
- Fallback triggers alert if confidence too low

### 2.5 Automated Reminders

- Seller-initiated or bot-timed follow-ups
- Payment pending, delivery notification, feedback request

### 2.6 Human Handoff

- Triggered by flagged phrases or low bot confidence
- Alert seller via WhatsApp + dashboard highlight

---

**End of UX Page Inventory v1.0**
