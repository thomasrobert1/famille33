import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { supabase } from '../lib/supabase.js';
import { setting } from '../lib/settings.js';
import { isMaster } from '../lib/session.js';
import { formatDateTime, formatRelative } from '../lib/format.js';
import { navigate } from '../lib/router.js';
import { renderInline } from '../lib/markdown.js';
import { savedContributor, PROMO_MIN, PROMO_MAX } from '../lib/contributor.js';
import {
  field, loadingState, errorState, emptyState, actionMenu, confirmDialog, toast, toastError, setBusy,
  setFieldError, clearFieldErrors, focusFirstError,
} from '../lib/ui.js';
import { postCard, POST_FIELDS } from './feed.js';

export async function renderPost(container, { params, query }) {
  const page = h('div', { class: 'page page--narrow' }, loadingState());
  container.replaceChildren(page);

  async function load() {
    try {
      const [{ data: post, error }, { data: categories }] = await Promise.all([
        supabase.from('posts').select(POST_FIELDS).eq('id', params.id)
          .order('position', { referencedTable: 'post_images' }).maybeSingle(),
        supabase.from('post_categories').select('id, name'),
      ]);
      if (error) throw error;
      if (!post) {
        page.replaceChildren(backLink(), emptyState({
          iconName: 'scroll', title: 'Cet article n’est pas disponible.',
          text: 'Il a peut-être été supprimé, ou il attend encore d’être validé.',
        }));
        return;
      }
      const edited = new Date(post.updated_at) - new Date(post.created_at) > 60_000;
      page.replaceChildren(
        backLink(),
        postCard(post, categories ?? [], () => navigate('/fil'), { full: true }),
        edited ? h('p', { class: 'post__edited' }, `Modifié le ${formatDateTime(post.updated_at)}`) : null,
        await commentsSection(post));
      if (query?.has('commentaires')) page.querySelector('#commentaires')?.scrollIntoView({ block: 'start' });
    } catch (err) {
      page.replaceChildren(backLink(), errorState(err, load));
    }
  }
  await load();
}

function backLink() {
  return h('a', { class: 'back-link', href: '#/fil' }, icon('chevron-left', { size: 18 }), 'Retour au fil');
}

async function commentsSection(post) {
  const list = h('ol', { class: 'comments__list' });
  const heading = h('h2', { class: 'section-title', id: 'commentaires', tabindex: '-1' }, 'Commentaires');
  const section = h('section', { class: 'comments', 'aria-labelledby': 'commentaires' }, heading, list);

  async function refresh() {
    const { data, error } = await supabase.from('comments')
      .select('id, body, author_name, author_bucque, author_promo, is_hidden, created_at')
      .eq('post_id', post.id).order('created_at');
    if (error) return list.replaceChildren(h('li', null, errorState(error, refresh)));
    heading.textContent = data.length ? `Commentaires (${data.length})` : 'Commentaires';
    list.replaceChildren(...(data.length
      ? data.map((c) => commentItem(c, refresh))
      : [h('li', { class: 'comments__empty' }, 'Aucun commentaire pour l’instant.')]));
  }
  await refresh();

  if (setting('comments.enabled') !== false && post.status === 'published' && !post.is_hidden) {
    const saved = savedContributor() ?? {};
    const name = field({
      label: 'Votre nom', name: 'author_name', required: true, maxlength: 100, autocomplete: 'name',
      value: [saved.first_name, saved.last_name].filter(Boolean).join(' '),
    });
    const bucque = field({ label: 'Bucque', name: 'author_bucque', maxlength: 80, value: saved.bucque ?? '', hint: 'Facultative' });
    const promo = field({
      label: 'Promotion', name: 'author_promo', type: 'number', inputmode: 'numeric',
      min: PROMO_MIN, max: PROMO_MAX, value: saved.promo ?? '', hint: 'Facultative',
    });
    const textarea = h('textarea', {
      id: 'new-comment', name: 'body', rows: 3, maxlength: 4000, required: true,
      placeholder: 'Votre commentaire', class: 'comment-form__input',
    });
    const submit = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Publier le commentaire');
    const form = h('form', { class: 'comment-form', novalidate: true },
      h('label', { for: 'new-comment', class: 'field__label' }, 'Ajouter un commentaire'),
      textarea,
      h('div', { class: 'grid-3' }, name, bucque, promo),
      h('div', { class: 'comment-form__actions' }, submit));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      const body = textarea.value.trim();
      if (!body) return textarea.focus();
      if (!name.control.value.trim()) {
        setFieldError(form, 'author_name', 'Indiquez votre nom.');
        return focusFirstError(form);
      }
      const promoValue = promo.control.value.trim();
      if (promoValue && (Number(promoValue) < PROMO_MIN || Number(promoValue) > PROMO_MAX)) {
        setFieldError(form, 'author_promo', `Entre ${PROMO_MIN} et ${PROMO_MAX}.`);
        return focusFirstError(form);
      }
      setBusy(submit, true, 'Publication…');
      const { error } = await supabase.from('comments').insert({
        post_id: post.id,
        body,
        author_name: name.control.value.trim(),
        author_bucque: bucque.control.value.trim() || null,
        author_promo: promoValue ? Number(promoValue) : null,
      });
      setBusy(submit, false);
      if (error) return toastError(error);
      textarea.value = '';
      toast('Commentaire publié.');
      await refresh();
    });
    section.append(form);
  } else if (setting('comments.enabled') === false) {
    section.append(h('p', { class: 'muted' }, 'Les commentaires sont fermés pour le moment.'));
  }
  return section;
}

function commentItem(comment, refresh) {
  const signature = [comment.author_bucque, comment.author_promo ? `ch ${comment.author_promo}` : null]
    .filter(Boolean).join(', ');
  const menu = isMaster() ? actionMenu([
    {
      label: comment.is_hidden ? 'Réafficher' : 'Masquer', icon: comment.is_hidden ? 'eye' : 'eye-off',
      onClick: async () => {
        const { error } = await supabase.from('comments').update({ is_hidden: !comment.is_hidden }).eq('id', comment.id);
        if (error) return toastError(error);
        refresh();
      },
    },
    {
      label: 'Supprimer', icon: 'trash', danger: true,
      onClick: async () => {
        const ok = await confirmDialog({ title: 'Supprimer le commentaire ?', message: 'Cette action est définitive.', confirmLabel: 'Supprimer', danger: true });
        if (!ok) return;
        const { error } = await supabase.from('comments').delete().eq('id', comment.id);
        if (error) return toastError(error);
        toast('Commentaire supprimé.');
        refresh();
      },
    },
  ], { label: 'Actions sur le commentaire' }) : null;

  return h('li', { class: ['comment', comment.is_hidden && 'comment--hidden'] },
    h('div', { class: 'comment__head' },
      h('div', null,
        h('span', { class: 'comment__author' }, comment.author_name),
        signature ? h('span', { class: 'comment__signature' }, signature) : null,
        h('time', { class: 'comment__time', datetime: comment.created_at, title: formatDateTime(comment.created_at) },
          formatRelative(comment.created_at))),
      comment.is_hidden ? h('span', { class: 'tag tag--warning' }, 'Masqué') : null,
      menu),
    h('div', { class: 'comment__body', trustedHtml: commentHtml(comment.body) }));
}

// Commentaires : texte brut, retours à la ligne et liens cliquables
function commentHtml(text) {
  return text.split(/\n{2,}/).map((p) => `<p>${p.split('\n').map(renderInline).join('<br>')}</p>`).join('');
}
