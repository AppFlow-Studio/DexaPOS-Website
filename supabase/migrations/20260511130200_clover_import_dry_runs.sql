-- =============================================================================
-- Migration: clover_import_dry_runs — staging table for the 3-step importer
-- =============================================================================
-- The Clover importer is a Parse → Preview → Commit flow. Between Preview and
-- Commit the operator reviews a structured diff in the UI. That diff plus the
-- parsed intermediate representation needs to survive a request cycle (and
-- multiple Vercel server-action invocations across the multi-instance Next.js
-- runtime), so it lives here in Postgres rather than in memory or Redis.
--
-- TTL is 15 minutes. Cleanup is opportunistic: every new insert deletes any
-- row whose expires_at < now() owned by the same merchant. A scheduled
-- pg_cron sweep is added at the bottom (commented — guarded by extension
-- availability; activate post-deploy once pg_cron is enabled on the target
-- environment).
--
-- RLS: deny-all to anon/authenticated. The importer server actions use the
-- service-role client and re-assert created_by_clerk_user_id at every read.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.clover_import_dry_runs (
    id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id                uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
    created_by_clerk_user_id   text NOT NULL,
    file_name                  text NOT NULL,
    file_hash                  text NOT NULL,
    payload                    jsonb NOT NULL,
    fingerprint                text NOT NULL,
    status                     text NOT NULL DEFAULT 'pending',
    created_at                 timestamptz NOT NULL DEFAULT now(),
    expires_at                 timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
    committed_at               timestamptz NULL,
    CONSTRAINT clover_import_dry_runs_status_check
        CHECK (status IN ('pending', 'committed', 'expired', 'aborted'))
);

COMMENT ON TABLE  public.clover_import_dry_runs IS
    'Staging area for Clover importer preview state. 15-min TTL between preview and commit. Read only by importer server actions via service-role client.';
COMMENT ON COLUMN public.clover_import_dry_runs.payload IS
    'JSONB containing the parsed Clover IR, the computed diff, and the raised flags. Sized ~50-200KB for realistic merchant menus.';
COMMENT ON COLUMN public.clover_import_dry_runs.fingerprint IS
    'md5 of (id || updated_at) across menu_items + categories + modifier_groups for this merchant at preview time. The commit RPC recomputes and aborts with ERR_STALE_PREVIEW if changed.';
COMMENT ON COLUMN public.clover_import_dry_runs.file_hash IS
    'sha256 of the raw .xlsx bytes. Used to raise FLAG-H when the same file is uploaded twice.';

CREATE INDEX IF NOT EXISTS clover_import_dry_runs_merchant_status_idx
    ON public.clover_import_dry_runs (merchant_id, status, expires_at);

CREATE INDEX IF NOT EXISTS clover_import_dry_runs_merchant_filehash_idx
    ON public.clover_import_dry_runs (merchant_id, file_hash)
    WHERE status = 'committed';

ALTER TABLE public.clover_import_dry_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clover_import_dry_runs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clover_import_dry_runs_deny_all ON public.clover_import_dry_runs;
CREATE POLICY clover_import_dry_runs_deny_all
    ON public.clover_import_dry_runs
    FOR ALL
    TO authenticated, anon
    USING (false)
    WITH CHECK (false);

-- Opportunistic cleanup: drop expired rows on every fresh insert. Cheap when
-- the partial index above is in place; bounds the table at ~hours of dry-runs.
CREATE OR REPLACE FUNCTION public.cleanup_expired_clover_dry_runs()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    DELETE FROM public.clover_import_dry_runs
     WHERE status = 'pending'
       AND expires_at < now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clover_import_dry_runs_cleanup_trg ON public.clover_import_dry_runs;
CREATE TRIGGER clover_import_dry_runs_cleanup_trg
    AFTER INSERT ON public.clover_import_dry_runs
    FOR EACH STATEMENT
    EXECUTE FUNCTION public.cleanup_expired_clover_dry_runs();

-- Optional: schedule a periodic sweep via pg_cron once the extension is
-- confirmed available on the target environment. Uncomment after enabling.
-- SELECT cron.schedule(
--     'clover_import_dry_runs_sweep',
--     '*/15 * * * *',
--     $$ DELETE FROM public.clover_import_dry_runs
--         WHERE expires_at < now() - interval '1 day' $$
-- );
