// Paramètres du site (table site_settings), avec valeurs par défaut.
import { supabase } from './supabase.js';

const DEFAULTS = {
  'site.name': 'Famille 33',
  'site.tagline': 'Tradition, transmission, camaraderie',
  'site.intro': '',
  'privacy.contact': '',
  'nav.labels': { feed: 'Fil', gallery: 'Galerie', planning: 'Planning' },
  'posts.open': true,
  'posts.require_approval': true,
  'posts.page_size': 10,
  'comments.enabled': true,
  'photos.open': true,
  'photos.require_approval': true,
  'events.open': true,
  'events.require_approval': true,
  'limits.posts_per_hour': 30,
  'limits.comments_per_hour': 120,
  'limits.photos_per_hour': 200,
  'limits.events_per_hour': 30,
  'limits.uploads_per_hour': 400,
  'form.options': { regions: [], countries: [], statuses: [], sectors: [] },
};

let values = { ...DEFAULTS };

export async function loadSettings() {
  const { data, error } = await supabase.from('site_settings').select('key, value');
  if (error) throw error;
  values = { ...DEFAULTS };
  for (const row of data ?? []) values[row.key] = row.value;
  return values;
}

export function setting(key) {
  return values[key] ?? DEFAULTS[key];
}

export function navLabel(key) {
  return setting('nav.labels')?.[key] || DEFAULTS['nav.labels'][key] || key;
}

export function settingDefault(key) {
  return DEFAULTS[key];
}
