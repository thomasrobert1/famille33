import { describe, it, expect } from 'vitest';
import { formatEventWhen, recurrenceLabel, todayISO, addDays, diffDays, weekdayIndex, formatTime } from '../../src/lib/format.js';
import { expandEvents, nthOccurrence, assignLanes } from '../../src/lib/recurrence.js';

const ev = (o) => ({ id: 'e1', title: 'Dîner', start_time: null, end_time: null, recurrence_unit: null, recurrence_interval: null, recurrence_until: null, ...o });

describe('dates', () => {
  it('calcule sans décalage de fuseau', () => {
    expect(addDays('2026-03-28', 2)).toBe('2026-03-30'); // passage à l'heure d'été
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364);
    expect(weekdayIndex('2026-10-12')).toBe(0); // lundi
    expect(todayISO(new Date('2026-12-31T23:30:00Z'))).toBe('2027-01-01'); // heure de Paris
  });
  it('formate en français', () => {
    expect(formatTime('19:00:00')).toBe('19 h');
    expect(formatTime('08:30:00')).toBe('8 h 30');
    expect(formatEventWhen(ev({ start_date: '2026-03-14', end_date: '2026-03-14', start_time: '19:00', end_time: '23:00' })))
      .toBe('Samedi 14 mars 2026, 19 h – 23 h');
    expect(formatEventWhen(ev({ start_date: '2026-03-14', end_date: '2026-03-15' }))).toBe('Du samedi 14 mars au dimanche 15 mars 2026');
    expect(recurrenceLabel('week', 2)).toBe('Toutes les 2 semaines');
    expect(recurrenceLabel('year', 1)).toBe('Chaque année');
  });
});

describe('récurrences', () => {
  it('ramène les fins de mois au dernier jour valide', () => {
    expect(nthOccurrence('2026-01-31', 'month', 1, 1)).toBe('2026-02-28');
    expect(nthOccurrence('2026-01-31', 'month', 1, 2)).toBe('2026-03-31');
    expect(nthOccurrence('2024-02-29', 'year', 1, 1)).toBe('2025-02-28');
    expect(nthOccurrence('2024-02-29', 'year', 1, 4)).toBe('2028-02-29');
  });
  it('génère les occurrences d’une année', () => {
    const weekly = ev({ start_date: '2026-01-05', end_date: '2026-01-05', recurrence_unit: 'week', recurrence_interval: 1 });
    expect(expandEvents([weekly], [], '2026-01-01', '2026-12-31')).toHaveLength(52);
    const yearly = ev({ start_date: '2001-06-21', end_date: '2001-06-21', recurrence_unit: 'year', recurrence_interval: 1 });
    const occ = expandEvents([yearly], [], '2026-01-01', '2026-12-31');
    expect(occ.map((o) => o.start_date)).toEqual(['2026-06-21']);
  });
  it('respecte la date de fin de répétition', () => {
    const monthly = ev({ start_date: '2026-01-10', end_date: '2026-01-10', recurrence_unit: 'month', recurrence_interval: 1, recurrence_until: '2026-04-30' });
    expect(expandEvents([monthly], [], '2026-01-01', '2026-12-31')).toHaveLength(4);
  });
  it('applique les modifications et annulations d’occurrences', () => {
    const monthly = ev({ start_date: '2026-01-10', end_date: '2026-01-10', recurrence_unit: 'month', recurrence_interval: 1 });
    const overrides = [
      { event_id: 'e1', occurrence_date: '2026-02-10', cancelled: true },
      { event_id: 'e1', occurrence_date: '2026-03-10', cancelled: false, title: 'Dîner déplacé', start_date: '2026-03-12', end_date: '2026-03-12' },
    ];
    const occ = expandEvents([monthly], overrides, '2026-01-01', '2026-04-30');
    expect(occ.map((o) => o.start_date)).toEqual(['2026-01-10', '2026-03-12', '2026-04-10']);
    expect(occ[1].title).toBe('Dîner déplacé');
    expect(occ[1].occurrence_date).toBe('2026-03-10');
  });
  it('inclut les événements sur plusieurs jours qui chevauchent la période', () => {
    const e = ev({ start_date: '2025-12-30', end_date: '2026-01-02' });
    expect(expandEvents([e], [], '2026-01-01', '2026-12-31')).toHaveLength(1);
  });
  it('répartit la frise sans chevauchement', () => {
    const items = [{ start: 0, end: 5 }, { start: 3, end: 4 }, { start: 6, end: 8 }, { start: 2, end: 2, reserve: 10 }];
    const lanes = assignLanes(items);
    expect(lanes).toBe(3);
    expect(items[0].lane).not.toBe(items[1].lane);
    expect(items[2].lane).toBe(items[0].lane);
  });
});
