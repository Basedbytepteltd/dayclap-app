import { createClient } from '@supabase/supabase-js'

// Helper function to get environment variables,
// supporting both Vite (import.meta.env) and Node.js (process.env)
const getEnv = (key) => {
  // Check if import.meta.env is available (Vite environment)
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  // Otherwise, assume Node.js environment
  return process.env[key];
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY');
const supabaseServiceRoleKey = getEnv('VITE_SUPABASE_SERVICE_ROLE_KEY');

// --- START DEBUG LOGS ---
console.log('DEBUG: VITE_SUPABASE_URL:', supabaseUrl ? `Loaded (length: ${supabaseUrl.length}, starts: ${supabaseUrl.substring(0, 10)})` : 'NOT LOADED');
console.log('DEBUG: VITE_SUPABASE_ANON_KEY:', supabaseAnonKey ? `Loaded (length: ${supabaseAnonKey.length}, starts: ${supabaseAnonKey.substring(0, 10)})` : 'NOT LOADED');
// --- END DEBUG LOGS ---

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Create a separate client for admin actions using the service_role key
// IMPORTANT: Do NOT expose this key in a production client-side application.
// This is for demonstration purposes only.
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    persistSession: false // Admin client doesn't need to persist user sessions
  }
});
