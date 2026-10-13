import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { supabase } from '../lib/supabase.js';
import { promoLabel, promoYear, cousins } from '../lib/contributor.js';
import { formatShortDate } from '../lib/format.js';
import { pageHeader, loadingState, emptyState, errorState, openModal } from '../lib/ui.js';

export async function renderDirectory(container, { query }) {
  const state = { q: query.get('q') ?? '', token: 0, rows: [] };
  const results = h('div', { class: 'directory', 'aria-live': 'polite' });
  const count = h('p', { class: 'muted directory__count' });
  const search = h('input', {
    class: 'search__input', type: 'search', value: state.q, maxlength: 80,
    placeholder: 'Nom, bucque, entreprise, ville…', 'aria-label': 'Rechercher un membre',
  });
  const numberFilter = h('select', { class: 'select-inline', 'aria-label': 'Filtrer par numéro' },
    h('option', { value: '' }, 'Tous les numéros'),
    [33, 67, 133].map((n) => h('option', { value: n }, `Numéro ${n}`)));

  let debounce;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.q = search.value.trim(); load(); }, 300);
  });
  numberFilter.addEventListener('change', draw);

  container.replaceChildren(h('div', { class: 'page page--wide' },
    pageHeader('Annuaire'),
    h('p', { class: 'lead' },
      'Les personnes qui ont déposé un article apparaissent ici, avec les informations qu’elles ont choisi d’indiquer. Les adresses e-mail ne sont visibles que si leur titulaire l’a demandé.'),
    h('div', { class: 'toolbar toolbar--filters' },
      h('label', { class: 'search' }, icon('search', { size: 18 }), search),
      numberFilter),
    count,
    results));

  async function load() {
    const token = ++state.token;
    results.replaceChildren(loadingState('Recherche…'));
    try {
      const { data, error } = await supabase.rpc('contributors', { p_query: state.q || null });
      if (error) throw error;
      if (token !== state.token) return;
      state.rows = data ?? [];
      draw();
    } catch (err) {
      if (token === state.token) results.replaceChildren(errorState(err, load));
    }
  }

  function draw() {
    const filter = Number(numberFilter.value) || null;
    const rows = filter ? state.rows.filter((r) => r.number === filter) : state.rows;
    count.textContent = rows.length ? `${rows.length} personne${rows.length > 1 ? 's' : ''}` : '';
    if (!rows.length) {
      results.replaceChildren(emptyState({
        iconName: 'users',
        title: state.rows.length ? 'Aucune personne ne correspond.' : 'L’annuaire se remplira avec les articles.',
        text: state.rows.length ? 'Élargissez la recherche.' : 'Chaque personne qui dépose un article y apparaît.',
      }));
      return;
    }
    const byPromo = new Map();
    for (const r of rows) {
      if (!byPromo.has(r.promo)) byPromo.set(r.promo, []);
      byPromo.get(r.promo).push(r);
    }
    results.replaceChildren(...[...byPromo.entries()].map(([promo, people]) => h('section', { class: 'directory__group' },
      h('h2', { class: 'directory__promo' }, promoLabel(promo), h('span', null, `entrée en ${promoYear(promo)}`)),
      h('ul', { class: 'directory__list' }, people.map((p) => h('li', null, personCard(p)))))));
  }

  await load();
}

function fullName(p) {
  return [p.first_name, p.last_name].filter(Boolean).join(' ');
}

function personCard(p) {
  const work = [p.job, p.company].filter(Boolean).join(', ');
  const place = [p.city, p.region, p.country].filter(Boolean).join(', ');
  return h('button', { class: 'member-card', type: 'button', onClick: () => openPerson(p) },
    h('span', { class: 'author__badge', 'aria-hidden': 'true' },
      h('span', { class: 'author__initials' }, `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}`.toUpperCase()),
      h('span', { class: 'author__number' }, String(p.number))),
    h('span', { class: 'member-card__text' },
      h('span', { class: 'member-card__name' }, fullName(p)),
      h('span', { class: 'member-card__id' }, p.bucque),
      work ? h('span', { class: 'member-card__line' }, work) : null,
      place ? h('span', { class: 'member-card__line muted' }, place) : null));
}

function openPerson(p) {
  const row = (label, value) => (value ? h('div', { class: 'dl__row' }, h('dt', null, label), h('dd', null, value)) : null);
  const content = h('div', { class: 'member-detail' },
    h('div', { class: 'member-detail__head' },
      h('span', { class: 'author__badge author__badge--lg', 'aria-hidden': 'true' },
        h('span', { class: 'author__initials' }, `${p.first_name?.[0] ?? ''}${p.last_name?.[0] ?? ''}`.toUpperCase()),
        h('span', { class: 'author__number' }, String(p.number))),
      h('div', null,
        h('p', { class: 'member-detail__id' }, p.bucque),
        h('p', { class: 'muted' }, `${p.number} ch ${p.promo}, entrée en ${promoYear(p.promo)}`),
        h('p', { class: 'muted' }, `Cousin de ${cousins(p.number, p.promo).join(' et ')}`))),
    h('dl', { class: 'dl' },
      row('Statut', p.status),
      row('Entreprise', p.company),
      row('Fonction', p.job),
      row('Secteur', p.sector),
      row('Ville', p.city),
      row('Région', p.region),
      row('Pays', p.country),
      row('E-mail', p.email ? h('a', { href: `mailto:${p.email}` }, p.email) : null),
      row('Articles déposés', String(p.posts_count)),
      row('Dernier article', formatShortDate(p.last_post_at))),
    p.note ? h('p', { class: 'member-detail__bio' }, p.note) : null);
  openModal({ title: fullName(p), content });
}
