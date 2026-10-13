import { h } from '../lib/dom.js';
import { supabase } from '../lib/supabase.js';
import { isMaster } from '../lib/session.js';
import { toIdentityColumns, tokenFor, saveToken } from '../lib/contributor.js';
import { contributorForm } from '../components/contributor-form.js';
import { setting } from '../lib/settings.js';
import { validateEvent } from '../lib/events.js';
import { recurrenceLabel } from '../lib/format.js';
import { friendlyError } from '../lib/errors.js';
import { field, openModal, setFieldError, clearFieldErrors, focusFirstError, toast } from '../lib/ui.js';

/**
 * mode : 'create' | 'series' (modifier toute la série / un événement ponctuel) | 'occurrence'
 */
export function openEventForm({ mode = 'create', occurrence = null, categories, recurrenceOptions, defaultDate, onSaved }) {
  const ev = occurrence?.event ?? null;
  const source = mode === 'occurrence' ? occurrence : (ev ?? {});
  const series = mode !== 'occurrence';
  const activeCategories = categories.filter((c) => c.is_active || c.id === ev?.category_id);
  const multiDayInitial = Boolean(source.start_date && source.end_date && source.start_date !== source.end_date);

  const title = field({ label: 'Titre de l’événement', name: 'title', required: true, maxlength: 150, value: source.title ?? '' });
  const category = series ? field({
    label: 'Catégorie', name: 'category_id', type: 'select', required: activeCategories.length > 0,
    value: ev?.category_id ?? '', placeholderOption: 'Choisir…',
    options: activeCategories.map((c) => ({ value: c.id, label: c.name })),
  }) : null;
  const description = field({ label: 'Description', name: 'description', type: 'textarea', rows: 4, maxlength: 5000, value: source.description ?? '' });

  const durationName = `duration-${Math.random().toString(36).slice(2, 7)}`;
  const oneDay = h('input', { type: 'radio', name: durationName, value: 'one', checked: !multiDayInitial });
  const manyDays = h('input', { type: 'radio', name: durationName, value: 'many', checked: multiDayInitial });
  const duration = h('fieldset', { class: 'fieldset fieldset--inline' },
    h('legend', null, 'Durée'),
    h('label', { class: 'check' }, oneDay, h('span', null, 'Sur une journée')),
    h('label', { class: 'check' }, manyDays, h('span', null, 'Sur plusieurs jours')));

  const startDate = field({ label: 'Date de début', name: 'start_date', type: 'date', required: true, value: source.start_date ?? defaultDate ?? '' });
  const startTime = field({ label: 'Heure de début', name: 'start_time', type: 'time', value: (source.start_time ?? '').slice(0, 5), hint: 'Facultative' });
  const endDate = field({ label: 'Date de fin', name: 'end_date', type: 'date', required: true, value: source.end_date ?? '' });
  const endTime = field({ label: 'Heure de fin', name: 'end_time', type: 'time', value: (source.end_time ?? '').slice(0, 5), hint: 'Facultative' });

  const location = field({ label: 'Lieu', name: 'location', maxlength: 200, value: source.location ?? '', autocomplete: 'off' });
  const organizer = series ? field({ label: 'Organisateur ou contact', name: 'organizer', maxlength: 200, value: ev?.organizer ?? '' }) : null;
  const link = series ? field({ label: 'Lien d’inscription ou d’information', name: 'link', type: 'url', maxlength: 500, placeholder: 'https://', value: ev?.link ?? '' }) : null;

  // Récurrence
  const options = recurrenceOptions.filter((o) => o.is_active
    || (o.unit === ev?.recurrence_unit && o.interval_count === ev?.recurrence_interval));
  const hasCustom = ev?.recurrence_unit && !options.some((o) => o.unit === ev.recurrence_unit && o.interval_count === ev.recurrence_interval);
  const recurring = h('input', { type: 'checkbox', name: 'recurring', checked: Boolean(ev?.recurrence_unit) });
  const frequency = field({
    label: 'Fréquence', name: 'recurrence', type: 'select', required: true,
    value: ev?.recurrence_unit ? `${ev.recurrence_unit}:${ev.recurrence_interval}` : '',
    placeholderOption: 'Choisir…',
    options: [
      ...options.map((o) => ({ value: `${o.unit}:${o.interval_count}`, label: o.label })),
      ...(hasCustom ? [{ value: `${ev.recurrence_unit}:${ev.recurrence_interval}`, label: recurrenceLabel(ev.recurrence_unit, ev.recurrence_interval) }] : []),
    ],
  });
  const until = field({ label: 'Jusqu’au', name: 'recurrence_until', type: 'date', value: ev?.recurrence_until ?? '', hint: 'Facultatif : laissez vide pour une répétition sans fin.' });
  const recurrenceBox = h('div', { class: 'grid-2' }, frequency, until);
  const recurrenceSection = series ? h('fieldset', { class: 'fieldset' },
    h('legend', null, 'Répétition'),
    h('label', { class: 'check' }, recurring, h('span', null, 'Événement récurrent')),
    recurrenceBox) : null;

  const syncVisibility = () => {
    endDate.hidden = !manyDays.checked;
    recurrenceBox.hidden = !recurring.checked;
  };
  for (const input of [oneDay, manyDays, recurring]) input.addEventListener('change', syncVisibility);
  startDate.control.addEventListener('change', () => {
    if (manyDays.checked && (!endDate.control.value || endDate.control.value < startDate.control.value)) {
      endDate.control.value = startDate.control.value;
    }
  });
  syncVisibility();

  const approvalNote = mode === 'create' && setting('events.require_approval') !== false && !isMaster()
    ? h('p', { class: 'notice' }, 'Votre événement sera relu par l’administrateur avant d’apparaître au planning.') : null;
  const contributor = mode === 'create' ? contributorForm({ full: false, contact: false }) : null;
  const occurrenceNote = mode === 'occurrence'
    ? h('p', { class: 'notice' }, 'Ces modifications ne concernent que cette date. Les autres dates de la série restent inchangées.') : null;
  const formError = h('p', { class: 'form-error', role: 'alert' });

  const form = h('form', { class: 'stack', novalidate: true },
    approvalNote, occurrenceNote,
    contributor ? h('section', { class: 'form-section' },
      h('h2', { class: 'form-section__title' }, 'Qui êtes-vous ?'), contributor.element) : null,
    title, category, description, duration,
    h('div', { class: 'grid-2' }, startDate, startTime, endDate, endTime),
    recurrenceSection, location, organizer, link,
    h('p', { class: 'field__hint' }, 'Les champs marqués d’un astérisque sont obligatoires.'),
    formError);

  const submit = h('button', { class: 'btn btn--primary', type: 'button', onClick: () => form.requestSubmit() },
    mode === 'create' ? 'Ajouter l’événement' : 'Enregistrer');
  const modal = openModal({
    title: { create: 'Ajouter un événement', series: 'Modifier l’événement', occurrence: 'Modifier cette date' }[mode],
    size: 'lg', content: form,
    actions: [h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => modal.close() }, 'Annuler'), submit],
  });
  title.control.focus();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    formError.textContent = '';
    const [unit, interval] = (frequency.control.value || ':').split(':');
    const values = {
      title: title.control.value.trim(),
      category_id: category?.control.value || null,
      description: description.control.value.trim() || null,
      start_date: startDate.control.value,
      start_time: startTime.control.value || null,
      end_date: manyDays.checked ? endDate.control.value : startDate.control.value,
      end_time: endTime.control.value || null,
      location: location.control.value.trim() || null,
      organizer: organizer?.control.value.trim() || null,
      link: link?.control.value.trim() || null,
      recurring: series && recurring.checked,
      recurrence_unit: unit || null,
      recurrence_interval: interval ? Number(interval) : null,
      recurrence_until: until.control.value || null,
    };
    if (values.link && !/^https?:\/\//i.test(values.link)) values.link = `https://${values.link}`;
    const identity = contributor ? contributor.read(form) : null;
    if (contributor && !identity) return;
    const errors = validateEvent(values, { requireCategory: activeCategories.length > 0, series });
    if (Object.keys(errors).length) {
      for (const [name, message] of Object.entries(errors)) {
        setFieldError(form, name === 'end_date' && !manyDays.checked ? 'start_date' : name, message);
      }
      return focusFirstError(form);
    }

    submit.disabled = true;
    try {
      if (mode === 'occurrence') {
        const { error } = await supabase.from('event_overrides').upsert({
          event_id: ev.id, occurrence_date: occurrence.occurrence_date, cancelled: false,
          title: values.title, description: values.description, location: values.location,
          start_date: values.start_date, start_time: values.start_time, end_date: values.end_date, end_time: values.end_time,
        });
        if (error) throw error;
      } else {
        const row = {
          title: values.title, category_id: values.category_id, description: values.description,
          start_date: values.start_date, start_time: values.start_time, end_date: values.end_date, end_time: values.end_time,
          location: values.location, organizer: values.organizer, link: values.link,
          recurrence_unit: values.recurring ? values.recurrence_unit : null,
          recurrence_interval: values.recurring ? values.recurrence_interval : null,
          recurrence_until: values.recurring ? values.recurrence_until : null,
        };
        if (mode === 'create') {
          // Identifiant et jeton tirés par le navigateur : un événement en
          // attente de validation n'est pas lisible du public, la base ne peut
          // donc pas renvoyer la ligne créée.
          const eventId = crypto.randomUUID();
          const eventToken = crypto.randomUUID();
          const { error } = await supabase.from('events')
            .insert({ id: eventId, ...row, ...toIdentityColumns(identity), edit_token: eventToken });
          if (error) throw error;
          saveToken(eventId, eventToken);
        } else if (isMaster()) {
          const { error } = await supabase.from('events').update(row).eq('id', ev.id);
          if (error) throw error;
        } else {
          throw new Error('Seul l’administrateur peut modifier un événement déjà publié.');
        }
      }
      modal.close();
      toast(mode === 'create'
        ? (approvalNote ? 'Événement envoyé, en attente de validation.' : 'Événement ajouté au planning.')
        : 'Événement modifié.');
      onSaved?.(values.start_date);
    } catch (err) {
      formError.textContent = friendlyError(err);
      submit.disabled = false;
    }
  });
}
