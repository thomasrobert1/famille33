// Fichiers : les espaces de stockage sont publics en lecture, donc l'adresse
// d'une image se construit directement, sans signature.
import { supabase } from './supabase.js';

const cache = new Map();

export function publicUrl(bucket, path) {
  if (!path) return null;
  const key = `${bucket}|${path}`;
  if (!cache.has(key)) {
    cache.set(key, supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl);
  }
  return cache.get(key);
}

export function newPath(suffix = '') {
  const now = new Date();
  const folder = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${folder}/${crypto.randomUUID()}${suffix}.jpg`;
}

export async function uploadFile(bucket, path, blob) {
  const { error } = await supabase.storage.from(bucket).upload(path, blob, {
    contentType: blob.type || 'image/jpeg',
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function removeFiles(bucket, paths) {
  const list = (paths ?? []).filter(Boolean);
  if (!list.length) return;
  for (const p of list) cache.delete(`${bucket}|${p}`);
  const { error } = await supabase.storage.from(bucket).remove(list);
  // Échec sans gravité : le fichier reste dans la file de purge côté base.
  if (error) console.warn('Suppression de fichiers différée :', error.message);
}

export function clearStorageCache() {
  cache.clear();
}
