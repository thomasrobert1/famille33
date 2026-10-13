// Session d'administration.
//
// Le site se consulte et accepte des contributions sans aucun compte. Seul
// l'administrateur se connecte, avec l'identifiant master33 et un mot de passe
// vérifié par Supabase Auth, qui limite lui-même les tentatives.
import { supabase, ADMIN_IDENTIFIER, ADMIN_EMAIL_DOMAIN } from './supabase.js';
import { UserError } from './errors.js';

export const session = { admin: null };

export const adminEmail = () => `${ADMIN_IDENTIFIER}@${ADMIN_EMAIL_DOMAIN}`;

export async function initSession() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) return;
  try {
    await refreshAdmin();
  } catch {
    await logout();
  }
}

async function refreshAdmin() {
  const { data, error } = await supabase.from('admins').select('*').maybeSingle();
  if (error) throw error;
  if (!data) throw new UserError('Ce compte n’est pas administrateur.');
  session.admin = data;
  return data;
}

export async function login(identifier, password) {
  const id = String(identifier ?? '').trim().toLowerCase();
  if (id !== ADMIN_IDENTIFIER) throw new UserError('Identifiant ou mot de passe incorrect.');

  const { error } = await supabase.auth.signInWithPassword({ email: adminEmail(), password });
  if (error) {
    const message = String(error.message ?? '');
    if (/too many requests|rate limit/i.test(message)) {
      throw new UserError('Trop de tentatives. Patientez quelques minutes avant de réessayer.');
    }
    if (/fetch|network/i.test(message)) {
      throw new UserError('Connexion impossible. Vérifiez votre accès à Internet puis réessayez.');
    }
    throw new UserError('Identifiant ou mot de passe incorrect.');
  }
  try {
    await refreshAdmin();
  } catch (err) {
    await logout();
    throw err;
  }
  await supabase.rpc('admin_touch_login');
  return session.admin;
}

export async function logout() {
  try {
    await supabase.auth.signOut();
  } finally {
    session.admin = null;
  }
}

export async function adminCall(name, args = {}) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

export const isMaster = () => Boolean(session.admin);
