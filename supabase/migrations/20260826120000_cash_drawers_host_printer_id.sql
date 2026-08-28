-- =====================================================================
-- cash_drawers.host_printer_id — record which printer holds the drawer
-- =====================================================================
-- P0 cash-drawer kick fix (Notion 3c88280c1b1d81679011f36099e5db70).
--
-- WHY
--   The cash-drawer kick has always INFERRED which printer the drawer is
--   wired to, and inferred wrong: it ranked every Star above the Landi and
--   a Star ACKs a drawer pulse whether or not a drawer is on its DK port,
--   so the kick "succeeded" on the wrong printer and the real drawer never
--   opened. The Star-first routing (client flag drawerRoutingV2) selects the
--   wired Star from persisted drawer-sense, but a drawer on solenoid-only
--   pins (no sense line) can't be auto-detected, and installers need an
--   explicit, verifiable binding. This column records that binding.
--
--   host_printer_id is the printers.id whose DK port the drawer is wired to.
--   The kick resolves against it first (deterministic); NULL falls back to
--   sense-based selection. It is populated by provisioning/health-check
--   auto-bind (when a Star reports externalDevice1Connected = true and the
--   binding is unset) or manually via the Cash Management "Test Pop" screen.
--
--   NOTE: cash_drawers.device_id is NOT reused — it is an FK to
--   device_catalog (hardware MODEL catalog, cash_drawers_device_id_fkey),
--   surfaced in the settings UI as the drawer's model. A printers.id there
--   would violate that FK. Hence a dedicated column.
--
-- SAFETY
--   Additive and reversible. Nullable, defaults NULL, so existing rows and
--   all current reads/writes are unaffected. ON DELETE SET NULL means
--   deleting/deactivating the bound printer cleanly reverts the drawer to
--   inferred selection — no orphan pointer. IF NOT EXISTS guards make it
--   idempotent. No RLS change needed (row access already governed by the
--   existing cash_drawers policies; this is a new column on those rows).
--   The client reads the column defensively, so app builds are safe before
--   or after this migration.
-- =====================================================================

ALTER TABLE public.cash_drawers
  ADD COLUMN IF NOT EXISTS host_printer_id uuid
  REFERENCES public.printers (id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_cash_drawers_host_printer_id
  ON public.cash_drawers USING btree (host_printer_id);

COMMENT ON COLUMN public.cash_drawers.host_printer_id IS
  'Printer (printers.id) whose cash-drawer/DK port the drawer is physically '
  'wired to. Explicit override for the sense-based drawer-kick routing '
  '(client flag drawerRoutingV2); NULL = infer the host from drawer-sense. '
  'Distinct from device_id, which is an FK to device_catalog (hardware model).';
