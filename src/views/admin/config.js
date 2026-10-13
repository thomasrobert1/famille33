import { h } from '../../lib/dom.js';
import { icon, CATEGORY_ICONS } from '../../lib/icons.js';
import { supabase } from '../../lib/supabase.js';
import { adminCall } from '../../lib/session.js';
import { removeFiles } from '../../lib/storage.js';
import { loadSettings, setting } from '../../lib/settings.js';
import { recurrenceLabel } from '../../lib/format.js';
import { friendlyError } from '../../lib/errors.js';
import {
  field, openModal, confirmDialog, toast, toastError, errorState, setFieldError, clearFieldErrors, focusFirstError, setBusy,
} from '../../lib/ui.js';

const ICON_LABELS = {
  calendar: 'Calendrier', users: 'Groupe', landmark: 'Monument', utensils: 'Repas', wine: 'Verre', mountain: 'Montagne',
  tent: 'Camping', bike: 'Vélo', ship: 'Bateau', plane: 'Avion', briefcase: 'Travail', 'graduation-cap': 'Diplôme',
  hammer: 'Marteau', cog: 'Engrenage', music: 'Musique', 'party-popper': 'Fête', cake: 'Gâteau', gift: 'Cadeau',
  trophy: 'Trophée', star: 'Étoile', flag: 'Drapeau', heart: 'Cœur', 'book-open': 'Livre', camera: 'Photo',
  megaphone: 'Annonce', 'map-pin': 'Lieu',
};
const UNITS = [{ value: 'day', label: 'Jour(s)' }, { value: 'week', label: 'Semaine(s)' }, { value: 'month', label: 'Mois' }, { value: 'year', label: 'Année(s)' }];
const ORDER = { name: 'sort_order', label: 'Ordre d’affichage', type: 'number', min: -1000, maxValue: 1000, value: 0, hint: 'Les plus petits nombres apparaissent en premier.' };

const BLOCKS = [
  {
    table: 'post_categories', title: 'Rubriques du fil', description: 'Proposées lors de la rédaction d’une publication.',
    order: ['sort_order', 'name'], label: (r) => r.name,
    fields: [{ name: 'name', label: 'Nom', required: true, max: 60 }, ORDER],
    preview: (r) => h('strong', null, r.name),
    deleteWarning: 'Les publications de cette rubrique resteront en ligne, sans rubrique.',
  },
  {
    table: 'albums', title: 'Albums de la galerie', description: 'Servent à classer et filtrer les photos.',
    order: ['sort_order', 'name'], label: (r) => r.name,
    fields: [{ name: 'name', label: 'Nom', required: true, max: 80 }, { name: 'description', label: 'Description', type: 'textarea', max: 500 }, ORDER],
    preview: (r) => [h('strong', null, r.name), r.description ? h('span', { class: 'muted' }, r.description) : null],
    deleteWarning: 'Les photos de cet album resteront dans la galerie, sans album.',
  },
  {
    table: 'event_categories', title: 'Catégories d’événements', description: 'Nom, couleur et pictogramme utilisés dans le planning.',
    order: ['sort_order', 'name'], label: (r) => r.name,
    fields: [
      { name: 'name', label: 'Nom', required: true, max: 60 },
      { name: 'color', label: 'Couleur', type: 'color', value: '#14213A' },
      { name: 'icon', label: 'Pictogramme', type: 'icon' },
      { name: 'description', label: 'Description', type: 'textarea', max: 300 },
      ORDER,
      { name: 'is_active', label: 'Proposée dans le formulaire d’événement', type: 'checkbox', value: true },
    ],
    preview: (r) => [
      h('span', { class: 'cat-chip', style: { '--cat': r.color } }, icon(r.icon, { size: 16 }), r.name),
      r.is_active ? null : h('span', { class: 'tag tag--muted' }, 'Inactive'),
    ],
    deleteWarning: 'Les événements de cette catégorie resteront au planning, sans catégorie. Pour la retirer du formulaire sans la supprimer, désactivez-la plutôt.',
  },
  {
    table: 'recurrence_options', title: 'Fréquences de répétition', description: 'Options du menu « Fréquence » des événements récurrents.',
    order: ['sort_order', 'label'], label: (r) => r.label,
    fields: [
      { name: 'label', label: 'Libellé', required: true, max: 60, hint: 'Ex. « Tous les 3 mois ».' },
      { name: 'unit', label: 'Unité', type: 'select', options: UNITS, value: 'week', required: true },
      { name: 'interval_count', label: 'Intervalle', type: 'number', min: 1, maxValue: 365, value: 1, required: true },
      ORDER,
      { name: 'is_active', label: 'Proposée dans le formulaire', type: 'checkbox', value: true },
    ],
    preview: (r) => [h('strong', null, r.label), h('span', { class: 'muted' }, recurrenceLabel(r.unit, r.interval_count)),
      r.is_active ? null : h('span', { class: 'tag tag--muted' }, 'Inactive')],
    deleteWarning: 'Les événements déjà créés avec cette fréquence ne sont pas modifiés.',
  },
];

export function renderAdminCategories(panel) {
  panel.replaceChildren(...BLOCKS.map(crudBlock));
}

function iconPicker(value) {
  const hidden = h('input', { type: 'hidden', name: 'icon', value });
  const grid = h('div', { class: 'icon-picker', role: 'radiogroup', 'aria-label': 'Pictogramme' },
    CATEGORY_ICONS.map((name) => h('button', {
      type: 'button', class: 'icon-picker__btn', role: 'radio', 'aria-checked': String(name === value),
      'aria-label': ICON_LABELS[name] ?? name, title: ICON_LABELS[name] ?? name,
      onClick: (e) => {
        hidden.value = name;
        for (const b of grid.children) b.setAttribute('aria-checked', String(b === e.currentTarget));
      },
    }, icon(name, { size: 20 }))));
  return { element: h('div', { class: 'field' }, h('span', { class: 'field__label' }, 'Pictogramme'), grid, hidden), get value() { return hidden.value; } };
}

function crudBlock(spec) {
  const list = h('div', { class: 'crud' });
  const section = h('section', { class: 'panel' },
    h('div', { class: 'panel__head' },
      h('div', null, h('h2', { class: 'section-title' }, spec.title), h('p', { class: 'muted' }, spec.description)),
      h('button', { class: 'btn btn--secondary btn--sm', type: 'button', onClick: () => edit(null) }, icon('plus', { size: 16 }), 'Ajouter')),
    list);

  async function load() {
    let q = supabase.from(spec.table).select('*');
    for (const col of spec.order) q = q.order(col);
    const { data, error } = await q;
    if (error) return list.replaceChildren(errorState(error, load));
    list.replaceChildren(...(data.length ? data.map((row) => h('div', { class: 'crud__row' },
      h('div', { class: 'crud__main' }, spec.preview(row)),
      h('div', { class: 'crud__actions' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Modifier ${spec.label(row)}`, onClick: () => edit(row) }, icon('pencil', { size: 18 })),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': `Supprimer ${spec.label(row)}`, onClick: () => remove(row) }, icon('trash', { size: 18 })))))
      : [h('p', { class: 'muted' }, 'Aucun élément pour le moment.')]));
  }

  function edit(row) {
    const controls = {};
    let picker = null;
    const parts = spec.fields.map((f) => {
      if (f.type === 'icon') {
        picker = iconPicker(row?.icon ?? 'calendar');
        return picker.element;
      }
      if (f.type === 'checkbox') {
        const input = h('input', { type: 'checkbox', name: f.name, checked: row ? row[f.name] : f.value });
        controls[f.name] = input;
        return h('label', { class: 'check' }, input, h('span', null, f.label));
      }
      const w = field({
        label: f.label, name: f.name, type: f.type, required: f.required, maxlength: f.max, min: f.min, max: f.maxValue,
        value: row ? (row[f.name] ?? '') : (f.value ?? ''), options: f.options, rows: 3, hint: f.hint,
      });
      controls[f.name] = w.control;
      return w;
    });
    const formError = h('p', { class: 'form-error', role: 'alert' });
    const form = h('form', { class: 'stack', novalidate: true }, parts, formError);
    const save = h('button', { class: 'btn btn--primary', type: 'button', onClick: () => form.requestSubmit() }, 'Enregistrer');
    const modal = openModal({
      title: row ? `Modifier « ${spec.label(row)} »` : `Ajouter : ${spec.title.toLowerCase()}`, content: form,
      actions: [h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => modal.close() }, 'Annuler'), save],
    });
    form.querySelector('input:not([type=hidden]), select, textarea')?.focus();
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      formError.textContent = '';
      const values = {};
      for (const f of spec.fields) {
        if (f.type === 'icon') { values.icon = picker.value; continue; }
        const c = controls[f.name];
        if (f.type === 'checkbox') { values[f.name] = c.checked; continue; }
        if (f.type === 'number') {
          const n = Number(c.value);
          if (c.value === '' || !Number.isInteger(n) || n < f.min || n > f.maxValue) {
            setFieldError(form, f.name, `Nombre entier entre ${f.min} et ${f.maxValue}.`);
          }
          values[f.name] = n;
          continue;
        }
        const v = c.value.trim();
        if (f.required && !v) setFieldError(form, f.name, 'Ce champ est obligatoire.');
        values[f.name] = v || null;
      }
      if (form.querySelector('.has-error')) return focusFirstError(form);
      setBusy(save, true);
      const { error } = row
        ? await supabase.from(spec.table).update(values).eq('id', row.id)
        : await supabase.from(spec.table).insert(values);
      setBusy(save, false);
      if (error) {
        formError.textContent = friendlyError(error);
        return;
      }
      modal.close();
      toast('Enregistré.');
      load();
    });
  }

  async function remove(row) {
    const ok = await confirmDialog({ title: `Supprimer « ${spec.label(row)} » ?`, message: spec.deleteWarning, confirmLabel: 'Supprimer', danger: true });
    if (!ok) return;
    const { error } = await supabase.from(spec.table).delete().eq('id', row.id);
    if (error) return toastError(error);
    toast('Supprimé.');
    load();
  }

  load();
  return section;
}

// --- Paramètres --------------------------------------------------------------------
export async function renderAdminSettings(panel) {
  await loadSettings().catch(() => {});

  const group = (title, description, content, collect, { refreshShell = false } = {}) => {
    const formError = h('p', { class: 'form-error', role: 'alert' });
    const save = h('button', { class: 'btn btn--primary', type: 'submit' }, 'Enregistrer');
    const form = h('form', { class: 'panel stack', novalidate: true },
      h('h2', { class: 'section-title' }, title),
      description ? h('p', { class: 'muted' }, description) : null,
      content, formError, h('div', { class: 'form-actions' }, save));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      clearFieldErrors(form);
      formError.textContent = '';
      const entries = collect(form);
      if (!entries) return focusFirstError(form);
      setBusy(save, true);
      const { error } = await supabase.from('site_settings')
        .upsert(entries.map(([key, value]) => ({ key, value })), { onConflict: 'key' });
      setBusy(save, false);
      if (error) {
        formError.textContent = friendlyError(error);
        return;
      }
      await loadSettings().catch(() => {});
      toast('Paramètres enregistrés.');
      if (refreshShell) window.dispatchEvent(new CustomEvent('f33:settings'));
    });
    return form;
  };

  // Textes
  const name = field({ label: 'Nom du site', name: 'site.name', required: true, maxlength: 60, value: setting('site.name') });
  const tagline = field({ label: 'Accroche', name: 'site.tagline', maxlength: 120, value: setting('site.tagline') });
  const intro = field({ label: 'Texte d’introduction du fil', name: 'site.intro', type: 'textarea', rows: 3, maxlength: 1000, value: setting('site.intro'), hint: 'Affiché en haut du fil. Laissez vide pour ne rien afficher.' });
  const contact = field({ label: 'Contact pour les données personnelles', name: 'privacy.contact', type: 'email', maxlength: 254, value: setting('privacy.contact'), hint: 'Affiché sur la page Confidentialité.' });

  // Onglets
  const labels = setting('nav.labels') ?? {};
  const navFields = ['feed', 'gallery', 'planning'].map((k, i) => field({
    label: `Onglet ${i + 1}`, name: `nav.${k}`, required: true, maxlength: 20, value: labels[k] ?? '',
    hint: { feed: 'Actualités (par défaut « Fil »)', gallery: 'Photos (par défaut « Galerie »)', planning: 'Événements (par défaut « Planning »)' }[k],
  }));

  // Règles de contribution
  const check = (key, label, defaultOn = true) => {
    const value = setting(key);
    const input = h('input', { type: 'checkbox', checked: value === undefined ? defaultOn : value !== false });
    return { input, element: h('label', { class: 'check check--wide' }, input, h('span', null, label)) };
  };
  const postsOpen = check('posts.open', 'Le dépôt d’articles est ouvert à tous');
  const postsApproval = check('posts.require_approval', 'Relire les articles avant publication');
  const comments = check('comments.enabled', 'Les commentaires sont ouverts');
  const photosOpen = check('photos.open', 'Le dépôt de photos est ouvert à tous');
  const photosApproval = check('photos.require_approval', 'Relire les photos avant publication');
  const eventsOpen = check('events.open', 'Le dépôt d’événements est ouvert à tous');
  const eventsApproval = check('events.require_approval', 'Relire les événements avant publication');
  const pageSize = field({ label: 'Articles chargés à la fois', name: 'posts.page_size', type: 'number', min: 3, max: 30, value: setting('posts.page_size') });

  // Limites anti-inondation
  const limitFields = [
    ['limits.posts_per_hour', 'Articles par heure', 1, 1000],
    ['limits.comments_per_hour', 'Commentaires par heure', 1, 5000],
    ['limits.photos_per_hour', 'Photos par heure', 1, 5000],
    ['limits.events_per_hour', 'Événements par heure', 1, 1000],
    ['limits.uploads_per_hour', 'Fichiers envoyés par heure', 1, 5000],
  ].map(([key, label, min, max]) => ({
    key, min, max,
    field: field({ label, name: key, type: 'number', min, max, value: setting(key) }),
  }));

  // Listes
  const options = setting('form.options') ?? {};
  const listField = (key, label) => field({ label, name: `list.${key}`, type: 'textarea', rows: 6, value: (options[key] ?? []).join('\n'), hint: 'Une valeur par ligne.' });
  const regions = listField('regions', 'Régions');
  const countries = listField('countries', 'Pays');
  const statuses = listField('statuses', 'Statuts');
  const sectors = listField('sectors', 'Secteurs d’activité');

  const purge = h('button', { class: 'btn btn--secondary', type: 'button' }, icon('trash', { size: 16 }), 'Purger les fichiers supprimés');
  purge.addEventListener('click', async () => {
    setBusy(purge, true, 'Purge en cours…');
    try {
      let removed = 0;
      // La file est lue par lots : on supprime les fichiers du stockage, puis
      // on retire les lignes traitées. Un fichier déjà absent n'est pas une erreur.
      for (;;) {
        const rows = await adminCall('admin_storage_trash');
        if (!rows?.length) break;
        const byBucket = new Map();
        for (const row of rows) {
          if (!byBucket.has(row.bucket)) byBucket.set(row.bucket, []);
          byBucket.get(row.bucket).push(row.path);
        }
        for (const [bucket, paths] of byBucket) await removeFiles(bucket, paths);
        removed += await adminCall('admin_storage_trash_clear', { p_ids: rows.map((r) => r.id) });
        if (rows.length < 500) break;
      }
      toast(removed
        ? `${removed} fichier${removed > 1 ? 's' : ''} retiré${removed > 1 ? 's' : ''} du stockage.`
        : 'Aucun fichier en attente de suppression.');
    } catch (err) {
      toastError(err);
    } finally {
      setBusy(purge, false);
    }
  });

  const intIn = (form, f, min, max) => {
    const n = Number(f.control.value);
    if (!Number.isInteger(n) || n < min || n > max) {
      setFieldError(form, f.control.name, `Nombre entier entre ${min} et ${max}.`);
      return null;
    }
    return n;
  };

  panel.replaceChildren(
    group('Textes du site', null, h('div', { class: 'stack' }, name, tagline, intro, contact), (form) => {
      if (!name.control.value.trim()) { setFieldError(form, 'site.name', 'Le nom du site est obligatoire.'); return null; }
      const email = contact.control.value.trim();
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setFieldError(form, 'privacy.contact', 'Adresse e-mail invalide.'); return null; }
      return [['site.name', name.control.value.trim()], ['site.tagline', tagline.control.value.trim()],
        ['site.intro', intro.control.value.trim()], ['privacy.contact', email]];
    }, { refreshShell: true }),
    group('Onglets de navigation', 'Libellés des trois onglets principaux.', h('div', { class: 'grid-3' }, navFields), (form) => {
      const values = {};
      for (const [i, k] of ['feed', 'gallery', 'planning'].entries()) {
        const v = navFields[i].control.value.trim();
        if (!v) { setFieldError(form, `nav.${k}`, 'Obligatoire.'); return null; }
        values[k] = v;
      }
      return [['nav.labels', values]];
    }, { refreshShell: true }),
    group('Contributions et modération',
      'Vous décidez de ce qui est ouvert au public et de ce qui passe par votre relecture.',
      h('div', { class: 'stack' },
        h('fieldset', { class: 'fieldset' }, h('legend', null, 'Articles'), postsOpen.element, postsApproval.element, comments.element),
        h('fieldset', { class: 'fieldset' }, h('legend', null, 'Photos'), photosOpen.element, photosApproval.element),
        h('fieldset', { class: 'fieldset' }, h('legend', null, 'Événements'), eventsOpen.element, eventsApproval.element),
        pageSize),
      (form) => {
        const size = intIn(form, pageSize, 3, 30);
        if (size === null) return null;
        return [
          ['posts.open', postsOpen.input.checked], ['posts.require_approval', postsApproval.input.checked],
          ['comments.enabled', comments.input.checked],
          ['photos.open', photosOpen.input.checked], ['photos.require_approval', photosApproval.input.checked],
          ['events.open', eventsOpen.input.checked], ['events.require_approval', eventsApproval.input.checked],
          ['posts.page_size', size],
        ];
      }),
    group('Limites de dépôt',
      'Nombre maximal de contributions acceptées par heure, tous visiteurs confondus. Ces limites évitent qu’un robot ou une mauvaise plaisanterie n’inonde le site.',
      h('div', { class: 'grid-3' }, limitFields.map((l) => l.field)),
      (form) => {
        const values = limitFields.map((l) => [l.key, intIn(form, l.field, l.min, l.max)]);
        return values.some(([, v]) => v === null) ? null : values;
      }),
    group('Listes du formulaire', 'Valeurs proposées aux contributeurs et dans l’annuaire.',
      h('div', { class: 'grid-3' }, regions, countries, statuses, sectors), () => {
        const parse = (f) => [...new Set(f.control.value.split('\n').map((v) => v.trim()).filter(Boolean))].slice(0, 100);
        return [['form.options', {
          regions: parse(regions), countries: parse(countries), statuses: parse(statuses), sectors: parse(sectors),
        }]];
      }),
    h('section', { class: 'panel stack' },
      h('h2', { class: 'section-title' }, 'Maintenance'),
      h('p', { class: 'muted' }, 'Retire du stockage les fichiers des photos et publications supprimées qui n’ont pas pu l’être immédiatement.'),
      h('div', null, purge)));
}
