# Website Editor — move to `/manage/website-editor` + design-system conversion (Family 6)

**Date:** 2026-09-29 · **Branch:** `Haydar-AdminRestructure` · **Spec:** [`docs/UI-DESIGN-SYSTEM.md`](../../UI-DESIGN-SYSTEM.md)

The marketing-site CMS lived at `/admin` with its own top navbar, Barlow fonts and ~1,430 lines of
bespoke CSS (`admin.css` + `cms-theme.css`). The HQ sidebar's "Website Editor" link pointed there,
so opening it dropped the operator out of the HQ shell. This moves it under `/manage` and converts
every screen, including the section editor internals, onto Part A and §14.

Decisions (confirmed with the user before implementation):
- **Route:** move to `/manage/website-editor/**` inside the HQ shell; `/admin/**` redirects there.
- **Depth:** full conversion. `SectionEditor` and `TipTapEditor` are rewritten onto shadcn
  primitives; `admin.css` and `cms-theme.css` are deleted.

## Scope

| Old | New | Notes |
|---|---|---|
| `app/admin/layout.tsx` (+ `admin.css`, `cms-theme.css`) | — | Deleted. The HQ layout owns the chrome. |
| `app/admin/page.tsx` | — | Deleted; `/admin` redirects in `next.config.ts` |
| `app/admin/pages/page.tsx`, `NewPageForm`, `PageRowActions` | `app/manage/website-editor/page.tsx` + `components/PagesTable.tsx`, `NewPageDialog.tsx` | Skeleton A |
| `app/admin/pages/[route]/**` | `app/manage/website-editor/pages/[route]/**` | Skeleton D-ish (full width: the section editor needs it) |
| `app/admin/categories/**` | `app/manage/website-editor/categories/**` | |
| `app/admin/blocks/**` | `app/manage/website-editor/blocks/**` | |
| `components/cms/SectionEditor.tsx`, `TipTapEditor.tsx` | same paths | Rewritten; only the CMS editor uses them |
| — | `components/cms/ImageLibraryDialog.tsx` | One image library for the section editor and TipTap (replaces the hand-rolled backdrop gallery) |
| `components/cms/CmsImageActions.tsx` | unchanged | Shared with the public inline preview and styled by `marketing.css`; TipTap stops using it |
| `proxy.ts` | `/admin(.*)` matcher + CMS branch removed | `/manage/*` is already HQ-gated |
| `app/manage/layout.tsx` | nav URL → `/manage/website-editor` | |

## Work items

- [x] Routes moved; `/admin`, `/admin/pages`, `/admin/pages/:route*`, `/admin/categories`, `/admin/blocks` → `redirects()` (lesson 2026-08-18: never a `redirect()` page)
- [x] `layout.tsx` gates on `system.config.manage` (same as the nav item and `/manage/devices`); `requireHqUser` stays on each page as the data gate
- [x] Shared header: `PageShell as="div"` + `PageHeader` ("View site" action) + a route pill rail (Pages / Categories / Content blocks) that scrolls itself (§13.2, D-24), copied from `DeviceRegistrySectionNav`
- [x] **Pages:** grouped hand-rolled rows → one `Panel padded` with a §5.2 toolbar (search, category, status, Clear filters), `Table variant="data"` from `lg` with record cards below, paged at 10, worded empties; category order preserved as the default sort
- [x] Pages: status as a neutral outline `Badge`; "Updated" column (was fetched, never shown); row menu (Edit, Preview, Duplicate, Delete) replacing the icon cluster inside the `<Link>`; delete confirms in an `AlertDialog`
- [x] Pages: inline "+ New Page" form → `NewPageDialog` with a `/` affix field and slug validation
- [x] **Page editor:** `PageHeader` with back pill, route as subtitle (scope, kept on phones), status word + saved time; actions Preview / Save draft / Publish in the header and again under the sections
- [x] Page editor: "Page details" and "Content sections" `Panel > PanelSection`s; muted fields; category `Select` fed server-side (was a client fetch after mount); route-required shown via `aria-invalid`; save errors via toast
- [x] **Section editor:** each section a tier-2 nested card; a real toggle `<button aria-expanded>`; grip, move and delete as labelled ghost icon buttons (visible at rest, §7); "Add a section" as a neutral tile grid
- [x] Section editor fields: raw `<input>`/`<select>`/`<textarea>` → `Input` / `Select` / `Textarea` (§11.1); colour keeps the native swatch; wells are `rounded-2xl bg-muted/30`, no lines
- [x] Image picker: URL field + preview with a `DropdownMenu` (Replace, Choose from library, Remove) — the menu trigger is visible at rest, not hover-revealed
- [x] `ImageLibraryDialog`: centred `Dialog` (clip/scroll structure, full screen on phones), skeleton while loading, worded empty, neutral error with Retry, upload in the footer
- [x] Card sub-editor: Icon/Image segmented pill with the neutral active state; icon grid with the neutral active ring
- [x] Advanced JSON: `Collapsible`; invalid JSON marks the textarea `aria-invalid`
- [x] **TipTap:** muted rounded field, lucide toolbar with `aria-pressed` + neutral active state, no toolbar rule; renders its shell before the editor mounts (was `return null`, a layout jump)
- [x] **Categories:** `Panel > PanelSection`; tree rows with depth indent; page count per category; create/edit in a `Dialog`; delete in an `AlertDialog` (was `window.confirm`)
- [x] **Content blocks:** block list rows → edit in a `Dialog` (`sm:max-w-3xl`); new block = same dialog with an editable key and a duplicate-key check; save feedback via toast (failures were silent)
- [x] Site settings editor: eight inline-styled cards → brand-blue section headings, link rows as responsive grids, index numbers as plain muted text (was circle chips), ✕ with hover-JS → labelled ghost icon buttons
- [x] `loading.tsx` for the list routes and the editor (`DataPageSkeleton shell="plain"`)
- [x] `admin.css`, `cms-theme.css` deleted

## Behaviour changes beyond presentation

| Where | Change | Why |
|---|---|---|
| URLs | `/admin/**` → `/manage/website-editor/**` (307 via `redirects()`) | The editor now sits inside the HQ shell |
| Access | Page routes require `system.config.manage` | Matches the nav item; previously any HQ member could open `/admin` by URL. The `/api/cms/*` routes are unchanged (`requireHqUser`). |
| Pages list | Flat table with a category filter instead of per-category groups | Bounded + paged (§5.7); category is a column |
| Duplicate / delete / save / category / block failures | Toast on failure | Previously silent (or `window.confirm` + red text) |
| TipTap image button | Opens `ImageLibraryDialog` (upload inside) | `CmsImageActions` rendered unstyled outside the marketing layout |
| TipTap toolbar active states | Subscribed with `useEditorState` | TipTap v3 no longer re-renders per transaction, so moving the caret left Bold/Heading/etc. stale |
| TipTap Link extension | Configured through `StarterKit` instead of a second `LinkExt` | StarterKit v3 already bundles Link; it was registered twice |
| Page editor route | Saving with an emptied route (`/`) is refused unless the page *is* the home page | An emptied field read as `/` and would have overwritten the home page |
| Site settings "Same as" | Keeps its own text; empty lines are dropped from the saved value only | Filtering on every keystroke swallowed Enter, so a second URL could only be pasted |
| Category delete copy | Says pages keep the deleted category's slug; mentions subcategories moving to top level | The old confirm claimed pages' category would be cleared. It isn't: `page_content.category` is a plain slug with no FK. `parent_id` is `ON DELETE SET NULL`. |
| New page dialog | Route required and validated (letters, numbers, `-`, `_`, `/`) | An empty route used to open the home page's editor as "new" |

## Found, not changed

- **Deleting or re-slugging a category orphans its pages.** Pages keep the old slug and show it as an unrecognised category in the list until they are moved. Needs either an FK/cascade or an API-side re-file.
- TipTap's **Link** and **Alt** buttons still use `window.prompt`.
- `/api/cms/*` authorises any HQ member, while the pages now need `system.config.manage`.
- The section editor's **Advanced JSON** textarea re-keys on every section change (`key={JSON.stringify(section)}`), which discards an unapplied JSON draft when another field changes. Pre-existing.

## Verification

- [x] `tsc --noEmit --incremental false`: 820 project errors, **0 in changed files**
- [x] ESLint on changed files: no new findings
- [x] §3.5, §5.5, §8, §12 greps on changed files: only allowed hits (section headings, destructive actions)
- [x] Exactly one `PageShell`, `as="div"`, per render branch
- [ ] **Browser check not done** (light + dark, 1440px + 375px): the Chrome DevTools MCP failed to connect this session. `/admin` and `/admin/pages/pricing` verified as real 307s to the new routes against the running dev server.
