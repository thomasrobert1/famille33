// Construit un APERÇU HORS LIGNE en un seul fichier HTML, avec des données de
// test en mémoire (tests/e2e/mock-supabase.js). Il s'ouvre d'un double-clic,
// sans serveur ni Supabase. Rien n'y est enregistré. Ne pas publier en ligne.
//
//   npm run apercu   →   apercu/famille33-apercu.html
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';

const dist = 'tests/e2e/.dist';
const assets = join(dist, 'assets');
let html = readFileSync(join(dist, 'index.html'), 'utf8');

const mime = { '.woff2': 'font/woff2', '.woff': 'font/woff', '.svg': 'image/svg+xml', '.png': 'image/png' };
const dataUri = (file) => `data:${mime[extname(file)] ?? 'application/octet-stream'};base64,${readFileSync(file).toString('base64')}`;

// Feuille de style : polices intégrées (woff2 uniquement, supporté partout)
const cssFile = readdirSync(assets).find((f) => f.endsWith('.css'));
let css = readFileSync(join(assets, cssFile), 'utf8')
  .replace(/,\s*url\([^)]*\.woff\)\s*format\(["']?woff["']?\)/g, '')
  .replace(/url\((?:\.\/|\/assets\/)?([^)'"]+\.woff2)\)/g, (_, name) => `url(${dataUri(join(assets, name.split('/').pop()))})`);

// Script : intégré dans la page (les modules chargés depuis file:// sont bloqués)
const jsFile = readdirSync(assets).find((f) => f.endsWith('.js'));
const js = readFileSync(join(assets, jsFile), 'utf8').replace(/<\/script/gi, '<\\/script');

html = html
  .replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/s, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<link rel="modulepreload"[^>]*>/g, '')
  .replace(/<link rel="stylesheet"[^>]*>/, () => `<style>${css}</style>`)
  .replace(/<script type="module"[^>]*src="[^"]*"><\/script>/, () => `<script type="module">${js}</script>`)
  .replace(/href="\.\/favicon\.svg"/, () => `href="${dataUri(join(dist, 'favicon.svg'))}"`)
  .replace('<title>Famille 33</title>', '<title>Famille 33 – aperçu hors ligne</title>')
  .replace('<body>', () => `<body>
    <div role="note" style="background:#0d1729;color:#d6bc86;font:600 14px/1.4 system-ui,sans-serif;padding:8px 16px;text-align:center;border-bottom:1px solid #b08d57">
      Aperçu hors ligne avec des données de test : rien n’est enregistré, aucune connexion à Supabase.
      Connectez-vous avec l’identifiant <strong style="color:#f4efe2">master</strong> et n’importe quel mot de passe.
    </div>`);

mkdirSync('apercu', { recursive: true });
writeFileSync('apercu/famille33-apercu.html', html);
console.log(`apercu/famille33-apercu.html (${Math.round(html.length / 1024)} Ko)`);
