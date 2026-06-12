# QA Test Plan — GlobalSearch Command Palette

Feature: dashboard top-bar command palette (`GlobalSearch`) — navigation fuzzy routing + record search (orders/customers/menu items).

**Environment constraint:** local dev Clerk session is an HQ admin, so `/dashboard/*` redirects to `/manage`. Merchant-context UI is exercised via a temporary harness route under `/manage`; record-search query logic is validated against the real DB with the service-role client (mirrors the action's exact filters). This is noted per case.

| # | ID | Test case | Steps | Expected | Maps to AC |
|---|-----|-----------|-------|----------|-----------|
| 1 | OPEN-CLICK | Top-bar button opens palette | Click search icon in dashboard top bar | Centered modal opens, input focused | AC1 |
| 2 | OPEN-KBD | ⌘K / Ctrl+K opens; toggles | Press Ctrl+K | Palette opens; press again toggles closed | AC1 |
| 3 | CLOSE-ESC | Esc closes | Open palette, press Esc | Palette closes | AC1 |
| 4 | NAV-EXACT | Section routes on Enter | Type "discounts", Enter | Router pushes `/dashboard/discounts` | AC2 |
| 5 | NAV-SUB | Subsection routes | Type "service charge", Enter | Pushes `/dashboard/tables/service-charge` | AC2 |
| 6 | FUZZY-TYPO | Typo-tolerant | Type "invntry" | Inventory appears as top result | AC3 |
| 7 | FUZZY-OOO | Out-of-order | Type "cash draw" | Cash Drawers appears | AC3 |
| 8 | REC-ORDER | Order number/name → orders | Search term matches orders | Orders group returns matching orders; select → `/dashboard/orders/{id}` | AC4 |
| 9 | SCOPE-TENANT | No cross-tenant leak | Query with bogus/non-merchant org | Returns empty | AC5 |
| 10 | SCOPE-LOC | Active location filter | Same query, all vs one location | Location-scoped ⊆ all-locations | AC5 |
| 11 | EMPTY-RECENT | Recents on empty query | Open palette, no input | "Recent" group with count + items | AC6 |
| 12 | COUNT | Per-group counts | Type a query with matches | Group headers show count badge | AC6 |
| 13 | HIGHLIGHT | Matched text highlighted | Type "invntry" | Matched chars highlighted in row | AC6 |
| 14 | SEE-ALL | Overflow "See all results" | Type "report" (>7 nav matches) | Cap at 7 + "See all results (N) →"; expands inline | AC6 |
| 15 | NO-MATCH | Empty state | Type "zzzzzqqq" | "No results match …" message | AC7 |
| 16 | LOADING | In-flight indicator | Trigger record search | "Searching records…" spinner shown | AC7 |
| 17 | KBD-FLOW | Keyboard-only end to end | Ctrl+K → ↓ → Enter → reopen → Esc | Full flow works without mouse | AC8 |

## Results — executed 2026-06-12 (dev server localhost:3000)

| # | ID | Result | Evidence |
|---|-----|--------|----------|
| 1 | OPEN-CLICK | ✅ PASS | Click → `cmdk-root` present, input `activeElement` focused |
| 2 | OPEN-KBD | ✅ PASS | Ctrl+K → open=true; Ctrl+K again → open=false (toggle) |
| 3 | CLOSE-ESC | ✅ PASS | Esc → `cmdk-root` removed |
| 4 | NAV-EXACT | ✅ PASS | "discounts" + Enter → dialog closed, recents[0]=`/dashboard/discounts` |
| 5 | NAV-SUB | ✅ PASS | "service charge" + Enter → recents[0]=`/dashboard/tables/service-charge` |
| 6 | FUZZY-TYPO | ✅ PASS | "invntry" → top item "Inventory", Pages count 1 |
| 7 | FUZZY-OOO | ✅ PASS | "cash draw" → Cash Drawers + Cash Drawers Report (count 2) |
| 8 | REC-ORDER | ✅ PASS | "Ali" → 41 orders (names: Ali jj/awdi/jaffal); row-select routes `/dashboard/orders/{id}` (verified prior run). Query `error:null` |
| 9 | SCOPE-TENANT | ✅ PASS | `SearchRecords("org_DOES_NOT_EXIST_qa", …)` → all groups empty (`bogusTenantEmpty:true`) |
| 10 | SCOPE-LOC | ✅ PASS | location-scoped count ≤ all-locations (`scopedIsSubsetOfAll:true`) |
| 11 | EMPTY-RECENT | ✅ PASS | empty query → "Recent" group, count 5 |
| 12 | COUNT | ✅ PASS | group headers show count badge (Pages 1 / 2 / 12, Recent 5) |
| 13 | HIGHLIGHT | ✅ PASS | "invntry" → label DOM = `<span bg:yellow>Inv</span>e<span>nt</span>o<span>ry</span>` (microfuzz ranges) |
| 14 | SEE-ALL | ✅ PASS | "report" → Pages 12, 7 visible + "See all results (12) →"; expands inline to 12 |
| 15 | NO-MATCH | ✅ PASS | "zzzzzqqq" (after records settle) → "No results match "zzzzzqqq."" |
| 16 | LOADING | ✅ PASS | during in-flight record query → "Searching records…" indicator shown |
| 17 | KBD-FLOW | ✅ PASS | Ctrl+K → type → ArrowDown (selection → row 2) → Enter (routed `/dashboard/tables/service-charge`); Esc closes |

**Summary: 17 / 17 PASS** — all 8 acceptance criteria covered.

### Caveats / not covered by automation
- **Live merchant-session UI for record groups:** record search was validated by (a) the action's query logic + scoping against the real DB and (b) record-group rendering via mock data + verified row routing. A final smoke test from a real merchant login (or HQ impersonation) — typing a real order number and seeing the Orders group populate from the network — is recommended before merge, since the local dev session is an HQ admin that cannot reach `/dashboard`.
- **Ctrl+K in production layout:** the keystroke listener was tested via an identical copy in the harness; the real wiring in `app/dashboard/layout.tsx` is confirmed by code inspection (same handler).
- `display_number` double-`#`: the mock used a `#`-prefixed value; real `orders.display_number` has no `#`, so the row renders `#<number>` once. Not a code defect.
