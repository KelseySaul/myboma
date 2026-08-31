<!-- impeccable:product-schema 1 -->

# Product: MyBoma (Property OS)

## Platform
- **Target:** `adaptive` (Mobile-First Responsive Web / PWA + Capacitor Android & iOS Hybrid)
- **Primary surface:** Cross-device web application and installable mobile apps optimized for touch interfaces and mobile workflows.

## Stack
- **Frontend:** React 19, Vite, TypeScript, Tailwind CSS v4, Shadcn UI (Base-Nova style), Radix UI / Base UI, Lucide Icons, Motion (Framer Motion).
- **Backend & Data:** Express.js API Gateway / BFF (`/api/web`, `/api/mobile`), Drizzle ORM, PostgreSQL (Supabase / Neon Database).
- **Mobile Engine:** Capacitor v8 (Android & iOS wrapper with native plugins like OneSignal and Capgo Updater), Vite PWA.
- **Payments & Integrations:** M-Pesa Daraja API (STK Push & B2C Settlement), Pesapal API 3.0, Stripe Connect, OneSignal push notifications, Sentry monitoring.

## Users & Roles
1. **Landlords & Property Managers:**
   - Manage multi-unit properties, vacancies, leases, and tenant rosters.
   - Track rent collection, send reminders, and manage automated payouts via M-Pesa / Stripe.
   - Coordinate maintenance requests and review property analytics.
2. **Tenants:**
   - View lease terms, payment history, and upcoming dues.
   - Pay rent seamlessly via M-Pesa STK push, Pesapal, or card.
   - Submit maintenance tickets with photos/descriptions and track resolution status.
3. **House Hunters:**
   - Search and filter available rental listings by location, price, and amenities.
   - Inquire and connect with verified property managers.
4. **Super Admins:**
   - System-wide metrics, platform monitoring, tenant/landlord verification, and user impersonation for support.

## Product Purpose
MyBoma is an African-first Property Operating System designed to digitize and simplify the end-to-end rental ecosystem—unifying property discovery, lease administration, and localized rent collection into one intuitive platform.

## Positioning & Differentiators
- **Localized Payments First:** Native integration with East African payment rails (M-Pesa STK Push, Pesapal) alongside international cards (Stripe).
- **Unified Rental Lifecycle:** Connects discovery (house hunting) directly to tenancy, invoicing, payments, and property maintenance without third-party tool hopping.
- **Accessible & Multi-Surface:** Frictionless access via installable PWA or native mobile apps (Capacitor) designed for low-bandwidth stability and mobile-first utility.

## Durable Constraints & Commitments
- **Mobile-First Ergonomics:** UI must be comfortable on standard mobile devices while scaling gracefully to desktop management dashboards.
- **Data Integrity & Security:** All API routes strictly validated with Zod, sanitized inputs, and server-side secret management.
- **Compliance & Trust:** Explicit user consent for terms of use and privacy policy on onboarding; clear payment status tracking and auditable transaction logs.
