# Technology Stack

**Analysis Date:** 2025-01-25

## Languages

**Primary:**
- TypeScript 5 - All application and configuration files
- React 19.1.0 - UI components and client-side logic
- JavaScript/ECMAScript - Runtime language

**Secondary:**
- SQL - Supabase migrations and database operations
- Deno - Supabase Edge Functions runtime

## Runtime

**Environment:**
- Node.js (no specific version pinned; see package.json engines)

**Package Manager:**
- npm (lockfile: `package-lock.json` present)

## Frameworks

**Core:**
- Next.js 15.5.9 - Full-stack React framework with App Router and Server Components
- React 19.1.0 - UI library for components

**UI & Styling:**
- Tailwind CSS 4 - Utility-first CSS framework
- Shadcn/UI - Component library built on Radix UI
- Radix UI (multiple packages: dialog, dropdown, select, tabs, etc.) - Unstyled accessible components

**Forms & Validation:**
- React Hook Form 7.65.0 - Form state management
- Zod 3.25.76 - TypeScript-first schema validation
- @hookform/resolvers 3.10.0 - Bridge between React Hook Form and Zod

**Data Management:**
- TanStack Query (React Query) 5.90.2 - Server state management
- TanStack Table 8.21.3 - Headless UI for data tables
- Zustand 5.0.9 - Lightweight client state management

**Testing:**
- Vitest 4.0.16 - Unit/integration test runner
- Node environment for tests

**Build/Dev:**
- Next.js with Turbopack - Fast bundler for development and production
- TypeScript 5 - Type checking
- ESLint (Next.js config-based) - Linting via `next lint`

**UI Effects & Interactions:**
- Motion 12.23.24 - Animation library
- @dnd-kit (core, sortable, utilities) - Drag-and-drop functionality
- @use-gesture/react 10.3.1 - Gesture handling
- react-modal-sheet 5.2.1 - Modal component
- react-dropzone 14.3.8 - File upload handling

**Charts & Visualization:**
- Recharts 2.15.4 - React charting library

**Utilities:**
- date-fns 4.1.0 - Date manipulation
- uuid 13.0.0 - UUID generation
- bcryptjs 3.0.3 - Password hashing (for payment terminal credentials)
- clsx 2.1.1 - Conditional className joining
- class-variance-authority 0.7.1 - Component variant management
- tailwind-merge 3.3.1 - Tailwind class merging
- cmdk 1.1.1 - Command palette component
- Lucide React 0.545.0 - Icon library
- Tabler Icons React 3.35.0 - Alternative icon library
- sonner 2.0.7 - Toast notifications
- next-themes 0.4.6 - Theme management
- react-day-picker 8.10.1 - Date picker component

## Authentication & Authorization

**Frontend Auth:**
- Clerk (@clerk/nextjs 6.33.3) - Session management, authentication UI, organization/membership
- @clerk/backend 2.18.0 - Server-side Clerk operations (webhooks, user/org operations)

## Database & Backend

**Primary Database:**
- PostgreSQL (via Supabase)

**Supabase Integration:**
- @supabase/supabase-js 2.75.0 - Client library for Supabase
- @supabase/ssr 0.7.0 - SSR utilities for Clerk + Supabase integration
- Supabase Edge Functions (Deno runtime) at `supabase/functions/clerk-webhooks/`

**Storage:**
- Supabase Storage - File/image storage for store assets (bucket: `store-assets`)

## Configuration

**Environment:**
- Next.js env variables (NEXT_PUBLIC_* prefixed for client-side)
- Environment file: `.env` (git-tracked with sensitive values during development)

**Key Configuration Variables:**
```
NEXT_PUBLIC_SUPABASE_URL          # Supabase project URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY # Anon key for browser access
SUPABASE_SERVICE_ROLE_KEY         # Service role key for server operations
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY # Clerk publishable key
CLERK_SECRET_KEY                  # Clerk secret key
NEXT_PUBLIC_CLERK_SIGN_IN_URL     # Redirect URLs
NEXT_PUBLIC_CLERK_SIGN_UP_URL
NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL
NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL
NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL
NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL
DEXA_POS_INTERNAL_TEAM_ID         # Clerk org ID for Dexa HQ admin
NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID
NEXT_PUBLIC_DEJAVOO_SPIN_API      # Payment processor API (Dejavoo)
```

**Build Configuration:**
- `next.config.ts`: Enables Turbopack, ignores ESLint/TypeScript errors during build, allows remote image patterns
- `tsconfig.json`: ES2017 target, strict mode, module resolution via bundler
- `.eslintrc.json`: Extends `next/core-web-vitals`

**Testing Configuration:**
- `vitest.config.ts`: Node environment, uses process.env for configuration

## Platform Requirements

**Development:**
- Node.js (no specific version enforced; npm lockfile ensures consistency)
- Git for version control
- Supabase local development environment (optional, via Docker)

**Production:**
- Deployment platform: Vercel (inferred from Next.js 15 and Turbopack emphasis)
- PostgreSQL database hosting: Supabase
- File storage: Supabase Storage
- Authentication: Clerk (SaaS)

## Key Dependencies Summary

| Package | Version | Purpose |
|---------|---------|---------|
| next | 15.5.9 | Framework |
| react | 19.1.0 | UI library |
| typescript | 5 | Type checking |
| @clerk/nextjs | 6.33.3 | Auth, sessions |
| @supabase/supabase-js | 2.75.0 | Database client |
| @tanstack/react-query | 5.90.2 | Server state |
| zustand | 5.0.9 | Client state |
| zod | 3.25.76 | Validation |
| react-hook-form | 7.65.0 | Forms |
| tailwindcss | 4 | Styling |
| vitest | 4.0.16 | Testing |

---

*Stack analysis: 2025-01-25*
