import { createClient } from '@supabase/supabase-js'

// Public client (browser-safe)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Debug logs to verify env at runtime
console.log('DEBUG: Final check - VITE_SUPABASE_URL:', supabaseUrl ? `Loaded (length: ${supabaseUrl.length}, starts: ${supabaseUrl.substring(0, 10)})` : 'NOT LOADED')
console.log('DEBUG: Final check - VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? `Loaded (length: ${supabaseAnonKey.length}, starts: ${supabaseAnonKey.substring(0, 10)})` : 'NOT LOADED')
console.log('DEBUG: Final check - URL is truthy:', !!supabaseUrl, 'Anon Key is truthy:', !!supabaseAnonKey)

if (!supabaseUrl) {
  throw new Error('Supabase Client Error: VITE_SUPABASE_URL is missing or empty. Please ensure it is set in your .env file and exposed correctly by your build tool (e.g., Vercel).')
}
if (!supabaseAnonKey) {
  throw new Error('Supabase Client Error: VITE_SUPABASE_ANON_KEY is missing or empty. Please ensure it is set in your .env file and exposed correctly by your build tool (e.g., Vercel).')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Node-only, lazy admin client for scripts (never in the browser)
let _adminClient = null
export function getSupabaseAdmin() {
  // Ensure this never runs in the browser
  if (typeof window !== 'undefined') return null

  if (_adminClient) return _adminClient
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const serviceKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    console.warn('Supabase Admin: Missing URL or Service Role Key in environment. Admin client not created.')
    return null
  }

  _adminClient = createClient(url, serviceKey, {
    auth: { persistSession: false }
  })
  return _adminClient
}
