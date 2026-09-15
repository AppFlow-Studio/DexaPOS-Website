# Kiosk Logo Upload, HQ Brand Fallback, and Menu Toggle Latency

## Source

- Reported directly by the user on 2026-09-15 with screenshots of the kiosk
  asset editor, the HQ sidebar, and the merchant menu list.
- Notion title: pending connector reconnection
- Notion page ID: pending connector reconnection
- Notion URL: pending connector reconnection

## Problem

Three related website defects should ship in one pull request:

1. Uploading a kiosk logo reports `Edge Function returned a non-2xx status
   code`. The reported environment appears to be running a `cdn-upload`
   version that does not include `kiosk` in its runtime merchant-category
   allowlist even though the TypeScript category type includes it.
2. When the HQ organization logo URL is missing or cannot load, the top-left
   admin brand renders a broken image instead of the Dexa shield fallback.
3. The menu active-status switch remains visually unchanged for roughly four
   seconds while its server action reads the old state, writes the new state,
   waits for audit logging, and refetches the menu list.

## Scope

- Keep the CDN category type and runtime allowlist in one shared contract and
  cover kiosk image/logo eligibility with automated tests.
- Fall back to the Dexa shield immediately when the HQ logo URL fails to load.
- Make menu activation an explicit set operation rather than a read-then-toggle
  operation.
- Update menu state optimistically, disable repeat submissions for that menu,
  roll back on failure, and reconcile from the server in the background.
- Apply the latency behavior to both the menu list and menu settings view.

## Acceptance Criteria

- PNG and SVG kiosk logos pass the CDN upload policy for merchant scope.
- Kiosk uploads remain merchant-scoped and reject unknown categories.
- A failed HQ organization image never leaves a broken image glyph in the
  sidebar; the shield fallback is visible instead.
- A menu switch changes visually on the same interaction frame rather than
  waiting for the network response.
- Failed menu updates restore the previous state and display an error.
- A menu cannot submit overlapping active-state writes.
- Successful menu updates reconcile cached data without blocking the control
  on query invalidation.

## Deployment Requirements

- Deploy `supabase/functions/cdn-upload/index.ts` after merging. The kiosk
  upload fix is not live merely because its source is merged.
- No database migration is required.
- No new environment variables are required.

## Verification

- Automated tests for CDN category policy and HQ image failure fallback.
- Type-check and lint all changed TypeScript/TSX files.
- Manual QA in preview:
  - Upload PNG and SVG kiosk logos and save/publish the profile.
  - Force an invalid HQ image URL and confirm the shield fallback.
  - Toggle a menu active/inactive and confirm immediate movement, persistence
    after refetch, and rollback when the action is forced to fail.
