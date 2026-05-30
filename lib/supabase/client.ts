// lib/supabase/client.ts
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Basic unauthenticated client (for public data)
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  {}
)

// Authenticated browser client factory
// Use this when you need to make authenticated requests from the browser
// Requires passing the Clerk session token
export function createBrowserSupabaseClient(token: string): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
       async accessToken() {
          return token ?? null
        },
    }
  )
}