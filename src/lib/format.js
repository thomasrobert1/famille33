// Dates et heures — affichage français, fuseau Europe/Paris.
// Les dates d'événements (« YYYY-MM-DD ») sont des dates civiles : elles sont
// manipulées en UTC pour éviter tout décalage dû au fuseau du navigateur.
export const TIMEZONE = 'Europe/Paris';

const cacheFmt = new Map();
function fmt(locale, options) {
  const key = locale + JSON.stringify(options);
  if (!cacheFmt.has(key)) cacheFmt.set(key, new Intl.DateTimeFormat(locale, options));
  return cacheFmt.get(key);
}

const capitalize = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// --- Horodatages (timestamptz) --------------------------------------------
export function formatDateTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const date = fmt('fr-FR', { timeZone: TIMEZONE, day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  const time = fmt('fr-FR', { timeZone: TIMEZONE, hour: '2-digit', minute: '2-digit' }).format(d);
  return `${date} à ${time}`;
}

export function formatShortDate(ts) {
  if (!ts) return '';
  return fmt('fr-FR', { timeZone: TIMEZONE, day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(ts));
}

export function formatRelative(ts, now = Date.now()) {
  if (!ts) return '';
  const diff = (now - new Date(ts).getTime()) / 1000;
  if (diff < 0 || diff > 6 * 86400) return formatDateTime(ts);
  if (diff < 60) return 'à l’instant';
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  if (diff < 3600) return rtf.format(-Math.floor(diff / 60), 'minute');
  if (diff < 86400) return rtf.format(-Math.floor(diff / 3600), 'hour');
  return rtf.format(-Math.floor(diff / 86400), 'day');
}

// --- Dates civiles (YYYY-MM-DD) --------------------------------------------
export function todayISO(now = new Date()) {
  return fmt('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

export function parseISO(iso) {
  const [y, m, d] = String(iso).split('-').map(Number);
  return { y, m, d };
}

export function toUTC(iso) {
  const { y, m, d } = parseISO(iso);
  return Date.UTC(y, m - 1, d);
}

export function fromUTC(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isoDate(y, m, d) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function addDays(iso, n) {
  return fromUTC(toUTC(iso) + n * 86400000);
}

export function diffDays(a, b) {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function isLeapYear(y) {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInYear(y) {
  return isLeapYear(y) ? 366 : 365;
}

export function dayOfYear(iso) {
  const { y } = parseISO(iso);
  return diffDays(isoDate(y, 1, 1), iso);
}

// Lundi = 0 … dimanche = 6
export function weekdayIndex(iso) {
  return (new Date(toUTC(iso)).getUTCDay() + 6) % 7;
}

export function formatDay(iso, { weekday = true, year = true, month = 'long' } = {}) {
  const opts = { timeZone: 'UTC', day: 'numeric', month };
  if (weekday) opts.weekday = 'long';
  if (year) opts.year = 'numeric';
  return fmt('fr-FR', opts).format(new Date(toUTC(iso)));
}

export const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];
export const MONTHS_SHORT = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août',
  'sept.', 'oct.', 'nov.', 'déc.'];
export const WEEKDAYS_SHORT = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

export function formatTime(t) {
  if (!t) return '';
  const [hh, mm] = String(t).split(':');
  return mm === '00' ? `${Number(hh)} h` : `${Number(hh)} h ${mm}`;
}

// « Samedi 14 mars 2026, 19 h – 23 h » / « Du samedi 14 au dimanche 15 mars 2026 »
export function formatEventWhen(ev) {
  const sameDay = ev.start_date === ev.end_date;
  if (sameDay) {
    let text = capitalize(formatDay(ev.start_date));
    if (ev.start_time && ev.end_time) text += `, ${formatTime(ev.start_time)} – ${formatTime(ev.end_time)}`;
    else if (ev.start_time) text += `, ${formatTime(ev.start_time)}`;
    return text;
  }
  const s = parseISO(ev.start_date);
  const e = parseISO(ev.end_date);
  const startText = formatDay(ev.start_date, { year: s.y !== e.y });
  const endText = formatDay(ev.end_date);
  const startTime = ev.start_time ? `, ${formatTime(ev.start_time)},` : '';
  const endTime = ev.end_time ? `, ${formatTime(ev.end_time)}` : '';
  return `Du ${startText}${startTime} au ${endText}${endTime}`;
}

export function recurrenceLabel(unit, interval) {
  if (!unit) return '';
  const n = Number(interval) || 1;
  if (n === 1) return { day: 'Tous les jours', week: 'Chaque semaine', month: 'Chaque mois', year: 'Chaque année' }[unit];
  return { day: `Tous les ${n} jours`, week: `Toutes les ${n} semaines`, month: `Tous les ${n} mois`, year: `Tous les ${n} ans` }[unit];
}

export function fileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}
