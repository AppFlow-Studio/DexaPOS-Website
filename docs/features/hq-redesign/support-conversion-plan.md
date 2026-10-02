# `/manage/support` — design-system audit and conversion (Family 5)

**Date:** 2026-09-30 · **Branch:** `Haydar-AdminRestructure` · **Spec:** [`docs/UI-DESIGN-SYSTEM.md`](../../UI-DESIGN-SYSTEM.md)

This covers every page under the sidebar's **Support** and **KDS** entries, audited against Part A and §14. The inbox
and KDS were converted on 2026-09-29, before D-25–D-28 (2026-09-30). The ticket thread and the new-ticket form were
never converted. The KDS conversion record is [`kds-conversion-plan.md`](kds-conversion-plan.md).

The audit was a code read only: the chrome-devtools MCP server failed to connect, so no widths were checked in a browser.

## Where each page stands

| Page | State | Main gaps |
|---|---|---|
| `support` (inbox) | Converted 2026-09-29; predates D-25–D-28 | Table from `lg` with an unprefixed `min-w-[680px]`; 3-line ticket cell; status is a card pair instead of leading; list state in `useState`, not the URL |
| `support/new` | Not converted | No shell (raw `div`, hand-written `h1`, icon-only back); `border-t` footer; `rounded-2xl border shadow-sm` card; bordered select and textarea triggers; no `new/loading.tsx`, so the inbox skeleton shows; silent failures |
| `support/[ticketId]` | Not converted | No `PageShell`/`PageHeader`/`Panel`; icon-only back with no `aria-label`; not-found and load-error are the same sentence with no Retry; `lg:border-l` rule; phone controls under 44px and below the whole thread; avatars on phones; silent mutation failures; skeleton matches the old layout |
| `support/kds-mirror` | Converted 2026-09-29; gaps | Divergence table scrolls sideways at 1024–1073px; errors render with a false empty sentence under them; three tables are still bounded (inner scroll); rows 2–3 lines; ledger and unsent show cards until `xl`; the ledger `Switch` fills `--primary` |
| `support/kds-truth` | Bare `redirect()` | — |
| `support/new` | A failed assignee load reads "Assignees couldn't be loaded" with a "try again" button (it read "No support assignees configured"); a failed create shows a toast | §4.9 |
| `support/[ticketId]` | On phones the ticket-controls panel comes before the thread (source order, no `order-*`, so reading order matches); from `lg` grid placement puts it in the rail | Controls were below the whole thread and composer |
| `support/[ticketId]` | A missing ticket says "Ticket not found"; any other failure says "We couldn't load this ticket" with Retry. The server action still returns "Ticket not found" for a DB error on the lookup, so that one case reads as not-found | §4.9 |
| `support/[ticketId]` | Status, assign, priority, category and send failures toast (they were silent). Auto-scroll jumps to the bottom on load only from `lg`, where the thread scrolls itself; below `lg` the page moves only after a send; smooth scroll respects reduced motion | §4.9, §7 |
| `AttachmentList` (shared with the merchant thread) | One close button in the preview (the hand-rolled second ✕ is gone); a hidden `DialogTitle` added for Radix | DS-CTL-08 |
| Inbox | Tab, filters, search and page live in the URL (`status`, `q`, `source`, `category`, `priority`, `assignee` = `unassigned`/`me`, `page`); search writes after 300 ms; every change but a page turn resets to page 1 | §5.9, D-28 |
| Inbox | The ticket number and unread badge show from `xl`; below that unread is bold with an `sr-only` count and the number is in the tooltip. Status words are short ("Waiting"), full label in the tooltip. Location and category left the row (merchant tooltip carries them; category is still a filter) | One-line rows at 414px (§5.3, §5.7) |
| Inbox | A refetch failure after a success now shows `LoadError` above the stale rows (it was hidden) | §4.9 |
| KDS send ledger | Items on order, station, device id and "Show on board" moved from the row into the expanded `SendDetail` (shared by row and card); the first flag is a pill, the rest "+N" | One-line rows |
| KDS send ledger | "Anomalies only" is a neutral `aria-pressed` chip with a fixed label (was a `--primary` `Switch`) | §3.5 |
| KDS board | The two-step status reset moved from an effect to a render-time adjustment (clears the pre-existing `set-state-in-effect` lint error) | — |

§14.5's "still pending" note is out of date for `[ticketId]` and `new`: commit `8b658018` already removed their amber
internal notes, coloured action buttons, `<Separator>` dividers and the blue callout. What is left is structural.

## Work items

### Step 1 — KDS faults (real bugs, local)

- [x] Divergence table fits every width: `hidden md:block`, `table-fixed`, `bounded={false}`, columns tiered (Item, Order, Verdict essential; Server routed and Device from `lg`; Kitchen status from `xl`), no unprefixed `min-w`, cards `md:hidden` (§5.3, D-26)
- [x] Divergence rows one line tall: `truncate` instead of `line-clamp-2`, no `align-top`; the "device was online/offline" note moves into the Device cell, so the verdict cell is just the verdict (§5.7, D-25)
- [x] Divergence emphasis is one rule for row and card: `needsAttention` verdicts by weight (the table bolded only NEVER_SHOWED)
- [x] Board: a failed load shows only `LoadError`, never "No pending tickets" beneath it (§4.9 "Unknown is not zero")
- [x] Device truth: a failed truth window shows `LoadError` in "Routed vs seen" and a sentence in "Divergences", instead of "No truth timeline" / "No routed items"
- [x] Display health: a failed `useKdsDeviceTruthHealth` shows `LoadError`, not "No KDS displays at this location"
- [x] Scope controls: a failed locations, displays or routing-health load shows `LoadError` with Retry under the pickers; a loaded-but-empty location list says so in the placeholder
- [x] Merchant picker: a failed search says so (not "No merchant matches that"); a failed selected-merchant lookup doesn't read "Loading merchant..." forever

### Step 2 — `support/new`

- [x] `PageShell as="div" width="narrow"` + `PageHeader` with `backHref`/`backLabel` (D-01, D-04, §14.1)
- [x] Form in `Panel padded`; footer separated by spacing, not `border-t` (§5.5, §3.1)
- [x] Callout: `rounded-2xl bg-muted/60 px-4 py-3`, bare muted icon, no plate
- [x] Select triggers and textarea on the muted, borderless material (§4.2); `AssigneeEmailMultiSelect` trigger and popover (`rounded-2xl`, `w-[var(--radix-popover-trigger-width)]`)
- [x] Phone buttons `h-11 sm:h-9` (§13.6)
- [x] Failures are sentences: assignee-load failure and create failure (§4.9)
- [x] New `new/loading.tsx` shaped like skeleton D (§14.4)

### Step 3 — `support/[ticketId]`

- [x] Skeleton C: `PageShell as="div"`, `PageHeader` (subject, status/priority, back to Support, actions), thread and rail each on a panel surface; no `lg:border-l`
- [x] Not-found vs load-error split, with Retry (`DetailUnavailable`)
- [x] Rail headings via `PanelSection`; Textarea on the muted material
- [x] Phones: controls reachable before the thread, `h-11` targets, no avatar plates (§13.4, §13.6)
- [x] Mutation failures toast; reduced-motion respected by the auto-scroll (§7)
- [x] Shared `AttachmentList` (also used on the merchant thread): drop the second close button, neutral PDF glyph, `rounded-2xl` tiles
- [x] Rewrite `SupportTicketSkeleton` with the page (§14.4)

### Step 4 — Tables onto D-25–D-28 (inbox + KDS together)

- [x] Inbox: table from `md`, tiered columns, one-line rows, status leads the card; `loading.tsx` moves with it
- [x] Inbox: status, filters, search and page in the URL (§5.9, D-28)
- [x] KDS send ledger and unsent items: table from `md`, tiered, `bounded={false}`, one-line rows; ledger `Switch` becomes the neutral `aria-pressed` chip
- [x] KDS skeleton: one stacked board column below `lg`, the filter-pill rows, and a title bone at the h1's height
- [ ] ~~KDS skeleton follows `?tab=`~~ — not possible: `loading.tsx` gets no search params, and the Suspense fallback shows *because* the page is suspended on `useSearchParams`, so it cannot read the tab either. It stays board-shaped (its docblock says so)

### Step 5 — Doc housekeeping

- [x] §14.5: correct the `[ticketId]` / `new` notes, record each step as it lands
- [x] `kds-conversion-plan.md`: correct the divergence-fit and error-handling claims

## Behaviour changes beyond presentation

| Where | Change | Why |
|---|---|---|
| KDS divergences | The "device was online/offline" note moved from under the verdict into the Device cell ("Online when fired" / "Offline when fired"); every `needsAttention` verdict is bold in the table, not just NEVER_SHOWED | One-line rows (§5.7); one emphasis rule for row and card |
| KDS, all tabs | A query that fails before it ever returns now shows only its `LoadError`; the view's empty sentence no longer renders under it. A refetch failure after a success keeps the last good data under the error | §4.9 "Unknown is not zero" |
| KDS scope controls | Locations, displays and routing-health failures now surface as one `LoadError` with Retry under the pickers (they were silent). An empty location list says "No locations for this merchant" | §4.9 |
| KDS merchant picker | A failed search shows "We couldn't search merchants" with Retry, not "No merchant matches that". The first load shows the spinner instead of the no-match sentence | §4.9 "Loading is not empty" |
| `support/new` | A failed assignee load reads "Assignees couldn't be loaded" with a "try again" button (it read "No support assignees configured"); a failed create shows a toast | §4.9 |
| `support/[ticketId]` | On phones the ticket-controls panel comes before the thread (source order, no `order-*`, so reading order matches); from `lg` grid placement puts it in the rail | Controls were below the whole thread and composer |
| `support/[ticketId]` | A missing ticket says "Ticket not found"; any other failure says "We couldn't load this ticket" with Retry. The server action still returns "Ticket not found" for a DB error on the lookup, so that one case reads as not-found | §4.9 |
| `support/[ticketId]` | Status, assign, priority, category and send failures toast (they were silent). Auto-scroll jumps to the bottom on load only from `lg`, where the thread scrolls itself; below `lg` the page moves only after a send; smooth scroll respects reduced motion | §4.9, §7 |
| `AttachmentList` (shared with the merchant thread) | One close button in the preview (the hand-rolled second ✕ is gone); a hidden `DialogTitle` added for Radix | DS-CTL-08 |
| Inbox | Tab, filters, search and page live in the URL (`status`, `q`, `source`, `category`, `priority`, `assignee` = `unassigned`/`me`, `page`); search writes after 300 ms; every change but a page turn resets to page 1 | §5.9, D-28 |
| Inbox | The ticket number and unread badge show from `xl`; below that unread is bold with an `sr-only` count and the number is in the tooltip. Status words are short ("Waiting"), full label in the tooltip. Location and category left the row (the merchant tooltip carries them; category is still a filter) | One-line rows at 414px (§5.3, §5.7) |
| Inbox | A refetch failure after a success now shows `LoadError` above the stale rows (it was hidden) | §4.9 |
| KDS send ledger | Items on order, station, device id and "Show on board" moved from the row into the expanded `SendDetail` (shared by row and card); the first flag is a pill, the rest "+N" | One-line rows |
| KDS send ledger | "Anomalies only" is a neutral `aria-pressed` chip with a fixed label (was a `--primary` `Switch`) | §3.5 |
| KDS board | The two-step status reset moved from an effect to a render-time adjustment (clears the pre-existing `set-state-in-effect` lint error) | — |

## Verification log

- **Step 1 (2026-09-30):** `tsc --noEmit --incremental false` reports 839 errors, none in the four changed files (the rest are in unrelated menu, orders and edge-function files; the 822 baseline in memory predates other uncommitted branch work). `eslint` on the four files is clean. **Not browser-checked:** the chrome-devtools MCP server failed to connect. Width budget, by arithmetic: the panel section leaves the table ~414px at `md`, ~670px at `lg`, ~926px at `xl`; the fixed columns take 224 / 512 / 640px, leaving Item 190 / 158 / 286px.
- **Steps 2–5 (2026-09-30):** `tsc --noEmit --incremental false` reports 836 project errors, **none** in `app/manage/support/**`, `components/support/{AttachmentList,AssigneeEmailMultiSelect,FileUploadInput}.tsx` or `app/dashboard/support/**` (the merchant thread that shares `AttachmentList`). `eslint app/manage/support` is clean; the three shared components carry only pre-existing `<img>` warnings. §3.5 grep: the only hues left are the HQ-2 send-failure glyphs and figures. **Not browser-checked** (chrome-devtools MCP down). Worth checking at 375 / 768 / 1024 / 1280 / 1536, both themes: the three KDS tables and the inbox at each tier, the ticket thread's `lg` height calc (a two-line subject or the impersonation banner scrolls the page slightly), and the merchant-side attachment preview.
