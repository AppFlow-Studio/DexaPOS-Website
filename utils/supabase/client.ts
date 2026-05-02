import { createBrowserClient } from '@supabase/ssr'

// Decode JWT and validate that it's an anon key (security check)
function validateSupabaseAnonKey(token: string): void {
  try {
    // JWT format: header.payload.signature
    const parts = token.split('.')
    if (parts.length !== 3) {
      throw new Error('Invalid JWT format')
    }
    
    // Decode payload (base64url to JSON)
    const payload = JSON.parse(
      Buffer.from(parts[1], 'base64url').toString('utf-8')
    )
    
    // Verify it's an anon key by checking the role
    if (payload.role !== 'anon') {
      throw new Error(
        `SUPABASE_ANON_KEY contains non-anon role: "${payload.role}". ` +
        'This is a security issue - the publishable key must be the anon key only.'
      )
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('contains non-anon role')) {
      throw error
    }
    console.warn('Failed to validate Supabase JWT (may be expected in test env):', error)
  }
}

export function createClient() {
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  
  // Validate that the key is the anon key (required for security)
  if (typeof window !== 'undefined') {
    validateSupabaseAnonKey(supabaseKey)
  }
  
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    supabaseKey
  )
}