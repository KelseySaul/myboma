---
name: MyBoma
description: African-First Property Operating System (Modern Fintech UI)
colors:
  canvas-bg: "#f0f2f7"
  card-bg: "#ffffff"
  primary-rose: "#ff3b5c"
  primary-dark: "#1e293b"
  accent-sky: "#0ea5e9"
  accent-purple: "#8b5cf6"
  accent-emerald: "#10b981"
  accent-amber: "#f59e0b"
  border-subtle: "#e2e8f0"
  text-primary: "#0f172a"
  text-muted: "#64748b"
typography:
  display:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "clamp(1.75rem, 4vw, 2.5rem)"
    fontWeight: 800
    lineHeight: 1.15
  headline:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 700
    lineHeight: 1.3
  body:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
rounded:
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  2xl: "24px"
---

# Design System: MyBoma (Modern Fintech Edition)

## Overview

**Creative North Star: "The Modern Fintech Hub"** (Ref: Asian E-Commerce / SaaS Hub — Xiaodianpu)

A lively, approachable, and human-designed property operating system. Replaces generic dark/monochrome SaaS templates with soft light-gray canvas, floating pure-white rounded cards, pastel-tinted KPI surfaces with vibrant circular icon badges, gradient quick-action onboarding tiles, and clean, legible typography.

**Key Characteristics:**
- **Soft Floating Canvas:** Light blue-gray canvas (`#f0f2f7`) with pure white floating card containers (`rounded-3xl` / `24px`).
- **Pastel Metric Tiles:** Key metric cards tinted in pastel hues (Soft Rose, Soft Sky Blue, Soft Violet, Soft Emerald) with solid vibrant circular icon badges on top-right.
- **Gradient Action Steps:** 3-step onboarding / quick-action tiles with smooth horizontal gradients and white pill `GO` action buttons.
- **Operations Grid:** 2x4 quick-action tool cards with square tinted icon badges and clean two-line descriptions.

---

## Colors

### Canvas & Base Surfaces
- **Canvas Ground:** `#f0f2f7` (Soft slate-blue canvas that makes white cards elevate naturally)
- **Container Card:** `#ffffff` (Pure white with subtle 1px border `border-slate-100` and soft shadow `shadow-[0_2px_12px_rgba(0,0,0,0.03)]`)

### Palette Accents & Metric Roles
- **Vibrant Coral / Rose:** `#ff3b5c` / `#f43f5e` (Revenue & Primary Active Nav)
  - *Pastel tint:* `bg-rose-50/80 text-rose-900 border-rose-100/60`
  - *Circular badge:* `bg-rose-500 text-white`
- **Vibrant Sky / Blue:** `#0284c7` / `#0ea5e9` (Units & Invoices)
  - *Pastel tint:* `bg-sky-50/80 text-sky-900 border-sky-100/60`
  - *Circular badge:* `bg-sky-500 text-white`
- **Vibrant Violet / Purple:** `#7c3aed` / `#8b5cf6` (Tenants & Customers)
  - *Pastel tint:* `bg-purple-50/80 text-purple-900 border-purple-100/60`
  - *Circular badge:* `bg-purple-600 text-white`
- **Vibrant Emerald / Green:** `#059669` / `#10b981` (Vacancies & Deliveries)
  - *Pastel tint:* `bg-emerald-50/80 text-emerald-900 border-emerald-100/60`
  - *Circular badge:* `bg-emerald-500 text-white`

---

## Components

### 1. Step Action Banner
Horizontal floating card featuring an inspiring headline on the left and 3 colorful gradient action cards on the right:
- **Card 1 (Coral):** `bg-gradient-to-r from-rose-500 to-rose-400 text-white rounded-2xl p-4 shadow-sm` with white `GO` pill.
- **Card 2 (Sky):** `bg-gradient-to-r from-blue-500 to-sky-400 text-white rounded-2xl p-4 shadow-sm` with white `GO` pill.
- **Card 3 (Purple):** `bg-gradient-to-r from-purple-500 to-indigo-400 text-white rounded-2xl p-4 shadow-sm` with white `GO` pill.

### 2. Pastel KPI Cards
Metric cards with top-level stats:
```tsx
<div className="rounded-2xl p-5 bg-rose-50/70 border border-rose-100/60 flex items-center justify-between">
  <div>
    <p className="text-xs font-semibold text-slate-600">Payment amount</p>
    <p className="text-2xl sm:text-3xl font-black text-slate-900 tabular-nums">KES 145,000</p>
    <p className="text-[11px] text-slate-400 mt-1">Yesterday KES 120,000</p>
  </div>
  <div className="w-10 h-10 rounded-full bg-rose-500 text-white flex items-center justify-center shadow-sm">
    <Icon />
  </div>
</div>
```

### 3. Operations Assistant Cards
Grid of quick-action cards (`rounded-2xl border border-slate-100 bg-white p-4 flex items-center gap-3.5 hover:shadow-md transition-all shadow-xs`):
- Square tinted icon badge (`w-11 h-11 rounded-xl flex items-center justify-center`).
- Title + subtitle.

### 4. Navigation & Sidebar
- Clean white sidebar with subtle active state pill in Coral / Rose or Indigo.
- Top bar with estate switcher and status pill.
