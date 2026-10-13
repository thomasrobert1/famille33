// Règles des événements : validation du formulaire et export agenda (.ics).
import { addDays, diffDays, TIMEZONE } from './format.js';

const PERIOD_DAYS = { day: 1, week: 7, month: 28, year: 365 };

/**
 * Valide les valeurs du formulaire d'événement.
 * @returns {Object} { champ: message } — vide si tout est correct
 */
export function validateEvent(v, { requireCategory = true, series = true } = {}) {
  const errors = {};
  const title = String(v.title ?? '').trim();
  if (!title) errors.title = 'Donnez un titre à l’événement.';
  else if (title.length > 150) errors.title = 'Le titre ne doit pas dépasser 150 caractères.';

  if (series && requireCategory && !v.category_id) errors.category_id = 'Choisissez une catégorie.';

  if (!v.start_date) errors.start_date = 'Indiquez la date de début.';
  if (!v.end_date) errors.end_date = 'Indiquez la date de fin.';
  if (v.start_date && v.end_date) {
    if (v.end_date < v.start_date) {
      errors.end_date = 'La date de fin ne peut pas précéder la date de début.';
    } else if (v.end_date === v.start_date && v.start_time && v.end_time && v.end_time < v.start_time) {
      errors.end_time = 'L’heure de fin ne peut pas précéder l’heure de début.';
    } else if (diffDays(v.start_date, v.end_date) > 366) {
      errors.end_date = 'Un événement ne peut pas durer plus d’un an.';
    }
  }
  if (v.end_time && !v.start_time) errors.start_time = 'Indiquez aussi l’heure de début.';

  if (series) {
    if (v.link && !/^https?:\/\/[^\s]+\.[^\s]+$/i.test(v.link)) {
      errors.link = 'Saisissez une adresse complète, commençant par https://';
    }
    if (v.recurring) {
      if (!v.recurrence_unit) {
        errors.recurrence = 'Choisissez une fréquence.';
      } else if (v.start_date && v.end_date) {
        const period = PERIOD_DAYS[v.recurrence_unit] * (Number(v.recurrence_interval) || 1);
        if (diffDays(v.start_date, v.end_date) >= period) {
          errors.recurrence = 'L’événement dure plus longtemps que l’intervalle de répétition.';
        }
      }
      if (v.recurrence_until && v.start_date && v.recurrence_until < v.start_date) {
        errors.recurrence_until = 'La date de fin de répétition doit suivre la date de début.';
      }
    }
  }
  return errors;
}

// --- Export iCalendar ---------------------------------------------------------
function icsEscape(text) {
  return String(text ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1');
}

function fold(line) {
  // Lignes de 75 octets max (RFC 5545) — approximation par caractères
  const parts = [];
  for (let i = 0; i < line.length; i += 73) parts.push((i ? ' ' : '') + line.slice(i, i + 73));
  return parts.join('\r\n');
}

const compactDate = (iso) => iso.replace(/-/g, '');
const compactTime = (t) => String(t).slice(0, 5).replace(':', '') + '00';

export function buildIcs(occ, { now = new Date(), siteName = 'Famille 33' } = {}) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', `PRODID:-//${icsEscape(siteName)}//Planning//FR`, 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${occ.event?.id ?? occ.id}-${compactDate(occ.occurrence_date ?? occ.start_date)}@famille33`,
    `DTSTAMP:${stamp}`,
  ];
  if (occ.start_time) {
    lines.push(`DTSTART;TZID=${TIMEZONE}:${compactDate(occ.start_date)}T${compactTime(occ.start_time)}`);
    const endTime = occ.end_time ?? occ.start_time;
    lines.push(`DTEND;TZID=${TIMEZONE}:${compactDate(occ.end_date)}T${compactTime(endTime)}`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${compactDate(occ.start_date)}`);
    lines.push(`DTEND;VALUE=DATE:${compactDate(addDays(occ.end_date, 1))}`);
  }
  lines.push(`SUMMARY:${icsEscape(occ.title)}`);
  if (occ.location) lines.push(`LOCATION:${icsEscape(occ.location)}`);
  const description = [occ.description, occ.organizer ? `Contact : ${occ.organizer}` : null].filter(Boolean).join('\n\n');
  if (description) lines.push(`DESCRIPTION:${icsEscape(description)}`);
  if (occ.link) lines.push(`URL:${occ.link}`);
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function downloadText(filename, text, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function slugify(text) {
  return String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'evenement';
}
