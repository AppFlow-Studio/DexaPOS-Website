# Sprint Plan: Bunny CDN Migration

**Sprint focus date:** March 21, 2026  
**Scope:** Migrate file upload and asset serving flows from Supabase Storage to Bunny Storage + Bunny CDN, with all writes proxied through Supabase Edge Functions.

## Current Execution Status

Current implementation stop point:

1. `supabase/functions/cdn-upload/index.ts` added
2. Shared Bunny CDN helper added at `lib/cdn/client.ts`
3. CFD upload/delete flow migrated off direct browser storage writes
4. CFD uploader now restricts selection to JPG/PNG/WEBP and optimizes large images client-side before upload
5. Legacy CFD delete fallback preserved for historical Supabase-hosted URLs
6. Online ordering store-image uploads/deletes now route through Bunny instead of Supabase Storage
7. Legacy online-ordering delete fallback is preserved for historical `store-assets` URLs
8. HQ organization-logo migration is still pending

## Summary

This migration is not just a storage provider swap. The repo currently has three different asset patterns:

1. Server-side uploads to Supabase Storage through `lib/storage/actions.ts`
2. Direct client-side Supabase Storage uploads in the CFD settings page
3. HQ admin organization-logo uploads to the `Organizations-Logos` bucket during carrier and merchant creation

The Bunny migration needs to normalize those flows behind a single server-controlled boundary:

1. Bunny API key lives only in Supabase Edge Function secrets
2. Clients and server actions call the Edge Function, never Bunny directly
3. Database columns keep storing public URLs
4. Bunny Pull Zone URLs become the public asset URLs written into existing text columns

No schema migration is required for the first implementation pass if we continue storing only the CDN URL. Optional `storage_path` columns can come later if deletion tracking becomes too fragile.

## Current Repo State

### Existing upload and delete paths

1. Shared Supabase Storage helper:
- `lib/storage/actions.ts`
- Used today by online ordering image uploads

2. Online ordering image management:
- `app/dashboard/online-ordering/page.tsx`
- Uses `uploadStoreImage(...)` and `deleteStoreImage(...)`
- Currently writes public Supabase Storage URLs into online ordering settings

3. CFD carousel image management:
- `app/dashboard/settings/customer-display/page.tsx`
- Currently uploads directly from the client to Supabase Storage bucket `cfd-images`
- Also deletes directly from that bucket on the client
- This is the highest-risk path because it violates the new Bunny security model most directly

4. HQ organization and merchant logo uploads:
- `app/manage/organizations/actions/clerk-create-organization.ts`
- `app/manage/organizations/actions/create-carrier-merchant-account-admin.ts`
- `app/manage/actions/delete-organization.ts`
- `supabase/functions/clerk-webhooks/index.ts`
- These currently use Supabase Storage bucket `Organizations-Logos`

### Existing URL-backed columns already compatible with CDN URLs

1. Organization logo metadata:
- `organizations.imageURL`

2. Merchant/site assets:
- `sites.logo_url`
- `sites.hero_image_url`
- `sites.og_image_url`
- `menu_items.image`
- `cfd_carousel_images.image_url`

### Important repo-specific constraint

The provided folder structure is merchant-only:

```text
{merchant_id}/logos
{merchant_id}/cfd-images
{merchant_id}/menu-items
{merchant_id}/documents
```

That is not sufficient for this repo because HQ also uploads carrier and merchant organization logos before or outside merchant-scoped dashboard flows.

This repo needs a normalized storage layout such as:

```text
dexa-pos/
|-- merchants/
|   `-- {merchant_id}/
|       |-- logos/
|       |-- cfd-images/
|       |-- menu-items/
|       `-- documents/
`-- organizations/
    `-- {organization_id}/
        `-- logos/
```

This keeps merchant assets tenant-scoped while still covering HQ-managed organization logos cleanly.

## Locked Architecture Decisions

1. Never expose Bunny Storage API credentials to any client or browser code
2. All uploads and deletes go through Supabase Edge Functions
3. Public asset serving uses Bunny Pull Zone URLs only
4. Existing database URL columns remain the source of truth for asset URLs
5. Phase 1 will not require schema changes
6. Phase 1 will remove direct client-side storage writes from the CFD page
7. Merchant upload authorization must not rely only on `staff_profiles`

## Auth Model Normalization

The provided `verifyMerchantAccess(...)` example uses only `staff_profiles`.

That is not safe enough for this repo because merchant access here can come from:

1. Clerk org membership mapped to `members`
2. Merchant owner/admin roles in `members`
3. Staff profiles in some flows, but not all

There is already precedent in this repo that merchant access should not assume `staff_profiles` always exists.

### Required authorization behavior

For merchant-scoped uploads:

1. Read JWT from the Edge Function request
2. Resolve the caller's Clerk org from the token or Supabase auth context
3. Resolve the merchant by `merchants.clerk_org_id`
4. Only allow writes inside that merchant's folder tree
5. Reject any attempt to upload or delete outside that scope

For HQ-scoped organization logo uploads:

1. Require HQ-authenticated caller
2. Validate HQ permission before allowing organization-logo upload/delete
3. Only allow writes into the `organizations/{organization_id}/logos/` tree

## Target Edge Function Design

### Recommendation

Do not hardcode the first function exactly as the generic sample. Normalize it for this repo into a function that supports two upload families:

1. Merchant assets
2. Organization logos

### Proposed function

- `supabase/functions/cdn-upload/index.ts`

### Supported targets

```ts
type UploadTarget =
  | { scope: 'merchant'; merchantId: string; category: 'logos' | 'cfd-images' | 'menu-items' | 'documents' }
  | { scope: 'organization'; organizationId: string; category: 'logos' }
```

### Required behavior

1. Validate content type and size by category
2. Build storage path on the server only
3. Refuse path traversal and client-supplied folder injection
4. Proxy `PUT` and `DELETE` to Bunny Storage
5. Return both:
- `cdnUrl`
- `storagePath`
6. Log useful error detail without leaking secrets

## Shared Client Service Direction

We should keep one shared client/service surface, but adapt it to this repo:

- web dashboard usage
- future RN usage

### Recommendation

Create a shared Bunny CDN service wrapper that calls the Edge Function and returns:

```ts
{
  cdnUrl: string
  storagePath: string
}
```

### Phase 1 note

For web, a base64 payload is acceptable for the current image sizes if we keep limits tight.

Recommended phase-1 limits:

1. Logos / menu item / CFD images: 5MB request ceiling
2. Documents: 10MB ceiling

The generic 10MB-for-everything sample is too loose for routine image flows.

## Migration Scope By Surface

### Phase 1: Foundation

1. Add Bunny secrets to Supabase Edge Functions
2. Add `cdn-upload` Edge Function
3. Add shared CDN client helper in the app codebase
4. Add path-building helpers and URL parsing helpers
5. Add validation and logging

### Phase 2: Merchant asset migration

Migrate the currently active merchant-facing upload flows first.

1. Online ordering image uploads
- replace `lib/storage/actions.ts` Supabase Storage usage
- affected file:
  - `app/dashboard/online-ordering/page.tsx`

2. CFD carousel images
- remove direct browser Supabase Storage upload/delete
- affected file:
  - `app/dashboard/settings/customer-display/page.tsx`

This phase gives immediate security improvement and removes the current direct client storage writes.

### Phase 3: HQ organization logo migration

Migrate HQ-side org logo flows.

Affected files:

1. `app/manage/organizations/actions/clerk-create-organization.ts`
2. `app/manage/organizations/actions/create-carrier-merchant-account-admin.ts`
3. `app/manage/actions/delete-organization.ts`
4. `supabase/functions/clerk-webhooks/index.ts`

This phase requires the organization-path extension noted above.

### Phase 4: Optional menu item upload productization

The repo already stores menu item image URLs, but the current menu UI is still primarily URL-entry based rather than a dedicated uploader.

Affected areas to audit when this phase starts:

1. `components/dashboard/menu/ItemFormSheet.tsx`
2. `components/dashboard/menu/NewEditItemFormSheet.tsx`

This should only be pulled into the first implementation batch if you want to build the uploader UX at the same time.

## Implementation Order

1. Edge Function secrets and Bunny config
2. Shared CDN helper layer
3. CFD page migration
4. Online ordering page migration
5. HQ organization logo migration
6. Optional URL cleanup and old storage removal scripts

This order is intentional:

1. CFD is currently the least secure path because it uploads directly from the client
2. Online ordering already has a shared server helper and is easier to refactor cleanly
3. HQ logo migration needs path normalization for organizations and should come after the core proxy is stable

## Affected Files For Phase 1 and 2

### New

1. `docs/SPRINT-2026-03-21-BUNNY-CDN-MIGRATION-PLAN.md`
2. `supabase/functions/cdn-upload/index.ts`
3. `lib/cdn/client.ts` or `services/cdn.ts`
4. Optional shared file helpers under `lib/cdn/*`

### Existing likely to change

1. `lib/storage/actions.ts`
2. `app/dashboard/online-ordering/page.tsx`
3. `app/dashboard/settings/customer-display/page.tsx`

## Deletion Strategy

### Phase 1

Deletion can work by parsing the Bunny CDN URL back into a `storagePath`.

That is acceptable for the first pass because:

1. current DB columns already store URLs only
2. we do not need a schema migration to get started

### Later hardening option

If deletion reliability becomes a concern, add explicit `cdn_storage_path` columns later for the assets that are frequently replaced.

## Rollout and Backfill Strategy

1. New uploads should start writing Bunny CDN URLs immediately after the relevant surface is migrated
2. Existing Supabase Storage URLs can continue rendering during transition
3. Backfill/migration of legacy assets should be a separate controlled pass, not part of the initial code switch
4. Old delete logic must not assume every historical URL is Bunny-backed

## Acceptance Criteria For The First Implementation Pass

1. No Bunny credentials exist in browser code
2. CFD uploads and deletes no longer talk directly to Supabase Storage from the client
3. Online ordering uploads use Bunny via the Edge Function proxy
4. New asset URLs written into the DB are Bunny Pull Zone URLs
5. Existing legacy Supabase-hosted URLs still render without regression
6. Delete flows handle Bunny URLs correctly and fail safely for legacy URLs
7. CFD uploader only accepts supported image formats and optimizes large images before upload

## Current Acceptance State

1. `1`: satisfied by design in the current slice
2. `2`: implemented in the current slice
3. `3`: implemented in the current slice
4. `4`: implemented for CFD in the current slice
5. `5`: preserved in the current slice for both CFD and online ordering
6. `6`: implemented for CFD and online ordering in the current slice
7. `7`: implemented in the current slice

## Review Items Before Implementation

1. Do we want organization logos included in the first migration batch, or only merchant assets first?
2. Do we want to keep the first pass URL-only, or add `storagePath` columns now?
3. Do you want menu item image upload UX in scope now, or only the currently active upload flows?
4. Is the canonical Bunny folder structure acceptable if normalized to include `organizations/{organization_id}/logos/` in addition to merchant folders?

## Recommendation

Start with the smallest production-safe slice:

1. Build `cdn-upload`
2. Migrate CFD uploads/deletes
3. Migrate online ordering uploads/deletes
4. Stop and verify
5. Then migrate HQ organization-logo flows in a second pass

That gets the biggest security win first and avoids overloading the first implementation pass with HQ logo edge cases and historical backfill work.

## Actual Stop Point Reached

We are currently stopped after step `4`.

Next recommended action:

1. Verify online-ordering upload/delete against Bunny
2. Verify legacy online-ordering `store-assets` delete fallback still works
3. Then migrate HQ organization-logo flows as the next slice
