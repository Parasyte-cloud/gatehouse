import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Mirrors the RA-workspace pattern of tolerating missing config at import
// time (so the app can render a clear "not configured" state instead of a
// blank crash) rather than throwing during module init.
export const supabase: SupabaseClient | null =
  url && anonKey ? createClient(url, anonKey) : null
