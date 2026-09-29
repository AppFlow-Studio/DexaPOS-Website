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
