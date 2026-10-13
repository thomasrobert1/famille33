import { h } from '../../lib/dom.js';
import { icon } from '../../lib/icons.js';
import { supabase } from '../../lib/supabase.js';
import { publicUrl, removeFiles } from '../../lib/storage.js';
import { authorName, authorSignature } from '../../lib/contributor.js';
import { formatShortDate, formatEventWhen } from '../../lib/format.js';
import { navigate } from '../../lib/router.js';
import { loadingState, errorState, emptyState, actionMenu, confirmDialog, toast, toastError } from '../../lib/ui.js';
import { deletePost } from '../feed.js';

const TYPES = [['publications', 'Articles'], ['commentaires', 'Commentaires'], ['photos', 'Photos'], ['evenements', 'Événements']];

export async function renderAdminContent(panel, { query }) {
  let type = query?.get('type') ?? 'publications';
  if (!TYPES.some(([k]) => k === type)) type = 'publications';
  const box = h('div');
  const nav = h('div', { class: 'segmented', role: 'group', 'aria-label': 'Type de contenu' },
    TYPES.map(([key, label]) => h('button', {
      class: 'segmented__btn', type: 'button', 'aria-pressed': String(key === type), dataset: { key },
      onClick: () => {
        type = key;
        for (const b of nav.children) b.setAttribute('aria-pressed', String(b.dataset.key === key));
        history.replaceState(null, '', `#/admin/contenus?type=${key}`);
        show();
      },
    }, label)));
  panel.replaceChildren(h('div', { class: 'toolbar' }, nav), box);

  async function show() {
    box.replaceChildren(loadingState());
    try {
      await RENDERERS[type](box, show);
    } catch (err) {
      box.replaceChildren(errorState(err, show));
    }
  }
  await show();
}

const tag = (text, tone) => h('span', { class: `tag tag--${tone}` }, text);

function dataTable(headers, rows) {
  return h('div', { class: 'table-wrap' }, h('table', { class: 'table' },
    h('thead', null, h('tr', null, headers.map((c) => h('th', { scope: 'col', class: c ? null : 'visually-hidden-th' }, c || 'Actions')))),
    h('tbody', null, rows.map((cells) => h('tr', null, cells.map((cell, i) => h('td', {
      'data-label': headers[i] || null, class: headers[i] ? null : 'table__actions',
    }, cell)))))));
}

async function toggleHidden(table, row, reload) {
  const { error } = await supabase.from(table).update({ is_hidden: !row.is_hidden }).eq('id', row.id);
  if (error) return toastError(error);
  toast(row.is_hidden ? 'Contenu réaffiché.' : 'Contenu masqué aux membres.');
  reload();
}

const approveItem = (table, row, reload) => ({
  label: 'Valider la publication', icon: 'check',
  onClick: async () => {
    const { error } = await supabase.from(table).update({ status: 'published' }).eq('id', row.id);
    if (error) return toastError(error);
    toast('Contribution validée et visible de tous.');
    reload();
  },
});

const hideItem = (table, row, reload) => ({
  label: row.is_hidden ? 'Réafficher' : 'Masquer', icon: row.is_hidden ? 'eye' : 'eye-off',
  onClick: () => toggleHidden(table, row, reload),
});

const RENDERERS = {
  async publications(box, reload) {
    const { data, error } = await supabase.from('posts')
      .select(`id, title, status, is_hidden, created_at, author_first_name, author_last_name,
               author_number, author_promo, author_bucque, post_images(path), comments(count)`)
      .order('status', { ascending: true })
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    if (!data.length) return box.replaceChildren(emptyState({ iconName: 'scroll', title: 'Aucun article.' }));
    box.replaceChildren(dataTable(['Titre', 'Auteur', 'Date', 'Commentaires', 'État', ''], data.map((p) => [
      h('a', { href: `#/fil/${p.id}` }, p.title),
      h('span', null, authorName(p), h('br'), h('span', { class: 'muted' }, authorSignature(p))),
      formatShortDate(p.created_at),
      String(p.comments?.[0]?.count ?? 0),
      p.status === 'pending' ? tag('À valider', 'warning')
        : p.is_hidden ? tag('Masqué', 'warning') : tag('En ligne', 'ok'),
      actionMenu([
        p.status === 'pending' ? approveItem('posts', p, reload) : null,
        hideItem('posts', p, reload),
        { label: 'Modifier', icon: 'pencil', onClick: () => navigate(`/fil/${p.id}/modifier`) },
        { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => deletePost(p, reload) },
      ]),
    ])));
  },

  async commentaires(box, reload) {
    const { data, error } = await supabase.from('comments')
      .select('id, body, author_name, author_bucque, author_promo, post_id, is_hidden, created_at, posts(title)')
      .order('created_at', { ascending: false }).limit(200);
    if (error) throw error;
    if (!data.length) return box.replaceChildren(emptyState({ iconName: 'message-circle', title: 'Aucun commentaire.' }));
    box.replaceChildren(dataTable(['Commentaire', 'Auteur', 'Publication', 'Date', 'État', ''], data.map((c) => [
      h('span', { class: 'table__wrap' }, c.body.length > 140 ? `${c.body.slice(0, 140)}…` : c.body),
      h('span', null, c.author_name, c.author_bucque ? h('br') : null,
        c.author_bucque ? h('span', { class: 'muted' }, [c.author_bucque, c.author_promo ? `ch ${c.author_promo}` : null].filter(Boolean).join(', ')) : null),
      h('a', { href: `#/fil/${c.post_id}?commentaires` }, c.posts?.title ?? 'Article'),
      formatShortDate(c.created_at),
      c.is_hidden ? tag('Masqué', 'warning') : tag('Visible', 'ok'),
      actionMenu([
        hideItem('comments', c, reload),
        {
          label: 'Supprimer', icon: 'trash', danger: true,
          onClick: async () => {
            if (!await confirmDialog({ title: 'Supprimer le commentaire ?', message: 'Cette action est définitive.', confirmLabel: 'Supprimer', danger: true })) return;
            const { error: e } = await supabase.from('comments').delete().eq('id', c.id);
            if (e) return toastError(e);
            toast('Commentaire supprimé.');
            reload();
          },
        },
      ]),
    ])));
  },

  async photos(box, reload) {
    const { data, error } = await supabase.from('photos')
      .select(`id, path, thumb_path, caption, status, is_hidden, created_at,
               author_first_name, author_last_name, author_number, author_promo, author_bucque`)
      .order('status', { ascending: true })
      .order('created_at', { ascending: false }).limit(120);
    if (error) throw error;
    if (!data.length) return box.replaceChildren(emptyState({ iconName: 'images', title: 'Aucune photo.' }));
    box.replaceChildren(h('div', { class: 'admin-photos' }, data.map((p) => h('figure', { class: ['admin-photo', p.is_hidden && 'is-hidden'] },
      h('img', { src: publicUrl('gallery', p.thumb_path) ?? '', alt: p.caption ?? '', loading: 'lazy' }),
      h('figcaption', null,
        h('span', null, p.caption || 'Sans légende'),
        h('span', { class: 'muted' }, `${authorName(p)} — ${authorSignature(p)}, ${formatShortDate(p.created_at)}`),
        p.status === 'pending' ? tag('À valider', 'warning') : p.is_hidden ? tag('Masquée', 'warning') : null),
      h('div', { class: 'admin-photo__actions' },
        p.status === 'pending' ? h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: async () => {
          const { error: e } = await supabase.from('photos').update({ status: 'published' }).eq('id', p.id);
          if (e) return toastError(e);
          toast('Photo validée.');
          reload();
        } }, icon('check', { size: 16 }), 'Valider') : null,
        h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: () => toggleHidden('photos', p, reload) },
          icon(p.is_hidden ? 'eye' : 'eye-off', { size: 16 }), p.is_hidden ? 'Réafficher' : 'Masquer'),
        h('button', { class: 'btn btn--ghost btn--sm btn--danger-text', type: 'button', onClick: async () => {
          if (!await confirmDialog({ title: 'Supprimer la photo ?', message: 'La photo sera supprimée définitivement.', confirmLabel: 'Supprimer', danger: true })) return;
          const { error: e } = await supabase.from('photos').delete().eq('id', p.id);
          if (e) return toastError(e);
          await removeFiles('gallery', [p.path, p.thumb_path]);
          toast('Photo supprimée.');
          reload();
        } }, icon('trash', { size: 16 }), 'Supprimer'))))));
  },

  async evenements(box, reload) {
    const [pending, published] = await Promise.all([
      supabase.from('events').select('*').eq('status', 'pending').order('start_date'),
      supabase.from('events').select('*').eq('status', 'published').order('start_date', { ascending: false }).limit(150),
    ]);
    if (pending.error) throw pending.error;
    if (published.error) throw published.error;
    const rows = (list) => list.map((ev) => [
      ev.title,
      formatEventWhen(ev),
      h('span', null, authorName(ev), h('br'), h('span', { class: 'muted' }, authorSignature(ev))),
      actionMenu([
        ev.status === 'pending' ? {
          label: 'Valider', icon: 'check',
          onClick: async () => {
            const { error } = await supabase.from('events').update({ status: 'published' }).eq('id', ev.id);
            if (error) return toastError(error);
            toast('Événement validé.');
            reload();
          },
        } : null,
        { label: 'Voir dans le planning', icon: 'calendar', onClick: () => navigate(`/planning?annee=${ev.start_date.slice(0, 4)}&vue=mois&mois=${Number(ev.start_date.slice(5, 7))}`) },
        {
          label: 'Supprimer', icon: 'trash', danger: true,
          onClick: async () => {
            if (!await confirmDialog({ title: 'Supprimer l’événement ?', message: `« ${ev.title} »${ev.recurrence_unit ? ' et toutes ses dates' : ''} sera retiré du planning.`, confirmLabel: 'Supprimer', danger: true })) return;
            const { error } = await supabase.from('events').delete().eq('id', ev.id);
            if (error) return toastError(error);
            toast('Événement supprimé.');
            reload();
          },
        },
      ]),
    ]);
    box.replaceChildren(
      h('h2', { class: 'section-title' }, `À valider (${pending.data.length})`),
      pending.data.length ? dataTable(['Événement', 'Date', 'Proposé par', ''], rows(pending.data))
        : h('p', { class: 'muted' }, 'Aucun événement en attente.'),
      h('h2', { class: 'section-title' }, 'Événements publiés'),
      published.data.length ? dataTable(['Événement', 'Date', 'Proposé par', ''], rows(published.data))
        : h('p', { class: 'muted' }, 'Aucun événement.'));
  },
};
