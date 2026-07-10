"use server";

import { auth } from "@clerk/nextjs/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Per-user dashboard UI preferences (e.g. Orders list column visibility). Backed by
// public.user_ui_preferences (one row per user + pref_key), RLS-scoped so a user can
// only read/write their own rows. Preferences follow the user across devices.

export type UserUiPreferenceKey = "orders.columns";

/**
 * Read a single UI preference value for the current user. Returns null when unset
 * (caller falls back to its default visible set).
 */
export async function GetUserUiPreference<T = Record<string, unknown>>(
  prefKey: UserUiPreferenceKey
): Promise<{ data: T | null; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { data: null, error: "Unauthorized" };

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("user_ui_preferences")
    .select("value")
    .eq("user_id", userId)
    .eq("pref_key", prefKey)
    .maybeSingle();

  if (error) {
    console.error("[GetUserUiPreference] error:", error);
    return { data: null, error: error.message };
  }
  return { data: (data?.value as T) ?? null };
}

/**
 * Upsert a UI preference value for the current user. RLS enforces user_id ownership;
 * we still pass user_id explicitly so the row keys correctly on first insert.
 */
export async function SetUserUiPreference(
  prefKey: UserUiPreferenceKey,
  value: Record<string, unknown>
): Promise<{ success: boolean; error?: string }> {
  const { userId } = await auth();
  if (!userId) return { success: false, error: "Unauthorized" };

  const supabase = createServerSupabaseClient();
  const { error } = await supabase.from("user_ui_preferences").upsert(
    {
      user_id: userId,
      pref_key: prefKey,
      value,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,pref_key" }
  );

  if (error) {
    console.error("[SetUserUiPreference] error:", error);
    return { success: false, error: error.message };
  }
  return { success: true };
}
