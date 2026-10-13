// Identité du contributeur : champs du formulaire, validation, et mémoire
// locale pour ne pas la ressaisir à chaque dépôt.
export const FAMILY_NUMBERS = [33, 67, 133];
export const PROMO_MIN = 140;
export const PROMO_MAX = 250;
const STORAGE_KEY = 'f33.contributeur';

export const REQUIRED_FIELDS = ['first_name', 'last_name', 'number', 'promo', 'bucque'];

// Promotion PPP = année d'entrée − 1800 (Ch 225 → 2025)
export function promoYear(promo) {
  return promo ? 1800 + Number(promo) : null;
}

export function promoLabel(promo) {
  return promo ? `Ch ${promo}` : '';
}

// Les trois numéros d'une même promotion sont cousins (compléments à 100)
export function cousins(number, promo) {
  return FAMILY_NUMBERS.filter((n) => n !== Number(number)).map((n) => `${n} ch ${promo}`);
}

export function validateContributor(values) {
  const errors = {};
  if (!values.first_name?.trim()) errors.first_name = 'Indiquez votre prénom.';
  if (!values.last_name?.trim()) errors.last_name = 'Indiquez votre nom.';
  if (!FAMILY_NUMBERS.includes(Number(values.number))) errors.number = 'Choisissez 33, 67 ou 133.';
  const promo = Number(values.promo);
  if (!Number.isInteger(promo) || promo < PROMO_MIN || promo > PROMO_MAX) {
    errors.promo = `Indiquez un nombre entier entre ${PROMO_MIN} et ${PROMO_MAX}.`;
  }
  if (!values.bucque?.trim()) errors.bucque = 'Indiquez votre bucque.';
  if (values.email?.trim() && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(values.email.trim())) {
    errors.email = 'Adresse e-mail invalide, ex. prenom.nom@exemple.fr';
  }
  return errors;
}

// Les colonnes author_* attendues par la base
export function toAuthorColumns(values) {
  const text = (v) => (v?.trim() ? v.trim() : null);
  return {
    author_first_name: values.first_name.trim(),
    author_last_name: values.last_name.trim(),
    author_number: Number(values.number),
    author_promo: Number(values.promo),
    author_bucque: values.bucque.trim(),
    author_email: text(values.email),
    author_company: text(values.company),
    author_job: text(values.job),
    author_sector: text(values.sector),
    author_status: text(values.status),
    author_city: text(values.city),
    author_region: text(values.region),
    author_country: text(values.country),
    author_note: text(values.note),
    show_contact: Boolean(values.show_contact && text(values.email)),
  };
}

// Identité seule (photos et événements n'enregistrent pas les informations
// professionnelles).
export function toIdentityColumns(values) {
  return {
    author_first_name: values.first_name.trim(),
    author_last_name: values.last_name.trim(),
    author_number: Number(values.number),
    author_promo: Number(values.promo),
    author_bucque: values.bucque.trim(),
  };
}

export function authorName(row) {
  return [row.author_first_name, row.author_last_name].filter(Boolean).join(' ');
}

export function authorSignature(row) {
  const promo = row.author_promo ? `${row.author_number} ch ${row.author_promo}` : '';
  return [row.author_bucque, promo].filter(Boolean).join(', ');
}

export function initials(row) {
  const letters = `${row.author_first_name?.[0] ?? ''}${row.author_last_name?.[0] ?? ''}`;
  return letters.toUpperCase() || '?';
}

// --- Mémoire locale (uniquement sur l'appareil du visiteur) ---------------
export function savedContributor() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveContributor(values) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
  } catch {
    /* navigation privée : sans conséquence */
  }
}

export function forgetContributor() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* sans conséquence */
  }
}

// --- Jetons de modification remis aux auteurs ------------------------------
const TOKENS_KEY = 'f33.jetons';

export function savedTokens() {
  try {
    return JSON.parse(localStorage.getItem(TOKENS_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function saveToken(id, token) {
  try {
    const all = savedTokens();
    all[id] = token;
    localStorage.setItem(TOKENS_KEY, JSON.stringify(all));
  } catch {
    /* sans conséquence */
  }
}

export function tokenFor(id) {
  return savedTokens()[id] ?? null;
}

export function dropToken(id) {
  try {
    const all = savedTokens();
    delete all[id];
    localStorage.setItem(TOKENS_KEY, JSON.stringify(all));
  } catch {
    /* sans conséquence */
  }
}
