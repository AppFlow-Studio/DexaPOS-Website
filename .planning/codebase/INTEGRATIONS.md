# External Integrations

**Analysis Date:** 2025-01-25

## APIs & External Services

**Payment Processors:**
- Dejavoo (Spin POS API) - Point of sale payment processing
  - SDK/Client: Native fetch/HTTP calls via middleware
  - Endpoint: `NEXT_PUBLIC_DEJAVOO_SPIN_API` (https://test.spinpos.net in dev)
  - Documentation: Referenced in `app/dashboard/actions/payment-terminals.ts`

- PAX - Alternative payment terminal support (PAX devices)
  - Integration: Through generic payment terminal abstraction layer
  - Credentials: TPN, Auth Key, Register ID stored in database

## Data Storage

**Databases:**
- PostgreSQL (Supabase-hosted)
  - Connection: Via `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
  - Client: `@supabase/supabase-js` (v2.75.0)
  - Server Client: `@supabase/ssr` for Next.js SSR compatibility
  - Authentication: Clerk JWT tokens used as access tokens to Supabase
  - Row Level Security (RLS): Enabled for tenant isolation

**File Storage:**
- Supabase Storage - Local filesystem alternative
  - Bucket: `store-assets` for merchant assets (logos, banners, etc.)
  - Upload/Delete actions: `lib/storage/actions.ts`
  - Supported types: PNG, JPEG, GIF, WebP (max 5MB per file)
  - Access: Public URLs for served images

**Caching:**
- Client-side: TanStack Query caches server state
- Session storage: Zustand for UI state persistence
- Browser storage: Zustand with localStorage for floor-plan and cart data

## Authentication & Identity

**Auth Provider:**
- Clerk - Primary authentication service
  - SDKs: `@clerk/nextjs` (browser) + `@clerk/backend` (server)
  - Session Management: Clerk session tokens exchanged for Supabase JWT
  - Organization Management: Clerk orgs for Carriers and Merchants
  - Public Metadata: Custom data attached to Clerk users/orgs (merchant_type, carrier_id, level_type, etc.)

**Auth Flow:**
1. User signs in via Clerk (email/password)
2. Clerk webhook handler syncs user to Supabase `users` table
3. Clerk session token used to create Supabase access token
4. Supabase RLS policies enforce data isolation based on Clerk user context

**Webhook Integration:**
- Endpoint: `supabase/functions/clerk-webhooks/index.ts` (Supabase Edge Function)
- Events handled:
  - `user.created` - Sync new user to Supabase
  - `user.updated` - Sync user profile changes
  - `user.deleted` - Remove user from Supabase
  - `organization.created` - Create Carrier/Merchant records
  - `organization.updated` - Sync org changes
  - `organization.deleted` - Clean up org data and logos
  - `organizationMembership.created` - Create staff profiles and member records
  - `organizationMembership.updated` - Update member info
  - `organizationInvitation.accepted` - Mark location invites as accepted
- Signature Verification: Uses `@clerk/backend/webhooks` verifyWebhook
- Secret: `CLERK_WEBHOOK_SECRET` (configured in Supabase environment)

## Monitoring & Observability

**Error Tracking:**
- None detected (no Sentry, LogRocket, etc.)

**Logs:**
- Browser: `console.log/error` for debugging
- Server: Console logs from Next.js server actions and Supabase Edge Functions
- Audit Logging: Custom audit logs stored in `audit_logs` table via `LogAuditEvent` action

## CI/CD & Deployment

**Hosting:**
- Vercel (inferred from Next.js 15 Turbopack and modern Next.js features)

**CI Pipeline:**
- None explicitly configured in repository

**Build Configuration:**
- Next.js handles build via Turbopack
- ESLint errors ignored during build (`eslint.ignoreDuringBuilds: true`)
- TypeScript errors ignored during build (`typescript.ignoreBuildErrors: true`)

## Environment Configuration

**Required Environment Variables:**

**Supabase:**
- `NEXT_PUBLIC_SUPABASE_URL` - Supabase project URL
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` - Anon public key
- `SUPABASE_SERVICE_ROLE_KEY` - Service role key (server-only, bypasses RLS)

**Clerk:**
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` - Public key for browser
- `CLERK_SECRET_KEY` - Secret key for server operations
- `CLERK_WEBHOOK_SECRET` - Webhook signature verification (for Supabase Edge Function)
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL` - Sign-in redirect
- `NEXT_PUBLIC_CLERK_SIGN_UP_URL` - Sign-up redirect
- `NEXT_PUBLIC_CLERK_SIGN_IN_FORCE_REDIRECT_URL` - Post-sign-in redirect
- `NEXT_PUBLIC_CLERK_SIGN_UP_FORCE_REDIRECT_URL` - Post-sign-up redirect
- `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` - Fallback redirect
- `NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL` - Fallback redirect

**Organization/System:**
- `DEXA_POS_INTERNAL_TEAM_ID` - Clerk org ID for Dexa HQ admin (org_33z36QibAMZy6kc2xZNYmDl5duh)
- `NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID` - Same (public version)

**Payment Processing:**
- `NEXT_PUBLIC_DEJAVOO_SPIN_API` - Dejavoo API endpoint (https://test.spinpos.net)

**Secrets Location:**
- `.env` file (local development)
- Vercel environment variables (production)
- Supabase project settings (for edge function secrets)

## Webhooks & Callbacks

**Incoming Webhooks:**

**Clerk Webhooks:**
- Endpoint: `POST https://{vercel-domain}/functions/v1/clerk-webhooks` (Supabase Edge Function)
- Triggers: User/org lifecycle events from Clerk
- Authentication: Signature verification via `CLERK_WEBHOOK_SECRET`
- Processing: Syncs Clerk data to Supabase PostgreSQL

**Outgoing Webhooks:**
- None detected (no outbound webhook triggers implemented)

## Cross-Tenant Isolation

**Row Level Security (RLS):**
- Enforced at Supabase database level
- Policies filter data based on:
  - `merchant_id` - Merchant ownership
  - `carrier_id` - Carrier ownership
  - `organization_id` - Clerk org association
  - Role-based access (via `members` table role)

**Middleware Routing:**
- `middleware.ts` enforces route isolation:
  - `/manage/*` - Dexa HQ admin routes (only org_33z36QibAMZy6kc2xZNYmDl5duh)
  - `/dashboard/*` - Merchant routes
  - `/sites/*` - Public storefront routes

## Database Schema Integrations

**Key Tables (Relevant to Integrations):**
- `users` - Synced from Clerk (id, first_name, last_name, email, avatar_url, public_metadata)
- `organizations` - Synced from Clerk (id, name, type: carrier/merchant)
- `carriers` - Carrier-specific data (linked to Clerk org)
- `merchants` - Merchant-specific data (linked to Clerk org and carrier)
- `staff_profiles` - Staff members (account_type: 'clerk' or 'db_only', pin_code for POS tablet)
- `members` - Organization membership (links user + organization + role)
- `location_members` - Location-specific staff assignments (hourly_rate, employment_type, pin_code)
- `payment_terminals` - Payment terminal credentials (Dejavoo/PAX configs)
- `audit_logs` - Audit trail of admin actions

---

*Integration audit: 2025-01-25*
