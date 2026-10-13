// Point d'entrée : polices auto-hébergées, routes, session d'administration.
import '@fontsource/grenze-gotisch/500.css';
import '@fontsource/grenze-gotisch/700.css';
import '@fontsource/atkinson-hyperlegible-next/400.css';
import '@fontsource/atkinson-hyperlegible-next/400-italic.css';
import '@fontsource/atkinson-hyperlegible-next/700.css';
import './styles/main.css';

import { h } from './lib/dom.js';
import { isConfigured, supabase } from './lib/supabase.js';
import { route, resolve, currentPath, navigate, startRouter } from './lib/router.js';
import { initSession, logout, isMaster } from './lib/session.js';
import { loadSettings, setting, navLabel } from './lib/settings.js';
import { loadingState, errorState, emptyState, toast } from './lib/ui.js';
import { renderShell } from './components/shell.js';
import { emblem } from './components/emblem.js';
import { renderAdminLogin } from './views/login.js';
import { renderPrivacy } from './views/privacy.js';
import { renderFeed } from './views/feed.js';
import { renderPost } from './views/post.js';
import { renderPostEditor } from './views/post-editor.js';
import { renderGallery } from './views/gallery.js';
import { renderPlanning } from './views/planning.js';
import { renderDirectory } from './views/directory.js';
import { renderMyContributions } from './views/my-contributions.js';
import { renderAdmin } from './views/admin/index.js';

const root = document.getElementById('app');

route('/fil', renderFeed, { tab: 'feed' });
route('/deposer', renderPostEditor, { tab: 'feed', title: 'Déposer un article' });
route('/fil/:id/modifier', renderPostEditor, { tab: 'feed', title: 'Modifier l’article' });
route('/fil/:id', renderPost, { tab: 'feed' });
route('/galerie', renderGallery, { tab: 'gallery' });
route('/planning', renderPlanning, { tab: 'planning' });
route('/annuaire', renderDirectory, { tab: 'directory', title: 'Annuaire' });
route('/mes-contributions', renderMyContributions, { title: 'Mes contributions' });
route('/confidentialite', renderPrivacy, { title: 'Confidentialité' });
route('/admin', renderAdmin, { master: true, title: 'Administration' });
route('/admin/:tab', renderAdmin, { master: true, title: 'Administration' });
route('/', null, { redirect: '/fil' });

let shell = null;
let cleanup = null;
let renderToken = 0;

function setTitle(match) {
  const label = match.title ?? (match.tab ? navLabel(match.tab) : null);
  document.title = label ? `${label} – ${setting('site.name')}` : setting('site.name');
}

async function render() {
  const token = ++renderToken;
  cleanup?.();
  cleanup = null;

  const path = currentPath();
  const match = resolve(path);
  if (!match) return navigate('/fil', { replace: true });
  if (match.redirect) return navigate(match.redirect, { replace: true });
  setTitle(match);

  if (!shell) shell = renderShell(root, { onLogout: doLogout });
  shell.setActive(match.tab ?? null);
  window.scrollTo(0, 0);

  // Chaque page reçoit son conteneur : une page lente ne peut pas écraser
  // la suivante si le visiteur change d'onglet entre-temps.
  const view = h('div', { class: 'view' });
  shell.main.replaceChildren(view);

  // L'espace d'administration demande une connexion ; tout le reste est public.
  if (match.master && !isMaster()) {
    renderAdminLogin(view, {
      onSuccess: () => {
        shell.refreshMenu();
        toast('Bienvenue dans l’espace d’administration.');
        render();
      },
    });
    return;
  }

  view.append(loadingState());
  try {
    const result = await match.view(view, { params: match.params, query: match.query });
    if (typeof result === 'function') {
      if (token === renderToken) cleanup = result;
      else result();
    }
  } catch (err) {
    console.error(err);
    if (token === renderToken) view.replaceChildren(errorState(err, render));
  }
}

async function doLogout() {
  await logout();
  shell = null;
  toast('Vous avez quitté l’espace d’administration.');
  navigate('/fil', { replace: true });
}

function configurationMissing() {
  root.replaceChildren(h('main', { class: 'standalone', id: 'main' },
    h('div', { class: 'login__card' },
      emblem({ size: 72 }),
      h('h1', { class: 'login__title' }, 'Configuration incomplète'),
      h('p', null, 'Les variables VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY ne sont pas définies. Consultez la section « Configuration » du fichier README.md.'))));
}

async function boot() {
  if (!isConfigured) return configurationMissing();
  await loadSettings().catch(() => {});
  await initSession();

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && isMaster()) {
      shell = null;
      navigate('/fil', { replace: true });
    }
  });
  window.addEventListener('f33:settings', () => {
    shell = null;
    render();
  });
  startRouter(render);
}

boot();
