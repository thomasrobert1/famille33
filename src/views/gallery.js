import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { supabase } from '../lib/supabase.js';
import { isMaster } from '../lib/session.js';
import { publicUrl, uploadFile, removeFiles, newPath } from '../lib/storage.js';
import { toIdentityColumns, authorName, tokenFor, saveToken, dropToken } from '../lib/contributor.js';
import { contributorForm } from '../components/contributor-form.js';
import { prepareImage, pickFiles } from '../lib/images.js';
import { formatDay, formatShortDate, todayISO } from '../lib/format.js';
import { setting } from '../lib/settings.js';
import { promoLabel, PROMO_MIN, PROMO_MAX } from '../lib/contributor.js';
import { friendlyError } from '../lib/errors.js';
import {
  pageHeader, loadingState, emptyState, errorState, openModal, confirmDialog, toast, toastError, field,
  setFieldError, clearFieldErrors,
} from '../lib/ui.js';
import { openLightbox } from '../components/lightbox.js';

const PAGE = 24;
const FIELDS = `id, path, thumb_path, width, height, caption, album_id, event_id, promo, taken_on,
  author_first_name, author_last_name, author_number, author_promo, author_bucque, status, is_hidden, created_at`;

export async function renderGallery(container) {
  const state = { album: '', year: '', event: '', offset: 0, done: false, token: 0, photos: [] };
  let albums = [];
  let events = [];

  const grid = h('div', { class: 'gallery', 'aria-live': 'polite' });
  const more = h('button', { class: 'btn btn--secondary', type: 'button', hidden: true, onClick: () => load(false) }, 'Afficher plus de photos');
  const albumSelect = h('select', { class: 'select-inline', 'aria-label': 'Album' }, h('option', { value: '' }, 'Tous les albums'));
  const yearSelect = h('select', { class: 'select-inline', 'aria-label': 'Année' }, h('option', { value: '' }, 'Toutes les années'));
  const eventSelect = h('select', { class: 'select-inline', 'aria-label': 'Événement', hidden: true }, h('option', { value: '' }, 'Tous les événements'));
  for (const [select, key] of [[albumSelect, 'album'], [yearSelect, 'year'], [eventSelect, 'event']]) {
    select.addEventListener('change', () => { state[key] = select.value; load(true); });
  }

  container.replaceChildren(h('div', { class: 'page page--wide' },
    pageHeader('La Galerie', h('button', { class: 'btn btn--primary', type: 'button', onClick: () => openUpload() },
      icon('image-plus', { size: 18 }), 'Ajouter des photos')),
    h('div', { class: 'toolbar toolbar--filters' }, albumSelect, yearSelect, eventSelect),
    grid,
    h('div', { class: 'feed__more' }, more)));

  async function loadFilters() {
    const [albumRes, oldest, eventRes] = await Promise.all([
      supabase.from('albums').select('id, name, description').order('sort_order').order('name'),
      supabase.from('photos').select('taken_on, created_at').order('created_at', { ascending: true }).limit(1),
      supabase.from('photos').select('event_id, events(id, title, start_date)').not('event_id', 'is', null).limit(1000),
    ]);
    albums = albumRes.data ?? [];
    albumSelect.replaceChildren(h('option', { value: '' }, 'Tous les albums'), ...albums.map((a) => h('option', { value: a.id }, a.name)));
    albumSelect.value = state.album;
    albumSelect.hidden = albums.length === 0;

    const { data: oldestTaken } = await supabase.from('photos').select('taken_on').not('taken_on', 'is', null).order('taken_on').limit(1);
    const current = Number(todayISO().slice(0, 4));
    const firstYear = Math.min(
      oldest.data?.[0] ? Number(oldest.data[0].created_at.slice(0, 4)) : current,
      oldestTaken?.[0] ? Number(oldestTaken[0].taken_on.slice(0, 4)) : current);
    yearSelect.replaceChildren(h('option', { value: '' }, 'Toutes les années'));
    for (let y = current; y >= firstYear; y -= 1) yearSelect.append(h('option', { value: y }, String(y)));
    yearSelect.value = state.year;

    const seen = new Map();
    for (const row of eventRes.data ?? []) if (row.events) seen.set(row.events.id, row.events);
    events = [...seen.values()].sort((a, b) => b.start_date.localeCompare(a.start_date));
    eventSelect.replaceChildren(h('option', { value: '' }, 'Tous les événements'),
      ...events.map((ev) => h('option', { value: ev.id }, `${ev.title} (${ev.start_date.slice(0, 4)})`)));
    eventSelect.value = state.event;
    eventSelect.hidden = events.length === 0;
  }

  async function load(reset) {
    const token = ++state.token;
    if (reset) {
      state.offset = 0;
      state.photos = [];
      grid.replaceChildren(loadingState('Chargement des photos…'));
    }
    more.disabled = true;
    try {
      let query = supabase.from('photos').select(FIELDS)
        .order('taken_on', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .range(state.offset, state.offset + PAGE - 1);
      if (state.album) query = query.eq('album_id', state.album);
      if (state.event) query = query.eq('event_id', state.event);
      if (state.year) {
        const y = Number(state.year);
        query = query.or(`and(taken_on.gte.${y}-01-01,taken_on.lte.${y}-12-31),and(taken_on.is.null,created_at.gte.${y}-01-01T00:00:00Z,created_at.lt.${y + 1}-01-01T00:00:00Z)`);
      }
      const { data, error } = await query;
      if (error) throw error;
      if (token !== state.token) return;
      if (reset) grid.replaceChildren();
      if (reset && !data.length) {
        const filtered = state.album || state.year || state.event;
        grid.append(emptyState({
          iconName: 'images',
          title: filtered ? 'Aucune photo pour ces critères.' : 'La galerie attend ses premières photos.',
          text: filtered ? 'Modifiez les filtres pour voir d’autres photos.' : 'Partagez les souvenirs de la famille : rencontres, traditions, promotions.',
          action: filtered ? null : h('button', { class: 'btn btn--primary', type: 'button', onClick: () => openUpload() }, 'Ajouter des photos'),
        }));
      }
      for (const photo of data) {
        state.photos.push(photo);
        grid.append(tile(photo));
      }
      state.offset += data.length;
      more.hidden = data.length < PAGE;
    } catch (err) {
      if (token !== state.token) return;
      if (reset) grid.replaceChildren(errorState(err, () => load(true)));
      else toastError(err);
    } finally {
      more.disabled = false;
    }
  }

  function tile(photo) {
    const index = () => state.photos.indexOf(photo);
    return h('figure', { class: ['tile', photo.is_hidden && 'tile--hidden'] },
      h('button', { class: 'tile__btn', type: 'button', 'aria-label': photo.caption ? `Agrandir : ${photo.caption}` : 'Agrandir la photo', onClick: () => openViewer(index()) },
        h('img', { src: publicUrl('gallery', photo.thumb_path) ?? '', alt: photo.caption ?? '', width: photo.width, height: photo.height, loading: 'lazy', decoding: 'async' })),
      photo.caption ? h('figcaption', { class: 'tile__caption' }, photo.caption) : null,
      photo.is_hidden ? h('span', { class: 'tile__badge' }, icon('eye-off', { size: 14 }), 'Masquée')
        : photo.status === 'pending' ? h('span', { class: 'tile__badge' }, icon('hourglass', { size: 14 }), 'En attente') : null);
  }

  function openViewer(index) {
    const items = [...state.photos];
    const viewer = openLightbox({
      items, index, bucket: 'gallery',
      meta: (item) => {
        const album = albums.find((a) => a.id === item.album_id);
        const ev = events.find((e) => e.id === item.event_id);
        const facts = [
          item.taken_on ? formatDay(item.taken_on, { weekday: false }) : null,
          item.promo ? `Promotion ${promoLabel(item.promo)}` : null,
          album ? `Album « ${album.name} »` : null,
          ev ? ev.title : null,
        ].filter(Boolean);
        return h('div', { class: 'lightbox__meta' },
          facts.length ? h('p', null, facts.join(', ')) : null,
          h('p', { class: 'muted' }, `Ajoutée par ${authorName(item)} (${item.author_bucque}, ${item.author_number} ch ${item.author_promo}) le ${formatShortDate(item.created_at)}`));
      },
      actions: (item, close) => ((isMaster() || tokenFor(item.id)) ? h('div', { class: 'lightbox__actions' },
        isMaster() ? h('button', { class: 'btn btn--ghost-light btn--sm', type: 'button', onClick: () => editPhoto(item, () => { viewer.refresh(); }) },
          icon('pencil', { size: 16 }), 'Modifier') : null,
        isMaster() ? h('button', { class: 'btn btn--ghost-light btn--sm', type: 'button', onClick: async () => {
          const { error } = await supabase.from('photos').update({ is_hidden: !item.is_hidden }).eq('id', item.id);
          if (error) return toastError(error);
          toast(item.is_hidden ? 'Photo réaffichée.' : 'Photo masquée aux membres.');
          close();
          load(true);
        } }, icon(item.is_hidden ? 'eye' : 'eye-off', { size: 16 }), item.is_hidden ? 'Réafficher' : 'Masquer') : null,
        h('button', { class: 'btn btn--ghost-light btn--sm', type: 'button', onClick: async () => {
          const ok = await confirmDialog({ title: 'Supprimer la photo ?', message: 'La photo sera supprimée définitivement de la galerie.', confirmLabel: 'Supprimer', danger: true });
          if (!ok) return;
          if (isMaster()) {
            const { error } = await supabase.from('photos').delete().eq('id', item.id);
            if (error) return toastError(error);
          } else {
            const { data, error } = await supabase.rpc('delete_photo_with_token', { p_id: item.id, p_token: tokenFor(item.id) });
            if (error) return toastError(error);
            if (!data) return toast('Ce lien n’est plus valable.', 'error');
            dropToken(item.id);
          }
          await removeFiles('gallery', [item.path, item.thumb_path]);
          toast('Photo supprimée.');
          close();
          load(true);
        } }, icon('trash', { size: 16 }), 'Supprimer')) : null),
    });
  }

  function metadataFields(values = {}) {
    return {
      album: field({ label: 'Album', name: 'album_id', type: 'select', value: values.album_id ?? state.album ?? '', placeholderOption: 'Sans album', options: albums.map((a) => ({ value: a.id, label: a.name })) }),
      event: field({ label: 'Événement associé', name: 'event_id', type: 'select', value: values.event_id ?? '', placeholderOption: 'Aucun', options: [] }),
      promo: field({ label: 'Promotion', name: 'promo', type: 'number', value: values.promo ?? '', min: PROMO_MIN, max: PROMO_MAX, inputmode: 'numeric', hint: `Facultatif, ex. 225 pour Ch 225.` }),
      date: field({ label: 'Date de la photo', name: 'taken_on', type: 'date', value: values.taken_on ?? '', max: todayISO() }),
    };
  }

  async function fillEventOptions(select, selected) {
    const { data } = await supabase.from('events').select('id, title, start_date').order('start_date', { ascending: false }).limit(150);
    select.replaceChildren(h('option', { value: '' }, 'Aucun'),
      ...(data ?? []).map((ev) => h('option', { value: ev.id, selected: ev.id === selected }, `${ev.title} (${formatShortDate(ev.start_date)})`)));
  }

  function readMetadata(form, f) {
    const promo = f.promo.control.value.trim();
    let ok = true;
    if (promo && (!/^\d{3}$/.test(promo) || Number(promo) < PROMO_MIN || Number(promo) > PROMO_MAX)) {
      setFieldError(form, 'promo', `Indiquez un nombre entre ${PROMO_MIN} et ${PROMO_MAX}.`);
      ok = false;
    }
    return ok ? {
      album_id: f.album.control.value || null,
      event_id: f.event.control.value || null,
      promo: promo ? Number(promo) : null,
      taken_on: f.date.control.value || null,
    } : null;
  }

  function editPhoto(photo, onSaved) {
    const f = metadataFields(photo);
    const caption = field({ label: 'Légende', name: 'caption', type: 'textarea', rows: 3, maxlength: 500, value: photo.caption ?? '' });
    fillEventOptions(f.event.control, photo.event_id);
    const form = h('form', { class: 'stack', novalidate: true }, caption, h('div', { class: 'grid-2' }, f.album, f.event, f.promo, f.date));
    const modal = openModal({
      title: 'Modifier la photo', content: form,
      actions: [
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => modal.close() }, 'Annuler'),
        h('button', { class: 'btn btn--primary', type: 'button', onClick: () => form.requestSubmit() }, 'Enregistrer'),
      ],
    });
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      const meta = readMetadata(form, f);
      if (!meta) return;
      const values = { ...meta, caption: caption.control.value.trim() || null };
      const { error } = await supabase.from('photos').update(values).eq('id', photo.id);
      if (error) return toastError(error);
      Object.assign(photo, values);
      const listed = state.photos.find((p) => p.id === photo.id);
      if (listed) Object.assign(listed, values);
      modal.close();
      toast('Photo modifiée.');
      onSaved?.();
    });
  }

  function openUpload() {
    if (setting('photos.open') === false && !isMaster()) {
      return toast('Le dépôt de photos est fermé pour le moment.', 'error');
    }
    const items = [];
    const contributor = contributorForm({ full: false, contact: false });
    const f = metadataFields();
    fillEventOptions(f.event.control, '');
    const list = h('div', { class: 'upload-list' });
    const status = h('p', { class: 'field__hint', 'aria-live': 'polite' });
    const progress = h('progress', { class: 'progress', max: 100, value: 0, hidden: true });
    const pick = h('button', { class: 'btn btn--secondary', type: 'button', onClick: async () => add(await pickFiles()) },
      icon('image-plus', { size: 18 }), 'Choisir des photos');
    const dropzone = h('div', { class: 'dropzone' }, h('p', null, 'Glissez vos photos ici ou'), pick, list);
    dropzone.addEventListener('dragover', (e) => { e.preventDefault(); dropzone.classList.add('is-over'); });
    dropzone.addEventListener('dragleave', () => dropzone.classList.remove('is-over'));
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('is-over');
      add([...e.dataTransfer.files].filter((file) => file.type.startsWith('image/')));
    });
    const needsApproval = setting('photos.require_approval') !== false && !isMaster();
    const form = h('form', { class: 'stack', novalidate: true },
      h('section', { class: 'form-section' },
        h('h2', { class: 'form-section__title' }, 'Qui êtes-vous ?'), contributor.element),
      dropzone,
      h('fieldset', { class: 'fieldset' }, h('legend', null, 'Informations communes (facultatives)'),
        h('div', { class: 'grid-2' }, f.album, f.event, f.promo, f.date)),
      needsApproval ? h('div', { class: 'notice' }, icon('hourglass', { size: 16 }),
        h('p', null, 'Vos photos seront relues par l’administrateur avant d’apparaître dans la galerie.')) : null,
      progress, status);
    const submit = h('button', { class: 'btn btn--primary', type: 'button', disabled: true, onClick: () => form.requestSubmit() }, 'Importer');
    const cancel = h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => modal.close() }, 'Annuler');
    const modal = openModal({ title: 'Ajouter des photos', size: 'lg', content: form, actions: [cancel, submit],
      onClose: () => { for (const it of items) URL.revokeObjectURL(it.previewUrl); } });

    function add(files) {
      for (const file of files.slice(0, 50 - items.length)) {
        const item = { file, previewUrl: URL.createObjectURL(file), caption: '' };
        items.push(item);
      }
      if (files.length + items.length > 50) toast('50 photos au maximum par import.', 'error');
      render();
    }
    function render() {
      list.replaceChildren(...items.map((item) => {
        const input = h('input', { type: 'text', maxlength: 500, placeholder: 'Légende (facultative)', value: item.caption, 'aria-label': `Légende de ${item.file.name}` });
        input.addEventListener('input', () => { item.caption = input.value; });
        return h('div', { class: ['upload-row', item.error && 'upload-row--error', item.done && 'upload-row--done'] },
          h('img', { src: item.previewUrl, alt: '' }),
          h('div', { class: 'upload-row__body' }, input, item.error ? h('p', { class: 'field__error' }, item.error) : null),
          item.done ? icon('circle-check', { size: 20, label: 'Importée' }) : h('button', {
            class: 'icon-btn', type: 'button', 'aria-label': `Retirer ${item.file.name}`,
            onClick: () => { items.splice(items.indexOf(item), 1); URL.revokeObjectURL(item.previewUrl); render(); },
          }, icon('x', { size: 18 })));
      }));
      const pending = items.filter((i) => !i.done).length;
      submit.disabled = pending === 0;
      submit.textContent = pending ? `Importer ${pending} photo${pending > 1 ? 's' : ''}` : 'Importer';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      const identity = contributor.read(form);
      if (!identity) return;
      const meta = readMetadata(form, f);
      if (!meta) return;
      const todo = items.filter((i) => !i.done);
      if (!todo.length) return;
      submit.disabled = true;
      cancel.disabled = true;
      pick.disabled = true;
      progress.hidden = false;
      let success = 0;
      for (const [index, item] of todo.entries()) {
        status.textContent = `Import ${index + 1} sur ${todo.length}…`;
        progress.value = Math.round((index / todo.length) * 100);
        const paths = [];
        try {
          const { main, thumb } = await prepareImage(item.file, { maxSide: 2400, thumbSide: 640 });
          const path = newPath();
          const thumbPath = path.replace(/\.jpg$/, '_t.jpg');
          await uploadFile('gallery', path, main.blob);
          paths.push(path);
          await uploadFile('gallery', thumbPath, thumb.blob);
          paths.push(thumbPath);
          // Identifiant et jeton tirés par le navigateur : une photo en attente
          // de validation n'est pas lisible du public, la base ne peut donc pas
          // renvoyer la ligne créée.
          const photoId = crypto.randomUUID();
          const photoToken = crypto.randomUUID();
          const { error } = await supabase.from('photos').insert({
            id: photoId, ...meta, ...toIdentityColumns(identity), path, thumb_path: thumbPath,
            width: main.width, height: main.height, caption: item.caption.trim() || null,
            edit_token: photoToken,
          });
          if (error) throw error;
          saveToken(photoId, photoToken);
          item.done = true;
          item.error = null;
          success += 1;
        } catch (err) {
          item.error = friendlyError(err);
          await removeFiles('gallery', paths);
          if (/autorisation|limite/.test(item.error)) break; // inutile d'insister
        }
        render();
      }
      progress.value = 100;
      const failed = items.filter((i) => !i.done).length;
      status.textContent = failed
        ? `${success} photo${success > 1 ? 's' : ''} importée${success > 1 ? 's' : ''}, ${failed} en erreur.`
        : '';
      cancel.disabled = false;
      pick.disabled = false;
      render();
      if (success) {
        toast(needsApproval
          ? `${success} photo${success > 1 ? 's' : ''} envoyée${success > 1 ? 's' : ''}, en attente de validation.`
          : `${success} photo${success > 1 ? 's' : ''} ajoutée${success > 1 ? 's' : ''} à la galerie.`);
        load(true);
        loadFilters().catch(() => {});
      }
      if (!failed) modal.close();
    });
    render();
  }

  try {
    await loadFilters();
  } catch { /* filtres facultatifs */ }
  await load(true);
}
