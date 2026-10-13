// Compilation de l'interface avec le faux Supabase (tests d'interface uniquement).
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  root: fileURLToPath(new URL('../..', import.meta.url)),
  base: './',
  resolve: { alias: { '@supabase/supabase-js': fileURLToPath(new URL('./mock-supabase.js', import.meta.url)) } },
  define: {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://test.supabase.co'),
    'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify('test'),
  },
  build: { outDir: 'tests/e2e/.dist', emptyOutDir: true },
  logLevel: 'warn',
});
