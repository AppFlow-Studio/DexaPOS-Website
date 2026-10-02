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

### Open — needs a browser

Clerk loads its UI from its CDN, so none of this can be checked from the repo:

- [ ] Do the `[&&]` active-pill classes reach the Clerk nav button? Does Clerk add `navbarButton__active`'s class in this version?
- [ ] `AccountProfile.tsx` says Clerk honours `appearance.variables`. The `globals.css` `.clerk-themed` comment says a browser check showed it honours neither `baseTheme` nor `variables`. If `globals.css` is right, the raw hex dark palette is dead code: delete it.
- [ ] §13.4: Clerk's Profile row shows an avatar beside the name, and Connected accounts shows provider logos. Hide both below `sm` (`userPreviewAvatarBox`, provider icons) if they show.
- [ ] §4.10: Clerk shows its own spinner in a saving button. If it can't be swapped for a busy label, record it as an exception in §14.3.
- [ ] Unthemed sub-views: OTP code boxes (`otpCodeFieldInput`), the phone country select, the "⋯" `menuList` radius (§4.6), Clerk's form `alert` surface (§3.5), and whether the narrow-width nav opens as a slide-in (§12).
- [ ] Clerk's section titles render in plain foreground (`.clerk-themed` forces `inherit`). Decide whether they count as section headings, which take the brand blue.
