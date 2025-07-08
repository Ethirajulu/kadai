# Kadai UX Design Prompts for AI Agent

**Version:** 1.0
**Date:** June 8, 2025
**Author:** Gemini (AI Assistant, in collaboration with User)
**Purpose:** Provide detailed, structured prompts to guide an AI UX agent in generating interface designs for Kadai's seller dashboard.

---

## 📌 Guidelines for the AI Agent

- Use the style rules from `Kadai UX Styleguide`
- All components should be Tailwind + Shadcn-compatible
- Prioritize mobile responsiveness and accessibility
- Always provide labels, tooltips, and visual feedback
- Minimize cognitive load: group related info, use whitespace generously

---

## 🧭 App Shell Layout

**Prompt:**

> Design a responsive application shell with a fixed sidebar (collapsible on mobile), a topbar for alerts and profile, and a content panel. Use Tailwind and Shadcn components. Sidebar should include icons and labels for: Dashboard, Products, Orders, Broadcasts, Quick Replies, Analytics, Conversations, Settings.

---

## 🧾 Dashboard Page

**Prompt:**

> Create a dashboard page with 4 stat cards (New Orders, Leads, Pending Payments, Low Stock). Include a horizontal section with 2 mini charts (Orders Over Time and Product Views). At the bottom, show a scrollable list of recent AI handoff events or confidence issues with icons.

---

## 📦 Products Page

**Prompt:**

> Build a product management page with a filterable data table. Columns: Product Name, Price, Stock, AI Confidence %, Last Updated. Include an “Add Product” button that opens a modal with manual input or voice upload (simulate voice-to-text preview inside modal). Support color/size variants using multi-select.

---

## 📥 Orders Page

**Prompt:**

> Generate an orders list with table view. Columns: Order ID, Buyer, Amount, Status, Created At. Clicking a row opens a drawer with full order details including timeline (created, paid, shipped), item list, total, and invoice download button.

---

## 📣 Broadcast Page

**Prompt:**

> Create a broadcast composer UI. Let the seller pick a WABA template or free-text message. Allow preview on right side. Include scheduling options (date/time picker), and a list of previously sent broadcasts with delivery stats.

---

## 💬 Quick Replies

**Prompt:**

> Build a quick reply management view. List saved replies with label and reply text. Add new reply via modal. Include auto-suggested trigger phrases.

---

## 📈 Analytics Page

**Prompt:**

> Show a dashboard with: sales over time (line chart), FAQ hits (bar), LLM/STT accuracy (radial or badge-style indicators). All charts should be mobile-responsive and match design theme.

---

## ⚙️ Settings Page

**Prompt:**

> Design a settings page with sections: Language Preferences, Notification Settings, WhatsApp Template Sync, Human Handoff Config (toggle + email field), and Support Contact Info.

---

## 🛠️ Reusable Components (For Reference)

- `StatCard`: metric label, value, optional icon, background variant
- `DataTable`: sortable, searchable, paginated, with `react-table`
- `Modal`: form inputs, file/voice upload area, footer with action buttons
- `Drawer`: slide-out panel for order details
- `Chart`: line or bar using `recharts` or `@nivo`

---

**End of UX Prompts for AI Design Agent v1.0**
