import { defineConfig } from 'vite';

export default defineConfig({
  // Chemin relatif : fonctionne sur un domaine personnalisé comme sur
  // https://<utilisateur>.github.io/<depot>/
  base: './',
  build: {
    target: 'es2020',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.js', 'tests/scripts/**/*.test.js'],
    testTimeout: 20000,
  },
});
