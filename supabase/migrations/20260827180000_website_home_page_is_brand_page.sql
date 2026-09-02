-- ─────────────────────────────────────────────────────────────────────────────
-- The home page is a BRAND page, not a location page.
--
-- `CreateHomePage` used to stamp `location_id` with whichever storefront the
-- merchant happened to have selected the first time they opened the builder.
-- That contradicts this schema's own design — see the foundation migration,
-- where `yourcafe.com` is the brand page carrying NULL and
-- `yourcafe.com/locations/downtown` is the location page — and it had two
-- visible consequences:
--
--   1. A multi-location merchant's home page quoted one arbitrary branch's
--      prices to every visitor, with no indication which branch.
--   2. It silently defeated the "Never show prices before a branch is chosen"
--      setting. `resolvePricingLocation` lets a page's own scope win over any
--      site-wide rule, by design — so a home page pinned by accident could
--      never be governed by the brand layer at all.
--
-- The code no longer writes it. This repairs any rows already written.
--
-- EXPECTED TO BE A NO-OP on staging (dfwqakoyittmrwbqvxgw), verified 2026-08-27:
-- all three home pages there predate `CreateHomePage`, which was introduced in
-- 2f66085d on 2026-08-16, and were made by the earlier `CreatePage` path that
-- wrote no location. The defect is latent, not realised — it would have pinned
-- the next home page created, not any that exist. This runs anyway because
-- production has not been checked from here and a no-op costs nothing.
--
-- Version is 18:00, not 12:00: 20260827120000 is already taken by
-- `revert_dual_pricing_cash_surcharge` on the live database, and the CLI keys on
-- the version prefix — a colliding file is silently treated as already applied.
--
-- SAFE AND NARROW: home pages only (`is_home`), and only where a location is
-- actually set. A merchant who deliberately made some *other* page a location
-- page is untouched, because they chose that and this never asked them.
--
-- AFTER THIS RUNS a single-location merchant's home page shows no prices until
-- they name a Default location in Website → Settings, which is exactly what
-- that setting's help text has always told them to do. That is the intended
-- end state, not a regression: the alternative is a price that answers for a
-- branch nobody picked.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE public.site_pages
SET location_id = NULL
WHERE is_home = true
  AND location_id IS NOT NULL;
