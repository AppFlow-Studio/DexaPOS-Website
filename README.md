<div align="center">
  <img src="public/dexa-logo.png" alt="DexaPOS Logo" width="120" />
  <h1>DexaPOS — Merchant Web Dashboard</h1>
  <p>The next-generation restaurant point-of-sale platform. Built for speed, reliability, and scale.</p>

  ![Next.js](https://img.shields.io/badge/Next.js-15-black?logo=next.js)
  ![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?logo=typescript)
  ![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green?logo=supabase)
  ![Tailwind CSS](https://img.shields.io/badge/Tailwind-CSS-38bdf8?logo=tailwindcss)
  ![Clerk](https://img.shields.io/badge/Auth-Clerk-purple?logo=clerk)
</div>

---

## Overview

DexaPOS is a modern, multi-tenant Point of Sale platform competing directly with Toast, Square, and Clover. This repository contains the **merchant-facing web dashboard** — the Next.js front end that carriers and merchants use to manage their restaurants, locations, menus, staff, analytics, and hardware.

The platform operates on a three-tier hierarchy:
```
DEXA HQ (internal) → Carriers (resellers/ISOs) → Merchants (restaurant owners)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15 (App Router) |
| Language | TypeScript (strict mode, no `any`) |
| Styling | Tailwind CSS + shadcn/ui |
| Auth | Clerk |
| Backend | Supabase (PostgreSQL + RLS + Edge Functions + Realtime) |
| State | Zustand (client) + TanStack Query (server) |
| Payments | iPOSPays Transact API V3 |
| CDN | Bunny CDN |

---

## Features

- **Multi-location management** — merchants manage multiple restaurant locations from a single dashboard
- **Menu builder** — create and manage menus, categories, items, modifiers, and pricing
- **Dual pricing (cash discount)** — built-in surcharge program compliant with card brand rules
- **Order management** — real-time order tracking across dine-in, takeout, and online channels
- **Online ordering** — multi-tenant subdomain routing with provider-agnostic webhook pipeline
- **Staff management** — roles, permissions, schedules, tip distribution
- **Analytics & reporting** — revenue graphs, filter-based reporting, TSYS bank reconciliation
- **Device management** — terminal registry, health monitoring, hardware lifecycle tracking
- **Inventory** — catalog, vendor management, recipe/ingredient linking, smart PO suggestions
- **Audit logs** — full activity feed with per-merchant and per-location views
- **Support tickets** — merchant-facing submit form with carrier-level visibility

---

## Getting Started

### Prerequisites

- Node.js 20+
- `pnpm` (recommended) or `npm`
- Supabase project (with schema applied)
- Clerk application
- iPOSPays credentials

### Installation
```bash
git clone https://github.com/dexapos/dexapos-website.git
cd dexapos-website
pnpm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your credentials:
```bash
cp .env.example .env.local
```
```env
# Clerk
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# iPOSPays
IPOS_API_KEY=
IPOS_SECRET_KEY=

# Bunny CDN
BUNNY_CDN_STORAGE_ZONE=
BUNNY_CDN_API_KEY=
```

### Development
```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the dashboard.

For multi-tenant online ordering (local subdomain routing):
```bash
# Add to /etc/hosts
127.0.0.1  {slug}.localhost
```

---

## Project Structure
```
app/
├── (auth)/              # Clerk sign-in / sign-up flows
├── (dashboard)/         # Protected merchant dashboard
│   ├── locations/       # Location management
│   ├── menu/            # Menu builder
│   ├── orders/          # Order management
│   ├── staff/           # Staff & scheduling
│   ├── analytics/       # Revenue reports & graphs
│   ├── inventory/       # Catalog, vendors, POs
│   ├── devices/         # Terminal & hardware registry
│   ├── billing/         # Subscription & invoicing
│   └── settings/        # Merchant & location config
├── (carrier)/           # Carrier portal (ISO/reseller)
├── (admin)/             # DEXA HQ internal panel
├── api/                 # Route handlers & webhooks
│   ├── webhooks/        # Online order ingestion (OrderOut, DoorDash, UberEats)
│   └── payments/        # iPOSPays callbacks
└── [slug]/              # Online ordering storefronts (multi-tenant)

components/
├── ui/                  # shadcn/ui base components
├── shared/              # Cross-feature shared components
└── features/            # Feature-scoped components

lib/
├── supabase/            # Supabase client + typed query helpers
├── clerk/               # Auth helpers
└── utils/               # General utilities

services/
└── paymentTerminal.ts   # Hardware abstraction layer (Dejavoo / Castles)
```

---

## Architecture Notes

### Row Level Security

All data access is enforced at the database level via Supabase RLS policies. The three-tier hierarchy (DEXA → Carrier → Merchant) is reflected in every table's policy set. Never bypass RLS with `service_role` in client-facing code.

### Monetary Values

All monetary amounts are stored as `NUMERIC` in `00.00` dollar format — **never integer cents**. Do not use `ROUND(x * 100)::INTEGER` anywhere in this codebase.

### Clerk JWT

User identity is accessed via `auth.jwt()->>'sub'` in RLS policies — not `auth.uid()`.

### Offline-First

The POS tablet app (separate repo) is offline-first. The web dashboard assumes connectivity but uses TanStack Query with appropriate stale times and background refetching for a snappy experience.

---

## Deployment

The web dashboard deploys to [Vercel](https://vercel.com). Connect your GitHub repository to Vercel and configure the environment variables above.
```bash
pnpm build   # production build
pnpm start   # production server
```

---

## Related Repositories

| Repo | Description |
|---|---|
| `dexapos-app` | React Native / Expo POS tablet app (Landi C20 PRO) |
| `dexapos-cfd` | Customer-facing display app (Landi C20SE) |
| `dexapos-kds` | Kitchen display system |
| `dexapos-supabase` | Database migrations, Edge Functions, RLS policies |

---

## License

Private & Proprietary — © 2025 DEXA POS AI LLC, New York. All rights reserved.
