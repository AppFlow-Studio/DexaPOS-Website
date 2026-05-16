"use server";

import type { SupabaseClient } from "@supabase/supabase-js";

type Entity = "menus" | "categories" | "menu_items";

const LABEL: Record<Entity, string> = {
  menus: "menu",
  categories: "category",
  menu_items: "item",
};

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

function escapeIlike(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
}

/**
 * Enforce that `name` is not already used by any menu, category, or menu_item
 * belonging to `merchantId`. Comparison is trimmed and case-insensitive.
 *
 * Pass `opts.excludeTable` + `opts.excludeId` to ignore the row being edited.
 */
export async function assertNameAvailable(
  supabase: SupabaseClient,
  merchantId: string,
  name: string,
  opts?: { excludeTable?: Entity; excludeId?: string },
): Promise<{ error?: string }> {
  const trimmed = name.trim();
  if (!trimmed) return {};

  const n = normalize(trimmed);
  const pattern = escapeIlike(trimmed);

  const tables: Entity[] = ["menus", "categories", "menu_items"];

  const results = await Promise.all(
    tables.map((t) =>
      supabase
        .from(t)
        .select("id, name")
        .eq("merchant_id", merchantId)
        .ilike("name", pattern),
    ),
  );

  for (let i = 0; i < tables.length; i++) {
    const table = tables[i];
    const rows = (results[i].data ?? []) as Array<{ id: string; name: string }>;
    const conflict = rows.find((r) => {
      if (normalize(r.name) !== n) return false;
      if (
        opts?.excludeTable === table &&
        opts?.excludeId &&
        r.id === opts.excludeId
      ) {
        return false;
      }
      return true;
    });
    if (conflict) {
      return {
        error: `A ${LABEL[table]} named "${trimmed}" already exists. Menus, categories, and items must have unique names.`,
      };
    }
  }

  return {};
}
