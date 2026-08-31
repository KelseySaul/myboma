---
name: MyBoma
description: African-First Property Operating System
colors:
  primary: "oklch(0.205 0 0)"
  primary-foreground: "oklch(0.985 0 0)"
  neutral-bg: "oklch(1 0 0)"
  neutral-fg: "oklch(0.145 0 0)"
  card-bg: "oklch(1 0 0)"
  card-border: "oklch(0.922 0 0)"
  brand-indigo: "#4f46e5"
  success-emerald: "oklch(0.65 0.15 150)"
  warning-amber: "oklch(0.75 0.15 80)"
  destructive-red: "oklch(0.6 0.15 20)"
typography:
  display:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "clamp(2rem, 5vw, 3rem)"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.015em"
  body:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "0.02em"
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  2xl: "16px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    rounded: "{rounded.xl}"
    padding: "8px 14px"
  button-outline:
    backgroundColor: "{colors.neutral-bg}"
    textColor: "{colors.neutral-fg}"
    rounded: "{rounded.xl}"
    padding: "8px 14px"
---

# Design System: MyBoma

## Overview

**Creative North Star: "The Sovereign Homestead"**

MyBoma is a high-trust digital estate ledger engineered for property owners, managers, and tenants across Africa. The aesthetic reflects structural dependability, financial clarity, and institutional trust. Rather than relying on ephemeral SaaS trends, the interface embodies the solidity of real estate governance: crisp white/slate planes, sharp 1px gridlines, and purposeful emerald and indigo accents.

The visual density is balanced for dual environments: touch-first accessibility on mobile screens for on-site managers and tenants paying via M-Pesa, paired with structured data grids on desktop management portals.

**Key Characteristics:**
- **High-Trust Financial Clarity:** Prominent, unambiguous numbers, clear transaction states, and auditable ledger rows.
- **Structured Surface Hierarchy:** Clean separation between navigation, analytical summaries, and actionable operational lists.
- **Adaptive Precision:** Fluid touch targets on mobile with dense data presentation on widescreen dashboards.

---

## Colors

The palette is anchored by deep structural slates, crisp white background planes, and distinct functional colors for financial flow and status signaling.

### Primary
- **Deep Slate Ground** (`oklch(0.205 0 0)` / `#0f172a`): Used for primary action buttons, dark headers, active navigation pills, and authoritative branding elements.

### Brand Accent
- **Indigo Action** (`#4f46e5`): Reserved for primary calls-to-action, system links, highlighted feature cards, and brand badges.

### Semantic Status
- **Financial Emerald / Success** (`oklch(0.65 0.15 150)` / `#10b981`): Signals completed payments, positive cash flow, active leases, and verified statuses.
- **Warning Amber** (`oklch(0.75 0.15 80)` / `#f59e0b`): Signals pending transactions, overdue notices, and maintenance requests in review.
- **Destructive Red** (`oklch(0.6 0.15 20)` / `#e11d48`): Signals failed payments, emergency maintenance, and critical lease expirations.

### Neutral
- **Canvas Base** (`oklch(1 0 0)` / `#ffffff`): Main application canvas.
- **Subtle Surface** (`oklch(0.97 0 0)` / `#f8fafc`): Sidebar grounds, table headers, and secondary card containers.
- **Crisp Border** (`oklch(0.922 0 0)` / `#e2e8f0`): 1px structural dividers framing containers and interactive controls.
- **Muted Text** (`oklch(0.556 0 0)` / `#64748b`): Descriptive labels, metadata, and timestamps.

### Named Rules
- **The Financial Green Rule:** Emerald is strictly reserved for verified revenue, completed transactions, and positive compliance. It is never used as decorative filler.
- **The 10% Brand Rule:** High-chroma Indigo is restricted to primary interactions and hero focal points, maintaining a calm, utilitarian workspace.

---

## Typography

**Display & Heading Font:** `Inter` (weights: 600, 700, 800) with `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` fallback.  
**Body Font:** `Inter` (weights: 400, 500) with crisp tabular figures for currency and date alignment.

**Character:** Clean, objective, and legible in low-light mobile environments. Currency amounts (e.g., `KES 45,000` or `$350`) consistently use medium/semi-bold weight with tabular alignment.

---

## Layout

- **Mobile First & Safe Areas:** Strict handling of mobile notch and bottom home indicators using `--sat` (`env(safe-area-inset-top)`) and `--sab` (`env(safe-area-inset-bottom)`).
- **Navigation:** Persistent sticky top navigation with integrated role switchers and impersonation awareness (`--app-header-offset`). Collapsible sidebars on desktop transitioning to sliding drawer navigation on mobile.
- **Responsive Grids:** 1-column layout on mobile viewports (<640px), transitioning to 2-column overview cards (md: 768px) and 3/4-column analytical KPI grids on desktop (lg/xl).

---

## Elevation & Depth

- **Surface Philosophy:** Subtle Layered Surfaces. Depth is communicated through 1px border definition and subtle tint contrasts rather than heavy, blurry drop shadows.
- **Elevation Steps:**
  - `Flat/Surface 0`: Canvas background (`bg-background`).
  - `Card/Surface 1`: `bg-card border border-border shadow-xs` for grouped items and tables.
  - `Overlay/Surface 2`: Dialogs, bottom sheets, and dropdown menus with `backdrop-blur-md` and `shadow-lg`.

---

## Shapes

- **Interactive Elements (Buttons, Inputs, Selects):** Rounded-xl (`12px` / `0.75rem`) for comfortable, ergonomic thumb tapping.
- **Containers & Modals:** Rounded-2xl (`16px` / `1rem`) for cards, dialog surfaces, and dashboard metric containers.
- **Badges & Status Pills:** Rounded-full (`9999px`) for compact state indicators.

---

## Components

- **Button:**
  - `default`: Deep slate solid with active micro-scale press (`active:scale-[0.98]`).
  - `outline`: White ground with 1px slate-200 border and subtle hover tint.
  - `secondary`: Soft slate-100 neutral for auxiliary actions.
  - `destructive` / `success` / `indigo`: Specific colored variants for high-impact interactions.
- **StatCard:** Compact metric card featuring an icon badge, primary numeric value, trend indicator pill, and contextual subtitle.
- **EmptyState:** Clean empty state illustration/icon, clear instructional heading, supportive copy, and a primary CTA.
- **ImpersonationBanner:** Persistent amber top banner fixed during super admin account impersonation.

---

## Do's and Don'ts

### Do's
- **DO** use tabular numerals (`tabular-nums`) when rendering currency and financial sums.
- **DO** honor mobile safe areas (`--sat`, `--sab`) on every full-height view.
- **DO** provide clear confirmation dialogs before executing destructive or irreversible payment operations.
- **DO** preserve crisp 1px borders on light and dark surfaces for container definition.

### Don'ts
- **DON'T** use multi-color gradient text or gratuitous purple/pink neon glows.
- **DON'T** nest cards within cards more than 2 layers deep.
- **DON'T** hide critical transaction statuses behind ambiguous tooltip icons without accessible text labels.
- **DON'T** use pure `#000000` black or un-tinted gray on dark mode surfaces.
