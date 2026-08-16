/**
 * Whether a published page is served to visitors anywhere yet.
 *
 * `false` today, and the editor's copy is written against it: publishing really
 * does append an immutable `site_page_versions` row and repoint the page, but
 * **nothing renders that row to the public**. Two separate things are missing,
 * and either one alone leaves publishing invisible from a visitor's seat:
 *
 *  1. No public route. `app/sites/[slug]` is the ordering storefront; the
 *     built-site route (PLAN-04 §2.1) does not exist.
 *  2. Nothing ever writes `merchant_sites.render_mode`. It defaults to
 *     `'template'`, and PLAN-04's rule 2 sends every `'template'` site to the
 *     storefront — so even once the route exists, publishing stays a no-op
 *     until the first successful publish flips the column.
 *
 * Until both land, the editor must not offer a "live page" link or present a
 * public URL as though it resolved: the address it would show belongs to the
 * ordering storefront, which serves something else entirely.
 *
 * **This constant is the whole switch.** Stage 6 (plan item W2.4) replaces it
 * with the real per-site `render_mode` check that the public route already has
 * to make; until then one boolean keeps every surface telling the same story.
 * Grep for it before writing any new "your site is live" copy.
 *
 * @see docs/features/website-builder/PLAN-2026-08-16-GAP-CLOSURE.md §0.2, W0, W2
 */
// Annotated `boolean` rather than inferred `false` on purpose: without it every
// `BUILT_SITE_IS_PUBLIC ?` branch narrows to a literal and the not-yet-reachable
// half reads as dead code to the compiler and to anyone reviewing it.
export const BUILT_SITE_IS_PUBLIC: boolean = false;
