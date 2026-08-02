# QA Full Ticket Test Scenarios

**Date:** 2026-04-24  
**Environment:** POS tablet + staging `dfwqakoyittmrwbqvxgw`  
**Owner:** Ali Dika  
**Purpose:** Detailed execution scenarios for the full reassigned ticket across Sections A, B, C, D, and DST.

## Important Note

`DEXA_POS_Test_Plan_v2.md` was not present in the current workspace when this playbook was prepared. The scenarios below are reconstructed from the ticket itself and from the current QA notes. They are designed to be directly executable by QA, but if the master v2 plan becomes available, its wording should take precedence.

## How To Use This Document

For every test:

1. Run the scenario exactly as written.
2. Capture screenshots or recordings for visible defects.
3. Capture SQL output for DB-level defects.
4. Record:
   - test ID
   - environment
   - role used
   - exact time
   - expected result
   - actual result
   - verdict: `PASS`, `FAIL`, `PARTIAL`, `PENDING`, `DEFERRED`

## Global QA Evidence Template

Use this template in your notes or ticket comments:

```text
Test ID:
Environment:
Role:
Preconditions:
Steps:
Expected:
Actual:
Evidence:
Verdict:
```

## Section A - Dine-In Flow (POS Tablet)

### Global Preconditions For Section A

Before running Section A scenarios:

1. Confirm tablet is online and synced.
2. Confirm at least two cashier/server test users exist.
3. Confirm at least one floor plan with multiple tables exists.
4. Confirm menu contains:
   - appetizers
   - entrees
   - at least one shared item
   - at least one discount
5. Confirm kitchen/KDS path is available if the scenario depends on fired items.

### Cross-Scenario Stability Check

Before each major scenario:

1. Open the app fresh.
2. Confirm it is responsive.
3. If the app greys out or freezes, record:
   - exact step
   - whether restart was required
   - whether data was lost after restart

### `TC-CSH-M-001` - Full-Service Dine-In Lifecycle

**Objective**

Validate a full-service dine-in lifecycle with separate courses fired in order.

**Preconditions**

- Host/seat flow is available
- Menu supports at least two courses
- KDS or kitchen fire state is visible

**Steps**

1. Seat a party of 4 at one table.
2. Add appetizers and assign them to Course 1.
3. Add entrees and assign them to Course 2.
4. Fire Course 1 only.
5. Verify only Course 1 is sent to kitchen/KDS.
6. Return to the order screen.
7. Fire Course 2.
8. Print check.
9. Complete payment.
10. Close the order.

**Expected**

- Course 1 and Course 2 remain separate
- firing Course 1 does not open, duplicate, or alter Course 2 items
- user can navigate back to menu/order sections without sync-loop issues
- check prints correctly
- payment closes normally
- table closes cleanly after completion

**Specific Defects To Watch**

- Course 2 opens the same item when Course 1 is fired
- inability to return to the menu
- sync retries required to resume normal behavior

**Evidence**

- screenshot or video of wrong course behavior
- screenshot of navigation lock
- optional SQL check on order items / course fields if needed

### `TC-CSH-M-002` - Split Check By Seat

**Objective**

Validate seat-based split check behavior, including a shared appetizer.

**Preconditions**

- Split-by-seat must be enabled in the UI
- Order contains multiple seats plus one shared item

**Steps**

1. Open one dine-in order for at least 3 seats.
2. Add one appetizer intended to be shared by the table.
3. Add seat-specific entrees for each seat.
4. Open split-check options.
5. Select split by seat.
6. Review each sub-check.

**Expected**

- split-by-seat option is visible and usable
- shared appetizer is allocated according to product rules
- shared appetizer is not duplicated across every seat check unless that is explicitly intended
- seat-specific items stay on the correct sub-check

**Current Known Risk**

- split-by-seat option may be missing entirely

**Evidence**

- screenshot if option is missing
- screenshot of each sub-check if shared item is duplicated

### `TC-CSH-M-003` - Split Evenly, Penny Preservation

**Objective**

Validate even split rounding on a non-round total.

**Preconditions**

- Open dine-in or comparable check totaling exactly `$103.47`

**Steps**

1. Create or adjust a ticket so grand total is exactly `$103.47`.
2. Open split-check options.
3. Split evenly `3` ways.
4. Note each resulting sub-check total.
5. Sum all sub-check totals.

**Expected**

- total of all sub-checks equals exactly `$103.47`
- no penny loss or penny creation
- if uneven cents exist, rounding should still preserve the total exactly

**Fail Examples**

- `$103.45`
- `$103.46`
- `$103.48`

**Evidence**

- screenshot of each sub-check total
- final manual sum

### `TC-CSH-M-004` - Split Payment On One Item

**Objective**

Validate mixed tender on a single item and correct allocation to `order_payment_items`.

**Preconditions**

- Single ticket with one `$20.00` item
- Both cash and card payment paths available

**Steps**

1. Open a ticket with one `$20.00` item only.
2. Begin payment.
3. Apply `$10.00` cash.
4. Apply `$10.00` card.
5. Complete the payment.
6. Verify the ticket closes.
7. Verify payment allocation in DB if needed.

**Expected**

- remaining balance is reduced correctly after first payment
- final balance reaches zero
- ticket closes normally
- cash and card allocations sum to exactly `$20.00`
- `order_payment_items` allocation is consistent with the two tenders

**Known Risk**

- cash side may under-allocate relative to card side

**Suggested SQL Verification**

```sql
select *
from public.order_payment_items
where order_id = '<ORDER_ID>';
```

### `TC-CSH-MH-002` - Two Cashiers Edit Same Table Simultaneously

**Objective**

Validate concurrent edit/payment protection on the same table.

**Preconditions**

- Two separate cashier sessions
- Same merchant, same location, same active table

**Steps**

1. Cashier A opens Table 5.
2. Cashier B opens Table 5 at the same time.
3. Both view or edit the same open order.
4. Move both users to the payment flow.
5. Let Cashier A complete payment first.
6. Without refreshing, let Cashier B attempt to complete payment.

**Expected**

- second cashier should be blocked, refreshed, or forced to reconcile state
- there should not be two successful payment completions
- no zero-fee fake completion should happen

**Known Defect To Watch**

- both users may complete payment, with one real payment and one `0`-fee completion

**Evidence**

- screenshots from both devices/sessions
- payment records in DB

### `TC-CSH-MH-003` - Transfer Order From Table 5 To Table 3

**Objective**

Validate table transfer after items are already fired.

**Preconditions**

- Open dine-in order on Table 5
- At least one item already fired to KDS

**Steps**

1. Open Table 5 order.
2. Fire at least one item.
3. Use transfer-table action.
4. Move the order to Table 3.
5. Verify front-of-house state updates.
6. Verify KDS references the new table after transfer if applicable.

**Expected**

- transfer completes
- FOH table assignment updates from Table 5 to Table 3
- KDS or kitchen references reflect the new table context, or retain a traceable transfer note without inconsistency

**Known Risk**

- transfer action may not work at all

### `TC-CSH-MH-004` - Transfer Order From Server A To Server B

**Objective**

Validate server reassignment mid-shift and future tip attribution integrity.

**Preconditions**

- Open dine-in order assigned to Server A
- Server B active in same location

**Steps**

1. Open an order assigned to Server A.
2. Add items and fire at least one item.
3. Reassign the order to Server B.
4. Continue activity as Server B.
5. Close and pay the order.
6. Later verify attribution in tip or audit views if available.

**Expected**

- server transfer completes
- order ownership updates visibly
- subsequent actions are attributed to Server B
- prior history remains traceable to Server A

**Known Risk**

- transfer action may not work at all

### `TC-CSH-MH-011` - Waitlist -> Seat -> Order Lifecycle

**Objective**

Validate the normal conversion from waitlist to seated table to active order.

**Steps**

1. Add a party to waitlist.
2. Seat the party to a table.
3. Open order from seated table.
4. Add items.
5. Progress through normal order lifecycle.

**Expected**

- waitlist entry converts cleanly
- seating attaches the party to the correct table
- order opens normally from the seated party

### `TC-CSH-MH-012` - Reservation No-Show Deposit Forfeit

**Objective**

Validate deposit forfeit after grace window.

**Status**

- Deferred for later execution

**Suggested Steps**

1. Create reservation with deposit.
2. Move system/test clock past grace window.
3. Mark reservation no-show.
4. Verify deposit is forfeited according to rule.
5. Verify audit and financial records are created.

### `TC-CSH-H-007` - Complex Check Stress Test

**Objective**

Exercise every major check-math path at once.

**Steps**

1. Open one dine-in check.
2. Add `50` items.
3. Apply `3` discounts.
4. Split `4` ways.
5. Add tip.
6. Use multi-payment across the split checks.
7. Close the check.

**Expected**

- no freeze or math corruption
- discounts apply correctly
- split sums reconcile
- payment sums reconcile
- final closed state is clean

### `TC-CSH-H-009` - Long-Running Dine-In, 8+ Hours

**Objective**

Validate long-lived ticket stability, state retention, and auth/session refresh.

**Suggested Steps**

1. Open a dine-in order.
2. Leave it open across a long duration or simulate the auth/session boundary.
3. Return to the order later.
4. Add/edit items.
5. Complete payment and close.

**Expected**

- state remains intact
- auth refresh does not break the order
- close still works without stale-state corruption

### `TC-MRC-MH-005` - Floor Plan + Server Section Enforcement

**Objective**

Validate server cannot open another section's table without explicit override.

**Preconditions**

- Server A assigned to Section A
- Server B assigned to Section B
- Table assignments mapped to sections

**Steps**

1. Log in as Server A.
2. Attempt to open a Section B table.
3. Observe whether access is blocked or an override flow is required.
4. If override exists, complete it and verify audit trail.

**Expected**

- direct access is blocked, or a controlled override path is used
- no silent unauthorized open is allowed

## Section B - Compliance, Payroll, Tax

**Owner Note**

The ticket says Temur will handle this section. Scenarios are still included here so the full ticket has one playbook.

### `TC-CSH-H-003` - Tip Pool With Shift Trade + Late Card Tip After Close

**Objective**

Validate FLSA / IRS correctness when a shift is traded and a late card tip arrives after close.

**Preconditions**

- Tip pool enabled
- Shift trade path available
- Card tip can arrive after close/import

**Steps**

1. Create Shift A for Employee 1.
2. Mid-shift, trade the remainder to Employee 2.
3. Close the shift/order path before the delayed card tip is posted.
4. Post a late-arriving card tip after close.
5. Check tip pool allocation, payroll hours, and reporting.

**Expected**

- late card tip is allocated to the correct labor/tip ownership model
- shift trade does not misattribute tips
- IRS/FLSA reporting remains consistent

### `TC-CSH-H-005` - Mid-Shift Cash Skim Detection

**Objective**

Validate variance + No Sale audit path catches suspicious mid-shift skimming patterns.

**Steps**

1. Open a drawer session.
2. Perform several real cash transactions.
3. Trigger a No Sale event.
4. Introduce a controlled cash variance mid-shift.
5. Check variance analytics, alerts, and audit rows.

**Expected**

- No Sale is audited
- variance is detected
- relevant anti-skim signal is visible

### `TC-CSH-H-006` - Refund-To-Self Fraud Velocity Block

**Objective**

Validate same-cashier repeated refunds are blocked or flagged.

**Steps**

1. Create eligible transactions.
2. Have the same cashier perform 2-3 refunds in a suspicious sequence.
3. Observe whether the third event is blocked or escalated.

**Expected**

- velocity logic prevents silent repetitive abuse
- alert/block behavior matches design

### `TC-CSH-H-013` - FLSA Unpaid Break Exclusion

**Objective**

Validate unpaid break time is excluded from tip pool hours.

**Steps**

1. Create a shift with a known unpaid break.
2. Close the shift.
3. Run tip pool allocation.
4. Compare hours used in tip pool math to actual paid hours.

**Expected**

- unpaid break duration is excluded from tip-pool-eligible hours

### `TC-MRC-M-018` - Tip Pool Config FLSA Warning On Non-Tipped Roles

**Objective**

Validate warning is shown when non-tipped roles are included.

**Steps**

1. Configure tip pool with a non-tipped role included.
2. Save or preview the configuration.

**Expected**

- warning appears
- no hard block if the spec says owner awareness only

### `TC-MRC-H-004` - DST Spring Forward During Night Shift

**Objective**

Validate spring-forward shift duration is `7` clock hours, not `8` elapsed.

**Steps**

1. Create a shift crossing spring-forward DST boundary.
2. Clock in before the jump and clock out after the jump.
3. Review calculated duration.

**Expected**

- duration reflects lost hour correctly

### `TC-MRC-H-005` - DST Fall Back During Night Shift

**Objective**

Validate fall-back shift duration is `9` clock hours, not `8`.

**Steps**

1. Create a shift crossing fall-back DST boundary.
2. Clock in before the repeated hour and clock out after.
3. Review calculated duration.

**Expected**

- duration reflects repeated hour correctly

### `TC-MRC-H-006` - End-Of-Day Close Reconciliation

**Objective**

Validate close report math.

**Steps**

1. Build a day with gross sales, discounts, voids, comps, tax, and multiple payments.
2. Run end-of-day close.
3. Verify:
   - gross - discounts - voids - comps = net
   - net + tax = total
   - total = sum of payments

### `TC-MRC-H-007` - Tax Rate Effective Date Change

**Objective**

Validate new tax rate applies only from effective date forward.

**Steps**

1. Create transactions before the tax effective date.
2. Change tax rate with a future effective date.
3. Create transactions after the effective date.
4. Compare tax application.

**Expected**

- no retroactive change to old transactions

### `TC-MRC-H-011` - PTO Accrual

**Status**

- Skip, per ticket

## Section C - Database Integrity, RLS, Audit

### `TC-MRC-H-008` - `audit_logs` Tamper Test

**Objective**

Prove merchant role cannot `UPDATE` or `DELETE` audit rows by any path.

**Steps**

1. Log in as merchant and perform an action that creates an audit row.
2. Identify the row in Supabase.
3. Simulate merchant auth context in SQL.
4. Attempt `UPDATE` on the audit row.
5. Attempt `DELETE` on the audit row.
6. Re-read the row.

**Expected**

- update blocked or affects zero rows
- delete blocked or affects zero rows
- row remains unchanged

### `TC-XCC-AUD-001` - Platform-Wide Audit Log Immutability

**Objective**

Prove audit rows are immutable across all actor types, not just merchants.

**Steps**

1. Generate audit rows from merchant, admin, and system paths if possible.
2. Attempt tamper/deletion under each corresponding role where applicable.
3. Verify no update/delete path exists.
4. Verify delayed/missing logging does not create backfill anomalies or partial states.

**Expected**

- no actor can mutate historical audit rows through allowed app/API paths

### `TC-XCC-AUD-002` - Audit Completeness On Sensitive Actions

**Objective**

Validate every sensitive action creates a meaningful audit entry.

**Steps**

1. Choose sensitive actions from multiple domains:
   - staff changes
   - location changes
   - settings changes
   - payment credential reads
   - suspension/reactivation
   - impersonation
2. Record exact test time.
3. Execute one action at a time.
4. Query `audit_logs` for the time window.
5. Validate row exists and is meaningful.

**Expected**

- every action produces an audit row
- row includes correct actor, resource, and change context

### `TC-XCC-SEC-001` - RLS Coverage + No Open Policies

**Objective**

Validate every `public.*` table has RLS + at least one policy, and no policy is effectively open unless explicitly approved.

**Steps**

1. Run catalog query for RLS-enabled tables without any policy.
2. Run catalog query for policies whose `USING` or `WITH CHECK` expression reduces to `true`.
3. Review results.
4. Separate intentional public-read exceptions from real findings.

**Expected**

- no unintended tables without policy
- no unintended always-open policy

**Core Queries**

```sql
select n.nspname as schema_name, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
  and c.relrowsecurity = true
  and not exists (
    select 1 from pg_policy p where p.polrelid = c.oid
  )
order by 1, 2;
```

```sql
select
  n.nspname as schema_name,
  c.relname as table_name,
  p.polname as policy_name,
  pg_get_expr(p.polqual, p.polrelid) as using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid) as with_check_expr
from pg_policy p
join pg_class c on c.oid = p.polrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and (
    coalesce(pg_get_expr(p.polqual, p.polrelid), '') in ('true', '(true)')
    or coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '') in ('true', '(true)')
  )
order by 1, 2, 3;
```

### `TC-XCC-SEC-002` - JWT Substitution Attack

**Objective**

Prove protected endpoints reject modified `sub`, forged signature, and revoked-token replay.

**Steps**

1. Capture a real bearer token from a protected authenticated request.
2. Modify only the `sub` claim and replay the request.
3. Forge a token with the wrong signing key and replay the request.
4. Log out or revoke the real session.
5. Replay the old token.

**Expected**

- all three attempts fail with `401` or `403`

**Evidence**

- request and response for each case
- note whether UI/browser must be refreshed afterward

### `TC-XCC-SEC-003` - PII Scrub In Logs And Exports

**Objective**

Validate no full PAN, no CVV, and no raw card payload leaks.

**Steps**

1. Execute payment-related success and failure flows.
2. Inspect:
   - audit logs
   - exports
   - error payloads
   - Supabase logs if available
3. Search for:
   - `cvv`
   - `ccnumber`
   - card-like 13-19 digit strings

**Expected**

- no full PAN ever
- no CVV ever
- at most masked card data or last-4

### `TC-XCC-SEC-004` - CSRF On State-Changing Routes

**Objective**

Validate state-changing routes cannot be abused cross-site.

**Steps**

1. Capture a real state-changing request from the app.
2. Replay it with:
   - missing `Origin`
   - fake `Origin`
   - missing anti-CSRF header if applicable
3. Attempt a cross-site form submit if the route supports form semantics.
4. Verify whether state changed.

**Expected**

- request blocked or rejected
- no state change occurs

### `TC-XCC-SEC-005` - Rate Limit On Auth And OTP

**Objective**

Validate send and verify throttling.

**Steps**

1. Request OTP six times for the same phone/store.
2. Verify whether the 6th attempt is blocked.
3. Request a fresh OTP.
4. Enter wrong OTP three times.
5. Attempt a 4th verify.

**Expected**

- send rate limit enforced
- verify-attempt limit enforced

### `TC-ADM-H-008` - Security-Definer View Audit

**Objective**

Review each flagged view and determine whether it should be rewritten or justified.

**Steps**

1. Pull exact flagged `security_definer_view` findings from Advisor.
2. Inspect definition of each view.
3. Check whether `security_invoker=true` is set.
4. Test low-privilege read paths where possible.
5. Determine:
   - safe and justified
   - rewrite needed
   - convert to function/RPC needed

## Section D - Admin DB Integrity + Cross-Merchant Isolation

### `D.1` - `admin_merchant_access` RLS Validation

**Objective**

Validate admin access grants and revocations are enforced at the RLS layer.

**Steps**

1. Create or confirm an admin access row for Merchant A with `is_active=true`.
2. Using direct API or crafted JWT path, query Merchant A tenant-scoped tables.
3. Attempt the same against Merchant B without an active access row.
4. Revoke Merchant A access by setting `is_active=false` and `revoked_at`.
5. Re-test after revocation.
6. Attempt to self-grant access from a merchant context if possible.

**Expected**

- Merchant A read works only when access is active
- Merchant B read is blocked
- revoked access stops within expected window
- self-grant attempt is blocked

### `D.2` - Cross-Merchant Isolation Under Admin Operation

**Objective**

Validate merchant users cannot see another merchant's data.

**Steps**

1. Use Merchant A user session.
2. Attempt direct access to Merchant B resource IDs across:
   - orders
   - customers
   - menu_items
   - staff_profiles
   - audit_logs
   - settlement_batches
   - merchant_billing_profiles
   - location_banking_profiles
   - support_tickets
3. Attempt search/autocomplete flows from Merchant A context.
4. Review whether Merchant B names, phones, or items appear.

**Expected**

- direct resource requests return `403`
- search/autocomplete returns only Merchant A data

### `D.3` - Admin Impersonation Dual Attribution

**Objective**

Validate impersonation is visible and correctly attributed.

**Steps**

1. Start impersonation session on Merchant X.
2. Perform one or more merchant actions while impersonating.
3. Inspect `audit_logs`.
4. Verify fields:
   - `actor_user_id`
   - `effective_user_id`
   - `impersonation_id`
   - `notes`
5. Open merchant-facing audit log view if available.
6. End impersonation.
7. Verify session expiration/closure behavior.

**Expected**

- actual admin identity is preserved
- impersonated identity is recorded separately
- impersonation cannot be hidden from merchant

### `D.4` - Merchant Suspension + Reactivation Safety

**Objective**

Validate operational lockout without data loss.

**Steps**

1. Put Merchant A into active operational state with in-flight work.
2. Suspend Merchant A.
3. Verify in-flight work can complete or close cleanly.
4. Verify new operations are blocked.
5. Reactivate Merchant A.
6. Verify normal operation resumes.
7. Verify audit trail exists for suspend/reactivate.

**Expected**

- suspension blocks new work without deleting data
- reactivation restores normal operation
- audit trail preserved

### `D.5` - Merchant Deletion Safety

**Objective**

Validate deletion safety when operational or financial state is still active.

**Steps**

1. Create scenario with staff clocked in or drawers open.
2. Attempt merchant deletion.
3. Observe whether:
   - delete is blocked with reason
   - decommissioning state is entered
4. Complete cash drawer sessions if required.
5. Re-attempt delete or finalization.
6. Verify chargeback / settlement / legal-hold data remains preserved.

**Expected**

- delete should not silently fail
- operational blockers should be explicit
- required records remain preserved

### `D.6` - Settlement & Financial Reconciliation Per Merchant

**Objective**

Validate merchant-scoped reconciliation consistency.

**Steps**

1. Compare daily settlement batch totals to `order_payments`.
2. Check for orphan `order_payments` rows.
3. Validate refund / void / chargeback reconciliation.
4. Inspect `invoice_number_sequences` for gaps.

**Expected**

- settlement sums align
- no orphan payment rows
- no duplicate or inconsistent chargeback reconciliation
- invoice sequences follow expected gap rules

### `D.7` - Sensitive Financial Data RLS

**Objective**

Validate financial profile access and masking rules.

**Steps**

1. Test `merchant_billing_profiles` and `location_banking_profiles` as:
   - admin with active access
   - admin without active access
   - merchant user
2. Verify merchant cannot access another merchant's profile.
3. Inspect stored/displayed values for bank/routing masking.
4. Verify token references exist per spec.
5. Verify `payment_credential_access_log` captures reads.

**Expected**

- only allowed admins can read
- merchant cross-merchant read is blocked
- no full bank/routing values stored or exposed
- access logging is present

### `D.8` - Webhook DLQ + Idempotency

**Objective**

Validate merchant scoping, idempotency, and DLQ cleanup.

**Steps**

1. Identify a DLQ row for Merchant A.
2. Replay it from admin flow.
3. Verify only Merchant A data changes.
4. Replay the same DLQ item again.
5. Verify no duplicate side effects occur.
6. Verify DLQ row is removed after successful replay.

**Expected**

- replay remains merchant-scoped
- replay is idempotent
- successful replay removes the DLQ row

## DST Tests (Cross-Cutting)

### `TC-XCC-DST-001` - `%_at` Columns Use `timestamptz`

**Objective**

Validate timestamp columns are timezone-aware.

**Steps**

1. Query information schema or catalog for `%_at` columns.
2. Identify columns typed as `timestamp without time zone`.

**Suggested Query**

```sql
select table_schema, table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and column_name like '%\_at' escape '\'
order by table_name, column_name;
```

**Expected**

- all relevant `%_at` columns are `timestamp with time zone`

### `TC-XCC-DST-002` - Reservation At 2:15am On Spring-Forward Night

**Objective**

Validate nonexistent local time is rejected, not silently shifted.

**Steps**

1. Configure a location in a DST-observing timezone.
2. Attempt to create a reservation at `2:15am` on spring-forward night.
3. Observe creation result.

**Expected**

- invalid local time is rejected explicitly

### `TC-XCC-DST-003` - Shift Ending At 1:30am On Fall-Back Night

**Objective**

Validate repeated local time is handled unambiguously.

**Steps**

1. Create a shift spanning the fall-back repeated hour.
2. Record whether the system distinguishes first vs second `1:30am`.
3. Review stored timestamps and duration.

**Expected**

- first vs second occurrence is explicit or documented

### `TC-XCC-DST-004` - Reports "Yesterday" After DST Transition

**Objective**

Validate relative-day reporting after DST change.

**Steps**

1. Create reportable data around a DST transition.
2. Run "yesterday" report the following day.
3. Compare report scope to expected business-local date boundaries.

**Expected**

- "yesterday" uses correct local-business date range

### `TC-XCC-DST-005` - Multi-Timezone Merchant Aggregation

**Objective**

Validate aggregation across locations in different timezones.

**Steps**

1. Use one merchant with NY and LA locations.
2. Generate activity in both.
3. Run aggregation/reporting.
4. Validate each location respects its own local boundary while merchant rollup remains coherent.

**Expected**

- no timezone mixing or off-by-one-day errors

## Suggested Execution Order

Recommended order if continuing from current QA state:

1. Finish Section A pending math/concurrency tests
2. Finish Section C auth / PII / CSRF / security-definer review
3. Finish Section D admin isolation and financial RLS
4. Finish DST set

