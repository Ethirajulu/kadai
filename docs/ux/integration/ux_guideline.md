# Kadai WhatsApp UX Guide & Design Prompts

**Version:** 1.0
**Date:** June 8, 2025
**Author:** Gemini (AI Assistant, in collaboration with User)
**Purpose:** Define conversational UX standards and AI design prompts for the WhatsApp interface used by Kadai sellers and customers

---

## 🎯 WhatsApp UX Philosophy

- Conversational, human-like, assistive tone
- Support for multimodal inputs: text, voice, image
- Minimize friction for both seller and customer
- Automate 80% of common tasks (inventory, queries, orders)
- Prioritize language clarity and safety
- Fallback gracefully to human/seller when needed

---

## 💬 Message Design Guidelines

| Element               | Standard                                                                     |
| --------------------- | ---------------------------------------------------------------------------- |
| **Tone**              | Friendly, concise, professional (e.g., "Sure! Here are your order details:") |
| **Response Time**     | Aim for < 5s response time for AI replies                                    |
| **Formatting**        | Use newlines, bullet points, and bold where needed                           |
| **Language Handling** | Auto-detect and reply in sender’s language (LangDetect + Translate)          |
| **Voice Input**       | Transcribe, confirm meaning, handle errors with retry prompt                 |
| **Image Input**       | Use tags for search, fallback if unrecognized                                |
| **CTA Buttons**       | Use WhatsApp Interactive Message format: Quick Replies & CTAs                |
| **Handoff**           | Low confidence → trigger seller alert + log conversation in dashboard        |

---

## 📄 Conversation Types & Design Prompts

### 1. Product Query Flow

**Prompt:**

> Design a flow where a customer sends a text/voice/image message describing a product need (e.g., "Do you have red kurtis under ₹800?"). Detect language → translate → semantic search → return up to 3 product cards with name, price, description, and image. Use buttons like "Add to Cart", "See More".

### 2. Order Placement Flow

**Prompt:**

> Create a checkout flow. Customer confirms product → bot generates order summary → UPI payment link is sent → bot waits for webhook status → sends confirmation message with ETA. If payment not made in 30 mins, send reminder.

### 3. Seller Voice Ingestion

**Prompt:**

> Seller sends a voice note. System transcribes it → NLP parser extracts product name, price, stock → bot replies with confirmation summary ("Added: Blue Kurti, ₹499, Stock: 12. Correct?") → allow "Yes" or "Edit" quick reply.

### 4. Image-Based Product Search

**Prompt:**

> Customer sends a product image. Image tagging service extracts tags → search by keywords → show top 3 matching products. If no match, say: "I couldn't find this exact item, but here are similar ones."

### 5. FAQ & Help Bot

**Prompt:**

> A user sends a question (e.g., "How do I pay?"). Detect language → translate → match intent → return preset FAQ answer. If not matched confidently, trigger fallback message and alert seller.

### 6. Handoff & Alerts

**Prompt:**

> If any response confidence is low, or a buyer uses phrases like "Can I talk to someone?", send a handoff message ("I'll alert the seller to assist you shortly.") and notify seller via pinned conversation + dashboard alert.

### 7. Payment/Delivery Reminder

**Prompt:**

> Set timed messages like "Hi! Just a reminder to complete your payment for your order. Tap below to pay" with UPI link + status. After delivery, optionally ask for feedback.

---

## 🔄 Conversation Logging Schema

- Message ID, timestamp, sender type, input type (text/voice/image)
- Original language, translated text
- Detected intent, confidence score
- AI response + fallback indicator
- Handled_by (bot/human)

---

## 📱 Interactive Message Usage

- Use WhatsApp template formats for:

  - Product lists
  - Payment buttons
  - Post-sale follow-ups
  - Catalog browsing

- Avoid overuse of generic quick replies

---

**End of WhatsApp UX Design Guide v1.0**
