import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { supabase } from '../lib/supabase.js';
import { setting } from '../lib/settings.js';
import { isMaster } from '../lib/session.js';
import { publicUrl, removeFiles } from '../lib/storage.js';
import { renderMarkdown, excerpt, plainText } from '../lib/markdown.js';
import { formatRelative, formatDateTime } from '../lib/format.js';
import { authorName, authorSignature, initials, promoYear, tokenFor, dropToken } from '../lib/contributor.js';
import { navigate } from '../lib/router.js';
import {
  pageHeader, loadingState, emptyState, errorState, actionMenu, confirmDialog, toast, toastError, ornament,
} from '../lib/ui.js';
import { openLightbox } from '../components/lightbox.js';

export const POST_FIELDS = `id, title, subtitle, body, category_id, status, is_hidden, created_at, updated_at,
  author_first_name, author_last_name, author_number, author_promo, author_bucque,
  author_company, author_job, author_city, author_region, author_country, author_email, show_contact,
  post_images(id, path, width, height, position), comments(count)`;

export async function renderFeed(container) {
  const pageSize = Math.min(30, Math.max(3, Number(setting('posts.page_size')) || 10));
  const state = { offset: 0, search: '', category: '', loading: false, token: 0 };
  let categories = [];

  const list = h('div', { class: 'feed', 'aria-live': 'polite' });
  const more = h('button', { class: 'btn btn--secondary', type: 'button', hidden: true, onClick: () => load(false) }, 'Afficher les publications plus anciennes');
  const search = h('input', { class: 'search__input', type: 'search', placeholder: 'Rechercher un nom, une bucque, un mot', 'aria-label': 'Rechercher dans le fil', maxlength: 100 });
  const categorySelect = h('select', { class: 'select-inline', 'aria-label': 'Filtrer par rubrique', hidden: true },
    h('option', { value: '' }, 'Toutes les rubriques'));

  let debounce;
  search.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => { state.search = search.value.trim(); load(true); }, 350);
  });
  categorySelect.addEventListener('change', () => { state.category = categorySelect.value; load(true); });

  const intro = String(setting('site.intro') ?? '').trim();
  const open = setting('posts.open') !== false;
  container.replaceChildren(h('div', { class: 'page page--narrow' },
    pageHeader('Le Fil',
      open ? h('a', { class: 'btn btn--primary', href: '#/deposer' }, icon('pencil', { size: 18 }), 'Déposer un article') : null),
    intro ? h('aside', { class: 'notice notice--intro' }, h('p', null, intro)) : null,
    !open ? h('aside', { class: 'notice' }, icon('lock', { size: 16 }), h('p', null, 'Le dépôt d’articles est momentanément fermé.')) : null,
    h('div', { class: 'toolbar' },
      h('label', { class: 'search' }, icon('search', { size: 18 }), search),
      categorySelect),
    list,
    h('div', { class: 'feed__more' }, more)));

  try {
    const { data } = await supabase.from('post_categories').select('id, name').order('sort_order').order('name');
    categories = data ?? [];
    for (const c of categories) categorySelect.append(h('option', { value: c.id }, c.name));
    categorySelect.hidden = categories.length === 0;
  } catch { /* rubriques facultatives */ }

  async function load(reset) {
    if (state.loading && !reset) return;
    const token = ++state.token;
    if (reset) {
      state.offset = 0;
      list.replaceChildren(loadingState('Chargement du fil…'));
    }
    state.loading = true;
    more.disabled = true;
    try {
      let query = supabase.from('posts').select(POST_FIELDS)
        .order('created_at', { ascending: false })
        .order('position', { referencedTable: 'post_images' })
        .range(state.offset, state.offset + pageSize - 1);
      if (state.search) query = query.textSearch('search', state.search, { type: 'websearch', config: 'french' });
      if (state.category) query = query.eq('category_id', state.category);
      const { data, error } = await query;
      if (error) throw error;
      if (token !== state.token) return;

      if (reset) list.replaceChildren();
      if (reset && data.length === 0) {
        list.append(state.search || state.category
          ? emptyState({ iconName: 'search', title: 'Aucune publication ne correspond.', text: 'Essayez avec d’autres mots ou une autre rubrique.' })
          : emptyState({
              iconName: 'scroll', title: 'Le fil est encore vide.',
              text: 'Déposez la première nouvelle de la famille : un souvenir, une annonce, une photo.',
              action: open ? h('a', { class: 'btn btn--primary', href: '#/deposer' }, 'Déposer le premier article') : null,
            }));
      }
      for (const post of data) {
        if (list.querySelector('.post')) list.append(ornament());
        list.append(postCard(post, categories, () => load(true)));
      }
      state.offset += data.length;
      more.hidden = data.length < pageSize;
    } catch (err) {
      if (token !== state.token) return;
      if (reset) list.replaceChildren(errorState(err, () => load(true)));
      else toastError(err);
    } finally {
      if (token === state.token) {
        state.loading = false;
        more.disabled = false;
      }
    }
  }

  await load(true);
}

// ---------------------------------------------------------------------------
export function authorBlock(post, { detailed = false } = {}) {
  const place = [post.author_city, post.author_region, post.author_country].filter(Boolean).join(', ');
  const work = [post.author_job, post.author_company].filter(Boolean).join(', ');
  return h('div', { class: 'author' },
    h('span', { class: 'author__badge', 'aria-hidden': 'true' },
      h('span', { class: 'author__initials' }, initials(post)),
      h('span', { class: 'author__number' }, String(post.author_number))),
    h('div', { class: 'author__text' },
      h('p', { class: 'author__name' }, authorName(post)),
      h('p', { class: 'author__meta' },
        h('span', { class: 'author__bucque' }, post.author_bucque),
        h('span', null, `${post.author_number} ch ${post.author_promo}`),
        detailed && post.author_promo ? h('span', null, `entrée en ${promoYear(post.author_promo)}`) : null),
      detailed && work ? h('p', { class: 'author__line' }, work) : null,
      detailed && place ? h('p', { class: 'author__line muted' }, place) : null,
      detailed && post.show_contact && post.author_email
        ? h('p', { class: 'author__line' }, h('a', { href: `mailto:${post.author_email}` }, post.author_email))
        : null));
}

export function postCard(post, categories, onChanged, { full = false } = {}) {
  const category = categories.find((c) => c.id === post.category_id);
  const href = `#/fil/${post.id}`;
  const commentCount = post.comments?.[0]?.count ?? 0;
  const { text, truncated } = excerpt(post.body, 420);
  const longBody = plainText(post.body).length > 700;
  const time = h('time', { datetime: post.created_at, title: formatDateTime(post.created_at) }, formatRelative(post.created_at));

  return h('article', { class: ['post', post.is_hidden && 'post--hidden', full && 'post--full'] },
    h('header', { class: 'post__head' },
      authorBlock(post, { detailed: full }),
      h('div', { class: 'post__tags' },
        category ? h('span', { class: 'tag' }, category.name) : null,
        post.status === 'pending' ? h('span', { class: 'tag tag--warning' }, icon('hourglass', { size: 14 }), 'En attente') : null,
        post.is_hidden ? h('span', { class: 'tag tag--warning' }, icon('eye-off', { size: 14 }), 'Masquée') : null,
        postMenu(post, onChanged))),
    full ? h('h1', { class: 'post__title' }, post.title) : h('h2', { class: 'post__title' }, h('a', { href }, post.title)),
    post.subtitle ? h('p', { class: 'post__subtitle' }, post.subtitle) : null,
    full || !longBody
      ? h('div', { class: 'post__body prose', trustedHtml: renderMarkdown(post.body) })
      : h('div', { class: 'post__body prose' }, h('p', null, text)),
    !full && longBody && truncated ? h('a', { class: 'post__more', href }, 'Lire la suite') : null,
    postMedia(post, full),
    h('footer', { class: 'post__foot' },
      h('span', { class: 'post__date' }, time),
      full ? null : h('a', { class: 'post__comments', href: `${href}?commentaires` }, icon('message-circle', { size: 18 }),
        commentCount === 0 ? 'Commenter' : `${commentCount} commentaire${commentCount > 1 ? 's' : ''}`)));
}

function postMenu(post, onChanged) {
  const mine = Boolean(tokenFor(post.id));
  if (!mine && !isMaster()) return null;
  return actionMenu([
    mine ? { label: 'Modifier', icon: 'pencil', onClick: () => navigate(`/fil/${post.id}/modifier`) } : null,
    isMaster() && post.status === 'pending' ? {
      label: 'Valider la publication', icon: 'check',
      onClick: async () => {
        const { error } = await supabase.from('posts').update({ status: 'published' }).eq('id', post.id);
        if (error) return toastError(error);
        toast('Article validé et visible de tous.');
        onChanged?.();
      },
    } : null,
    isMaster() ? {
      label: post.is_hidden ? 'Réafficher' : 'Masquer', icon: post.is_hidden ? 'eye' : 'eye-off',
      onClick: async () => {
        const { error } = await supabase.from('posts').update({ is_hidden: !post.is_hidden }).eq('id', post.id);
        if (error) return toastError(error);
        toast(post.is_hidden ? 'Article réaffiché.' : 'Article masqué.');
        onChanged?.();
      },
    } : null,
    (mine || isMaster()) ? { label: 'Supprimer', icon: 'trash', danger: true, onClick: () => deletePost(post, onChanged) } : null,
  ], { label: 'Actions sur la publication' });
}

export async function deletePost(post, onDeleted) {
  const ok = await confirmDialog({
    title: 'Supprimer la publication ?',
    message: `« ${post.title} » sera supprimée définitivement, avec ses photos et ses commentaires.`,
    confirmLabel: 'Supprimer', danger: true,
  });
  if (!ok) return;
  const paths = (post.post_images ?? []).map((i) => i.path);
  const token = tokenFor(post.id);
  if (isMaster()) {
    const { error } = await supabase.from('posts').delete().eq('id', post.id);
    if (error) return toastError(error);
  } else {
    const { data, error } = await supabase.rpc('delete_post_with_token', { p_id: post.id, p_token: token });
    if (error) return toastError(error);
    if (!data) return toast('Ce lien de modification n’est plus valable.', 'error');
  }
  dropToken(post.id);
  await removeFiles('post-images', paths);
  toast('Publication supprimée.');
  onDeleted?.();
}

function postMedia(post, full) {
  const images = post.post_images ?? [];
  if (!images.length) return null;
  const open = (index) => openLightbox({ items: images, index, bucket: 'post-images' });
  if (images.length === 1) {
    const img = images[0];
    return h('figure', { class: 'post-media post-media--single' },
      h('button', { class: 'post-media__btn', type: 'button', 'aria-label': 'Agrandir la photo', onClick: () => open(0) },
        h('img', { src: publicUrl('post-images', img.path) ?? '', alt: '', width: img.width, height: img.height, loading: 'lazy', decoding: 'async' })));
  }
  const shown = full ? images : images.slice(0, 4);
  const hiddenCount = images.length - shown.length;
  return h('div', { class: ['post-media', 'post-media--grid', `post-media--n${Math.min(shown.length, 4)}`] },
    shown.map((img, i) => h('button', {
      class: 'post-media__btn', type: 'button', 'aria-label': `Agrandir la photo ${i + 1} sur ${images.length}`, onClick: () => open(i),
    },
    h('img', { src: publicUrl('post-images', img.path) ?? '', alt: '', loading: 'lazy', decoding: 'async' }),
    i === shown.length - 1 && hiddenCount > 0 ? h('span', { class: 'post-media__more' }, `+${hiddenCount}`) : null)));
}

export { authorSignature };
