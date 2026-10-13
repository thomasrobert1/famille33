import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { field, setFieldError, clearFieldErrors, focusFirstError } from '../lib/ui.js';
import { setting } from '../lib/settings.js';
import {
  FAMILY_NUMBERS, PROMO_MIN, PROMO_MAX, validateContributor, savedContributor, saveContributor,
  forgetContributor, promoYear, cousins,
} from '../lib/contributor.js';

/**
 * Formulaire « Qui êtes-vous ? », commun au dépôt d'un article, d'une photo
 * ou d'un événement.
 * @param {Object} options
 * @param {boolean} [options.full]  inclure les informations facultatives
 * @param {boolean} [options.contact] proposer l'affichage des coordonnées
 */
export function contributorForm({ full = true, contact = true } = {}) {
  const options = setting('form.options') ?? {};
  const saved = savedContributor() ?? {};

  const firstName = field({
    label: 'Prénom', name: 'first_name', required: true, maxlength: 80,
    autocomplete: 'given-name', value: saved.first_name ?? '',
  });
  const lastName = field({
    label: 'Nom', name: 'last_name', required: true, maxlength: 80,
    autocomplete: 'family-name', value: saved.last_name ?? '',
  });
  const bucque = field({
    label: 'Bucque', name: 'bucque', required: true, maxlength: 80, value: saved.bucque ?? '',
    hint: 'Votre nom de baptême aux Arts et Métiers.',
  });
  const promo = field({
    label: 'Promotion', name: 'promo', type: 'number', required: true, inputmode: 'numeric',
    min: PROMO_MIN, max: PROMO_MAX, value: saved.promo ?? '',
    hint: `Nombre entre ${PROMO_MIN} et ${PROMO_MAX}.`,
  });

  // Numéro : trois boutons radio, plus parlants qu'une liste déroulante
  const groupName = `numero-${Math.random().toString(36).slice(2, 7)}`;
  const numberInputs = FAMILY_NUMBERS.map((n) => h('input', {
    type: 'radio', name: groupName, value: n, checked: Number(saved.number) === n,
  }));
  const numberHint = h('p', { class: 'field__hint', 'aria-live': 'polite' });
  const numberError = h('p', { class: 'field__error', 'aria-live': 'polite' });
  const numberField = h('fieldset', { class: 'fieldset number-field' },
    h('legend', null, 'Numéro', h('span', { class: 'field__req', 'aria-hidden': 'true' }, ' *'),
      h('span', { class: 'visually-hidden' }, ' (obligatoire)')),
    h('div', { class: 'number-field__choices' },
      numberInputs.map((input) => h('label', { class: 'number-chip' }, input, h('span', null, input.value)))),
    numberHint, numberError);

  const selectedNumber = () => Number(numberInputs.find((i) => i.checked)?.value) || null;
  const syncHint = () => {
    const n = selectedNumber();
    const p = Number(promo.control.value);
    if (!n || !p || p < PROMO_MIN || p > PROMO_MAX) {
      numberHint.textContent = 'Les numéros 33, 67 et 133 d’une même promotion sont cousins.';
      return;
    }
    numberHint.textContent = `Vous êtes ${n} ch ${p} (entrée en ${promoYear(p)}), cousin de ${cousins(n, p).join(' et ')}.`;
  };
  for (const input of numberInputs) input.addEventListener('change', syncHint);
  promo.control.addEventListener('input', syncHint);
  syncHint();

  const identity = h('div', { class: 'grid-2' }, firstName, lastName, bucque, promo);

  // --- Informations facultatives -------------------------------------------
  const optional = {};
  let optionalBlock = null;
  let contactCheck = null;
  if (full) {
    const list = (key) => [...(options[key] ?? [])];
    optional.email = field({
      label: 'Adresse e-mail', name: 'email', type: 'email', maxlength: 254,
      autocomplete: 'email', value: saved.email ?? '',
      hint: 'Pour que la famille puisse vous joindre. Affichée seulement si vous le demandez.',
    });
    optional.status = field({ label: 'Statut', name: 'status', type: 'select', value: saved.status ?? '', placeholderOption: 'Non précisé', options: list('statuses') });
    optional.company = field({ label: 'Entreprise', name: 'company', maxlength: 120, autocomplete: 'organization', value: saved.company ?? '' });
    optional.job = field({ label: 'Fonction ou activité', name: 'job', maxlength: 120, autocomplete: 'organization-title', value: saved.job ?? '' });
    optional.sector = field({ label: 'Secteur d’activité', name: 'sector', type: 'select', value: saved.sector ?? '', placeholderOption: 'Non précisé', options: list('sectors') });
    optional.city = field({ label: 'Ville', name: 'city', maxlength: 80, autocomplete: 'address-level2', value: saved.city ?? '' });
    optional.region = field({ label: 'Région', name: 'region', type: 'select', value: saved.region ?? '', placeholderOption: 'Non précisée', options: list('regions') });
    optional.country = field({ label: 'Pays', name: 'country', type: 'select', value: saved.country ?? 'France', placeholderOption: 'Non précisé', options: list('countries') });
    optional.note = field({
      label: 'Quelques mots sur vous', name: 'note', type: 'textarea', rows: 3, maxlength: 500,
      value: saved.note ?? '', hint: 'Centres d’intérêt, parcours, ce que vous voulez partager.',
    });

    contactCheck = contact
      ? h('input', { type: 'checkbox', name: 'show_contact', checked: Boolean(saved.show_contact) })
      : null;

    optionalBlock = h('details', { class: 'disclosure', open: Boolean(saved.company || saved.city || saved.note) },
      h('summary', { class: 'disclosure__summary' },
        'En dire un peu plus (facultatif)', icon('chevron-down', { size: 18, className: 'disclosure__chevron' })),
      h('div', { class: 'disclosure__body' },
        optional.email, optional.status, optional.company, optional.job,
        optional.sector, optional.city, optional.region, optional.country, optional.note,
        contactCheck
          ? h('label', { class: 'check check--wide' }, contactCheck,
            h('span', null, 'Afficher mon adresse e-mail dans l’annuaire, pour que la famille puisse me joindre'))
          : null));
  }

  const element = h('div', { class: 'contributor' },
    h('p', { class: 'field__hint' },
      'Ces informations apparaîtront publiquement à côté de votre contribution, sauf l’adresse e-mail, qui reste masquée si vous ne cochez pas la case.'),
    identity, numberField, optionalBlock);

  function read(form) {
    clearFieldErrors(form);
    numberError.textContent = '';
    numberField.classList.remove('has-error');
    const values = {
      first_name: firstName.control.value,
      last_name: lastName.control.value,
      bucque: bucque.control.value,
      promo: promo.control.value,
      number: selectedNumber(),
    };
    if (full) {
      for (const [key, wrapper] of Object.entries(optional)) values[key] = wrapper.control.value;
      values.show_contact = Boolean(contactCheck?.checked);
    }
    const errors = validateContributor(values);
    if (Object.keys(errors).length) {
      for (const [name, message] of Object.entries(errors)) {
        if (name === 'number') {
          numberField.classList.add('has-error');
          numberError.textContent = message;
        } else {
          setFieldError(form, name, message);
        }
      }
      if (errors.number && !form.querySelector('.field.has-error')) numberInputs[0].focus();
      else focusFirstError(form);
      return null;
    }
    saveContributor(values);
    return values;
  }

  return { element, read, forget: forgetContributor };
}
