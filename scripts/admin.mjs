#!/usr/bin/env node
// =====================================================================
// Famille 33 — création et gestion du compte d'administration
// =====================================================================
// Le site est public : les visiteurs n'ont pas de compte. Seul le compte
// d'administration existe, et il se crée ici, depuis votre ordinateur.
// C'est le seul endroit où la clé d'administration de Supabase est utilisée :
// elle reste dans .env.local, qui n'est jamais versionné.
//
//   npm run admin -- creer                  Créer le compte d'administration
//   npm run admin -- motdepasse             Changer son mot de passe
//   npm run admin -- etat                   Vérifier que le compte existe
//
// Le mot de passe est demandé à la saisie : il n'apparaît ni dans la
// commande, ni dans l'historique du terminal. Vous pouvez aussi le placer
// dans .env.local (MASTER_PASSWORD) pour une installation automatisée.
// =====================================================================
import { readFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';

const DEFAULT_IDENTIFIER = 'master33';
const MIN_PASSWORD_LENGTH = 12;

function readEnvFile() {
  const values = {};
  for (const file of ['.env.local', '.env']) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (m) values[m[1]] ??= m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
  return values;
}

const env = { ...readEnvFile(), ...process.env };
const url = env.VITE_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_KEY;
const emailDomain = env.VITE_ADMIN_EMAIL_DOMAIN || 'admin.famille33.local';
const identifier = (env.VITE_ADMIN_IDENTIFIER || DEFAULT_IDENTIFIER).trim().toLowerCase();
const adminEmail = `${identifier}@${emailDomain}`;

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function requireConfig() {
  if (url && serviceKey) return;
  fail(`Configuration incomplète dans .env.local. Il faut au minimum :
  VITE_SUPABASE_URL=https://votre-ref.supabase.co
  SUPABASE_SERVICE_KEY=…   (Supabase > Project Settings > API Keys > service_role)

La clé service_role ne doit jamais être copiée dans les variables GitHub.`);
}

// Les clés récentes (sb_secret_…) ne sont pas des jetons JWT : elles se
// présentent dans l'en-tête « apikey » seulement. Les envoyer aussi dans
// « Authorization: Bearer » ferait échouer la requête, la plateforme tentant
// de les lire comme un jeton. Les anciennes clés service_role, elles, sont
// des JWT et attendent les deux en-têtes.
const isLegacyKey = serviceKey?.startsWith('ey');

function authHeaders() {
  return isLegacyKey
    ? { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
    : { apikey: serviceKey };
}

async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`${url}${path}`, {
    method,
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const message = data?.message || data?.msg || data?.error_description || data?.error || text || res.statusText;
    const error = new Error(`${res.status} ${message}`);
    error.status = res.status;
    throw error;
  }
  return data;
}

async function ask(question, { secret = false } = {}) {
  const rl = createInterface({ input: stdin, output: stdout, terminal: true });
  if (!secret) {
    const answer = await rl.question(question);
    rl.close();
    return answer.trim();
  }
  // Saisie masquée : le mot de passe ne s'affiche pas à l'écran.
  const onData = (char) => {
    if (['\n', '\r', '\u0004'].includes(String(char))) return;
    stdout.write('\x1b[2K\x1b[200D' + question + '*'.repeat(rl.line.length));
  };
  stdin.on('data', onData);
  const answer = await rl.question(question);
  stdin.removeListener('data', onData);
  stdout.write('\n');
  rl.close();
  return answer;
}

function checkPassword(password) {
  if (password.length < MIN_PASSWORD_LENGTH) return `Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`;
  if (password.length > 128) return 'Le mot de passe ne doit pas dépasser 128 caractères.';
  if (password.toLowerCase().includes(identifier)) return 'Le mot de passe ne doit pas contenir l’identifiant.';
  return null;
}

async function askPassword() {
  if (env.MASTER_PASSWORD) {
    const problem = checkPassword(env.MASTER_PASSWORD);
    if (problem) fail(`MASTER_PASSWORD : ${problem}`);
    return env.MASTER_PASSWORD;
  }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const password = await ask('Mot de passe de l’administration : ', { secret: true });
    const problem = checkPassword(password);
    if (problem) {
      console.log(`  ${problem}`);
      continue;
    }
    const again = await ask('Confirmez le mot de passe : ', { secret: true });
    if (password !== again) {
      console.log('  Les deux saisies diffèrent.');
      continue;
    }
    return password;
  }
  fail('Trop de tentatives.');
  return null;
}

async function existingAdmin() {
  const rows = await api(`/rest/v1/admins?select=id,identifier,last_login_at&limit=5`);
  return rows[0] ?? null;
}

async function findAuthUser() {
  const list = await api(`/auth/v1/admin/users?per_page=200`);
  return (list.users ?? []).find((u) => u.email === adminEmail) ?? null;
}

const commands = {
  async creer() {
    const admin = await existingAdmin();
    if (admin) {
      fail(`Le compte « ${admin.identifier} » existe déjà.
Pour changer son mot de passe : npm run admin -- motdepasse`);
    }
    const password = await askPassword();
    let user = await findAuthUser();
    if (user) {
      await api(`/auth/v1/admin/users/${user.id}`, { method: 'PUT', body: { password } });
    } else {
      user = await api('/auth/v1/admin/users', {
        method: 'POST',
        body: { email: adminEmail, password, email_confirm: true, app_metadata: { identifier } },
      });
    }
    try {
      await api('/rest/v1/admins', { method: 'POST', body: { id: user.id, identifier, display_name: 'Administration' } });
    } catch (err) {
      throw err;
    }
    console.log(`\n✔ Compte d’administration créé.

  Identifiant : ${identifier}
  Connexion   : page du site, menu « Administration » (adresse #/admin)

  Ce mot de passe n’est stocké nulle part dans le projet : seule son
  empreinte chiffrée existe chez Supabase. Rangez-le dans un gestionnaire
  de mots de passe.`);
  },

  async motdepasse() {
    const admin = await existingAdmin();
    if (!admin) fail('Aucun compte d’administration. Créez-le avec : npm run admin -- creer');
    const user = await findAuthUser();
    if (!user) fail('Compte introuvable côté authentification. Recréez-le avec : npm run admin -- creer');
    const password = await askPassword();
    await api(`/auth/v1/admin/users/${user.id}`, { method: 'PUT', body: { password } });
    console.log('\n✔ Mot de passe modifié. Les sessions ouvertes restent valides jusqu’à une heure.');
  },

  async etat() {
    const admin = await existingAdmin();
    if (!admin) {
      console.log('\nAucun compte d’administration. Créez-le avec : npm run admin -- creer\n');
      return;
    }
    const last = admin.last_login_at ? new Date(admin.last_login_at).toLocaleString('fr-FR') : 'jamais';
    const counts = {};
    for (const table of ['posts', 'comments', 'photos', 'events']) {
      const res = await fetch(`${url}/rest/v1/${table}?select=id`, {
        headers: { ...authHeaders(), Prefer: 'count=exact', Range: '0-0' },
      });
      counts[table] = res.headers.get('content-range')?.split('/')[1] ?? '?';
    }
    console.log(`
  Compte d’administration : ${admin.identifier}
  Dernière connexion      : ${last}

  Articles    : ${counts.posts}
  Commentaires: ${counts.comments}
  Photos      : ${counts.photos}
  Événements  : ${counts.events}
`);
  },
};

const command = process.argv[2];
if (!command || !commands[command]) {
  console.log(`
Administration du site Famille 33

  npm run admin -- creer         Créer le compte d'administration (${identifier})
  npm run admin -- motdepasse    Changer son mot de passe
  npm run admin -- etat          Vérifier le compte et compter les contributions

Le mot de passe est demandé à la saisie et n'apparaît pas à l'écran.
`);
  process.exit(command ? 1 : 0);
}

requireConfig();
try {
  await commands[command]();
} catch (err) {
  if (err.status === 401 || err.status === 403) {
    fail(`Clé refusée par Supabase (${err.message}).
Vérifiez SUPABASE_SERVICE_KEY dans .env.local : il faut la clé « service_role »
(ancien format, commençant par ey…) ou la clé secrète (sb_secret_…), et non la
clé publique. Vérifiez aussi qu'elle provient bien du projet ${url}.`);
  }
  if (err.status === 404) fail(`Adresse introuvable. Vérifiez VITE_SUPABASE_URL dans .env.local.\n${err.message}`);
  if (/fetch failed/i.test(err.message)) fail('Connexion impossible. Vérifiez votre accès à Internet et l’URL du projet.');
  fail(err.message);
}
