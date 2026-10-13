// Composants d'interface partagés : notifications, boîtes de dialogue, menus,
// états de chargement/vides, champs de formulaire.
import { h, append, clear, uniqueId } from './dom.js';
import { icon } from './icons.js';
import { friendlyError } from './errors.js';

// --- Notifications ----------------------------------------------------------
let toastRegion;
export function toast(message, type = 'success') {
  if (!toastRegion) {
    toastRegion = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.append(toastRegion);
  }
  const el = h('div', { class: ['toast', `toast--${type}`] },
    icon(type === 'error' ? 'alert' : 'circle-check', { size: 18 }), h('span', null, message));
  toastRegion.append(el);
  setTimeout(() => el.classList.add('is-leaving'), type === 'error' ? 6000 : 3200);
  setTimeout(() => el.remove(), type === 'error' ? 6400 : 3600);
}

export function toastError(err) {
  console.error(err);
  toast(friendlyError(err), 'error');
}

// --- Boîte de dialogue modale (élément <dialog> natif) -----------------------
export function openModal({ title, content, size = 'md', onClose, actions, className } = {}) {
  const titleId = uniqueId('dlg');
  const body = h('div', { class: 'modal__body' });
  const footer = h('div', { class: 'modal__footer' });
  const dialog = h('dialog', { class: ['modal', `modal--${size}`, className], 'aria-labelledby': titleId },
    h('div', { class: 'modal__header' },
      h('h2', { id: titleId, class: 'modal__title' }, title),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Fermer', onClick: () => close() }, icon('x'))),
    body, footer);
  if (content) append(body, [content]);
  if (actions) append(footer, [actions]);
  else footer.remove();

  let closed = false;
  function close(result) {
    if (closed) return;
    closed = true;
    dialog.close();
    dialog.remove();
    onClose?.(result);
  }
  dialog.addEventListener('cancel', (e) => {
    e.preventDefault();
    close();
  });
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) close(); // clic sur le fond
  });
  document.body.append(dialog);
  dialog.showModal();
  return { dialog, body, footer, close, setTitle: (t) => { dialog.querySelector('.modal__title').textContent = t; } };
}

export function confirmDialog({ title, message, confirmLabel = 'Confirmer', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    const confirmBtn = h('button', { class: ['btn', danger ? 'btn--danger' : 'btn--primary'], type: 'button',
      onClick: () => { result = true; modal.close(); } }, confirmLabel);
    const modal = openModal({
      title,
      size: 'sm',
      content: h('p', { class: 'modal__message' }, message),
      actions: [
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => modal.close() }, 'Annuler'),
        confirmBtn,
      ],
      onClose: () => resolve(result),
    });
    confirmBtn.focus();
  });
}

// Petite boîte « choisir une option » (ex. : cette occurrence / toute la série)
export function choiceDialog({ title, message, choices }) {
  return new Promise((resolve) => {
    let result = null;
    const modal = openModal({
      title,
      size: 'sm',
      content: h('p', { class: 'modal__message' }, message),
      actions: [
        h('button', { class: 'btn btn--ghost', type: 'button', onClick: () => modal.close() }, 'Annuler'),
        ...choices.map((c) => h('button', {
          class: ['btn', c.danger ? 'btn--danger' : 'btn--secondary'], type: 'button',
          onClick: () => { result = c.value; modal.close(); },
        }, c.label)),
      ],
      onClose: () => resolve(result),
    });
  });
}

// --- Menu d'actions « … » ------------------------------------------------------
export function actionMenu(items, { label = 'Actions' } = {}) {
  const visible = items.filter(Boolean);
  if (!visible.length) return null;
  const menuId = uniqueId('menu');
  const list = h('div', { class: 'menu', id: menuId, role: 'menu', hidden: true });
  const button = h('button', {
    class: 'icon-btn icon-btn--quiet', type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    'aria-controls': menuId, 'aria-label': label,
  }, icon('ellipsis'));
  const wrapper = h('div', { class: 'menu-wrap' }, button, list);

  const close = () => {
    list.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', outside, true);
    document.removeEventListener('keydown', onKey, true);
  };
  const outside = (e) => { if (!wrapper.contains(e.target)) close(); };
  const onKey = (e) => {
    const entries = [...list.querySelectorAll('[role="menuitem"]')];
    const idx = entries.indexOf(document.activeElement);
    if (e.key === 'Escape') { close(); button.focus(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); entries[(idx + 1) % entries.length]?.focus(); }
    if (e.key === 'ArrowUp') { e.preventDefault(); entries[(idx - 1 + entries.length) % entries.length]?.focus(); }
  };
  button.addEventListener('click', () => {
    if (!list.hidden) return close();
    list.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    document.addEventListener('click', outside, true);
    document.addEventListener('keydown', onKey, true);
    list.querySelector('[role="menuitem"]')?.focus();
  });
  for (const item of visible) {
    list.append(h('button', {
      class: ['menu__item', item.danger && 'menu__item--danger'], type: 'button', role: 'menuitem',
      onClick: () => { close(); item.onClick(); },
    }, item.icon ? icon(item.icon, { size: 18 }) : null, item.label));
  }
  return wrapper;
}

// --- États ---------------------------------------------------------------------
export function loadingState(label = 'Chargement…') {
  return h('div', { class: 'state state--loading', role: 'status' },
    icon('loader', { size: 22, className: 'spin' }), h('span', null, label));
}

export function emptyState({ iconName = 'info', title, text, action }) {
  return h('div', { class: 'state state--empty' },
    h('div', { class: 'state__icon' }, icon(iconName, { size: 28 })),
    h('p', { class: 'state__title' }, title),
    text ? h('p', { class: 'state__text' }, text) : null,
    action ?? null);
}

export function errorState(err, retry) {
  return h('div', { class: 'state state--error', role: 'alert' },
    h('div', { class: 'state__icon' }, icon('alert', { size: 28 })),
    h('p', { class: 'state__title' }, friendlyError(err)),
    retry ? h('button', { class: 'btn btn--secondary', type: 'button', onClick: retry }, 'Réessayer') : null);
}

// --- Formulaires -----------------------------------------------------------------
// field({ label, name, type, value, required, hint, options, rows, ... })
export function field(opts) {
  const id = opts.id ?? uniqueId('fld');
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const common = {
    id, name: opts.name, required: opts.required, disabled: opts.disabled,
    'aria-describedby': [opts.hint ? hintId : null, errorId].filter(Boolean).join(' '),
    autocomplete: opts.autocomplete ?? 'off', maxlength: opts.maxlength, placeholder: opts.placeholder,
    inputmode: opts.inputmode, min: opts.min, max: opts.max, step: opts.step, pattern: opts.pattern,
    autocapitalize: opts.autocapitalize, spellcheck: opts.spellcheck,
  };
  let control;
  if (opts.type === 'textarea') {
    control = h('textarea', { ...common, rows: opts.rows ?? 4 });
    control.value = opts.value ?? '';
  } else if (opts.type === 'select') {
    control = h('select', common,
      opts.placeholderOption !== undefined ? h('option', { value: '' }, opts.placeholderOption) : null,
      (opts.options ?? []).map((o) => {
        const value = typeof o === 'object' ? o.value : o;
        const text = typeof o === 'object' ? o.label : o;
        return h('option', { value, selected: String(value) === String(opts.value ?? '') }, text);
      }));
  } else {
    control = h('input', { ...common, type: opts.type ?? 'text', value: opts.value ?? '' });
  }
  // L'erreur s'efface dès la première correction, sans attendre un nouvel envoi.
  control.addEventListener('input', () => {
    const box = control.closest('.field');
    if (!box?.classList.contains('has-error')) return;
    box.classList.remove('has-error');
    box.querySelector('.field__error').textContent = '';
    control.setAttribute('aria-invalid', 'false');
  });

  const wrapper = h('div', { class: ['field', opts.className] },
    h('label', { for: id, class: 'field__label' }, opts.label,
      opts.required ? h('span', { class: 'field__req', 'aria-hidden': 'true' }, ' *') : null,
      opts.required ? h('span', { class: 'visually-hidden' }, ' (obligatoire)') : null),
    opts.prefix ? h('div', { class: 'field__row' }, control, opts.prefix) : control,
    opts.hint ? h('p', { class: 'field__hint', id: hintId }, opts.hint) : null,
    h('p', { class: 'field__error', id: errorId, 'aria-live': 'polite' }));
  wrapper.control = control;
  return wrapper;
}

export function setFieldError(form, name, message) {
  const control = form.querySelector(`[name="${name}"]`);
  const wrapper = control?.closest('.field');
  if (!wrapper) return;
  wrapper.classList.toggle('has-error', Boolean(message));
  control.setAttribute('aria-invalid', message ? 'true' : 'false');
  wrapper.querySelector('.field__error').textContent = message ?? '';
}

export function clearFieldErrors(form) {
  for (const w of form.querySelectorAll('.field.has-error')) {
    w.classList.remove('has-error');
    w.querySelector('.field__error').textContent = '';
    w.querySelector('[aria-invalid]')?.setAttribute('aria-invalid', 'false');
  }
}

export function focusFirstError(form) {
  form.querySelector('.field.has-error input, .field.has-error textarea, .field.has-error select')?.focus();
}

export function setBusy(button, busy, busyLabel) {
  if (busy) {
    button.dataset.label = button.textContent;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    if (busyLabel) button.textContent = busyLabel;
  } else {
    button.disabled = false;
    button.removeAttribute('aria-busy');
    if (button.dataset.label) button.textContent = button.dataset.label;
  }
}

export function pageHeader(title, ...actions) {
  return h('header', { class: 'page-head' },
    h('h1', { class: 'page-title' }, title),
    actions.length ? h('div', { class: 'page-head__actions' }, actions) : null);
}

export function ornament() {
  return h('div', { class: 'ornament', 'aria-hidden': 'true' }, h('span'));
}

export { clear };
