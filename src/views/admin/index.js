import { h } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { supabase } from '../../lib/supabase.js';
import { todayISO, formatDateTime } from '../../lib/format.js';
import { downloadText } from '../../lib/events.js';
import { toCsv } from '../../lib/csv.js';
import { pageHeader, loadingState, errorState, emptyState, toast, toastError } from '../../lib/ui.js';
import { renderAdminContent } from './content.js';
import { renderAdminCategories, renderAdminSettings } from './config.js';

const TABS = [
  { key: 'tableau', label: 'Tableau de bord', render: renderDashboard },
  { key: 'contenus', label: 'Contenus', render: renderAdminContent },
  { key: 'categories', label: 'Catégories et listes', render: renderAdminCategories },
  { key: 'parametres', label: 'Paramètres', render: renderAdminSettings },
  { key: 'journal', label: 'Journal', render: renderAudit },
  { key: 'export', label: 'Export', render: renderExport },
];

export async function renderAdmin(container, { params, query }) {
  const current = TABS.find((t) => t.key === params.tab) ?? TABS[0];
  const panel = h('div', { class: 'admin__panel' });
  container.replaceChildren(h('div', { class: 'page page--wide admin' },
    pageHeader('Administration'),
    h('nav', { class: 'admin__tabs', 'aria-label': 'Sections de l’administration' },
      TABS.map((t) => h('a', { class: 'admin__tab', href: `#/admin/${t.key}`, 'aria-current': t === current ? 'page' : null }, t.label))),
    panel));
  await current.render(panel, { query });
}

// --- Tableau de bord ------------------------------------------------------------
async function renderDashboard(panel) {
  panel.replaceChildren(loadingState());
  try {
    const count = (q) => q.then((r) => { if (r.error) throw r.error; return r.count ?? 0; });
    const head = { count: 'exact', head: true };
    const [postsPending, photosPending, eventsPending, posts, comments, photos, upcoming, recent] = await Promise.all([
      count(supabase.from('posts').select('id', head).eq('status', 'pending')),
      count(supabase.from('photos').select('id', head).eq('status', 'pending')),
      count(supabase.from('events').select('id', head).eq('status', 'pending')),
      count(supabase.from('posts').select('id', head)),
      count(supabase.from('comments').select('id', head)),
      count(supabase.from('photos').select('id', head)),
      count(supabase.from('events').select('id', head).gte('end_date', todayISO())),
      supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).limit(6),
    ]);
    const waiting = postsPending + photosPending + eventsPending;
    const stat = (value, label, href, alert = false) => h(href ? 'a' : 'div', { class: ['stat', alert && value > 0 && 'stat--alert'], href },
      h('span', { class: 'stat__value' }, String(value)), h('span', { class: 'stat__label' }, label));
    panel.replaceChildren(
      waiting > 0
        ? h('div', { class: 'notice notice--action' }, icon('hourglass', { size: 18 }),
          h('p', null, `${waiting} contribution${waiting > 1 ? 's' : ''} ${waiting > 1 ? 'attendent' : 'attend'} votre validation.`))
        : null,
      h('div', { class: 'stats' },
        stat(postsPending, 'articles à valider', '#/admin/contenus?type=publications', true),
        stat(photosPending, 'photos à valider', '#/admin/contenus?type=photos', true),
        stat(eventsPending, 'événements à valider', '#/admin/contenus?type=evenements', true),
        stat(posts, 'articles au total', '#/admin/contenus'),
        stat(comments, 'commentaires', '#/admin/contenus?type=commentaires'),
        stat(photos, 'photos', '#/admin/contenus?type=photos'),
        stat(upcoming, 'événements à venir', '#/planning')),
      h('h2', { class: 'section-title' }, 'Dernières actions'),
      auditTable(recent.data ?? []),
      h('p', null, h('a', { href: '#/admin/journal' }, 'Voir tout le journal')));
  } catch (err) {
    panel.replaceChildren(errorState(err, () => renderDashboard(panel)));
  }
}

// --- Journal -----------------------------------------------------------------------
const ACTIONS = {
  update: 'Modification', delete: 'Suppression', insert: 'Création',
  purge_storage: 'Purge des fichiers',
};
const ENTITIES = {
  posts: 'Article', comments: 'Commentaire', photos: 'Photo', events: 'Événement',
  post_categories: 'Rubrique', albums: 'Album', event_categories: 'Catégorie d’événement',
  recurrence_options: 'Fréquence', site_settings: 'Paramètre', storage: 'Stockage',
};

function describe(row) {
  const d = row.details ?? {};
  const parts = [];
  if (d.label) parts.push(`« ${d.label} »`);
  if (d.fields?.length) parts.push(`champs : ${d.fields.join(', ')}`);
  if (d.files) parts.push(`${d.files} fichier(s)`);
  if (d.value !== undefined) parts.push(`valeur : ${JSON.stringify(d.value).slice(0, 80)}`);
  return parts.join(' ; ');
}

function auditTable(rows) {
  if (!rows.length) return emptyState({ iconName: 'scroll', title: 'Aucune action enregistrée pour le moment.' });
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', null, h('tr', null, ['Date', 'Par', 'Action', 'Élément', 'Détails'].map((c) => h('th', { scope: 'col' }, c)))),
    h('tbody', null, rows.map((r) => h('tr', null,
      h('td', { 'data-label': 'Date' }, formatDateTime(r.created_at)),
      h('td', { 'data-label': 'Par' }, r.actor ?? 'système'),
      h('td', { 'data-label': 'Action' }, ACTIONS[r.action] ?? r.action),
      h('td', { 'data-label': 'Élément' }, ENTITIES[r.entity] ?? r.entity),
      h('td', { 'data-label': 'Détails', class: 'table__wrap' }, describe(r)))))));
}

async function renderAudit(panel) {
  let offset = 0;
  const list = h('div');
  const more = h('button', { class: 'btn btn--secondary', type: 'button', onClick: () => load() }, 'Afficher plus');
  const rows = [];
  panel.replaceChildren(h('p', { class: 'lead' }, 'Historique des actions de l’administration et des opérations sur les comptes.'), list, more);
  async function load() {
    const { data, error } = await supabase.from('audit_logs').select('*').order('created_at', { ascending: false }).range(offset, offset + 49);
    if (error) return list.replaceChildren(errorState(error, load));
    rows.push(...data);
    offset += data.length;
    more.hidden = data.length < 50;
    list.replaceChildren(auditTable(rows));
  }
  await load();
}

// --- Export ---------------------------------------------------------------------------
async function fetchAll(table, select, order = 'created_at') {
  const all = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from(table).select(select).order(order).range(from, from + 999);
    if (error) throw error;
    all.push(...data);
    if (data.length < 1000) return all;
  }
}

function renderExport(panel) {
  const stamp = todayISO();
  const exports = [
    {
      label: 'Contributeurs (CSV)', hint: 'Une ligne par personne ayant déposé un article, avec les informations qu’elle a indiquées.',
      run: async () => {
        const { data, error } = await supabase.rpc('contributors');
        if (error) throw error;
        downloadText(`contributeurs-${stamp}.csv`, toCsv(data ?? [], [
          { key: 'last_name', label: 'Nom' }, { key: 'first_name', label: 'Prénom' },
          { key: 'bucque', label: 'Bucque' }, { key: 'number', label: 'Numéro' }, { key: 'promo', label: 'Promotion' },
          { key: 'status', label: 'Statut' }, { key: 'company', label: 'Entreprise' }, { key: 'job', label: 'Fonction' },
          { key: 'sector', label: 'Secteur' }, { key: 'city', label: 'Ville' }, { key: 'region', label: 'Région' },
          { key: 'country', label: 'Pays' }, { key: 'email', label: 'E-mail (si partagé)' },
          { key: 'posts_count', label: 'Articles' }, { key: 'last_post_at', label: 'Dernier article' },
        ]), 'text/csv');
      },
    },
    {
      label: 'Articles et commentaires (JSON)', hint: 'Textes complets et identité des auteurs, pour archivage.',
      run: async () => {
        const [posts, comments] = await Promise.all([
          fetchAll('posts', `id, title, subtitle, body, status, is_hidden, created_at, updated_at,
            author_first_name, author_last_name, author_number, author_promo, author_bucque,
            author_email, author_company, author_job, author_sector, author_status,
            author_city, author_region, author_country, author_note, show_contact, post_images(path)`),
          fetchAll('comments', 'id, post_id, body, author_name, author_bucque, author_promo, is_hidden, created_at'),
        ]);
        downloadText(`articles-${stamp}.json`, JSON.stringify({ exported_at: new Date().toISOString(), posts, comments }, null, 2), 'application/json');
      },
    },
    {
      label: 'Événements (CSV)', hint: 'Toutes les entrées du planning.',
      run: async () => {
        const rows = await fetchAll('events', '*, event_categories(name)', 'start_date');
        downloadText(`evenements-${stamp}.csv`, toCsv(rows, [
          { key: 'title', label: 'Titre' }, { label: 'Catégorie', get: (r) => r.event_categories?.name },
          { key: 'start_date', label: 'Début' }, { key: 'start_time', label: 'Heure de début' },
          { key: 'end_date', label: 'Fin' }, { key: 'end_time', label: 'Heure de fin' },
          { key: 'recurrence_unit', label: 'Récurrence' }, { key: 'recurrence_interval', label: 'Intervalle' },
          { key: 'location', label: 'Lieu' }, { key: 'organizer', label: 'Organisateur' },
          { label: 'Proposé par', get: (r) => `${r.author_first_name} ${r.author_last_name} (${r.author_bucque}, ${r.author_number} ch ${r.author_promo})` },
          { key: 'status', label: 'Statut' }, { key: 'description', label: 'Description' },
        ]), 'text/csv');
      },
    },
    {
      label: 'Photos (CSV)', hint: 'Métadonnées et chemins des fichiers.',
      run: async () => {
        const rows = await fetchAll('photos', `id, path, caption, promo, taken_on, status, is_hidden, created_at,
          author_first_name, author_last_name, author_number, author_promo, author_bucque, albums(name)`);
        downloadText(`photos-${stamp}.csv`, toCsv(rows, [
          { key: 'path', label: 'Fichier' }, { key: 'caption', label: 'Légende' },
          { label: 'Album', get: (r) => r.albums?.name },
          { label: 'Déposée par', get: (r) => `${r.author_first_name} ${r.author_last_name} (${r.author_bucque}, ${r.author_number} ch ${r.author_promo})` },
          { key: 'taken_on', label: 'Date' }, { key: 'status', label: 'Statut' }, { key: 'created_at', label: 'Ajoutée le' },
        ]), 'text/csv');
      },
    },
    {
      label: 'Journal d’administration (CSV)', hint: 'Traçabilité des actions.',
      run: async () => {
        const rows = await fetchAll('audit_logs', '*');
        downloadText(`journal-${stamp}.csv`, toCsv(rows, [
          { key: 'created_at', label: 'Date' }, { key: 'actor', label: 'Par' },
          { label: 'Action', get: (r) => ACTIONS[r.action] ?? r.action },
          { label: 'Élément', get: (r) => ENTITIES[r.entity] ?? r.entity },
          { key: 'entity_id', label: 'Identifiant' }, { label: 'Détails', get: describe },
        ]), 'text/csv');
      },
    },
  ];
  panel.replaceChildren(
    h('p', { class: 'notice' }, icon('lock', { size: 16 }),
      'Ces fichiers contiennent des données personnelles : conservez-les en lieu sûr, ne les ajoutez jamais au dépôt GitHub et supprimez-les lorsqu’ils ne sont plus utiles.'),
    h('div', { class: 'panel' }, exports.map((ex) => {
      const btn = h('button', { class: 'btn btn--secondary', type: 'button' }, icon('download', { size: 16 }), 'Exporter');
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        try {
          await ex.run();
          toast('Export téléchargé.');
        } catch (err) {
          toastError(err);
        } finally {
          btn.disabled = false;
        }
      });
      return h('div', { class: 'panel__row' }, h('div', null, h('p', { class: 'panel__label' }, ex.label), h('p', { class: 'muted' }, ex.hint)), btn);
    })));
}
