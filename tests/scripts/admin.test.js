import { describe, it, expect, afterEach } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startFakeSupabase } from './fake-supabase.mjs';

const run = promisify(execFile);
let fake;
afterEach(() => fake?.server.close());

async function admin(args, { key = 'sb_secret_TEST', password = 'phrase-de-passe-33' } = {}) {
  const env = {
    ...process.env,
    VITE_SUPABASE_URL: fake.url,
    SUPABASE_SERVICE_KEY: key,
    MASTER_PASSWORD: password,
  };
  try {
    const { stdout } = await run('node', ['scripts/admin.mjs', ...args], { env });
    return { ok: true, out: stdout };
  } catch (err) {
    return { ok: false, out: (err.stdout ?? '') + (err.stderr ?? '') };
  }
}

describe('script d’administration', () => {
  it('crée le compte master33 avec une clé récente (sb_secret_…)', async () => {
    fake = await startFakeSupabase();
    const { ok, out } = await admin(['creer']);
    expect(ok).toBe(true);
    expect(out).toMatch(/Compte d’administration créé/);
    expect(fake.state.admins[0]).toMatchObject({ identifier: 'master33' });
    expect(fake.state.users[0].password).toBe('phrase-de-passe-33');
    // La clé récente ne doit jamais partir dans l'en-tête Authorization
    expect(fake.state.calls.every((c) => !c.bearer)).toBe(true);
    expect(fake.state.calls.every((c) => c.apikey === 'sb_secret_TEST')).toBe(true);
  });

  it('fonctionne aussi avec une ancienne clé service_role (JWT)', async () => {
    const legacyKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.service.role';
    fake = await startFakeSupabase({ key: legacyKey, legacy: true });
    const { ok } = await admin(['creer'], { key: legacyKey });
    expect(ok).toBe(true);
    // Les anciennes clés sont des jetons : les deux en-têtes sont attendus
    expect(fake.state.calls.every((c) => c.bearer === legacyKey)).toBe(true);
  });

  it('refuse un mot de passe trop court, sans rien créer', async () => {
    fake = await startFakeSupabase();
    const { ok, out } = await admin(['creer'], { password: 'court' });
    expect(ok).toBe(false);
    expect(out).toMatch(/au moins 12 caractères/);
    expect(fake.state.users).toHaveLength(0);
  });

  it('refuse de créer un second compte', async () => {
    fake = await startFakeSupabase();
    await admin(['creer']);
    const { ok, out } = await admin(['creer']);
    expect(ok).toBe(false);
    expect(out).toMatch(/existe déjà/);
    expect(fake.state.admins).toHaveLength(1);
  });

  it('change le mot de passe d’un compte existant', async () => {
    fake = await startFakeSupabase();
    await admin(['creer']);
    const { ok } = await admin(['motdepasse'], { password: 'nouvelle-phrase-33' });
    expect(ok).toBe(true);
    expect(fake.state.users[0].password).toBe('nouvelle-phrase-33');
  });

  it('explique clairement une clé refusée', async () => {
    fake = await startFakeSupabase();
    const { ok, out } = await admin(['etat'], { key: 'sb_publishable_MAUVAISE' });
    expect(ok).toBe(false);
    expect(out).toMatch(/Clé refusée par Supabase/);
    expect(out).toMatch(/service_role|sb_secret_/);
  });

  it('exige la configuration avant toute action', async () => {
    fake = await startFakeSupabase();
    const { ok, out } = await admin(['etat'], { key: '' });
    expect(ok).toBe(false);
    expect(out).toMatch(/Configuration incomplète/);
  });
});
