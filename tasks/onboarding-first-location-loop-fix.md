# WEB BUG — Onboarding First-Location wizard loops back to Step 1 on completion

**Notion:** https://app.notion.com/p/WEB-BUG-Onboarding-First-Location-wizard-loops-back-to-Step-1-on-completion-browser-Back-trapped-3828280c1b1d814d8462f4fd65e05583
**Owner:** Ali Awdi · **Priority:** High · **Branch:** aliawdi-dev
**Status:** Plan only — implementation deferred (coordinate w/ Haidar per ticket).

## Root cause (corrected vs. ticket hypothesis)
The ticket assumes a **middleware guard** keyed on `locations.onboarding_completed`. Neither is true:
- `middleware.ts` has **no** onboarding guard.
- The wizard already sets `onboarding_completed: true` / `onboarding_step: 7` on create, already
  invalidates the locations query, and already navigates with `router.replace('/dashboard')`.

The only onboarding redirect is in `app/dashboard/layout.tsx:1136-1148`, and it gates on
**`locations.length === 0`** (a count), not on `onboarding_completed`.

The loop is a **stale-cache race**:
1. Wizard submits → location written to DB.
2. `queryClient.invalidateQueries(['locations'])` fires but is **not awaited** (background refetch).
3. `router.replace('/dashboard')` runs immediately; the persisted dashboard layout re-evaluates the
   gate with `isOnboardingRoute` now `false`.
4. `['locations', clerkOrgId]` has `staleTime: 5min` and previously cached `[]`. Mid-refetch,
   `isLoading` is `false` and `locations` is still stale `[]`.
5. Gate sees `locations.length === 0` → `router.replace('/dashboard/onboarding/first-location')`
   → wizard remounts at Step 1. Trapped.

## Scope (confirmed): Race fix + gate hardening

- [ ] **Race fix** — `components/dashboard/locations/CreateLocationWizard.tsx`, `handleSubmit`
      onboarding branch (~L406-413): `await queryClient.refetchQueries({ queryKey: ['locations'] })`
      (or awaited `invalidateQueries`) **before** `router.replace('/dashboard')`, so the cache holds
      the new location (length ≥ 1) before the layout gate re-runs.
- [ ] **Gate hardening** — `app/dashboard/layout.tsx:1129-1148`: pull `isFetching` from
      `useLocations(...)` and add it to the gate's early-return guard, so the redirect only fires
      once locations are definitively loaded (not mid-fetch).
- [ ] (Out of scope per decision) Generic "Go to Dashboard" exit in onboarding shell — declined:
      for a zero-location merchant the gate intentionally bounces them back, so a generic exit would
      re-introduce the trap. Revisit with Haidar only if a post-completion exit is wanted.

## Files
- `components/dashboard/locations/CreateLocationWizard.tsx` (handleSubmit, ~L406-413)
- `app/dashboard/layout.tsx` (useLocations call ~L1129; gate effect L1136-1148)
- `app/dashboard/hooks/useLocations.ts` (already returns full query object → `isFetching` available)

## Verification
- [ ] Confirm `CreateLocation` / `GetLocations` persist `onboarding_completed = true` (acceptance criterion).
- [ ] Manual: 7-step complete → lands on dashboard w/ new location selected, no Step-1 bounce.
- [ ] Browser Back from post-onboarding dashboard does not re-enter wizard.
- [ ] Re-navigate to `/dashboard/onboarding/first-location` with a location present → redirects out.
- [ ] Screen recording of full flow (DoD).

## Review
**Implemented (aliawdi-dev):**
- ✅ Race fix — `CreateLocationWizard.tsx` handleSubmit: onboarding branch now
  `await queryClient.refetchQueries({ queryKey: ['locations'] })` before `router.replace('/dashboard')`.
  Restructured the non-onboarding path into an `else` so locations invalidation still runs for both
  `?open=<id>` and the bare `/dashboard/locations` push.
- ✅ Gate hardening — `app/dashboard/layout.tsx`: destructured `isFetching: locationsFetching` from
  `useLocations` and added it to the first-location gate's early-return (+ dep array), so the redirect
  never fires on an in-flight refetch holding the stale empty list.
- ✅ Findings comment posted to the Notion ticket.
- ✅ `tsc --noEmit`: no new errors from these edits. layout.tsx clean. The lone CreateLocationWizard
  error (L356, `business_hours` type) is pre-existing and untouched by this change.

**Live Playwright E2E — PASSED (2026-06-26):**
Repro path: user added a temp `admin_merchant_access` grant so HQ admin (Ali) could impersonate
**Mikes Diner** (0 locations). Impersonated → dashboard correctly redirected to the onboarding
wizard → completed all 7 steps (location "Main Street Diner").
- ✅ On "Create Location" → landed on `/dashboard` and STAYED ("Viewing all 1 location"); NO bounce
  to Step 1. (Core bug fixed.)
- ✅ Browser Back did not return to the wizard (router.replace kept it out of history).
- ✅ DB: location `onboarding_completed = true`, `onboarding_step = 7`.
- ✅ Re-navigating to `/dashboard/onboarding/first-location` redirected back to `/dashboard`
  (after the added bidirectional-gate fix below).

**Gap found during E2E → 3rd fix added:** the gate had `if (isOnboardingRoute) return`, so an
already-onboarded merchant re-visiting the onboarding URL got a fresh Step 1 instead of redirecting
out (ticket acceptance criterion). Made the gate **bidirectional** in `app/dashboard/layout.tsx`:
0 locations + not on onboarding → into wizard; ≥1 location + on onboarding → `router.replace('/dashboard')`.
Re-verified live: redirects out. tsc clean.

**Cleanup (owner to run / verify):** delete temp grant + test location (Mikes Diner → back to 0).
Impersonation session ended in-app. Screenshots saved: onboarding-01..04 in repo root.
