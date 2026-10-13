// Calcul des occurrences des événements (ponctuels et récurrents) sur une période.
import { addDays, daysInMonth, diffDays, isoDate, parseISO, toUTC } from './format.js';

const MAX_OCCURRENCES = 1500;

// Ajoute k périodes à une date de départ. Les mois/années trop courts sont
// ramenés au dernier jour valide (31 janvier + 1 mois → 28 ou 29 février).
export function nthOccurrence(startIso, unit, interval, k) {
  if (unit === 'day') return addDays(startIso, k * interval);
  if (unit === 'week') return addDays(startIso, k * interval * 7);
  const { y, m, d } = parseISO(startIso);
  const months = unit === 'month' ? k * interval : k * interval * 12;
  const total = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return isoDate(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

function approxPeriodDays(unit, interval) {
  return { day: 1, week: 7, month: 31, year: 366 }[unit] * interval; // majorant : ne jamais sauter trop loin
}

function overlaps(start, end, rangeStart, rangeEnd) {
  return start <= rangeEnd && end >= rangeStart;
}

/**
 * @param {Array} events      lignes de la table events
 * @param {Array} overrides   lignes de la table event_overrides
 * @param {string} rangeStart YYYY-MM-DD inclus
 * @param {string} rangeEnd   YYYY-MM-DD inclus
 * @returns {Array} occurrences triées par date de début
 */
export function expandEvents(events, overrides, rangeStart, rangeEnd) {
  const byKey = new Map();
  for (const o of overrides ?? []) byKey.set(`${o.event_id}|${o.occurrence_date}`, o);
  const used = new Set();
  const out = [];

  const push = (ev, occurrenceDate, base) => {
    const key = `${ev.id}|${occurrenceDate}`;
    const o = byKey.get(key);
    if (o) used.add(key);
    if (o?.cancelled) return;
    const occ = o
      ? {
          title: o.title, description: o.description, location: o.location,
          start_date: o.start_date, start_time: o.start_time, end_date: o.end_date, end_time: o.end_time,
        }
      : base;
    if (!overlaps(occ.start_date, occ.end_date, rangeStart, rangeEnd)) return;
    out.push({
      ...ev,
      ...occ,
      key,
      event: ev,
      occurrence_date: occurrenceDate,
      is_recurring: Boolean(ev.recurrence_unit),
      is_modified: Boolean(o),
    });
  };

  for (const ev of events ?? []) {
    const duration = Math.max(0, diffDays(ev.start_date, ev.end_date));
    if (!ev.recurrence_unit) {
      push(ev, ev.start_date, ev);
      continue;
    }
    const unit = ev.recurrence_unit;
    const interval = Math.max(1, Number(ev.recurrence_interval) || 1);
    const until = ev.recurrence_until && ev.recurrence_until < rangeEnd ? ev.recurrence_until : rangeEnd;
    // On saute directement près du début de la période (sans dériver)
    const gap = diffDays(ev.start_date, rangeStart) - duration;
    let k = gap > 0 ? Math.max(0, Math.floor(gap / approxPeriodDays(unit, interval)) - 1) : 0;
    for (let count = 0; count < MAX_OCCURRENCES; count += 1, k += 1) {
      const start = nthOccurrence(ev.start_date, unit, interval, k);
      if (start > until) break;
      const end = addDays(start, duration);
      if (end < rangeStart && !byKey.has(`${ev.id}|${start}`)) continue;
      push(ev, start, { ...ev, start_date: start, end_date: end });
    }
  }

  // Occurrences déplacées DANS la période depuis une date située hors période
  const eventsById = new Map((events ?? []).map((e) => [e.id, e]));
  for (const [key, o] of byKey) {
    if (used.has(key) || o.cancelled) continue;
    const ev = eventsById.get(o.event_id);
    if (ev && overlaps(o.start_date, o.end_date, rangeStart, rangeEnd)) push(ev, o.occurrence_date, ev);
  }

  return out.sort((a, b) =>
    a.start_date.localeCompare(b.start_date)
    || String(a.start_time ?? '').localeCompare(String(b.start_time ?? ''))
    || a.title.localeCompare(b.title, 'fr'));
}

// Répartition des éléments de la frise sur des « pistes » sans chevauchement.
// items : [{ start, end, reserve? }] (positions en jours) ; reserve (ou minSpan) :
// place minimale réservée à l'étiquette, en jours.
export function assignLanes(items, minSpan = 0) {
  const laneEnds = [];
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
  for (const item of sorted) {
    const reserveEnd = Math.max(item.end, item.start + (item.reserve ?? minSpan));
    let lane = laneEnds.findIndex((end) => end < item.start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(reserveEnd);
    } else {
      laneEnds[lane] = reserveEnd;
    }
    item.lane = lane;
  }
  return laneEnds.length;
}

export function toTimeValue(iso) {
  return toUTC(iso);
}
