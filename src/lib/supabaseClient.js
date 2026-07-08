import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  supabaseUrl.startsWith('https://') &&
  supabaseAnonKey.length > 20
);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export async function safeSupabaseCall(callback, fallback = null) {
  try {
    if (!supabase) return fallback;
    return await callback(supabase);
  } catch (error) {
    console.error('Erreur Supabase sécurisée:', error);
    return fallback;
  }
}

console.log('Supabase configuré:', isSupabaseConfigured);
