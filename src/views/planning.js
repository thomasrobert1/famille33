import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { supabase } from '../lib/supabase.js';
import { isMaster } from '../lib/session.js';
import { setting } from '../lib/settings.js';
import { authorName, tokenFor, dropToken } from '../lib/contributor.js';
import { expandEvents, assignLanes } from '../lib/recurrence.js';
import { buildIcs, downloadText, slugify } from '../lib/events.js';
import { renderMarkdown } from '../lib/markdown.js';
import {
  todayISO, isoDate, daysInMonth, daysInYear, diffDays, addDays, weekdayIndex, parseISO, MONTHS,
  WEEKDAYS_SHORT, formatEventWhen, formatTime, formatDay, recurrenceLabel,
} from '../lib/format.js';
import {
  pageHeader, loadingState, errorState, emptyState, openModal, confirmDialog, choiceDialog, toast, toastError,
} from '../lib/ui.js';
import { openEventForm } from './event-form.js';

const LANE_HEIGHT = 46;

export async function renderPlanning(container, { query }) {
  const today = todayISO();
  const state = {
    year: Number(query.get('annee')) || Number(today.slice(0, 4)),
    month: Number(query.get('mois')) || Number(today.slice(5, 7)),
    view: query.get('vue') === 'mois' ? 'month' : 'timeline',
    hidden: new Set(),
    selectedDay: null,
    data: null,
    loadedYear: null,
  };
  let categories = [];
  let recurrenceOptions = [];

  const yearLabel = h('h2', { class: 'year-nav__label', 'aria-live': 'polite' });
  const body = h('div', { class: 'planning__body' });
  const legend = h('div', { class: 'legend', role: 'group', 'aria-label': 'Afficher ou masquer des catégories' });
  const timelineBtn = h('button', { class: 'segmented__btn', type: 'button', onClick: () => setView('timeline') }, icon('rows', { size: 16 }), 'Frise');
  const monthBtn = h('button', { class: 'segmented__btn', type: 'button', onClick: () => setView('month') }, icon('calendar-days', { size: 16 }), 'Mois');
  const canAdd = setting('events.open') !== false || isMaster();

  container.replaceChildren(h('div', { class: 'page page--wide planning' },
    pageHeader('Le Planning', canAdd ? h('button', { class: 'btn btn--primary', type: 'button', onClick: () => addEvent() },
      icon('calendar-plus', { size: 18 }), 'Ajouter un événement') : null),
    h('div', { class: 'planning__toolbar' },
      h('div', { class: 'year-nav' },
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Période précédente', onClick: () => shift(-1) }, icon('chevron-left')),
        yearLabel,
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Période suivante', onClick: () => shift(1) }, icon('chevron-right'))),
      h('button', { class: 'btn btn--ghost btn--sm', type: 'button', onClick: goToday }, icon('crosshair', { size: 16 }), 'Aujourd’hui'),
      h('div', { class: 'segmented', role: 'group', 'aria-label': 'Affichage' }, timelineBtn, monthBtn)),
    legend,
    body));

  function syncUrl() {
    const params = new URLSearchParams({ annee: state.year });
    if (state.view === 'month') { params.set('vue', 'mois'); params.set('mois', state.month); }
    history.replaceState(null, '', `#/planning?${params}`);
  }

  function setView(view) {
    state.view = view;
    render();
  }

  function shift(delta) {
    if (state.view === 'timeline') {
      state.year += delta;
    } else {
      state.month += delta;
      if (state.month < 1) { state.month = 12; state.year -= 1; }
      if (state.month > 12) { state.month = 1; state.year += 1; }
      state.selectedDay = null;
    }
    render();
  }

  function goToday() {
    state.year = Number(today.slice(0, 4));
    state.month = Number(today.slice(5, 7));
    state.selectedDay = state.view === 'month' ? today : null;
    render().then(() => {
      const target = body.querySelector('.agenda__month--current') ?? body.querySelector('.reglet__today');
      target?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'center' });
    });
  }

  async function loadYear(year) {
    const [eventsRes, catRes, recRes] = await Promise.all([
      supabase.from('events').select('*')
        .lte('start_date', `${year}-12-31`)
        .or(`end_date.gte.${year}-01-01,recurrence_unit.not.is.null`)
        .order('start_date'),
      categories.length ? { data: categories } : supabase.from('event_categories').select('*').order('sort_order').order('name'),
      recurrenceOptions.length ? { data: recurrenceOptions } : supabase.from('recurrence_options').select('*').order('sort_order'),
    ]);
    if (eventsRes.error) throw eventsRes.error;
    categories = catRes.data ?? [];
    recurrenceOptions = recRes.data ?? [];
    const recurringIds = eventsRes.data.filter((e) => e.recurrence_unit).map((e) => e.id);
    let overrides = [];
    if (recurringIds.length) {
      const { data, error } = await supabase.from('event_overrides').select('*').in('event_id', recurringIds);
      if (error) throw error;
      overrides = data;
    }
    state.data = expandEvents(eventsRes.data, overrides, `${year}-01-01`, `${year}-12-31`);
    state.loadedYear = year;
  }

  async function render(force = false) {
    timelineBtn.setAttribute('aria-pressed', String(state.view === 'timeline'));
    monthBtn.setAttribute('aria-pressed', String(state.view === 'month'));
    yearLabel.textContent = state.view === 'timeline' ? String(state.year) : `${MONTHS[state.month - 1]} ${state.year}`;
    syncUrl();
    if (force || state.loadedYear !== state.year) {
      body.replaceChildren(loadingState('Chargement du planning…'));
      try {
        await loadYear(state.year);
      } catch (err) {
        body.replaceChildren(errorState(err, () => render(true)));
        return;
      }
    }
    renderLegend();
    const occs = state.data.filter((o) => !state.hidden.has(o.category_id ?? 'none'));
    if (state.view !== 'timeline') { cleanup?.(); cleanup = null; }
    body.replaceChildren(state.view === 'timeline' ? timelineView(occs) : monthView(occs));
  }

  function category(id) {
    return categories.find((c) => c.id === id) ?? null;
  }

  function renderLegend() {
    const used = new Set(state.data.map((o) => o.category_id ?? 'none'));
    const items = categories.filter((c) => used.has(c.id));
    if (used.has('none')) items.push({ id: 'none', name: 'Sans catégorie', color: '#5B6270', icon: 'calendar' });
    legend.hidden = items.length < 2;
    legend.replaceChildren(...items.map((c) => {
      const btn = h('button', {
        class: 'legend__item', type: 'button', 'aria-pressed': String(!state.hidden.has(c.id)),
        style: { '--cat': c.color }, title: c.description ?? '',
        onClick: () => {
          if (state.hidden.has(c.id)) state.hidden.delete(c.id);
          else state.hidden.add(c.id);
          render();
        },
      }, h('span', { class: 'legend__swatch' }, icon(c.icon, { size: 14 })), c.name);
      return btn;
    }));
  }

  // --- Frise : réglet gradué + agenda ---------------------------------------
  function timelineView(occs) {
    const year = state.year;
    const total = daysInYear(year);
    const yearStart = `${year}-01-01`;
    const pct = (days) => `${(days / total) * 100}%`;
    const isCurrentYear = Number(today.slice(0, 4)) === year;

    const scale = h('div', { class: 'reglet__scale' },
      MONTHS.map((name, i) => h('button', {
        class: 'reglet__month', type: 'button', style: { flexGrow: daysInMonth(year, i + 1), '--days': daysInMonth(year, i + 1) },
        'aria-label': `Voir ${name} ${year} en détail`,
        onClick: () => { state.month = i + 1; setView('month'); },
      }, h('span', { class: 'reglet__month-name' }, name))));

    const lanes = h('div', { class: 'reglet__lanes' });
    const reglet = h('div', { class: 'reglet', 'aria-hidden': 'true' }, scale, lanes);
    if (isCurrentYear) {
      const position = diffDays(yearStart, today) + 0.5;
      reglet.append(h('div', { class: 'reglet__today', style: { left: pct(position) } }, h('span', null, 'Aujourd’hui')));
    }

    const layout = () => {
      const width = lanes.clientWidth || 1000;
      const dayPx = width / total;
      // Chaque élément occupe une « boîte » : sa durée, élargie si besoin pour
      // loger l'étiquette. Près de la fin d'année, la boîte s'aligne à droite.
      const items = occs.map((o) => {
        const start = Math.max(0, diffDays(yearStart, o.start_date));
        const end = Math.min(total - 1, diffDays(yearStart, o.end_date));
        const span = end - start + 1;
        const labelPx = Math.min(260, 34 + o.title.length * 8.6); // texte gras ≈ 8,5 px/caractère
        const box = Math.min(total, Math.max(span, Math.ceil(labelPx / dayPx) + 1));
        const flip = start + box > total;
        const boxStart = flip ? Math.max(0, end + 1 - box) : start;
        return { occ: o, span, box, flip, start: boxStart, end: boxStart + box - 1 };
      });
      const count = assignLanes(items);
      lanes.style.height = `${Math.max(1, count) * LANE_HEIGHT + 12}px`;
      lanes.replaceChildren(...items.map((it) => {
        const cat = category(it.occ.category_id);
        return h('div', {
          class: ['reglet__item', it.span > 1 ? 'reglet__item--span' : 'reglet__item--day', it.occ.status === 'pending' && 'is-pending', it.flip && 'reglet__item--flip'],
          style: {
            left: pct(it.start), width: pct(it.box), top: `${it.lane * LANE_HEIGHT + 6}px`,
            '--cat': cat?.color ?? '#5B6270', '--bar': `${(it.span / it.box) * 100}%`,
          },
        },
        h('button', { class: 'reglet__hit', type: 'button', tabindex: '-1', title: `${it.occ.title} — ${formatEventWhen(it.occ)}`, onClick: () => openDetail(it.occ) },
          h('span', { class: 'reglet__mark' }),
          h('span', { class: 'reglet__label' }, it.occ.title)));
      }));
    };

    const wrapper = h('div', { class: 'timeline' }, reglet, agenda(occs));
    cleanup?.();
    let lastWidth = 0;
    const observer = new ResizeObserver(() => {
      if (Math.abs(lanes.clientWidth - lastWidth) < 2) return;
      lastWidth = lanes.clientWidth;
      layout();
    });
    observer.observe(lanes);
    cleanup = () => observer.disconnect();
    return wrapper;
  }

  // Liste chronologique (seule vue sur téléphone : le réglet devient vertical)
  function agenda(occs) {
    if (!occs.length) {
      return emptyState({
        iconName: 'calendar', title: `Aucun événement en ${state.year}.`,
        text: 'Proposez une rencontre, une sortie ou un rendez-vous de promotion.',
        action: h('button', { class: 'btn btn--primary', type: 'button', onClick: () => addEvent() }, 'Ajouter un événement'),
      });
    }
    const currentMonth = Number(today.slice(5, 7));
    const isCurrentYear = Number(today.slice(0, 4)) === state.year;
    const byMonth = new Map();
    for (const o of occs) {
      const m = o.start_date.slice(0, 4) < String(state.year) ? 1 : parseISO(o.start_date).m;
      if (!byMonth.has(m)) byMonth.set(m, []);
      byMonth.get(m).push(o);
    }
    return h('div', { class: 'agenda' },
      h('h2', { class: 'visually-hidden' }, `Événements de ${state.year}`),
      [...byMonth.entries()].sort((a, b) => a[0] - b[0]).map(([m, list]) => h('section', {
        class: ['agenda__month', isCurrentYear && m === currentMonth && 'agenda__month--current'],
      },
      h('h3', { class: 'agenda__title' }, MONTHS[m - 1]),
      h('ul', { class: 'agenda__list' }, list.map((o) => agendaRow(o))))));
  }

  function agendaRow(o) {
    const cat = category(o.category_id);
    const s = parseISO(o.start_date);
    const multi = o.start_date !== o.end_date;
    const past = o.end_date < today;
    const sub = [
      o.start_time ? formatTime(o.start_time) + (o.end_time && !multi ? ` – ${formatTime(o.end_time)}` : '') : null,
      multi ? `jusqu’au ${formatDay(o.end_date, { weekday: false, year: o.end_date.slice(0, 4) !== o.start_date.slice(0, 4) })}` : null,
      o.location,
    ].filter(Boolean).join(', ');
    return h('li', null, h('button', {
      class: ['agenda__row', past && 'is-past', o.status === 'pending' && 'is-pending'], type: 'button',
      style: { '--cat': cat?.color ?? '#5B6270' }, onClick: () => openDetail(o),
    },
    h('span', { class: 'agenda__date' },
      h('span', { class: 'agenda__day' }, String(s.d)),
      h('span', { class: 'agenda__weekday' }, WEEKDAYS_SHORT[weekdayIndex(o.start_date)])),
    h('span', { class: 'agenda__icon' }, icon(cat?.icon ?? 'calendar', { size: 18 })),
    h('span', { class: 'agenda__text' },
      h('span', { class: 'agenda__name' }, o.title,
        o.is_recurring ? icon('repeat', { size: 14, label: 'Événement récurrent', className: 'agenda__repeat' }) : null),
      sub ? h('span', { class: 'agenda__sub' }, sub) : null,
      o.status === 'pending' ? h('span', { class: 'tag tag--warning' }, 'En attente de validation') : null)));
  }

  // --- Vue mensuelle ----------------------------------------------------------
  function monthView(occs) {
    const { year, month } = state;
    const first = isoDate(year, month, 1);
    const last = isoDate(year, month, daysInMonth(year, month));
    const gridStart = addDays(first, -weekdayIndex(first));
    const gridEnd = addDays(last, 6 - weekdayIndex(last));
    const days = diffDays(gridStart, gridEnd) + 1;

    const dayEvents = (iso) => occs.filter((o) => o.start_date <= iso && o.end_date >= iso);
    const detail = h('div', { class: 'month__detail', 'aria-live': 'polite' });

    const showDay = (iso) => {
      state.selectedDay = iso;
      for (const cell of grid.querySelectorAll('.month__cell')) cell.setAttribute('aria-pressed', String(cell.dataset.date === iso));
      const list = dayEvents(iso);
      detail.replaceChildren(
        h('h3', { class: 'month__detail-title' }, formatDay(iso)),
        list.length ? h('ul', { class: 'agenda__list' }, list.map(agendaRow))
          : h('p', { class: 'muted' }, 'Aucun événement ce jour-là.',
            ' ', h('button', { class: 'link-btn', type: 'button', onClick: () => addEvent(iso) }, 'Ajouter un événement')));
    };

    const grid = h('div', { class: 'month__grid', role: 'grid', 'aria-label': `${MONTHS[month - 1]} ${year}` },
      h('div', { class: 'month__row month__row--head', role: 'row' },
        WEEKDAYS_SHORT.map((d) => h('span', { class: 'month__weekday', role: 'columnheader' }, d))),
      Array.from({ length: days / 7 }, (_, w) => h('div', { class: 'month__row', role: 'row' },
        Array.from({ length: 7 }, (__, d) => {
          const iso = addDays(gridStart, w * 7 + d);
          const inMonth = iso >= first && iso <= last;
          const list = inMonth ? dayEvents(iso) : [];
          return h('button', {
            class: ['month__cell', !inMonth && 'is-outside', iso === today && 'is-today'], type: 'button', role: 'gridcell',
            dataset: { date: iso }, 'aria-pressed': String(state.selectedDay === iso),
            'aria-label': `${formatDay(iso)}${list.length ? `, ${list.length} événement${list.length > 1 ? 's' : ''}` : ''}`,
            disabled: !inMonth, onClick: () => showDay(iso),
          },
          h('span', { class: 'month__num' }, String(parseISO(iso).d)),
          list.length ? h('span', { class: 'month__chips' },
            list.slice(0, 3).map((o) => h('span', { class: 'month__chip', style: { '--cat': category(o.category_id)?.color ?? '#5B6270' } }, o.title)),
            list.length > 3 ? h('span', { class: 'month__more' }, `+${list.length - 3}`) : null) : null);
        }))));

    const wrapper = h('div', { class: 'month' }, grid, detail);
    const initial = state.selectedDay && state.selectedDay >= first && state.selectedDay <= last ? state.selectedDay
      : (today >= first && today <= last ? today : null);
    if (initial) queueMicrotask(() => showDay(initial));
    else detail.append(h('p', { class: 'muted' }, 'Touchez un jour pour voir ses événements.'));
    return wrapper;
  }

  // --- Fiche événement ----------------------------------------------------------
  function openDetail(o) {
    const ev = o.event;
    const cat = category(o.category_id);
    const recurrence = ev.recurrence_unit
      ? `${recurrenceLabel(ev.recurrence_unit, ev.recurrence_interval)}${ev.recurrence_until ? `, jusqu’au ${formatDay(ev.recurrence_until, { weekday: false })}` : ''}`
      : null;
    const fact = (iconName, content) => (content ? h('li', null, icon(iconName, { size: 18 }), h('span', null, content)) : null);
    const content = h('div', { class: 'event-detail', style: { '--cat': cat?.color ?? '#5B6270' } },
      cat ? h('p', { class: 'event-detail__cat' }, icon(cat.icon, { size: 16 }), cat.name) : null,
      o.status === 'pending' ? h('p', { class: 'notice' }, 'En attente de validation par l’administrateur : seuls vous et l’administrateur le voyez.') : null,
      h('ul', { class: 'facts' },
        fact('calendar', formatEventWhen(o)),
        fact('repeat', recurrence),
        fact('map-pin', o.location ? h('a', {
          href: `https://www.openstreetmap.org/search?query=${encodeURIComponent(o.location)}`, target: '_blank', rel: 'noopener noreferrer',
        }, o.location) : null),
        fact('user-round', ev.organizer)),
      o.description ? h('div', { class: 'prose', trustedHtml: renderMarkdown(o.description) }) : null,
      ev.link ? h('a', { class: 'btn btn--secondary', href: ev.link, target: '_blank', rel: 'noopener noreferrer' },
        icon('external-link', { size: 16 }), 'Inscription et informations') : null,
      h('p', { class: 'muted event-detail__by' },
        `Proposé par ${authorName(ev)} (${ev.author_bucque}, ${ev.author_number} ch ${ev.author_promo})`));

    const actions = [
      h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => {
        downloadText(`${slugify(o.title)}.ics`, buildIcs(o, { siteName: setting('site.name') }), 'text/calendar');
      } }, icon('download', { size: 16 }), 'Ajouter à mon agenda'),
    ];
    if (isMaster() && o.status === 'pending') {
      actions.push(h('button', { class: 'btn btn--secondary', type: 'button', onClick: async () => {
        const { error } = await supabase.from('events').update({ status: 'published' }).eq('id', ev.id);
        if (error) return toastError(error);
        modal.close();
        toast('Événement validé et visible de tous.');
        render(true);
      } }, icon('check', { size: 16 }), 'Valider'));
    }
    if (isMaster()) {
      actions.push(
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => { modal.close(); editEvent(o); } }, icon('pencil', { size: 16 }), 'Modifier'),
        h('button', { class: 'btn btn--ghost btn--danger-text', type: 'button', onClick: () => { modal.close(); deleteEvent(o); } }, icon('trash', { size: 16 }), 'Supprimer'));
    } else if (tokenFor(ev.id)) {
      actions.push(h('button', { class: 'btn btn--ghost btn--danger-text', type: 'button', onClick: () => { modal.close(); deleteEvent(o); } }, icon('trash', { size: 16 }), 'Retirer'));
    }
    const modal = openModal({ title: o.title, content, actions, className: 'modal--event' });
  }

  function addEvent(date) {
    openEventForm({
      mode: 'create', categories, recurrenceOptions, defaultDate: date ?? (state.view === 'month' ? state.selectedDay : null),
      onSaved: (start) => {
        state.year = Number(start.slice(0, 4));
        state.month = Number(start.slice(5, 7));
        render(true);
      },
    });
  }

  async function editEvent(o) {
    let mode = 'series';
    if (o.is_recurring) {
      mode = await choiceDialog({
        title: 'Modifier un événement récurrent',
        message: 'Souhaitez-vous modifier uniquement cette date, ou toutes les dates de la série ?',
        choices: [{ label: 'Cette date', value: 'occurrence' }, { label: 'Toute la série', value: 'series' }],
      });
      if (!mode) return;
    }
    openEventForm({ mode, occurrence: o, categories, recurrenceOptions, onSaved: () => render(true) });
  }

  async function deleteEvent(o) {
    const ev = o.event;
    let scope = 'series';
    // Retirer une seule date revient à modifier la série, ce que seul
    // l'administrateur peut faire. L'auteur d'un événement, lui, retire
    // l'ensemble de sa proposition.
    if (o.is_recurring && isMaster()) {
      scope = await choiceDialog({
        title: 'Supprimer un événement récurrent',
        message: 'Supprimer uniquement cette date, ou toute la série ?',
        choices: [{ label: 'Cette date', value: 'occurrence', danger: true }, { label: 'Toute la série', value: 'series', danger: true }],
      });
      if (!scope) return;
    } else {
      const ok = await confirmDialog({
        title: 'Retirer l’événement ?',
        message: o.is_recurring
          ? `« ${o.title} » et toutes ses dates seront retirés du planning.`
          : `« ${o.title} » sera retiré du planning.`,
        confirmLabel: 'Retirer', danger: true,
      });
      if (!ok) return;
    }
    if (scope === 'occurrence') {
      const { error } = await supabase.from('event_overrides')
        .upsert({ event_id: ev.id, occurrence_date: o.occurrence_date, cancelled: true });
      if (error) return toastError(error);
    } else if (isMaster()) {
      const { error } = await supabase.from('events').delete().eq('id', ev.id);
      if (error) return toastError(error);
    } else {
      const { data, error } = await supabase.rpc('delete_event_with_token', { p_id: ev.id, p_token: tokenFor(ev.id) });
      if (error) return toastError(error);
      if (!data) return toast('Ce lien n’est plus valable.', 'error');
      dropToken(ev.id);
    }
    toast(scope === 'occurrence' ? 'Cette date a été retirée de la série.' : 'Événement supprimé.');
    render(true);
  }

  let cleanup = null;
  await render(true);
  return () => cleanup?.();
}
