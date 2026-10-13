import { h } from '../lib/dom.js';
import { icon } from '../lib/icons.js';
import { supabase } from '../lib/supabase.js';
import { savedTokens, dropToken, savedContributor, forgetContributor } from '../lib/contributor.js';
import { formatDateTime } from '../lib/format.js';
import { pageHeader, loadingState, emptyState, errorState, confirmDialog, toast, toastError } from '../lib/ui.js';
import { removeFiles } from '../lib/storage.js';

// Les contributions déposées depuis cet appareil. Les jetons sont conservés
// par le navigateur : rien n'est enregistré ailleurs, et un autre appareil
// n'a pas accès à cette liste.
export async function renderMyContributions(container) {
  const page = h('div', { class: 'page page--narrow' }, loadingState());
  container.replaceChildren(page);

  async function load() {
    const tokens = savedTokens();
    const ids = Object.keys(tokens);
    const identity = savedContributor();
    const header = pageHeader('Mes contributions');

    if (!ids.length) {
      page.replaceChildren(header, emptyState({
        iconName: 'scroll',
        title: 'Aucune contribution depuis cet appareil.',
        text: 'Les articles que vous déposez apparaissent ici, et vous pouvez les modifier tant que vous utilisez le même appareil et le même navigateur.',
        action: h('a', { class: 'btn btn--primary', href: '#/deposer' }, 'Déposer un article'),
      }), identityCard(identity));
      return;
    }

    // Les articles en attente ne sont pas visibles du public : on les retrouve
    // en présentant les jetons conservés par ce navigateur.
    const { data, error } = await supabase.rpc('my_posts', { p_tokens: Object.values(tokens) });
    if (error) return page.replaceChildren(header, errorState(error, load));

    // Un article supprimé par l'administrateur n'a plus à encombrer la liste.
    const found = new Set((data ?? []).map((p) => p.id));
    for (const id of ids) if (!found.has(id)) dropToken(id);

    page.replaceChildren(header,
      h('p', { class: 'lead' },
        'Ces articles ont été déposés depuis cet appareil. Vous pouvez les modifier ou les retirer tant que vous utilisez le même navigateur.'),
      data.length
        ? h('ul', { class: 'contrib-list' }, data.map((post) => contributionRow(post, load)))
        : emptyState({ iconName: 'scroll', title: 'Vos articles ne sont plus en ligne.' }),
      identityCard(identity));
  }

  function contributionRow(post, reload) {
    const state = post.is_hidden
      ? { label: 'Masqué par l’administrateur', tone: 'warning' }
      : post.status === 'pending'
        ? { label: 'En attente de validation', tone: 'warning' }
        : { label: 'En ligne', tone: 'ok' };
    return h('li', { class: 'contrib' },
      h('div', { class: 'contrib__text' },
        h('a', { class: 'contrib__title', href: `#/fil/${post.id}` }, post.title),
        h('p', { class: 'muted' }, `Déposé le ${formatDateTime(post.created_at)}`),
        h('span', { class: `tag tag--${state.tone}` }, state.label)),
      h('div', { class: 'contrib__actions' },
        h('a', { class: 'btn btn--secondary btn--sm', href: `#/fil/${post.id}/modifier` }, icon('pencil', { size: 16 }), 'Modifier'),
        h('button', {
          class: 'btn btn--ghost btn--sm btn--danger-text', type: 'button',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'Retirer cet article ?',
              message: `« ${post.title} » sera supprimé définitivement, avec ses photos et ses commentaires.`,
              confirmLabel: 'Retirer', danger: true,
            });
            if (!ok) return;
            const token = savedTokens()[post.id];
            const { data, error } = await supabase.rpc('delete_post_with_token', { p_id: post.id, p_token: token });
            if (error) return toastError(error);
            if (!data) return toast('Ce lien de modification n’est plus valable.', 'error');
            await removeFiles('post-images', post.image_paths ?? []);
            dropToken(post.id);
            toast('Article retiré.');
            reload();
          },
        }, icon('trash', { size: 16 }), 'Retirer')));
  }

  function identityCard(identity) {
    if (!identity) return null;
    return h('section', { class: 'panel' },
      h('h2', { class: 'section-title' }, 'Informations retenues sur cet appareil'),
      h('p', { class: 'muted' },
        `${[identity.first_name, identity.last_name].filter(Boolean).join(' ')} — ${identity.bucque}, ${identity.number} ch ${identity.promo}. Elles sont proposées par défaut lors de votre prochain dépôt, et ne sont conservées que dans ce navigateur.`),
      h('div', null, h('button', {
        class: 'btn btn--ghost btn--sm', type: 'button',
        onClick: () => { forgetContributor(); toast('Informations effacées de cet appareil.'); load(); },
      }, icon('trash', { size: 16 }), 'Effacer ces informations')));
  }

  await load();
}
