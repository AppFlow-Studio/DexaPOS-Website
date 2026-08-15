# Design — builder UI, from first principles

**Date:** 2026-08-14
**Author:** Ali Awdi (with Claude)
**Status:** 🔵 **Proposal. No code has been changed.** Nothing here is built; nothing here is agreed
**Input:** [RESEARCH-2026-08-14-BUILDER-UI-PRIOR-ART.md](RESEARCH-2026-08-14-BUILDER-UI-PRIOR-ART.md) — 18 shipped products surveyed via Mobbin
**Constraints honoured:** the architecture in [HANDOFF §3.3](HANDOFF-2026-08-13-BUILD-SESSION.md#33-architecture) (A1–A11). The *data model is fixed*; only the interface is redrawn

> **How this was written:** the existing builder UI was set aside deliberately and the interface designed from
> scratch against the architecture and the prior art, so that the result is not an incremental defence of what
> already exists. Appendix A maps it back to what is built today. Decisions carry IDs **UI1–UI21** so they can be
> accepted or rejected individually.

---

## 1. The governing principle

Every product in the survey is an editor for a **static** page. Ours is the only one where the page is a window into
a **running POS** — prices, 86'd items, hours and phone numbers are live by construction (A4).

**Therefore: live data is a visible, first-class citizen of the editor, not an invisible implementation detail.**

A merchant must be able to see at a glance which parts of the page are wired to the POS and which are hand-typed,
and must be told when a live reference breaks. Today none of that surfaces — an `unavailable` binding is silently
dropped at render, the exact defect class fixed in [HANDOFF §6b](HANDOFF-2026-08-13-BUILD-SESSION.md#6b-render-cost--measured-and-reduced-2026-08-14).

The second governing fact, which settles anything the first doesn't:

**The user is a restaurant owner, not a designer.** This disqualifies the Webflow / Figma / Framer information
architecture outright, whatever the quality of their craft.

---

## 2. The shell

Two persistent columns; the third appears on selection.

```
┌────────────────────────────────────────────────────────────────────────────┐
│ ←  Joe's Coffee ▾   Home ▾      [▭ ▯ ▫]     ↶ ↷  ↗  Saved 2m   Publish·3 ▾ │
├──────────────────┬────────────────────────────────────┬────────────────────┤
│ ⌕ Search         │                                    │  ▤ Guest Favorites │
│                  │      ┌────────────────────┐        │  ┌──────┬──────┐   │
│ HEADER        🔒 │      │                    │        │  │Content│Style│   │
│  ⠿ ▤ Nav bar     │      │    live canvas     │        │  └──────┴──────┘   │
│                  │      │  (server-rendered) │        │                    │
│ PAGE             │      │                    │        │  Heading           │
│  ⠿ ▤ Hero        │      │  ·················  │       │  [ Guest Favorites]│
│  ⠿ ▤ Guest Favs ⚡⚠│     │   +  Add section   │       │                    │
│  ⠿ ▤ About       │      │  ·················  │       │  Items          ⚡ │
│  ⠿ ▤ Hours    ⚡ │      │                    │        │  ⠿ Latte    $4.50  │
│  ⠿ ▤ FAQ         │      │                    │        │  ⠿ Bagel  ⚠ 86'd ×│
│  + Add section   │      │                    │        │  + Add item        │
│                  │      └────────────────────┘        │                    │
│ FOOTER        🔒 │                                    │  Layout            │
│  ⠿ ▤ Footer   ⚡ │                                    │  ○ Grid  ● Row     │
└──────────────────┴────────────────────────────────────┴────────────────────┘
   structure (240)              canvas (flex)              inspector (340)
```

**UI1 — The inspector is conditional, not persistent.** Two fixed rails cost ~580px of chrome; the merchant is on a
1280–1440px laptop, which leaves a canvas too narrow to judge a desktop layout in. Shopify affords three columns
only by assuming a wide monitor. Making the third column appear on selection yields two honest modes:

- **Review** — nothing selected, canvas near-full-width. Where the merchant decides whether the site looks right.
- **Edit** — a section selected, inspector in.

`Esc` deselects and returns to review. This is the single most contestable call in the document.

**UI2 — Editor chrome is monochrome. Zinc only, no accent colour anywhere in the frame.** Convergent across
Shopify, Squarespace, Salesforce and Uvodo, and for a reason: the merchant's brand colour must be the only saturated
thing on screen or they cannot judge it. An editor with its own blue primary button beside the canvas poisons that
judgment. The `Publish` button is near-black, not brand-blue.

---

## 3. Decision register

| # | Decision | Source | Rationale |
|---|---|---|---|
| **UI1** | Inspector appears on selection; structure rail persistent | — | Canvas width on a 1280px laptop. Yields review/edit modes |
| **UI2** | Monochrome editor chrome, no accent colour | Shopify, Squarespace | Brand colour must be the only saturated thing on screen |
| **UI3** | Structure rail grouped by **zone** with labelled dividers | Shopify | Makes the A1 zone constraint visible instead of enforcing it after the fact via toast |
| **UI4** | `+ Add section` inside **each zone group**, not once globally | Shopify | Position becomes implicit; kills "I added it and it went to the wrong place" |
| **UI5** | Rows labelled with the section's **own heading**, falling back to the registry label | Shopify, Framer | "Guest Favorites", not "Menu Highlights" — a scannable list vs. nine identical nouns |
| **UI6** | Search field at the top of the rail | Retool, Framer | A nine-item eyeball scan stops working at 17 kinds |
| **UI7** | **`⚡` live-binding and `⚠` broken-binding glyphs on rail rows** | **none — new** | The governing principle, made ambient. Surfaces the §6b silent-drop class before a customer sees it |
| **UI8** | Drag handles in the rail only; never the canvas | A11 | Keyboard reordering free from dnd-kit; simultaneously simplest and most accessible |
| **UI9** | Hover-between-sections reveals a **`+` insert rule** in the canvas | Dribbble, Flodesk | Best insert affordance in the survey — states position without a word of UI |
| **UI10** | **Inspector on/off toggle** (`⌘⇧I`) | Shopify | An editor that permanently swallows clicks makes it impossible to test your own links or accordions |
| **UI11** | Inspector split into `Content` / `Style` tabs | Salesforce | Two tabs, not Webflow's five. Style = the `section-shell` vocabulary; Content = text and bindings |
| **UI12** | **Binding picker shows real dish, live price, live availability** | **none — new** | Not a text field, not an ID list. Draws from the *resolvable* set (§6b), never raw `menu_items` |
| **UI13** | **Bound values are never editable in place** | A4 | The absence of a price field *is* the explanation of A4. The merchant learns "I change this in the menu" on first look |
| **UI14** | `RESET TO DEFAULT` per generated form group | Squarespace, Gamma | Generated forms let people paint into corners; every mature editor ships an exit |
| **UI15** | **Publish button carries the unpublished-change count** — `Publish · 3` | **none — new** (GitBook hints in prose) | Free from A2's immutable versions. Draft-vs-published is the #1 merchant misunderstanding; this makes it ambient |
| **UI16** | Autosave stays; save state reads **`Saved 2m ago`**, not `Saved` | Shopify, Squarespace | A bare checkmark doesn't answer the question a nervous merchant is asking |
| **UI17** | **No separate `Save` button** | contra Uvodo, Salesforce | Both have one because neither autosaves. Two save-shaped buttons where one is automatic is the worst of both |
| **UI18** | Publish is a **popover**, not a modal; lists what changed; errors link to the offending section | GitBook + `validatePage` | Frequent, non-destructive action. A count with no path to the fix only creates anxiety |
| **UI19** | Version rollback copy taken near-verbatim from **Resend** | Resend | It is a literal, plain-English description of A2 |
| **UI20** | **Point-in-time preview before restore** | GitBook | *Look before you leap* is worth more than any amount of confirmation-dialog wording |
| **UI21** | Below `lg`, the rail drills in; canvas becomes a `Preview` tab | Uvodo | Merchants do open a 1280px lid and a tablet more often than we would like |

---

## 4. Region by region

### 4.1 Structure rail — 240px, persistent

Taken from [Shopify](https://mobbin.com/screens/0d104579-3bee-41f5-b33f-3eef140f0568), the best structure panel in
the survey, with three changes (UI3, UI4, UI7).

**Zones are labelled groups** — `HEADER` / `PAGE` / `FOOTER` in small caps, locked zones carrying a lock glyph. Zone
rules exist today in the mutation reducers and are enforced by a toast on violation; showing them means the merchant
never attempts the illegal move. **Refusal-by-toast is the worst available way to teach a constraint.**

**Row anatomy:**

```
⠿  ▤  Guest Favorites          ⚡ ⚠   👁  ⋯
│   │   │                       │  │   │   └─ duplicate / hide / delete
│   │   │                       │  │   └───── visibility toggle
│   │   │                       │  └───────── a binding failed to resolve
│   │   │                       └──────────── section carries live bindings
│   │   └──────────────────────────────────── the section's own heading (UI5)
│   └──────────────────────────────────────── registry icon
└──────────────────────────────────────────── drag handle (dnd-kit, keyboard-operable)
```

`⚡` and `⚠` (**UI7**) are the rail's whole reason for existing beyond reordering. `⚡` says *this content comes from
your POS*. `⚠` says *one of the things this points at is gone or unavailable*. Both derive from data the resolver
already computes and currently discards.

Page selection lives in the toolbar, not here — see UI-note in §4.4.

### 4.2 Canvas

- Hover → 1px outline plus a small floating label naming the section. Click → select.
- **UI9:** hovering the gap between two sections reveals a thin rule with a centred `+`. Clicking it opens Add
  Section pre-targeted at that position.
- **UI10:** an inspector on/off toggle. With it off the canvas behaves exactly as the live site, so the merchant can
  test their own links, `<details>` accordions and menu tabs.
- Device switcher resizes the canvas frame. It does not reload it.

### 4.3 Inspector — 340px, on selection

Header: registry icon + section name + `⋯` (duplicate, hide, delete), so destructive actions live in exactly one
place rather than being duplicated between rail and panel.

**`Content` / `Style` tabs (UI11).** Content = text and bindings. Style = spacing, background tone, alignment — the
existing `section-shell` vocabulary. A restaurant owner has no use for an interactions panel.

**The binding picker (UI12, UI13) is the control that matters**, and no product in the survey has one:

```
Items                                    ⚡ Live from your menu
┌────────────────────────────────────────────────────────┐
│ ⠿  Latte                         $4.50              ×  │
│ ⠿  Blueberry Bagel     ⚠ Unavailable at this location × │
│ ⠿  Cold Brew                     $5.25              ×  │
└────────────────────────────────────────────────────────┘
+ Add item
```

Two rules, both correctness properties rather than polish:

1. **An unavailable binding is shown, never hidden.** Visible, removable, with a plain-language reason. Today it
   silently disappears at render.
2. **Bound values are not editable here.** No price field, no dish-name field, ever.

`+ Add item` opens a searchable list drawn from the **resolvable** set — items on a menu actually serving this
location — never from raw `menu_items`. This is the §6b correctness fix expressed as an interface constraint rather
than a seed-helper detail.

Everything else is generated from Zod as planned (A9), grouped by schema group, each group carrying
`RESET TO DEFAULT` (UI14).

### 4.4 Toolbar

| Slot | Contents |
|---|---|
| **Left** | `←` back · site name ▾ · **page ▾** |
| **Centre** | device segmented control — desktop / tablet / mobile |
| **Right** | `↶ ↷` · view live site `↗` · save state · **`Publish · 3` ▾** |

Page selection is a **dropdown, not a rail**: the UI is home-page-only today, and a dropdown scales to the
multi-page model already in the schema without a redesign.

`Publish · 3` (**UI15**) is the highest-value single element in this design. The count comes from diffing the draft
against the live version — free, given A2 — and it makes the draft/published split, the thing merchants most
reliably misunderstand, permanently visible. The `▾` opens version history.

---

## 5. Flows

### 5.1 Add a section

Entered three ways — a zone's `+ Add section` (UI4), a canvas `+` rule (UI9), or `⌘K` — into one modal:

- **Category rail** on the left ([Squarespace](https://mobbin.com/screens/043d9866-d11c-4729-a54e-c86c1b84e3d4)). One
  `category` field on the registry entry. A flat grid is fine at 9 kinds and fails at 17.
- **Rendered thumbnails, not icons** ([Flodesk](https://mobbin.com/screens/5b916b2f-49a4-44a7-82b7-f938a25a719d)). A
  merchant picking "Hero" wants to see a hero.
- **Search focused on open, `⏎` inserts the top hit**
  ([Confluence](https://mobbin.com/screens/e2984777-9017-4d3a-a21f-ed53118596b7)).

Insertion position is inherited from the entry point. The modal never asks where.

### 5.2 Publish — **UI18**

A popover, not a modal. Publishing is frequent and non-destructive; a full-screen modal is the wrong weight.

```
Publish changes
────────────────────────────────────
3 changes since Aug 12, 4:20 pm
  • Hero heading edited
  • Guest Favorites added
  • FAQ reordered

⚠ 1 issue must be fixed before publishing
  Hero is missing a heading          → Fix
────────────────────────────────────
                    [ Cancel ]  [ Publish ]
```

Errors block; each links to its section — `→ Fix` selects it and opens the inspector on the offending field.
Warnings appear in the same list styled as tips and never block. This is the existing `validatePage` errors/warnings
split given somewhere to live: a toolbar pill showing a count with no path to the fix is a dead end.

On success: toast with a `View site ↗` link.

### 5.3 Version history and rollback — **UI19, UI20**

A right-side **sheet**, not a page. Rows grouped `Today` / `Yesterday` / date, each carrying timestamp, author
avatar, change count, and `Live` / `Current draft` badges.

Two actions per row:

- **Preview** — opens that version's render in a new tab (**UI20**).
- **Restore** — dialog copy taken near-verbatim from Resend (**UI19**):

  > **Restore this version?**
  > This will create a new version with the content from the selected one. Your current content will be preserved in
  > Version History.

  When the draft is dirty, append Relevance AI's conditional second clause: *"Any unpublished changes will be
  lost."*

Confluence's compare-two-versions is **cut** — right feature, wrong user.

### 5.4 First run

Nobody should meet an empty canvas. A **template picker** modelled on
[The Leap](https://mobbin.com/screens/65fccf5e-ff8a-406e-aeac-de303f6fb603): a small set of presets, each rendered
**with that merchant's real menu and brand colour already in it** — which we can do and Squarespace structurally
cannot. Choosing one commits a starter `PageDocument`; the merchant then edits rather than builds.

This is blocker **B11** and it is on the critical path for launch quality.

### 5.5 Narrow screens — **UI21**

Below `lg`, drill in rather than hide. The rail becomes the primary view; tapping a section pushes the inspector in
full-width with a back arrow; the canvas becomes a `Preview` tab.

---

## 6. Deliberately rejected

| Rejected | Why |
|---|---|
| Webflow's class / style-selector system | Designer tool. The merchant has no mental model of a CSS class, and A3 leaves nothing to attach one to |
| Figma's numeric X/Y/W/H inspector | No absolute positioning exists in the data model. The control would be a lie |
| Framer's AI-chat-as-inspector | Reachable later via A6, but it replaces a direct-manipulation UI the merchant has not learned yet. Wrong order, not wrong idea |
| Confluence's compare-two-versions | Too heavy for the audience; `Preview` (UI20) answers the same question |
| Readymag's floating panels | Forfeits the keyboard reordering a docked dnd-kit rail gives free |
| Canvas drag-and-drop | A11 was right the first time |
| A separate `Save` button | UI17 — two save-shaped buttons where one is automatic |

---

## 7. What is genuinely new here

Four elements exist in no product surveyed, all falling out of having a POS behind the page, and none requiring
anything the data model doesn't already carry:

| # | Element |
|---|---|
| **UI7** | `⚡` / `⚠` live-binding indicators in the structure rail |
| **UI12 / UI13** | A binding picker showing real prices and real availability, in which bound values are conspicuously not editable |
| **§5.4** | Starter templates pre-filled with the merchant's actual menu and brand colour |
| **UI15** | `Publish · 3` — the unpublished-change count on the button itself |

The remainder is Shopify's information architecture, Squarespace's insert modal, Salesforce's tab split, GitBook's
preview-before-revert, and Resend's rollback sentence.

---

## Appendix A — delta from what is built today

Recorded for estimation only; the design above was written without reference to it.

| Area | Today | Proposed | Rough cost |
|---|---|---|---|
| Shell | 3 fixed columns, both rails `hidden` below `md`/`lg` | Rail persistent, inspector on selection (UI1), drill-in below `lg` (UI21) | Moderate — `BuilderShell` layout + a mode in the store |
| Rail | Flat list, kind labels | Zone groups, content labels, per-zone add, search, `⚡`/`⚠` (UI3–UI7) | Moderate. `⚡`/`⚠` needs resolver outcomes surfaced to the client — the only new data path in this document |
| Canvas | Click-select | `+` insert rules (UI9), inspector toggle (UI10) | Small |
| Inspector | Generated form, no tabs | Content/Style tabs, binding picker, reset-per-group (UI11–UI14) | **Largest item.** The binding picker is genuinely new UI |
| Toolbar | Device switcher, undo/redo, validation pill, disabled Publish | Page dropdown, change count, `Saved 2m ago`, publish popover (UI15–UI18) | Moderate; the validation pill is absorbed into the popover |
| Publish / versions | Not built (Stage 5) | §5.2, §5.3 | Stage 5 scope, unchanged in size |
| First run | Empty canvas | Template picker (§5.4) | B11 — needs a designer and a budget |

**Nothing in this document requires a migration or a change to the section contract.** UI7 is the only item needing
data that does not currently reach the client, and that data is already computed by the resolver and discarded.

---

## Appendix B — open questions

| # | Question |
|---|---|
| 1 | **UI1** — is the conditional inspector right, or should it be persistent with a collapse toggle? Most contestable call here |
| 2 | **UI17** — dropping the separate `Save` button. Second most contestable |
| 3 | Do rendered section thumbnails (§5.1) need a designer, or can they be screenshots of the real renderers against fixture data? |
| 4 | Does `⚠` (UI7) need to survive into the *published* site as an HQ-visible signal, or is it editor-only? |
| 5 | Does the change list in the publish popover (§5.2) require a real document diff, or is a per-mutation activity log sufficient? |
