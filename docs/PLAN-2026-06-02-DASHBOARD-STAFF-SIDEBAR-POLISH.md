# Dashboard Staff + Sidebar Polish

## Purpose

This ticket is a merchant dashboard frontend polish pass with two scoped tasks:

1. Remove developer/internal fields from the merchant staff detail view.
2. Apply a calmer two-tone treatment to the merchant dashboard sidebar.

It is explicitly a web-dashboard ticket. It does not include POS, schema, auth, or backend behavior changes.

## Source Ticket

Source: user-provided ticket brief from June 2, 2026.

Surfaces:
- merchant dashboard staff detail sheet at `/dashboard/staff`
- merchant dashboard left sidebar in the shared `/dashboard/*` layout

## What The Ticket Means

### Task 1

The staff detail sheet currently exposes raw internal plumbing:
- `member_id` values like `orgmem_*`
- `staff_profile_id` UUIDs
- raw role codes like `merchant.owner`
- redundant assignment/account-status rows that repeat what the header already says

The requirement is display cleanup only. The actions and data layer stay intact.

### Task 2

The dashboard sidebar needs a lighter visual split from the main content surface:
- off-white sidebar surface
- white content surface
- brand-blue active state
- neutral inactive state
- low-emphasis section labels

This should be a scoped dashboard treatment, not a global app theme rewrite.

## Scope

In scope:
- merchant dashboard staff detail presentation cleanup
- role label humanization in the visible staff detail UI
- merchant dashboard sidebar color-token tuning
- before/after test notes for manual QA

Out of scope:
- POS staff screens
- HQ admin staff screens
- schema or RPC changes
- status-toggle, PIN, password, or assignment behavior changes
- audit-log sentence changes

## Grounded Code Touchpoints

### Task 1

- `components/dashboard/staff/StaffDetailSheet.tsx`
  - current raw-ID rows live here
  - visible raw role codes also live here
  - footer currently leaks `member_id`

Related read model:
- `types/staff.ts`
  - `LocationAssignment.role_name`
  - `UnifiedStaffMember.member_id`
  - `UnifiedStaffMember.staff_profile_id`

### Task 2

- `app/dashboard/layout.tsx`
  - dashboard sidebar provider entry point
- `components/ui/sidebar.tsx`
  - shared sidebar primitives already consume `--sidebar*` tokens
- `app/globals.css`
  - current sidebar tokens live here

## Implementation Plan

### Phase 1

Finish the document and align the shared ticket index.

### Phase 2

Implement Task 1 in `components/dashboard/staff/StaffDetailSheet.tsx`:
- remove visible `Member ID`
- remove visible `Staff Profile ID`
- remove redundant `Account Type` row
- remove redundant `Primary Assignment Status` row
- replace visible raw role codes with human-readable role labels
- keep all actions wired exactly as they are now

### Phase 3

Implement Task 2 with a dashboard-scoped token override:
- scope the styling to the merchant dashboard layout
- set sidebar surface to `#F8FAFC`
- set active background to `#EEF3FE`
- set active text/icon to `#0C4FD1`
- keep hover neutral and low-emphasis section labels

### Phase 4

Run a targeted syntax pass and prepare the manual QA checklist.

## Acceptance Criteria Translation

### Task 1

- no visible raw IDs in merchant dashboard staff detail UI
- role labels are human-readable wherever this sheet presents role information
- no behavior change in edit, PIN, password, status, or assignment flows

### Task 2

- dashboard sidebar is visually distinct from content without harsh contrast
- active item uses brand-blue tint treatment
- hover remains neutral, not blue
- no layout shift or shadow-heavy treatment

## Manual QA Plan

### Staff Detail

1. Open a dashboard user in `/dashboard/staff`.
2. Confirm no `orgmem_*`, UUID, or raw Clerk identifier is visible.
3. Confirm role reads as a human label, not `merchant.owner`.
4. Confirm status toggle, PIN controls, password controls, and edit actions still work visually.

### POS-only Staff

1. Open a POS-only staff member.
2. Confirm password section is absent.
3. Confirm no internal IDs are visible.

### Sidebar

1. Open `/dashboard`.
2. Verify sidebar surface differs subtly from content.
3. Verify exactly one active item is blue-tinted.
4. Hover an inactive item and confirm neutral hover treatment.
5. Expand/collapse `Orders` or another grouped item and confirm children inherit the same treatment.

## Current Execution Status

- [x] Ticket understood and grounded against repo files
- [x] Shared ticket reference updated
- [x] Task 1 implemented
- [x] Task 2 implemented
- [x] Targeted syntax validation
- [ ] Manual QA
