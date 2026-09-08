import { createClient } from "@supabase/supabase-js";

/**
 * A Supabase client with no identity at all — the publishable key, no Clerk
 * token, no service role.
 *
 * Server-side public rendering, and the built website route is its first
 * caller. The other three clients are wrong for it in different ways:
 * `server.ts` attaches a Clerk token that a visitor does not have,
 * `client.ts` is for the browser, and `service-role.ts` bypasses RLS
 * entirely — which for a page served to the open internet is the one property
 * you least want.
 *
 * Using this makes the security story checkable rather than assumed: the built
 * site renders with exactly the privileges an anonymous visitor has, so if a
 * grant is missing the page breaks in development instead of leaking in
 * production. Every read it performs is either an RLS-protected public policy
 * (`locations`, `online_store_config`) or a SECURITY DEFINER function anon may
 * execute (`get_public_site_page`, `get_menus_for_location`).
 */
export function createAnonSupabaseClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { persistSession: false } },
  );
}
