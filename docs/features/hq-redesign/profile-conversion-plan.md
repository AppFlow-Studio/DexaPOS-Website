# `/manage/profile` — design-system conversion (Family 5)

**Date:** 2026-09-29 · **Branch:** `Haydar-AdminRestructure` · **Spec:** [`docs/UI-DESIGN-SYSTEM.md`](../../UI-DESIGN-SYSTEM.md)

`/manage/profile` was the unconverted twin of the merchant `/dashboard/profile`: the same identity summary over Clerk's `<UserProfile>`, but on a hand-rolled `h1`, two `<Card>`s, a `secondary` `Badge` and Clerk's own bordered card. Rather than copy the merchant page's ~60 lines of Clerk theming, both pages now share one component.

## Scope

| File | Change |
|---|---|
| `components/profile/AccountProfile.tsx` | **New.** `ProfileIdentityPanel` and `ClerkAccountPanel`, lifted from `/dashboard/profile` |
| `app/manage/profile/page.tsx` | Rebuilt on `PageShell as="div" width="narrow"` + `PageHeader` + the shared panels. The HQ role is the identity label |
| `app/manage/profile/loading.tsx` | **New.** `DataPageSkeleton variant="profile" shell="plain"` inside a narrow `PageShell as="div"` (§14.4) |
| `app/dashboard/profile/page.tsx` | Now composes the shared panels; org names are the identity labels |
| `components/dashboard/loading/DataPageSkeleton.tsx` | The profile skeleton's avatar slot is hidden below `sm` |

## Work items

- [x] Shell: `PageShell as="div" width="narrow"` (§14.1, skeleton D); `h1` from `PageHeader` (was `text-2xl font-bold`); subtitle drops below `sm` automatically
- [x] Identity: `<Card>` → `Panel padded`; the role `Badge variant="secondary"` → the canonical neutral pill (§4.6b)
- [x] Clerk widget: the `border rounded-lg` card → the shared `ClerkAccountPanel` — Clerk's card stripped bare inside a `Panel`, muted borderless fields, no section rules (§4.2, §5.5), dark-mode palette (C4), and the painted-content fallback so the panel never sits empty while Clerk boots
- [x] Mobile: the avatar beside the name drops below `sm` (§13.4), and so does its skeleton slot (§5.4)
- [x] Error: a failed `useUserInfo` now says so on a neutral well with Retry (§4.9). HQ used to render an empty card; merchant showed a skeleton forever
- [x] Route skeleton added, so the page no longer arrives from a blank canvas

## Behaviour changes on `/dashboard/profile`

The merchant page now renders through the same component, so it picks up two rule fixes with it. Nothing else changes: same header, same org pills, same Clerk theming.

| Change | Rule |
|---|---|
| The avatar and its skeleton slot are hidden below `sm` | §13.4 (avatars beside a name), §5.4 |
| A user-info failure shows "We couldn't load your profile details" + Retry, instead of a permanent skeleton | §4.9 |

## Verification

- [x] `tsc --noEmit --incremental false`: 820 project errors (the baseline), **0 in any changed file**
- [x] ESLint: no findings in any changed file (the `HEAD` merchant page had none either)
- [x] §3.5, §5.5 and §8 greps return nothing for the changed files; `PageShell` on the HQ route carries `as="div"`
- [ ] Browser check was **not run**, because the Chrome DevTools MCP would not connect. Look at: the Clerk widget in dark mode on `/manage/profile` (it had never had the theming), the role pill, 375px with no avatar, and one `<main>` on the HQ route

## Re-audit — 2026-10-02

A code-only re-audit against the current rules (Chrome DevTools MCP still would not connect). The changes are in the shared components, so `/dashboard/profile` gets them too.

### Fixed

- [x] **One skeleton (§4.10).** There were three copies: the route's `ProfileSkeleton` (neutral `bg-muted/70`, `rounded-2xl`), plus the identity panel's and the Clerk fallback's in-page states. The in-page ones used the bare `Skeleton`, which is `bg-accent`, a violet tint in light mode. The blocks changed colour and radius at handoff. Now `components/profile/ProfileSkeletons.tsx` (`ProfileIdentitySkeleton`, `AccountPanelSkeleton`, moved from `UserProfileFallback.tsx`) is rendered by `DataPageSkeleton variant="profile"` and by both panels. The blocks are `aria-hidden`, with one `role="status"` line per panel.
- [x] **Role pill pop-in (§4.10).** The HQ role loads apart from `useUserInfo`. `ProfileIdentityPanel` takes `labelsLoading` and holds the pill row's place, so the panel no longer grows when the role lands.
- [x] **Clerk Save button (§4).** `formButtonPrimary` gets `!rounded-full`, matching the pill Cancel beside it.
- [x] **Clerk nav active state (§4.5).** Every item was forced to `!text-muted-foreground`, so the selected item had no cue except Clerk's theme-blind black tint. `navbarButton__active` now applies the DS-CTL-05 pill: `bg-background text-foreground shadow-sm ring-1 ring-border`. It uses `[&&]` so it outranks the base `!` colour, and the compiled output puts it after the hover rule.
- [x] **Retry on phones (§13.6).** 44px below `sm`.
- [x] A duplicate, stale docblock above `ProfileSkeleton` was removed.

### Phone fixes from user screenshots — 2026-10-03

The causes were found by reading Clerk's UI source (`npm pack @clerk/ui@1`, `dist/elements/**`), because no browser was available.

- [x] **Sideways scroll.** Clerk's card is capped at `calc(100vw - 2rem)`, which is wider than our padded Panel. Now `cardBox` is `!w-full !max-w-full`. Clerk's own page padding is also dropped below `md` (`profilePageContent`), where it doubled our inset.
- [x] **Second vertical scroll.** Clerk fixes the card at 44rem tall around an inner scroller. Now `cardBox !h-auto`, and `pageScrollBox` uses `!h-auto !overflow-visible`, so the page is the only scroller.
- [x] **Name and email cut off.** Clerk truncates them to one line. The user-preview text and the row text (reached via `profileSectionItem`) now wrap. The avatar beside the name drops below `sm` (§13.4).
- [x] **Doubled, overlapping Profile / Security menu.** `navbar` styles both the desktop rail and the phone slide-in menu. `!bg-transparent` made the menu see-through, so it drew over the page. Both now take `!bg-card`, and the rail's gradient image is cleared.
- [x] **Blue ring on the active item.** Clerk's buttons define their own `--border` (brand blue when active), so `ring-border` read it. The ring now reads `--app-border`, which `.clerk-themed` captures in `globals.css`.
- [x] **"Secured by Clerk" bar on phones.** Clerk re-shows it below 768px with a media query; now `footer: "!hidden"`.

### Own section rail, edit cards, centred buttons — 2026-10-03

The user disliked Clerk's phone menu, which slides a drawer over the page (against §12 and §13.2). They also asked for centred form buttons and reported cut-off panel edges.

- [x] **Our own rail.** Clerk's nav is hidden at every width (`navbar` and `navbarMobileMenuRow` are `!hidden`). It's replaced by `AccountSectionRail`, a DS-CTL-05 pill rail above the widget on desktop and phone alike. `<UserProfile routing="hash">` reads its page from the hash and re-renders on `hashchange` (`router/HashRouter.js`), so the rail sets `#/` or `#/security` and follows Clerk's own navigation. This retires the navbar overrides and the `--app-border` capture from the entries above.
- [x] **Cut-off edges.** Clerk's `scrollBox` is a second card: a 1px border, -1px margins and square corners just inside the Panel. Now `!m-0 !border-0`, and `profilePageContent` is `!p-0` at every width, since the Panel pads it.
- [x] **Inline editors** (Update profile, Add email, Add phone…) are tier-2 nested cards (§3.1): `!rounded-2xl !border !border-border/60 !bg-card !shadow-none`.
- [x] **Phone field** takes the DS-CTL-02 material on its box, and the input inside it goes clear.
- [x] **Cancel / Save centred.** The row has no `elements` hook, so `globals.css` reaches it through the Save button: `.clerk-themed div:has(> .cl-formButtonPrimary)`.
- [x] Skeletons: `AccountBodySkeleton` (heading + rows) sits under the live rail in-page. `AccountPanelSkeleton` (a rail block + the body) is the route's.

### Menus open downward; no sideways shift on open — 2026-10-03

- [x] **"Connect account" opened upward.** Clerk's add-menus (`connectedAccounts`, `enterpriseAccounts`, `web3Wallets`, `mfa`) are Floating UI popovers. They flip up whenever the overflow-hidden Panel has no room below, and they sit at the foot of their section. `globals.css` now lays these four out in flow (`position: static !important`, row wraps, no slide-in animation), so the list opens under its trigger and the panel grows. Row "⋯" menus carry no id and still float.
- [x] **Opening an inline editor shifted the whole panel sideways.** Clerk's `ActionOpen` calls `scrollIntoView` when an editor opens, which also scrolls the overflow-hidden Panel. The widget's wrapper is now `overflow-x-clip`, which can't be scrolled by script and adds no scrollable overflow to the Panel. The element that overhangs wasn't identified (no browser). If something now looks clipped at the right edge, that's it.
- [x] **Root cause of the moving buttons.** Clerk's root box is `width: fit-content` (`elements/InvisibleRootBox.js`), and our `w-full` lacked `!`, so it lost. The widget shrank to its widest row and grew when an editor's long sentence opened, so "Update profile" and the "⋯" menus moved sideways. Now `rootBox: "!w-full …"`. The `overflow-x-clip` stays as a guard against `scrollIntoView`.
- [x] **Controls far from their text at full width.** `profileSectionContent` is capped at `!max-w-md` (28rem), and `lg:!max-w-sm` (24rem) on laptops at the user's request.
- [x] **"P" of "Profile details" clipped.** Clerk's `cardBox` and `scrollBox` are `overflow: hidden`. With our zero padding, the bold P's overhang sat outside them. Both are now `!overflow-visible`, since the inner scroller and drawer they served are gone. Our wrapper's clip edge sits 8px out (`-mx-2 px-2`).
- [x] Clerk's ghost action buttons ("Update profile", "+ Add …", "+ Connect account") turned brand blue on hover or while open. Now `!text-foreground` (§3.5).

### Open — needs a browser

Clerk loads its UI from its CDN, so none of this can be checked from the repo:

- [x] The `[&&]` active-pill classes do reach the Clerk nav button. The user's screenshot showed the pill, which surfaced the ring-colour bug above.
- [x] ~~Clerk's phone menu slides in from the left~~. Its nav is now replaced by `AccountSectionRail`.
- [ ] `AccountProfile.tsx` says Clerk honours `appearance.variables`. The `globals.css` `.clerk-themed` comment says a browser check showed it honours neither `baseTheme` nor `variables`. If `globals.css` is right, the raw hex dark palette is dead code: delete it.
- [ ] §13.4: Clerk's Profile row shows an avatar beside the name, and Connected accounts shows provider logos. Hide both below `sm` (`userPreviewAvatarBox`, provider icons) if they show.
- [ ] §4.10: Clerk shows its own spinner in a saving button. If it can't be swapped for a busy label, record it as an exception in §14.3.
- [ ] Unthemed sub-views: OTP code boxes (`otpCodeFieldInput`), the "⋯" `menuList` radius (§4.6), Clerk's form `alert` surface (§3.5).
- [ ] Clerk's section titles render in plain foreground (`.clerk-themed` forces `inherit`). Decide whether they count as section headings, which take the brand blue.
