import { createClient } from "@supabase/supabase-js";

/**
 * Anonymous server-side Supabase client for PUBLIC CMS reads (published rows).
 *
 * The marketing site reads `page_content` / `content_blocks` / `page_categories`
 * with the publishable (anon) key; RLS exposes only `published = true` rows. This
 * is intentionally NOT Clerk-authed and NOT cookie-based — public pages must
 * render for anonymous visitors. Admin writes use the service-role client
 * (`@/lib/supabase/service-role`) after an HQ check; see `requireHqUser`.
 */
export function createCmsReadClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
