# BUG — HQ portal sidebar shows a merchant DBA instead of "Dexa POS HQ"

**Type:** Bug (frontend identity rendering / tenancy presentation)
**Surface:** `/manage/*` → sidebar header (org name + org logo). Both come from the same expression.
**Severity:** Medium. **Not** a privilege or data leak — permissions and route gating are unaffected (see [Scope & blast radius](#scope--blast-radius)). It is a trust/perception defect: the admin console brands itself as a tenant merchant, and under Cause 2 it renders that merchant's logo inside HQ.
**Reported by:** Platform user — *"when logged in, sometimes it shows the merchant dba even though not logged as merchant."*
**Investigated:** 2026-07-29, against `feat/orderout-status-relay` + live DB.
**Verdict:** **Reproducible and confirmed.** The "sometimes" is real — there are **two independent causes**, one nondeterministic and one state-dependent.
**Status:** **Fixed** on PR #259 (`aliawdi-dev`) — see [Resolution](#resolution). Live QA passed via Playwright (both triggers' user-visible symptoms confirmed gone; one sub-step deferred for lack of a super-admin login).

---

## Symptom

An HQ team member signs in and lands on `/manage`. The sidebar header — which should read **Dexa POS HQ** — instead reads a merchant's DBA (e.g. **Saucy INC**, **Joes Coffee Shop**), and the 32×32 header icon renders that merchant's uploaded logo in place of the HQ shield.

Nothing else about the session changes: the nav tree, the `/manage` routes, and the bottom-of-sidebar avatar (the real HQ user) are all still correct. That mismatch is exactly what makes it read as a tenancy bug to the reporter.

---

## The single shared root cause

[app/manage/layout.tsx:286-293](../app/manage/layout.tsx#L286-L293):

```tsx
{userInfo?.members?.[0]?.organizations?.imageURL ? (
    <Image src={userInfo?.members?.[0]?.organizations?.imageURL} ... />
) : (
    <Shield className="h-4 w-4 text-primary-foreground" />
)}
...
<span className="truncate font-semibold">
    {userInfo?.members?.[0]?.organizations?.name || 'DexaPOS HQ'}
</span>
```

The HQ header identifies itself by **positional index into an unfiltered, unordered membership array**. There is no check that `members[0]` is the *HQ* membership. `'DexaPOS HQ'` is only a null-fallback — it never fires when *some* membership exists.

Anything that puts a merchant membership at index 0 renders that merchant as the identity of the admin console. Two distinct mechanisms do exactly that.

---

## Cause 1 — HQ admins who also hold a merchant membership (the nondeterministic one)

[app/manage/actions/get-user-info.ts:23-32](../app/manage/actions/get-user-info.ts#L23-L32):

```ts
const { data, error } = await supabase.from('users').select(`
    *,
    members(
        *,
        organizations(
        *,
        merchants(id,clerk_org_id, name)
        )
    )
    `).eq('id', userId).single()
```

No `ORDER BY`, no role filter, no org filter on the `members` embed. PostgREST emits an unordered lateral subquery, and **Postgres guarantees no row order for an unordered query** — the observed order is an artifact of the chosen plan and current heap layout.

### Confirmed in live data

Query run against the live DB (`members` joined to `organizations`, filtered to users holding a `Dexa POS HQ` membership):

| user | membership rows |
|---|---|
| `support@dexaposai.com` | `Dexa POS HQ` — `hq.super_admin` — created 2026-03-31<br>`Saucy INC` — `merchant.owner` — created 2026-04-14 |
| `ali@mtechdistributors.com` | `Dexa POS HQ` only |
| `aliawdi6077@gmail.com` | `Dexa POS HQ` only |
| `aliawdiiiiiii@gmail.com` | `Dexa POS HQ` only |
| `alidika1000@gmail.com` | `Dexa POS HQ` only |
| `temur@appflowstudio.io` | `Dexa POS HQ` only |
| `admin@creatin.com` | `Dexa POS HQ` only |
| `temursayfutdinov3@gmail.com` | `Dexa POS HQ` only |

One of eight HQ users is currently exposed. HQ org = `org_33z36QibAMZy6kc2xZNYmDl5duh` ("Dexa POS HQ", 8 members).

### Why it flips ("sometimes")

Current physical order for `support@dexaposai.com`:

| membership | ctid |
|---|---|
| `Dexa POS HQ` (`hq.super_admin`) | `(0,12)` |
| `Saucy INC` (`merchant.owner`) | `(0,37)` |

HQ is physically first **today**, so the header renders correctly **today**. That is luck, not design. The order changes whenever:

1. **The HQ `members` row is `UPDATE`d.** Postgres writes a new tuple version, typically at the end of the heap — moving the HQ row *after* the merchant row. Live update paths on `members`:
   - [supabase/functions/clerk-webhooks/index.ts:1007](../supabase/functions/clerk-webhooks/index.ts#L1007) and [:1420](../supabase/functions/clerk-webhooks/index.ts#L1420) — fires on every Clerk `organizationMembership.updated` event
   - [app/manage/actions/admin-user-management.ts:138](../app/manage/actions/admin-user-management.ts#L138) — HQ role change
   - [app/manage/actions/admin-merchant/staff.ts:633](../app/manage/actions/admin-merchant/staff.ts#L633) — merchant staff role change
   - [app/dashboard/actions/unified-staff.ts:1640](../app/dashboard/actions/unified-staff.ts#L1640), [:1885](../app/dashboard/actions/unified-staff.ts#L1885) — staff↔Clerk linking
2. **The plan changes** — seq scan on a cold small table vs. index scan on `members(user_id)` yield different orders.
3. **`VACUUM` / autovacuum** reclaims dead tuples and lets later rows fill the gaps.

None of these are user-visible actions, which is precisely why the reporter experienced it as intermittent and unattributable.

### Reproduction (deterministic)

```sql
-- as a superuser on a scratch branch, with the HQ+merchant user:
UPDATE members SET updated_at = now()
 WHERE user_id = (SELECT id FROM users WHERE email = 'support@dexaposai.com')
   AND organization_id = 'org_33z36QibAMZy6kc2xZNYmDl5duh';
```

Sign in as that user → `/manage` → header now reads **Saucy INC** with the Saucy logo.

---

## Cause 2 — a live impersonation session bleeding into `/manage` (the common one)

[app/manage/actions/get-user-info.ts:46-91](../app/manage/actions/get-user-info.ts#L46-L91) deliberately **replaces the entire `members` array** with a single synthesized `merchant.owner` membership whenever a valid impersonation cookie is present:

```ts
const impersonation = await resolveImpersonationFromCookies().catch(() => null)
if (impersonation && data) {
    ...
    return {
        ...data,
        members: [ { role: 'merchant.owner', organizations: { ...organization, name: merchant.name, ... } } ],
    }
}
```

This is correct and intentional **for `/dashboard`** — the comment block at lines 39-45 explains the design: under impersonation the HQ admin should "look like" the merchant owner to every consumer of the hook. The defect is that **nothing scopes it to merchant routes**, and `/manage` consumes the same hook.

Three facts make this the common path rather than an edge case:

1. **`/manage` stays reachable while impersonating.** [proxy.ts:226-231](../proxy.ts#L226-L231) admits any user in the HQ Clerk org to `/manage/*` unconditionally — the impersonation cookie is never consulted. (The cookie check at [proxy.ts:252-258](../proxy.ts#L252-L258) only *permits* HQ onto `/dashboard/*`; it never restricts `/manage`.)
2. **`/manage` has no impersonation banner.** `ImpersonationHydrator` and `ImpersonationBanner` are mounted only in [app/dashboard/layout.tsx:1304-1305](../app/dashboard/layout.tsx#L1304-L1305) and [:1354-1357](../app/dashboard/layout.tsx#L1354-L1357). On `/manage` there is no countdown, no "you are impersonating" bar, no exit button — so the merchant DBA appears with zero explanation.
3. **Admins essentially never exit cleanly.** The cookie lives 24h (`maxAge = SESSION_TTL_SECONDS`, [lib/admin/impersonation.ts:86-97](../lib/admin/impersonation.ts#L86-L97)) on a sliding TTL. Live `impersonation_sessions` history — last 15 rows:

   | end_reason | count |
   |---|---|
   | `superseded` (abandoned, later overwritten by the next impersonation) | 9 |
   | `user_exit` (clicked Exit) | 4 |
   | still open, `ended_at = null` | 2 |

   Two sessions are open right now (`temur@appflowstudio.io` → Joes Coffee Shop, `ali@mtechdistributors.com` → Appflow Studio Cafe). Every navigation those admins make to `/manage` inside the TTL shows the merchant DBA.

### Reproduction (deterministic, no DB access needed)

1. Sign in as any HQ admin.
2. `/manage/merchants/<id>` → **Impersonate** ([components/admin/ImpersonateMerchantButton.tsx:92](../components/admin/ImpersonateMerchantButton.tsx#L92) hard-navigates to `/dashboard`).
3. Do **not** click Exit. Navigate to `/manage` (address bar, back button, or bookmark).
4. Sidebar header reads the merchant's DBA + merchant logo. No banner explains it.

### 2a. The state is not stale — the session is genuinely still open

Team-lead report during triage: *"this happens when you are impersonating a merchant and then you close it and then open the admin side again — it thinks you might still be in the merchant impersonation but you are in the HQ."*

Correct on the symptom, with one important correction to the mental model: **the app is not mistakenly *remembering* an old session. The session is still live and valid.** The impersonation cookies are set with `maxAge: SESSION_TTL_SECONDS` (24h), not as browser-session cookies ([lib/admin/impersonation.ts:86-97](../lib/admin/impersonation.ts#L86-L97)). Closing the tab, closing the browser, and restarting the machine all leave them intact. `resolveImpersonationFromCookies` then re-validates successfully against `touch_impersonation_session`, and correctly synthesizes the merchant membership.

This distinction matters for the fix: there is no stale cache to invalidate. The system state is accurate; the **UI never discloses it**.

### 2b. Client and server impersonation state have different lifetimes (the trap)

| | lifetime | cleared by |
|---|---|---|
| **Server** — `x-impersonate-merchant-id` / `x-impersonate-session-id` cookies | 24h sliding TTL | `endImpersonation`, TTL expiry, or being `superseded` |
| **Client** — `impersonation-storage` Zustand store | **per tab**; `sessionStorage` by explicit design ([stores/impersonation-store.ts:13-14,41-46](../stores/impersonation-store.ts#L41-L46)) | closing the tab/browser |

Close the browser mid-impersonation and the two diverge into the worst combination: **server still impersonating, client convinced it is not.** Consequences on the next launch:

- `GetUserInfo` honours the cookie → `/manage` header shows the merchant DBA and logo.
- The Zustand store is empty → `useImpersonatedMerchant()` returns `null` → `ImpersonationBanner` short-circuits at [components/dashboard/ImpersonationBanner.tsx:132](../components/dashboard/ImpersonationBanner.tsx#L132) (`if (!merchant) return null`).
- `ImpersonationHydrator` — the only thing that repopulates the store from the cookie — is mounted **only in the dashboard layout**. On `/manage` it never runs, so the store is never corrected.

**Net effect: no banner, no countdown, and no Exit button anywhere on `/manage`.** The Exit control exists in exactly one place in the codebase ([ImpersonationBanner.tsx:248-261](../components/dashboard/ImpersonationBanner.tsx#L248-L261)), gated behind a store the HQ console never populates. `/manage/audit-logs/impersonation` is read-only — it renders `end_reason` badges and offers no terminate action. `MerchantHeaderBar` / `ImpersonateMerchantButton` offer start, never end.

An admin in this state has three ways out, none discoverable:
1. Navigate to `/dashboard` — middleware allows it on the valid cookie, the Hydrator repopulates the store from the server, the banner reappears, then Exit works.
2. Wait out the 24h TTL.
3. Impersonate a different merchant, which supersedes the old session.

Option 3 is almost certainly why **9 of the last 15 sessions ended `superseded`** rather than `user_exit`. That statistic is not admins being careless — it is the measured footprint of this trap.

### What the exit path does *right* (ruled out during triage)

If "close it" is read as *clicked Exit*, that path is clean and is **not** implicated. `handleExit` ([ImpersonationBanner.tsx:91-112](../components/dashboard/ImpersonationBanner.tsx#L91-L112)) cancels and removes all React Query data, calls `endImpersonation` (which clears cookies **before** the RPC, so they clear even if the RPC fails — [lib/admin/impersonation.ts:344-361](../lib/admin/impersonation.ts#L344-L361)), clears the store, then **hard-reloads** to `/manage/merchants`. The header comment at [ImpersonationBanner.tsx:36-39](../components/dashboard/ImpersonationBanner.tsx#L36) records that this hard reload was added specifically to fix an earlier "had to refresh" variant of this bug. Verified sound — the defect is exclusively in the **abandon** path.

---

## Scope & blast radius

**What is *not* affected — verified:**

- **Route gating.** `/manage/*` access is decided by the Clerk `orgId` in [proxy.ts:226-231](../proxy.ts#L226-L231), never by `members[0]`.
- **HQ permissions.** `role`, `hasPermission`, `hasAnyPermission`, `isAtLeast` all come from `useAdminPermissions` ([lib/hooks/useAdminPermissions.ts](../lib/hooks/useAdminPermissions.ts)) via Supabase RPCs — a separate path from `useUserInfo`. Nav filtering at [app/manage/layout.tsx:245-276](../app/manage/layout.tsx#L245-L276) and the Create Merchant gate at [:300](../app/manage/layout.tsx#L300) are correct regardless.
- **The user identity block.** [app/manage/layout.tsx:362-368](../app/manage/layout.tsx#L362-L368) reads top-level `userInfo.first_name` / `avatar_url` / `email`, which the impersonation branch preserves by design. The real HQ user still shows at the bottom of the sidebar.
- **Audit attribution.** `LogAuditEvent` resolves the actor independently; nothing is mis-attributed.

**What is affected:** the sidebar header org name and the header logo image — that's the complete list. `userInfo?.members?.[0]?.organizations` appears nowhere else in `/manage` (the only other `organizations?.name` hits are [app/manage/users/[userId]/page.tsx:332-361](../app/manage/users/[userId]/page.tsx#L332-L361), which iterate a *target* user's memberships intentionally).

So: cosmetic in mechanism, but it presents to an operator as a tenancy boundary failure — and under Cause 2 a merchant's uploaded brand asset genuinely renders inside the admin console. Worth fixing on trust grounds alone.

---

## Proposed fix

Two changes; they are independent and Fix 1 alone closes the reported intermittent symptom.

### Fix 1 — identify the HQ membership explicitly (closes Cause 1)

Stop indexing positionally. Select the membership whose `organization_id` **is** the HQ org. `NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID` is already the established client-side pattern — see [app/manage/page.tsx:17](../app/manage/page.tsx#L17), [app/manage/users/page.tsx:71](../app/manage/users/page.tsx#L71), [lib/hooks/useAdminPermissions.ts:11](../lib/hooks/useAdminPermissions.ts#L11).

In [app/manage/layout.tsx](../app/manage/layout.tsx), inside `AppSidebar`:

```tsx
const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID ?? ''

// The HQ console must identify itself by the HQ membership specifically —
// never by members[0]. HQ admins may also hold a merchant membership, and the
// embed that produces `members` has no ORDER BY, so index 0 is not stable.
const hqOrg = useMemo(
    () => userInfo?.members?.find(
        (m: any) => m.organization_id === DEXA_HQ_ORG_ID
    )?.organizations ?? null,
    [userInfo]
)
```

then render `hqOrg?.name || 'Dexa POS HQ'` and `hqOrg?.imageURL`. When no HQ membership is present in the array — which is exactly the impersonation case — it falls through to the literal, so **this change also neutralizes Cause 2's visual symptom for free**.

Do not add a global sort to the `members` embed as a workaround. A stable order would only make positional consumers deterministically wrong when the first row is not the membership they intend. Each consumer must select a membership by organization, role, or other explicit intent.

### Fix 2 — decide what impersonation means on `/manage` (closes Cause 2 properly)

Fix 1 hides the wrong *name*, but the underlying state remains: an HQ admin can sit in the admin console with a live impersonation session and no indication of it. Two viable options — **this one needs a product call, not just an implementation**:

| | Option A — **suppress** | Option B — **surface** |
|---|---|---|
| Change | Skip the impersonation branch in `GetUserInfo` when the request targets `/manage` (read the pathname from `headers()`), so HQ routes always see the real memberships | Mount `ImpersonationHydrator` + `ImpersonationBanner` in [app/manage/layout.tsx](../app/manage/layout.tsx), same as the dashboard layout |
| Result | `/manage` behaves as if not impersonating | `/manage` shows HQ identity **and** a persistent "impersonating X — Exit" bar |
| Risk | Route-sniffing inside a server action is a smell; a shared hook behaving differently per route is easy to regress | None functionally; one more banner on HQ pages |
| Leaves the §2b trap open? | **Yes** — session stays live and now fully invisible | **No** — Hydrator repopulates the store from the cookie, so Exit becomes reachable from `/manage` |

**Recommendation: Option B, and the §2b findings make it the only defensible choice.** Option A hides the wrong name while leaving a live, audited, `severity: 'critical'` security session running with *no* UI affordance to end it — it would make the trap worse, not better. Option B fixes both halves at once: mounting `ImpersonationHydrator` on `/manage` repairs the client/server lifetime divergence, and mounting `ImpersonationBanner` puts the app's only Exit control where the stranded admin actually is. Expect the `superseded` end-reason rate to drop sharply as a side effect — that metric is the trap's footprint.

Note that Fix 1 and Option B are complementary, not redundant: Fix 1 makes the header say "Dexa POS HQ", Option B explains *why the session still exists* and lets the admin end it.

Optional hardening, not required: shorten `IMPERSONATION_TTL_SECONDS` (24h is generous for a critical elevation), and/or add a terminate action to the read-only `/manage/audit-logs/impersonation` page so any HQ admin can kill a dangling session.

---

## Verification plan

1. **Cause 1, before/after.** On a Supabase branch, run the `UPDATE members SET updated_at = now()` repro above against `support@dexaposai.com`'s HQ row. On `main` the `/manage` header flips to "Saucy INC"; with Fix 1 it stays "Dexa POS HQ". Repeat the update 3× to confirm stability across heap positions.
2. **Ordering independence.** Assert the HQ selector resolves the HQ organization with both HQ-first and merchant-first membership arrays.
3. **Cause 2.** Impersonate → navigate to `/manage` without exiting. Expect: header reads "Dexa POS HQ", banner present (Option B), Exit works from `/manage`.
3a. **Cause 2b — the browser-restart trap.** Impersonate → **fully close the browser** (clearing `sessionStorage`) → reopen → go straight to `/manage`. On `main`: merchant DBA in the header, no banner, no Exit anywhere. With Fix 1 + Option B: HQ name in the header, banner rehydrated from the cookie, Exit functional. Confirm the `impersonation_sessions` row closes with `end_reason = 'user_exit'` (not `superseded`).
4. **No regression on `/dashboard`.** Impersonate → `/dashboard` must still show the merchant name, merchant logo, merchant location scope, and the countdown banner. Fix 1 touches only the `/manage` layout; confirm the dashboard header path is untouched.
5. **Single-membership HQ users.** Sign in as `ali@mtechdistributors.com` (HQ membership only) — header unchanged, no `undefined` fallback flash.
6. **Permissions unchanged.** Confirm nav tree and Create Merchant visibility are identical before/after for both a `hq.super_admin` and a `hq.platform_admin`.

---

## Follow-ups (out of scope for this fix, worth tickets)

- **Positional `members[0]` elsewhere.** Same anti-pattern is known to appear in merchant-resolution paths (see the `members[0]`-derived merchant note in the test-env constraints). Each site should select by intent, not index. Worth an audit sweep.
- **`useUserInfo` cache key is identity-free.** [app/manage/hooks/useUserInfo..ts:6](../app/manage/hooks/useUserInfo..ts#L6) uses `queryKey: ['userInfo']` with no user or impersonation discriminator. `resetClientSession` on sign-out ([app/manage/layout.tsx:237-241](../app/manage/layout.tsx#L237-L241)) covers the sign-out path, but any client-side transition that changes effective identity — notably starting/ending impersonation — relies on a hard navigation to avoid serving stale identity. Consider keying on `[userId, impersonationSessionId ?? 'none']`.
- **Filename typo.** `app/manage/hooks/useUserInfo..ts` (double dot) — pre-existing, harmless, noted for cleanup.
- **HQ admins holding merchant memberships.** `support@dexaposai.com` owning `Saucy INC` may itself be unintended (test-data residue vs. a real support account). Worth confirming with whoever provisioned it — if it's residue, deleting the row also removes the Cause 1 trigger, though the code fix should land regardless. **Decision taken:** leave the data alone; the code fix is correct for any number of memberships.
- **Sign-out does not end an active impersonation session.** Found while implementing. `resetClientSession` ([lib/auth/session-reset.ts:38-50](../lib/auth/session-reset.ts#L38-L50)) clears the Zustand store and its `sessionStorage` key, but the impersonation **cookies are httpOnly** — JS cannot clear them, and nothing calls `endImpersonation()` on the sign-out path. So signing out mid-impersonation leaves the session live server-side; signing back in resumes it. Same root family as §2b (server state outliving client state). Mitigated but not closed by this fix: the banner now renders on `/manage`, so the state is at least visible and exitable. Proper fix is to `await endImpersonation()` in the sign-out handlers before `signOut()`.

---

## Resolution

**Implemented on PR #259 (`aliawdi-dev`).** No migration, schema change, live-data change, or dependency change.

| File | Change |
|---|---|
| [lib/admin/hq-identity.ts](../lib/admin/hq-identity.ts) | **New.** Pure, unit-tested `selectHqOrganization(userInfo, hqOrgId)` selector. Returns `null` — never a guess — for: no HQ membership, empty `hqOrgId`, an `Error` payload (`GetUserInfo` returns rather than throws), loading/absent states, and malformed rows. |
| [app/manage/layout.tsx](../app/manage/layout.tsx) | Header renders `hqOrg?.name \|\| 'Dexa POS HQ'` and `hqOrg?.imageURL` instead of `members[0]`. Fallback string normalised `'DexaPOS HQ'` → `'Dexa POS HQ'` to match the org name in the DB. Mounted `<ImpersonationHydrator />` beside `<DeniedParamHandler />` and `<ImpersonationBanner />` as the first child of `<main>`. |
| [lib/admin/__tests__/hq-identity.test.ts](../lib/admin/__tests__/hq-identity.test.ts) | **New.** Permanent regression coverage for mixed membership order, missing HQ membership, loading/error payloads, malformed rows, and missing organization joins. |

`ImpersonationBanner` and `ImpersonationHydrator` were **reused as-is** — no new component, no file moves, and no change to `handleExit`, which triage confirmed already sound.

### What has been verified

- **Selector regression suite — 10/10 tests pass** via `npx vitest run --config vitest.config.mts lib/admin/__tests__/hq-identity.test.ts`. The two cases encoding the bug — merchant-first and HQ-first mixed memberships — both resolve to `Dexa POS HQ`; absent or malformed HQ data returns `null` so the UI uses the safe literal fallback.
- **Targeted TypeScript validation passes** for the HQ selector and `/manage` integration files.
- **Production build passes** via `npm run build` on Next.js 16.2.12, including compilation and generation of all 118 static pages.
- **Dependency files remain identical to preview.** `npm ci` currently reports that preview's committed `package.json` and `package-lock.json` are out of sync around transitive Next/webpack dependencies. That repository-baseline lockfile issue is not caused or modified by this focused bug fix.

### Tooling note (pre-existing, unrelated to this fix)

`npm run lint` is broken repo-wide and could not be used as a gate: the script runs `next lint`, which Next 16 removed (`Invalid project directory provided, no such directory: …\lint`). Worth its own ticket.

### Live QA — run 2026-07-29 via Playwright against the dev environment

Signed in as `ali@mtechdistributors.com` (`hq.platform_admin`), dev server on `:3000`, remote dev Supabase. Impersonated **Joes Coffee Shop** with reason `"QA: verifying HQ header fix for BUG-hq-portal-shows-merchant-dba"` (session `04c95a86…`, closed cleanly — see below).

| Step | Check | Result |
|---|---|---|
| — | Baseline: `/manage` before impersonating | **Pass** — header `Dexa POS HQ` + HQ Clerk logo, no banner, store `current: null` |
| 3 | **The reported bug:** impersonate → back to `/manage` without exiting | **Pass** — header stays `Dexa POS HQ`; banner renders with countdown (`23:59:37`), session ID, reason, and a working Exit |
| 3a | **Browser-restart trap:** wipe `sessionStorage` (simulates browser close; cookie survives) → reload `/manage` | **Pass** — store repopulated from the server-validated cookie, banner rehydrated, Exit reachable. Pre-fix this state had no banner and no way out. |
| 4 | No `/dashboard` regression while impersonating | **Pass** — exactly **one** impersonation banner (not two), merchant name + merchant logo intact, HQ user avatar intact |
| — | Exit from `/manage` (impossible pre-fix) | **Pass** — hard-redirect to `/manage/merchants`, store cleared to `null`, header remains `Dexa POS HQ`, no banner |
| — | Audit trail | **Pass** — `/manage/audit-logs/impersonation` shows the session as **`user exit`**, 1 action, 2 minutes |
| 5 | Single-membership HQ user | **Pass** — Ali holds only the HQ membership; header correct throughout, no `undefined` flash |
| 6 | Permissions unchanged | **Pass (observational)** — full nav tree rendered, role badge `Platform Admin`, `Create Merchant` visible per `merchants.create`. Not a rigorous before/after diff. |

**Not run: step 1 (the Cause 1 heap-order flip).** It needs a login for `support@dexaposai.com` (the only user holding both an HQ and a merchant membership) plus a DB write to flip row order — and the Supabase MCP is read-only and lost access mid-session. Cause 1 is instead covered by the unit checks, which assert both array orders resolve to `Dexa POS HQ`. Worth running live if a super-admin login becomes available.

**Incidental finding — the trap is live in production data.** The same audit page shows `temur@appflowstudio.io` with a session **still `active`** from earlier the same day, preceded by four consecutive **`superseded`** sessions. That is the abandon-and-forget pattern described in §2b, observed in the wild rather than inferred.

**QA artifact left behind:** one `impersonation_sessions` row, properly closed with `end_reason = 'user_exit'` and a self-describing reason string. Harmless and auditable.
