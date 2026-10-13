import { describe, it, expect } from 'vitest';
import { validateEvent, buildIcs, slugify } from '../../src/lib/events.js';
import { toCsv } from '../../src/lib/csv.js';

const base = { title: 'Réunion', category_id: 'c1', start_date: '2026-05-10', end_date: '2026-05-10' };

describe('validation des événements', () => {
  it('accepte un événement correct', () => expect(validateEvent(base)).toEqual({}));
  it('exige titre, catégorie et dates', () => {
    const e = validateEvent({ title: ' ', start_date: '', end_date: '' });
    expect(Object.keys(e).sort()).toEqual(['category_id', 'end_date', 'start_date', 'title']);
  });
  it('refuse une fin avant le début', () => {
    expect(validateEvent({ ...base, end_date: '2026-05-09' }).end_date).toMatch(/précéder/);
    expect(validateEvent({ ...base, start_time: '18:00', end_time: '17:00' }).end_time).toMatch(/précéder/);
  });
  it('contrôle lien et récurrence', () => {
    expect(validateEvent({ ...base, link: 'javascript:alert(1)' }).link).toBeTruthy();
    expect(validateEvent({ ...base, recurring: true }).recurrence).toMatch(/fréquence/);
    expect(validateEvent({ ...base, end_date: '2026-05-20', recurring: true, recurrence_unit: 'week', recurrence_interval: 1 }).recurrence).toMatch(/intervalle/);
    expect(validateEvent({ ...base, recurring: true, recurrence_unit: 'year', recurrence_interval: 1, recurrence_until: '2025-01-01' }).recurrence_until).toBeTruthy();
  });
  it('n’exige pas la catégorie pour une occurrence', () => {
    expect(validateEvent({ ...base, category_id: null }, { series: false })).toEqual({});
  });
});

describe('export agenda et CSV', () => {
  it('produit un fichier iCalendar valide', () => {
    const ics = buildIcs({ id: 'x', title: 'Dîner; annuel, 2026', start_date: '2026-03-14', end_date: '2026-03-14', start_time: '19:00:00', end_time: '23:00:00', location: 'Châlons' }, { now: new Date('2026-01-01T00:00:00Z') });
    expect(ics).toContain('DTSTART;TZID=Europe/Paris:20260314T190000');
    expect(ics).toContain('SUMMARY:Dîner\\; annuel\\, 2026');
    expect(ics.split('\r\n')[0]).toBe('BEGIN:VCALENDAR');
    const allDay = buildIcs({ id: 'y', title: 'Week-end', start_date: '2026-06-06', end_date: '2026-06-07' });
    expect(allDay).toContain('DTEND;VALUE=DATE:20260608');
  });
  it('échappe le CSV et neutralise les formules', () => {
    const csv = toCsv([{ a: 'x;y', b: '=1+1', c: 'dit "oui"' }], [{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }, { key: 'c', label: 'C' }]);
    expect(csv.startsWith('\ufeffA;B;C\r\n')).toBe(true);
    expect(csv).toContain('"x;y";\'=1+1;"dit ""oui"""');
  });
  it('crée des noms de fichier propres', () => expect(slugify('Dîner de promo 225 !')).toBe('diner-de-promo-225'));
});
