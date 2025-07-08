# Kadai UX Style Guide & UI Principles

**Version:** 1.0
**Date:** June 8, 2025
**Author:** Gemini (AI Assistant, in collaboration with User)
**Purpose:** Define the UI/UX theme, layout, and component standards for the seller dashboard (Next.js + Tailwind + Shadcn)

---

## 🎨 1. Design Language & Theme

| Element           | Recommendation                                                               |
| ----------------- | ---------------------------------------------------------------------------- |
| **Overall Theme** | Clean, modern UI with soft shadows, large touch targets, and neutral tones   |
| **Font**          | `Inter` or `Satoshi` (legible, modern, sans-serif)                           |
| **Primary Color** | Deep Indigo or Emerald — subtle but professional (`#3C4CAD` or `#10B981`)    |
| **Secondary**     | Muted neutrals (`#F5F5F5`, `#E5E7EB`, `#9CA3AF`) with soft contrast          |
| **Accent**        | Bright Blue or Lime for active states and CTA buttons (`#3B82F6`, `#84CC16`) |
| **Border Radius** | Large and consistent: `rounded-2xl` (24px), `rounded-lg` (12px) for inputs   |
| **Elevation**     | Subtle: use Tailwind’s `shadow-sm` and `shadow-md` only where needed         |
| **Spacing**       | Generous padding/margin: `px-6`, `py-4`, `gap-4+`                            |
| **Iconography**   | Use `lucide-react` icons with accompanying labels                            |

---

## 🧭 2. Layout Architecture

### 📐 Structure: 3-Layer App Shell

```
Sidebar (collapsible) | Topbar | Content Pane
```

### 🌟 Sidebar

- Sections: Dashboard, Products, Orders, Broadcasts, Conversations, Settings
- Icons + labels
- Collapsible for mobile view (via Sheet or Popover)

### 🌤️ Topbar

- Business name/logo left-aligned
- Language toggle
- Alerts badge icon
- Seller profile dropdown

---

## 📄 3. Page-by-Page UX Breakdown

### Dashboard

- Stats: New Orders, Leads, Pending Payments, AI Issues
- Mini-charts: Orders over time
- Top AI activity logs

### Products

- Table with filters, stock quick edit
- “Add via Voice” modal with NLP/STT preview
- Variant support (size, color)
- Confidence badge on AI-ingested items

### Orders

- Status timeline per order
- Customer info, payment status
- One-click invoice download

### Broadcasts

- Template picker + preview
- Segment targeting (e.g. recent buyers)
- Schedule and review past broadcasts

### Quick Replies

- Template list
- Add/edit form with tag triggers

### Analytics

- Sales chart
- FAQ usage stats
- STT/LLM quality indicators

### Settings

- Language prefs
- WABA sync
- Notification config
- Handoff rules

---

## 🪟 4. Component Standards (Shadcn + Tailwind)

| Component     | Design Detail                                                                 |
| ------------- | ----------------------------------------------------------------------------- |
| **Card**      | `rounded-2xl`, `bg-white`, `shadow-md`, `p-4`                                 |
| **Button**    | `variant=default`, `rounded-xl`, `leading-tight`, icon support, loading state |
| **Input**     | `py-2 px-4`, `rounded-lg`, placeholder for hint text                          |
| **DataTable** | Use `@tanstack/react-table`, Shadcn's table style, filters + pagination       |
| **Dialog**    | Modal for Add/Edit (Product, Broadcast, Replies)                              |
| **Toast**     | Action confirmations with top-right placement, auto-dismiss                   |

---

## 🌐 5. Responsiveness

- Fully mobile optimized
- Sidebar collapses
- Tables collapse to stacked cards
- Floating CTA buttons for mobile

---

## 🧠 6. Accessibility & Ease-of-Use

- Descriptive labels
- Voice input preview
- Tooltips for action icons
- Action buttons use human-readable labels (“Send Broadcast” instead of “Submit”)

---

**End of UX Style Guide v1.0**
