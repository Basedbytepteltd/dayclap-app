import { createClient } from '@supabase/supabase-js'

// Directly access environment variables using import.meta.env for client-side
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
// The service role key should NEVER be exposed on the client-side.
// It is commented out here to prevent accidental client-side usage.
// const supabaseServiceRoleKey = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

// --- START DEBUG LOGS ---
console.log('DEBUG: Final check - VITE_SUPABASE_URL:', supabaseUrl ? `Loaded (length: ${supabaseUrl.length}, starts: ${supabaseUrl.substring(0, 10)})` : 'NOT LOADED');
console.log('DEBUG: Final check - VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? `Loaded (length: ${supabaseAnonKey.length}, starts: ${supabaseAnonKey.substring(0, 10)})` : 'NOT LOADED');
console.log('DEBUG: Final check - URL is truthy:', !!supabaseUrl, 'Anon Key is truthy:', !!supabaseAnonKey);
// --- END DEBUG LOGS ---

// Explicitly check for missing keys and throw a more informative error
if (!supabaseUrl) {
  throw new Error('Supabase Client Error: VITE_SUPABASE_URL is missing or empty. Please ensure it is set in your .env file and exposed correctly by your build tool (e.g., Vercel).');
}
if (!supabaseAnonKey) {
  throw new Error('Supabase Client Error: VITE_SUPABASE_ANON_KEY is missing or empty. Please ensure it is set in your .env file and exposed correctly by your build tool (e.g., Vercel).');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// IMPORTANT SECURITY NOTE:
// The supabaseAdmin client uses the service_role key and should NEVER be exposed on the client-side.
// It is commented out here to prevent accidental client-side usage.
// Any admin actions from the frontend should be routed through secure backend API endpoints.
// export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
//   auth: {
//     persistSession: false // Admin client doesn't need to persist user sessions
//   }
// });
