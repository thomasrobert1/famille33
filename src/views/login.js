import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { field, setFieldError, clearFieldErrors, setBusy, pageHeader } from '../lib/ui.js';
import { ADMIN_IDENTIFIER } from '../lib/supabase.js';
import { login } from '../lib/session.js';
import { friendlyError } from '../lib/errors.js';

// Page d'accès à l'administration. Les visiteurs n'ont pas de compte :
// seul l'administrateur se connecte ici.
export function renderAdminLogin(container, { onSuccess }) {
  const identifier = field({
    label: 'Identifiant', name: 'identifier', required: true, autocomplete: 'username',
    autocapitalize: 'none', spellcheck: 'false', maxlength: 40, value: '',
  });
  const password = field({
    label: 'Mot de passe', name: 'password', type: 'password', required: true,
    autocomplete: 'current-password', maxlength: 128,
  });
  const toggle = h('button', {
    class: 'field__toggle', type: 'button', 'aria-pressed': 'false',
    onClick: () => {
      const visible = password.control.type === 'password';
      password.control.type = visible ? 'text' : 'password';
      toggle.setAttribute('aria-pressed', String(visible));
      toggle.textContent = visible ? 'Masquer' : 'Afficher';
    },
  }, 'Afficher');
  password.querySelector('.field__label').after(toggle);

  const formError = h('p', { class: 'form-error', role: 'alert' });
  const submit = h('button', { class: 'btn btn--primary btn--block btn--lg', type: 'submit' }, 'Se connecter');
  const form = h('form', { class: 'stack', novalidate: true }, identifier, password, formError, submit);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearFieldErrors(form);
    formError.textContent = '';
    if (!identifier.control.value.trim()) {
      setFieldError(form, 'identifier', 'Saisissez l’identifiant.');
      return identifier.control.focus();
    }
    if (!password.control.value) {
      setFieldError(form, 'password', 'Saisissez le mot de passe.');
      return password.control.focus();
    }
    setBusy(submit, true, 'Connexion…');
    try {
      await login(identifier.control.value, password.control.value);
      onSuccess();
    } catch (err) {
      formError.textContent = friendlyError(err);
      password.control.value = '';
      password.control.focus();
    } finally {
      setBusy(submit, false);
    }
  });

  container.replaceChildren(h('div', { class: 'page page--narrow' },
    pageHeader('Accès administrateur'),
    h('div', { class: 'login__card login__card--inline' },
      h('p', { class: 'lead' },
        'Cette page est réservée à l’administration du site. Les visiteurs n’ont pas besoin de compte : la consultation et le dépôt d’articles sont libres.'),
      form,
      h('p', { class: 'login__help' }, icon('info', { size: 14 }),
        ` L’identifiant est « ${ADMIN_IDENTIFIER} ». En cas d’oubli du mot de passe, il se réinitialise avec la commande npm run admin -- motdepasse.`),
      h('p', { class: 'login__links' }, h('a', { href: '#/fil' }, 'Retour au site')))));
  identifier.control.focus();
}
