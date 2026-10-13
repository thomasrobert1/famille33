import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const isConfigured = Boolean(url && key && !String(url).includes('votre-projet'));

// Identifiant du compte d'administration (le mot de passe n'est connu que de
// Supabase, sous forme chiffrée).
export const ADMIN_IDENTIFIER = import.meta.env.VITE_ADMIN_IDENTIFIER || 'master33';
export const ADMIN_EMAIL_DOMAIN = import.meta.env.VITE_ADMIN_EMAIL_DOMAIN || 'admin.famille33.local';

// Seule la clé publique est utilisée ici : les droits sont appliqués par la
// base (lecture publique, dépôt encadré, administration réservée).
export const supabase = isConfigured
  ? createClient(url, key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'f33.session',
      },
    })
  : null;
