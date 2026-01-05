// lib/supabase/client.ts
import { createClient } from '@supabase/supabase-js'
import { useSes } from '@clerk/nextjs'
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {}
)