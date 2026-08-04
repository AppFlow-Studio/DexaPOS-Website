# Sprint Note: Bunny Storage Asset Audit

**Date:** 2026-04-28  
**Purpose:** Measure what still blocks full Supabase Storage deprecation after the Bunny CDN migration work.

## Why this audit is necessary

Migrating new uploads to Bunny is not enough.

Bucket deprecation can still break production if either of these are still true:

1. A live DB row still points to a Supabase Storage URL
2. A live feature still depends on a bucket path without storing a public URL

The main example of case `2` is:

- `public.support_ticket_attachments.file_path`

Those rows do not store a public URL, but they still require the `support-attachments` bucket because the app generates signed URLs from that path at runtime.

## What was already migrated before this audit

New uploads already go to Bunny for:

1. CFD images
2. online-store branding assets
3. organization logos during creation
4. merchant onboarding documents
5. W-9 / owner ID / bank-support docs
6. HQ merchant logo replacement

That means this audit is about:

1. remaining active Supabase Storage dependencies
2. historical rows still pointing to old Supabase buckets
3. legacy cleanup fallbacks that cannot be removed yet

## Audit file

Run:

- `supabase/validation/047_bunny_storage_asset_audit.sql`

Use the Supabase SQL editor on staging or production.

## What the SQL checks

### 1. DB fields still pointing at Supabase Storage URLs

The script checks these surfaces:

1. `organizations.imageURL`
2. `organizations.public_metadata.imageURL`
3. `organizations.public_metadata.online_store_w9_form_url`
4. `organizations.public_metadata.w9_form_url`
5. `organizations.public_metadata.online_store_owner_government_id_url`
6. `organizations.public_metadata.owner_government_id_url`
7. `locations.public_metadata.online_store_bank_support_document_url`
8. `locations.public_metadata.bank_support_document_url`
9. `online_store_config.logo_url`
10. `online_store_config.hero_image_url`
11. `online_store_config.favicon_url`
12. `online_store_config.og_image_url`
13. `sites.logo_url`
14. `receipt_templates.logo_url`
15. `cfd_carousel_images.image_url`
16. `cfd_ordering_panel_images.image_url`
17. `online_store_pages.image_url`
18. `online_store_pages.images`
19. `device_catalog.image_url`

### 2. Bucket-backed rows that do not store URLs

The script separately checks:

1. `support_ticket_attachments.file_path`

If this returns rows, the `support-attachments` bucket is still a hard dependency even if no Supabase public URLs remain anywhere else.

### 3. Legacy bucket inventory still present in Supabase Storage

The script checks object counts for:

1. `Organizations-Logos`
2. `store-assets`
3. `support-attachments`
4. `cfd-images`
5. `merchant-logos`

This matters because a bucket may still contain legacy objects even after active code paths have moved to Bunny.

## How to interpret results

### Safe to remove a bucket only when both are true

1. No live DB rows still reference that bucket or a Supabase Storage URL
2. No runtime feature still depends on its object paths

### Current practical meaning by bucket

#### `support-attachments`

This is still an active dependency until the support upload/read path is migrated to Bunny.

If `support_ticket_attachments.file_path` returns rows, do not remove this bucket.

#### `merchant-logos`

New HQ merchant logo replacements now use Bunny.

Any remaining objects or URLs here are legacy and should drain over time or be backfilled.

#### `Organizations-Logos`

Organization/merchant logo creation flows already use Bunny, but legacy cleanup fallback still exists.

If this audit returns rows or objects, keep the fallback until those rows are backfilled or explicitly cleaned.

#### `store-assets`

New online-store asset uploads already use Bunny, but historical rows can still point here.

Do not remove fallback cleanup until those DB references are gone.

#### `cfd-images`

New CFD uploads already use Bunny, but historical delete fallback still exists for old URLs.

Do not remove fallback cleanup until both DB references and storage inventory are clear.

## What is not included in this audit

This audit does **not** treat these as deprecation blockers:

1. old URLs inside `audit_logs.changes` or `audit_logs.metadata`
2. old URLs inside seed files
3. code comments or docs

Those may still be worth cleaning later, but they do not break runtime asset reads once buckets are removed.

## Recommended next move after running the SQL

Use the results to split work into two lists:

### Active dependency fixes

These must be migrated before bucket removal:

1. `support-attachments` upload/read flow

### Legacy backfill and cleanup

These can be handled after active flows are migrated:

1. rows still pointing to Supabase in `organizations`
2. rows still pointing to Supabase in `online_store_config`
3. rows still pointing to Supabase in `sites`
4. rows still pointing to Supabase in CFD tables
5. rows still pointing to Supabase in `online_store_pages`
6. legacy bucket objects with no remaining DB references

## Expected immediate outcome

After this audit you should know:

1. which buckets are still operationally required
2. which DB tables need backfill
3. which legacy delete fallbacks are still justified
4. which buckets can be scheduled for retirement only after support attachment migration
