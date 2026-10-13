import { describe, it, expect, beforeEach } from 'vitest';
import {
  validateContributor, toAuthorColumns, toIdentityColumns, authorName, authorSignature, initials,
  promoYear, cousins, saveContributor, savedContributor, forgetContributor,
  saveToken, tokenFor, dropToken, savedTokens, FAMILY_NUMBERS, PROMO_MIN, PROMO_MAX,
} from '../../src/lib/contributor.js';

const valid = { first_name: 'Camille', last_name: 'Arnaud', number: 33, promo: 225, bucque: 'Tourne-Broche' };

describe('identité du contributeur', () => {
  it('accepte une identité complète', () => expect(validateContributor(valid)).toEqual({}));

  it('exige prénom, nom, numéro, promotion et bucque', () => {
    const errors = validateContributor({});
    expect(Object.keys(errors).sort()).toEqual(['bucque', 'first_name', 'last_name', 'number', 'promo']);
  });

  it('n’accepte que les numéros 33, 67 et 133', () => {
    expect(FAMILY_NUMBERS).toEqual([33, 67, 133]);
    for (const n of FAMILY_NUMBERS) expect(validateContributor({ ...valid, number: n }).number).toBeUndefined();
    for (const n of [34, 0, 100, 333, null, 'trente-trois']) {
      expect(validateContributor({ ...valid, number: n }).number).toMatch(/33, 67 ou 133/);
    }
  });

  it('borne la promotion entre 140 et 250', () => {
    for (const p of [PROMO_MIN, 200, PROMO_MAX]) expect(validateContributor({ ...valid, promo: p }).promo).toBeUndefined();
    for (const p of [139, 251, 0, 12.5, 'abc', '']) {
      expect(validateContributor({ ...valid, promo: p }).promo).toMatch(/140 et 250/);
    }
  });

  it('refuse une bucque vide ou faite d’espaces', () => {
    expect(validateContributor({ ...valid, bucque: '   ' }).bucque).toBeTruthy();
  });

  it('contrôle l’adresse e-mail quand elle est renseignée', () => {
    expect(validateContributor({ ...valid, email: '' }).email).toBeUndefined();
    expect(validateContributor({ ...valid, email: 'a@b.fr' }).email).toBeUndefined();
    expect(validateContributor({ ...valid, email: 'pasunemail' }).email).toBeTruthy();
  });

  it('prépare les colonnes attendues par la base', () => {
    const columns = toAuthorColumns({ ...valid, company: ' Safran ', city: '', email: 'c@a.fr', show_contact: true });
    expect(columns.author_first_name).toBe('Camille');
    expect(columns.author_number).toBe(33);
    expect(columns.author_promo).toBe(225);
    expect(columns.author_company).toBe('Safran');
    expect(columns.author_city).toBeNull();
    expect(columns.show_contact).toBe(true);
    // Sans adresse e-mail, l'affichage des coordonnées n'a pas de sens
    expect(toAuthorColumns({ ...valid, show_contact: true }).show_contact).toBe(false);
    expect(Object.keys(toIdentityColumns(valid)).sort())
      .toEqual(['author_bucque', 'author_first_name', 'author_last_name', 'author_number', 'author_promo']);
  });

  it('met en forme l’auteur pour l’affichage', () => {
    const row = toAuthorColumns(valid);
    expect(authorName(row)).toBe('Camille Arnaud');
    expect(authorSignature(row)).toBe('Tourne-Broche, 33 ch 225');
    expect(initials(row)).toBe('CA');
  });

  it('calcule l’année d’entrée et le cousinage', () => {
    expect(promoYear(225)).toBe(2025);
    expect(promoYear(171)).toBe(1971);
    expect(cousins(33, 225)).toEqual(['67 ch 225', '133 ch 225']);
    expect(cousins(133, 198)).toEqual(['33 ch 198', '67 ch 198']);
  });
});

describe('mémoire de l’appareil', () => {
  beforeEach(() => localStorage.clear());

  it('retient puis oublie les informations du contributeur', () => {
    expect(savedContributor()).toBeNull();
    saveContributor(valid);
    expect(savedContributor()).toMatchObject({ bucque: 'Tourne-Broche', promo: 225 });
    forgetContributor();
    expect(savedContributor()).toBeNull();
  });

  it('conserve les clés de modification des contributions', () => {
    saveToken('post-1', 'jeton-1');
    saveToken('post-2', 'jeton-2');
    expect(tokenFor('post-1')).toBe('jeton-1');
    expect(Object.keys(savedTokens())).toEqual(['post-1', 'post-2']);
    dropToken('post-1');
    expect(tokenFor('post-1')).toBeNull();
    expect(tokenFor('post-2')).toBe('jeton-2');
  });

  it('ne casse pas si le navigateur refuse le stockage', () => {
    const original = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
    Storage.prototype.setItem = () => { throw new Error('navigation privée'); };
    expect(() => saveContributor(valid)).not.toThrow();
    expect(() => saveToken('x', 'y')).not.toThrow();
    Object.defineProperty(Storage.prototype, 'setItem', original);
  });
});
