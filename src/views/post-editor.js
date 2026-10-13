import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { supabase } from '../lib/supabase.js';
import { isMaster } from '../lib/session.js';
import { setting } from '../lib/settings.js';
import { renderMarkdown } from '../lib/markdown.js';
import { prepareImage, pickFiles } from '../lib/images.js';
import { publicUrl, uploadFile, removeFiles, newPath } from '../lib/storage.js';
import { navigate } from '../lib/router.js';
import { friendlyError } from '../lib/errors.js';
import { toAuthorColumns, tokenFor, saveToken, dropToken, authorName } from '../lib/contributor.js';
import {
  field, pageHeader, loadingState, errorState, emptyState, toast, setFieldError, clearFieldErrors,
  focusFirstError, openModal,
} from '../lib/ui.js';
import { contributorForm } from '../components/contributor-form.js';

const MAX_IMAGES = 10;

export async function renderPostEditor(container, { params }) {
  const editing = Boolean(params.id);
  const page = h('div', { class: 'page page--narrow' }, loadingState());
  container.replaceChildren(page);

  if (!editing && setting('posts.open') === false && !isMaster()) {
    page.replaceChildren(emptyState({
      iconName: 'lock', title: 'Le dépôt d’articles est fermé pour le moment.',
      text: 'L’administrateur de la famille peut le rouvrir.',
      action: h('a', { class: 'btn btn--secondary', href: '#/fil' }, 'Retour au fil'),
    }));
    return;
  }

  let post = null;
  let categories = [];
  let token = null;
  try {
    const [catRes, postRes] = await Promise.all([
      supabase.from('post_categories').select('id, name').order('sort_order').order('name'),
      editing
        ? supabase.from('posts')
          .select('id, title, subtitle, body, category_id, author_first_name, author_last_name, author_bucque, author_number, author_promo, post_images(id, path, width, height, position)')
          .eq('id', params.id).order('position', { referencedTable: 'post_images' }).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    if (postRes.error) throw postRes.error;
    categories = catRes.data ?? [];
    post = postRes.data;
    if (editing) {
      token = tokenFor(params.id);
      if (!post) {
        page.replaceChildren(emptyState({ iconName: 'scroll', title: 'Cet article n’existe plus.' }));
        return;
      }
      if (!token && !isMaster()) {
        page.replaceChildren(emptyState({
          iconName: 'lock',
          title: 'Modification impossible depuis cet appareil.',
          text: 'Seul l’appareil ayant déposé l’article peut le modifier. Si vous avez changé d’appareil ou effacé vos données de navigation, demandez à l’administrateur.',
          action: h('a', { class: 'btn btn--secondary', href: `#/fil/${params.id}` }, 'Retour à l’article'),
        }));
        return;
      }
    }
  } catch (err) {
    page.replaceChildren(errorState(err));
    return;
  }

  const contributor = editing ? null : contributorForm({ full: true, contact: true });

  // --- Contenu ------------------------------------------------------------------
  const title = field({ label: 'Titre', name: 'title', required: true, maxlength: 200, value: post?.title ?? '', hint: 'Au moins 3 caractères.' });
  const subtitle = field({ label: 'Sous-titre', name: 'subtitle', maxlength: 300, value: post?.subtitle ?? '', hint: 'Facultatif : une phrase pour introduire l’article.' });
  const category = categories.length
    ? field({ label: 'Rubrique', name: 'category', type: 'select', value: post?.category_id ?? '', placeholderOption: 'Sans rubrique', options: categories.map((c) => ({ value: c.id, label: c.name })) })
    : null;

  const textarea = h('textarea', { id: 'post-body', name: 'body', rows: 12, maxlength: 20000, class: 'editor__textarea' });
  textarea.value = post?.body ?? '';
  const counter = h('span', { class: 'editor__counter' });
  const updateCounter = () => { counter.textContent = `${textarea.value.length.toLocaleString('fr-FR')} / 20 000`; };
  updateCounter();
  const preview = h('div', { class: 'editor__preview', hidden: true });
  const writeTab = h('button', { class: 'segmented__btn', type: 'button', 'aria-pressed': 'true', onClick: () => setTab('write') }, 'Écrire');
  const previewTab = h('button', { class: 'segmented__btn', type: 'button', 'aria-pressed': 'false', onClick: () => setTab('preview') }, 'Aperçu');
  const toolbar = h('div', { class: 'editor__tools', role: 'toolbar', 'aria-label': 'Mise en forme' },
    toolButton('bold', 'Gras', () => wrap('**')),
    toolButton('italic', 'Italique', () => wrap('*')),
    toolButton('list', 'Liste à puces', () => prefixLines('- ')),
    toolButton('list-ordered', 'Liste numérotée', () => prefixLines('1. ')),
    toolButton('link', 'Insérer un lien', insertLink));

  function setTab(tab) {
    const isPreview = tab === 'preview';
    writeTab.setAttribute('aria-pressed', String(!isPreview));
    previewTab.setAttribute('aria-pressed', String(isPreview));
    textarea.hidden = isPreview;
    toolbar.hidden = isPreview;
    preview.hidden = !isPreview;
    if (isPreview) renderPreview();
  }

  function renderPreview() {
    const images = [
      ...existing.filter((i) => !i.removed).map((i) => publicUrl('post-images', i.path)),
      ...added.map((a) => a.previewUrl),
    ];
    preview.replaceChildren(h('article', { class: 'post post--preview' },
      h('h2', { class: 'post__title' }, title.control.value.trim() || 'Titre de l’article'),
      subtitle.control.value.trim() ? h('p', { class: 'post__subtitle' }, subtitle.control.value.trim()) : null,
      h('div', { class: 'post__body prose', trustedHtml: renderMarkdown(textarea.value) || '<p class="muted">Le texte apparaîtra ici.</p>' }),
      images.length
        ? h('div', { class: ['post-media', 'post-media--grid', `post-media--n${Math.min(images.length, 4)}`] },
          images.slice(0, 4).map((src) => h('span', { class: 'post-media__btn' }, h('img', { src, alt: '' }))))
        : null));
  }

  function wrap(marker) {
    const { selectionStart: s, selectionEnd: e, value } = textarea;
    const selected = value.slice(s, e) || 'texte';
    textarea.setRangeText(`${marker}${selected}${marker}`, s, e, 'end');
    textarea.focus();
    textarea.setSelectionRange(s + marker.length, s + marker.length + selected.length);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function prefixLines(prefix) {
    const { selectionStart: s, selectionEnd: e, value } = textarea;
    const lineStart = value.lastIndexOf('\n', s - 1) + 1;
    const block = value.slice(lineStart, e) || '';
    const lines = (block || 'élément').split('\n');
    const replaced = lines
      .map((l, i) => (prefix === '1. ' ? `${i + 1}. ` : prefix) + l.replace(/^\s*([-•*]|\d+[.)])\s+/, ''))
      .join('\n');
    textarea.setRangeText(replaced, lineStart, e, 'end');
    textarea.focus();
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function insertLink() {
    const { selectionStart: s, selectionEnd: e, value } = textarea;
    const label = field({ label: 'Texte du lien', name: 'label', value: value.slice(s, e), maxlength: 200 });
    const url = field({ label: 'Adresse web', name: 'url', type: 'url', placeholder: 'https://', maxlength: 500, required: true });
    const linkForm = h('form', { class: 'stack', novalidate: true }, label, url);
    const modal = openModal({
      title: 'Insérer un lien', size: 'sm', content: linkForm,
      actions: [
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => modal.close() }, 'Annuler'),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => linkForm.requestSubmit() }, 'Insérer'),
      ],
    });
    url.control.focus();
    linkForm.addEventListener('submit', (ev) => {
      ev.preventDefault();
      let href = url.control.value.trim();
      if (href && !/^https?:\/\//i.test(href)) href = `https://${href}`;
      if (!/^https?:\/\/[^\s]+\.[^\s]+/.test(href)) {
        return setFieldError(linkForm, 'url', 'Saisissez une adresse complète, par exemple https://www.exemple.fr');
      }
      const text = label.control.value.trim().replace(/[[\]]/g, '') || href;
      textarea.setRangeText(`[${text}](${href})`, s, e, 'end');
      modal.close();
      textarea.focus();
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  // --- Photos -------------------------------------------------------------------
  const existing = (post?.post_images ?? []).map((i) => ({ ...i, removed: false }));
  const added = [];
  let dirty = false;

  const photoGrid = h('div', { class: 'upload-grid' });
  const photoHint = h('p', { class: 'field__hint' });
  const addButton = h('button', { class: 'btn btn--secondary', type: 'button', onClick: async () => addFiles(await pickFiles()) },
    icon('image-plus', { size: 18 }), 'Ajouter des photos');
  const dropzone = h('div', { class: 'dropzone' }, h('p', null, 'Glissez vos photos ici ou'), addButton, photoHint, photoGrid);
  dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-over'); });
  dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('is-over');
    addFiles([...e.dataTransfer.files].filter((f) => f.type.startsWith('image/')));
  });

  const imageCount = () => existing.filter((i) => !i.removed).length + added.length;

  function addFiles(files) {
    const room = MAX_IMAGES - imageCount();
    if (files.length > room) toast(`Un article peut contenir ${MAX_IMAGES} photos au maximum.`, 'error');
    for (const file of files.slice(0, Math.max(0, room))) {
      const item = { file, previewUrl: URL.createObjectURL(file), status: 'pending' };
      item.prepared = prepareImage(file, { maxSide: 1600 }).then(
        (r) => { item.status = 'ready'; return r; },
        (err) => { item.status = 'error'; item.error = friendlyError(err); renderPhotos(); throw err; });
      item.prepared.catch(() => {});
      added.push(item);
      dirty = true;
    }
    renderPhotos();
  }

  function renderPhotos() {
    photoGrid.replaceChildren(
      ...existing.filter((i) => !i.removed).map((i) => photoTile(
        publicUrl('post-images', i.path),
        () => { i.removed = true; dirty = true; renderPhotos(); })),
      ...added.map((a) => photoTile(
        a.previewUrl,
        () => { added.splice(added.indexOf(a), 1); URL.revokeObjectURL(a.previewUrl); renderPhotos(); },
        a.status === 'error' ? a.error : null)));
    const n = imageCount();
    photoHint.textContent = n
      ? `${n} photo${n > 1 ? 's' : ''} sur ${MAX_IMAGES} au maximum.`
      : `JPEG, PNG ou WebP. ${MAX_IMAGES} photos au maximum, réduites automatiquement.`;
    addButton.disabled = n >= MAX_IMAGES;
  }
  renderPhotos();

  // --- Envoi ---------------------------------------------------------------------
  const needsApproval = setting('posts.require_approval') !== false && !isMaster();
  const formError = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn btn--primary btn--lg', type: 'submit' },
    editing ? 'Enregistrer les modifications' : 'Déposer l’article');
  const cancel = h('a', { class: 'btn btn--ghost', href: editing ? `#/fil/${post.id}` : '#/fil' }, 'Annuler');

  const form = h('form', { class: 'stack editor', novalidate: true },
    editing
      ? h('div', { class: 'notice' }, icon('info', { size: 16 }),
        h('p', null, `Article de ${authorName(post)} (${post.author_bucque}, ${post.author_number} ch ${post.author_promo}). L’identité de l’auteur ne change pas.`))
      : h('section', { class: 'form-section' },
        h('h2', { class: 'form-section__title' }, 'Qui êtes-vous ?'),
        contributor.element),
    h('section', { class: 'form-section' },
      h('h2', { class: 'form-section__title' }, 'Votre article'),
      h('div', { class: 'stack' },
        title, subtitle, category,
        h('div', { class: 'field' },
          h('div', { class: 'editor__bar' },
            h('label', { for: 'post-body', class: 'field__label' }, 'Texte'),
            h('div', { class: 'segmented', role: 'group', 'aria-label': 'Mode d’affichage' }, writeTab, previewTab)),
          toolbar, textarea, preview,
          h('div', { class: 'editor__meta' },
            h('span', { class: 'field__hint' }, 'Astuce : **gras**, *italique*, une ligne vide pour changer de paragraphe.'),
            counter)),
        h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Photos'), dropzone))),
    needsApproval && !editing
      ? h('div', { class: 'notice' }, icon('hourglass', { size: 16 }),
        h('p', null, 'Votre article sera relu par l’administrateur avant d’apparaître dans le fil.'))
      : null,
    formError,
    h('div', { class: 'form-actions' }, cancel, submit));

  form.addEventListener('input', () => { dirty = true; updateCounter(); });
  const beforeUnload = (e) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    formError.textContent = '';

    const identity = editing ? {} : contributor.read(form);
    if (!editing && !identity) return;

    const content = {
      title: title.control.value.trim(),
      subtitle: subtitle.control.value.trim() || null,
      body: textarea.value.replace(/\s+$/, ''),
      category_id: category?.control.value || null,
    };
    if (content.title.length < 3) {
      setFieldError(form, 'title', 'Donnez un titre d’au moins 3 caractères.');
      return focusFirstError(form);
    }
    if (added.some((a) => a.status === 'error')) {
      formError.textContent = 'Retirez les photos signalées en erreur avant de déposer l’article.';
      return;
    }

    submit.disabled = true;
    const uploaded = [];
    let createdId = null;
    let createdToken = null;
    try {
      submit.textContent = 'Envoi…';
      let postId = post?.id;
      if (editing) {
        if (isMaster()) {
          const { error } = await supabase.from('posts').update(content).eq('id', postId);
          if (error) throw error;
        } else {
          const { data, error } = await supabase.rpc('update_post_with_token', {
            p_id: postId, p_token: token, p_title: content.title, p_subtitle: content.subtitle,
            p_body: content.body, p_category_id: content.category_id,
          });
          if (error) throw error;
          if (!data) throw new Error('Ce lien de modification n’est plus valable.');
        }
      } else {
        // L'identifiant et le jeton sont tirés ici, par le navigateur. Le jeton
        // permettra à l'auteur de revenir modifier son article ; il n'est
        // lisible par personne d'autre, pas même par une requête à la base.
        //
        // L'identifiant est tiré ici, et non laissé à la base, parce qu'un
        // article en attente de validation est invisible du public : demander
        // à la base de renvoyer la ligne créée reviendrait à la lire, ce que
        // les règles d'accès refusent, à juste titre.
        createdToken = crypto.randomUUID();
        createdId = crypto.randomUUID();
        const { error } = await supabase.from('posts')
          .insert({ id: createdId, ...content, ...toAuthorColumns(identity), edit_token: createdToken });
        if (error) throw error;
        postId = createdId;
        saveToken(createdId, createdToken);
      }

      const removed = existing.filter((i) => i.removed);
      if (removed.length && isMaster()) {
        await supabase.from('post_images').delete().in('id', removed.map((i) => i.id));
        await removeFiles('post-images', removed.map((i) => i.path));
      }

      let position = existing.filter((i) => !i.removed).reduce((m, i) => Math.max(m, i.position + 1), 0);
      for (const [index, item] of added.entries()) {
        submit.textContent = `Envoi des photos (${index + 1}/${added.length})…`;
        const { main } = await item.prepared;
        const path = newPath();
        await uploadFile('post-images', path, main.blob);
        uploaded.push(path);
        const { error } = await supabase.from('post_images')
          .insert({ post_id: postId, path, width: main.width, height: main.height, position: position++ });
        if (error) throw error;
      }

      dirty = false;
      window.removeEventListener('beforeunload', beforeUnload);
      for (const a of added) URL.revokeObjectURL(a.previewUrl);

      if (createdId) showConfirmation(createdId, needsApproval);
      else {
        toast('Modifications enregistrées.');
        navigate(`/fil/${postId}`);
      }
    } catch (err) {
      // Dépôt interrompu : on retire ce qui a été créé pour ne rien laisser d'incomplet.
      if (createdId) {
        await supabase.rpc('delete_post_with_token', { p_id: createdId, p_token: createdToken }).catch(() => {});
        await removeFiles('post-images', uploaded);
        dropToken(createdId);
      }
      formError.textContent = friendlyError(err);
      submit.disabled = false;
      submit.textContent = editing ? 'Enregistrer les modifications' : 'Déposer l’article';
    }
  });

  page.replaceChildren(pageHeader(editing ? 'Modifier l’article' : 'Déposer un article'), form);
  (editing ? title.control : form.querySelector('input'))?.focus();
  return () => window.removeEventListener('beforeunload', beforeUnload);
}

function showConfirmation(postId, pending) {
  const modal = openModal({
    title: pending ? 'Article envoyé' : 'Article publié',
    size: 'sm',
    content: h('div', { class: 'stack' },
      h('p', null, pending
        ? 'Merci ! Votre article a bien été déposé. L’administrateur le relira avant de le publier dans le fil.'
        : 'Merci ! Votre article est désormais visible dans le fil.'),
      h('p', { class: 'field__hint' },
        'Depuis cet appareil, vous pourrez le retrouver et le modifier par la page « Mes contributions ».')),
    actions: [
      h('a', { class: 'btn btn--ghost', href: '#/deposer', onClick: () => modal.close() }, 'Déposer un autre article'),
      h('a', {
        class: 'btn btn--primary', href: pending ? '#/mes-contributions' : `#/fil/${postId}`,
        onClick: () => modal.close(),
      }, pending ? 'Voir mes contributions' : 'Voir l’article'),
    ],
  });
}

function toolButton(name, label, onClick) {
  return h('button', { class: 'icon-btn', type: 'button', 'aria-label': label, title: label, onClick }, icon(name, { size: 18 }));
}

function photoTile(src, onRemove, error = null) {
  return h('figure', { class: ['upload-tile', error && 'upload-tile--error'] },
    h('img', { src: src ?? '', alt: '' }),
    error ? h('figcaption', null, error) : null,
    h('button', { class: 'upload-tile__remove', type: 'button', 'aria-label': 'Retirer cette photo', onClick: onRemove },
      icon('x', { size: 16 })));
}
