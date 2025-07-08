# Kadai WhatsApp UX Design Prompts

**Version:** 1.0
**Date:** June 8, 2025
**Author:** Gemini (AI Assistant, in collaboration with User)
**Purpose:** Provide structured prompts to guide an AI UX agent in building conversational flows for WhatsApp experiences in Kadai

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

**End of WhatsApp UX Design Prompts v1.0**
