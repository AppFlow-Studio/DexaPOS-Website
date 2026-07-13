-- ============================================================================
-- Automate display_order on modifier-group join tables.
--
-- Problem this solves: several website code paths insert into
-- menu_item_modifier_groups / location_item_modifier_groups without
-- providing display_order (bulk-assign-modifier-to-items and bulk-assign-
-- modifier-to-category in particular). That leaves NULLs in the column.
-- NULL display_orders sort to the end and tie with each other, which then
-- breaks the POS chip-row ordering and any other consumer that relies on
-- a stable per-item sequence.
--
-- Two-part fix per table:
--   1) BEFORE INSERT: if display_order IS NULL, fill with MAX+1 for that
--      partition (menu_item_id, or location_id+menu_item_id).
--   2) AFTER DELETE: renumber the remaining rows for that partition to be
--      contiguous (0, 1, 2, ...) so removals don't leave growing gaps.
--
-- Existing flows that pass explicit display_order (the per-item reorder RPC
-- and the website's edit-item delete-all-then-reinsert path) are unaffected
-- because the BEFORE INSERT trigger only fires for NULL values.
--
-- After triggers are in place, a one-time backfill heals existing NULLs and
-- collapses any gaps.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- menu_item_modifier_groups (no updated_at column on this table)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_next_mimg_display_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.display_order IS NULL THEN
        NEW.display_order := COALESCE(
            (SELECT MAX(display_order) + 1
             FROM public.menu_item_modifier_groups
             WHERE menu_item_id = NEW.menu_item_id),
            0
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_mimg_display_order ON public.menu_item_modifier_groups;
CREATE TRIGGER trg_assign_mimg_display_order
BEFORE INSERT ON public.menu_item_modifier_groups
FOR EACH ROW
EXECUTE FUNCTION public.assign_next_mimg_display_order();


CREATE OR REPLACE FUNCTION public.renumber_mimg_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    WITH renumbered AS (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY display_order NULLS LAST, id) - 1 AS new_order
        FROM public.menu_item_modifier_groups
        WHERE menu_item_id = OLD.menu_item_id
    )
    UPDATE public.menu_item_modifier_groups m
    SET display_order = r.new_order
    FROM renumbered r
    WHERE m.id = r.id
      AND m.display_order IS DISTINCT FROM r.new_order;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_renumber_mimg_after_delete ON public.menu_item_modifier_groups;
CREATE TRIGGER trg_renumber_mimg_after_delete
AFTER DELETE ON public.menu_item_modifier_groups
FOR EACH ROW
EXECUTE FUNCTION public.renumber_mimg_after_delete();


-- ---------------------------------------------------------------------------
-- location_item_modifier_groups
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assign_next_limg_display_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    IF NEW.display_order IS NULL THEN
        NEW.display_order := COALESCE(
            (SELECT MAX(display_order) + 1
             FROM public.location_item_modifier_groups
             WHERE location_id = NEW.location_id
               AND menu_item_id = NEW.menu_item_id),
            0
        );
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_limg_display_order ON public.location_item_modifier_groups;
CREATE TRIGGER trg_assign_limg_display_order
BEFORE INSERT ON public.location_item_modifier_groups
FOR EACH ROW
EXECUTE FUNCTION public.assign_next_limg_display_order();


CREATE OR REPLACE FUNCTION public.renumber_limg_after_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
    WITH renumbered AS (
        SELECT id,
               ROW_NUMBER() OVER (ORDER BY display_order NULLS LAST, id) - 1 AS new_order
        FROM public.location_item_modifier_groups
        WHERE location_id = OLD.location_id
          AND menu_item_id = OLD.menu_item_id
    )
    UPDATE public.location_item_modifier_groups m
    SET display_order = r.new_order,
        updated_at = NOW()
    FROM renumbered r
    WHERE m.id = r.id
      AND m.display_order IS DISTINCT FROM r.new_order;
    RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_renumber_limg_after_delete ON public.location_item_modifier_groups;
CREATE TRIGGER trg_renumber_limg_after_delete
AFTER DELETE ON public.location_item_modifier_groups
FOR EACH ROW
EXECUTE FUNCTION public.renumber_limg_after_delete();


-- ---------------------------------------------------------------------------
-- One-time backfill: heal existing NULLs and collapse gaps.
-- ---------------------------------------------------------------------------

WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY menu_item_id
               ORDER BY display_order NULLS LAST, id
           ) - 1 AS new_order
    FROM public.menu_item_modifier_groups
)
UPDATE public.menu_item_modifier_groups m
SET display_order = r.new_order
FROM ranked r
WHERE m.id = r.id
  AND m.display_order IS DISTINCT FROM r.new_order;

WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (
               PARTITION BY location_id, menu_item_id
               ORDER BY display_order NULLS LAST, id
           ) - 1 AS new_order
    FROM public.location_item_modifier_groups
)
UPDATE public.location_item_modifier_groups m
SET display_order = r.new_order,
    updated_at = NOW()
FROM ranked r
WHERE m.id = r.id
  AND m.display_order IS DISTINCT FROM r.new_order;
