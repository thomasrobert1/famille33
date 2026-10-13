// Structure commune : en-tête, onglets, bouton de dépôt, navigation basse.
import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { emblem } from './emblem.js';
import { navLabel, setting } from '../lib/settings.js';
import { session, isMaster } from '../lib/session.js';

const TABS = [
  { key: 'feed', href: '#/fil', icon: 'scroll' },
  { key: 'gallery', href: '#/galerie', icon: 'images' },
  { key: 'planning', href: '#/planning', icon: 'calendar-days' },
  { key: 'directory', href: '#/annuaire', icon: 'users', label: 'Annuaire' },
];

export function renderShell(root, { onLogout }) {
  const menuList = h('div', { class: 'menu menu--account', id: 'account-menu', role: 'menu', hidden: true });
  const menuButton = h('button', {
    class: 'icon-btn icon-btn--light', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    'aria-controls': 'account-menu', 'aria-label': 'Menu',
  }, icon('ellipsis', { size: 22 }));

  const closeMenu = () => {
    menuList.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
  };
  menuButton.addEventListener('click', () => {
    const open = menuList.hidden;
    menuList.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    if (open) menuList.querySelector('[role="menuitem"]')?.focus();
  });
  document.addEventListener('click', (e) => {
    if (!menuList.hidden && !e.target.closest('.account')) closeMenu();
  });
  menuList.addEventListener('keydown', (e) => {
    const items = [...menuList.querySelectorAll('[role="menuitem"]')];
    const i = items.indexOf(document.activeElement);
    if (e.key === 'Escape') { closeMenu(); menuButton.focus(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); items[(i + 1) % items.length].focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  });
  menuList.addEventListener('click', (e) => { if (e.target.closest('a')) closeMenu(); });

  const topTabs = h('nav', { class: 'tabs', 'aria-label': 'Navigation principale' },
    TABS.map((t) => h('a', { class: 'tabs__link', href: t.href, dataset: { tab: t.key } }, t.label ?? navLabel(t.key))));
  const bottomTabs = h('nav', { class: 'bottom-nav', 'aria-label': 'Navigation principale' },
    TABS.map((t) => h('a', { class: 'bottom-nav__link', href: t.href, dataset: { tab: t.key } },
      icon(t.icon, { size: 22 }), h('span', null, t.label ?? navLabel(t.key)))));

  const main = h('main', { id: 'main', class: 'main', tabindex: '-1' });

  function fillMenu() {
    menuList.replaceChildren(
      isMaster()
        ? h('div', { class: 'menu__header' },
          h('strong', null, 'Administration'), h('span', null, session.admin.identifier))
        : null,
      link('#/deposer', 'pencil', 'Déposer un article'),
      link('#/mes-contributions', 'scroll', 'Mes contributions'),
      link('#/confidentialite', 'lock', 'Confidentialité'),
      isMaster() ? link('#/admin', 'shield', 'Espace d’administration') : null,
      isMaster()
        ? h('button', { class: 'menu__item', type: 'button', role: 'menuitem', onClick: () => { closeMenu(); onLogout(); } },
          icon('log-out', { size: 18 }), 'Quitter l’administration')
        : link('#/admin', 'key', 'Accès administrateur'));
  }
  fillMenu();

  root.replaceChildren(
    h('a', { class: 'skip-link', href: '#main', onClick: (e) => { e.preventDefault(); main.focus(); } }, 'Aller au contenu'),
    h('header', { class: 'site-header' },
      h('div', { class: 'site-header__inner' },
        h('a', { class: 'brand', href: '#/fil' },
          emblem({ size: 40 }),
          h('span', { class: 'brand__name' }, setting('site.name'))),
        topTabs,
        h('div', { class: 'header-actions' },
          h('a', { class: 'btn btn--primary btn--sm header-actions__post', href: '#/deposer' },
            icon('pencil', { size: 16 }), 'Déposer un article'),
          h('div', { class: 'account' }, menuButton, menuList)))),
    main,
    bottomTabs,
    h('a', { class: 'fab', href: '#/deposer', 'aria-label': 'Déposer un article' }, icon('pencil', { size: 22 })));

  return {
    main,
    setActive(tab) {
      for (const el of root.querySelectorAll('[data-tab]')) {
        if (el.dataset.tab === tab) el.setAttribute('aria-current', 'page');
        else el.removeAttribute('aria-current');
      }
    },
    refreshMenu: fillMenu,
  };
}

function link(href, iconName, label) {
  return h('a', { class: 'menu__item', href, role: 'menuitem' }, icon(iconName, { size: 18 }), label);
}
