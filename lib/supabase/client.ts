// lib/supabase/client.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Basic unauthenticated client (for public data)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {}
)

// Authenticated browser client factory.
// Pass a getter so each request fetches a fresh Clerk token (Clerk JWTs expire ~60s);
// capturing a token once at mount goes stale during idle and returns silent 401s.
export function createBrowserSupabaseClient(
  getToken: () => Promise<string | null>
): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      async accessToken() {
        return (await getToken()) ?? null
      },
    }
  )
}