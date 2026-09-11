# Dashboard scopes to `members[0]` instead of the active organization

**Status:** `useClerkOrgId` fixed. ~60 other call sites still on the old pattern.
**Date:** 2026-09-11
**Severity:** Wrong-tenant data for multi-org users. **Not** a privilege
escalation — see "Why this is not a breach".

---

## How it surfaced

During QA of support video attachments, a second merchant account appeared to
see another merchant's ticket (DEXA-00007, owned by *Joes Coffee Shop*).

That specific report turned out to be **correct behaviour**: the account used,
`temur+clerk_test@gmail.com`, is a `merchant.manager` **in Joes Coffee Shop
itself**, with exactly one membership. It was a member of the owning merchant,
so it was entitled to the ticket.

Investigating it, however, exposed a real defect underneath.

---

## The defect

`useClerkOrgId()` resolved the caller's organization as:

```ts
impersonated?.clerkOrgId || userInfo?.members?.[0]?.organizations?.id || ""
```

`members[0]` is an arbitrary entry in a membership list, **not** the
organization the user actually switched to in Clerk. For a user belonging to
more than one merchant, the dashboard keeps sending the wrong org id after an
org switch.

Worse, index 0 is not even stable. Per `lib/admin/hq-identity.ts` — written for
a previous bug with the same root cause — the `members` embed in `GetUserInfo`
has **no `ORDER BY`**, so which membership lands at index 0 is plan- and
heap-dependent and flips whenever the row is updated (Clerk webhooks, role
changes, staff linking). Confirmed: `app/manage/actions/get-user-info.ts` embeds
`members` with no ordering.

This hook keys menus, orders, reporting, staff, inventory and support alike, so
the blast radius is the whole merchant dashboard.

Real multi-org users exist today — e.g. `user_3AJtXIoZEaV1O9u1NAS4JRhKYbB` is
`merchant.admin` in two orgs, one of which owns DEXA-00007.

### Why this is not a breach

Server actions scope correctly. `GetTicketDetail` resolves the merchant from the
supplied `clerkOrgId` and then filters `.eq("merchant_id", merchant.id)`; the
attachment proxy returns 403 for a non-member. The client sent a **wrong but
legitimately-owned** org id — the user was a genuine member of whatever org was
resolved. No data crossed a tenant boundary the user did not already hold.

It is still wrong data, and it is confusing and unpredictable for any user with
more than one merchant.

---

## Fix applied

`app/dashboard/hooks/useLocationScoped.ts`:

```ts
impersonated?.clerkOrgId || activeOrgId || userInfo?.members?.[0]?.organizations?.id || ""
```

Precedence, each step load-bearing:

1. **Impersonation first.** While an HQ admin impersonates, Clerk's active org
   is still the HQ org, so `activeOrgId` would scope queries to HQ rather than
   the merchant being viewed. Several existing call sites already carry comments
   warning exactly this (`useAuth().orgId` stays HQ during impersonation).
2. **Clerk's active organization** (`useAuth().orgId`) — the org the user
   actually selected.
3. **`members[0]`** only as a transient fallback before Clerk resolves, and for
   single-org users where it is unambiguous.

---

## Still open: ~60 other call sites

The same `userInfo?.members?.[0]?.organizations?.id` pattern is duplicated
across roughly 60 places. Fixing only `useClerkOrgId` leaves most of the
dashboard on the old behaviour. Affected areas include:

- Hooks: `useCashDrawerAnalytics`, `useCashDrawerHardware`, `useOrderAnalytics`,
  `usePayments`, `useStaff`, `useTaxReport`, `useLocationScopedSchedules`,
  `useLocationScopedModifiers`, `useOrder`, `useCustomers`,
  `useCustomerMarketing`, the `inventory/hooks/*` family
- Pages: `menu/*`, `locations/*`, `inventory`, `cash-drawers`,
  `reports/comparison`, `payments/disputes`, `dashboard/layout.tsx`
- Components: menu wizards and sheets, staff sheets, scheduling dialogs,
  `LocationListView`

### Recommended approach

Do **not** hand-edit 60 sites. Export a single shared hook (the fixed
`useClerkOrgId`, plus a `useMerchantId` companion for the
`organizations.merchants.id` variant) and migrate call sites to it. That gives
one place to reason about impersonation precedence, instead of 60 copies that
will drift again.

Worth pairing with an `ORDER BY` on the `members` embed in `GetUserInfo` so the
fallback is at least deterministic.

This is a separate ticket: it touches the whole dashboard and needs its own
regression pass across menus, orders, reporting, staff and inventory.

---

## Verification

- `npx tsc --noEmit` — clean for `useLocationScoped.ts`.
- Support suites — 38/38 pass.
- **Not yet verified in a browser:** an actual org switch by a multi-org user.
  Needs a user with two merchant memberships to switch orgs and confirm the
  dashboard follows. `user_3AJtXIoZEaV1O9u1NAS4JRhKYbB` fits.
