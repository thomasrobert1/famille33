import { h } from '../lib/dom.js';
import { setting } from '../lib/settings.js';
import { pageHeader } from '../lib/ui.js';

export function renderPrivacy(container) {
  const contact = setting('privacy.contact');
  const section = (title, ...content) => h('section', { class: 'prose-section' }, h('h2', null, title), ...content);
  container.replaceChildren(h('article', { class: 'page page--narrow prose' },
    pageHeader('Confidentialité'),
    h('p', { class: 'lead' },
      'Ce site est public : tout ce qui y est déposé peut être lu par n’importe qui, y compris par les moteurs de recherche. Voici ce que cela implique.'),
    section('Ce que vous publiez est public',
      h('p', null, 'Quand vous déposez un article, votre prénom, votre nom, votre bucque, votre numéro et votre promotion sont affichés à côté de votre texte, ainsi que les informations facultatives que vous ajoutez (entreprise, fonction, ville, région, pays). Ne publiez que ce que vous acceptez de rendre visible de tous.'),
      h('p', null, 'Votre adresse e-mail fait exception : elle n’est jamais affichée, sauf si vous cochez la case prévue à cet effet au moment du dépôt.')),
    section('Qui est responsable ?',
      h('p', null, 'L’administrateur de la Famille 33 gère le site, relit les contributions et peut retirer tout contenu.',
        contact ? [' Contact : ', h('a', { href: `mailto:${contact}` }, contact), '.'] : '')),
    section('Modifier ou retirer une contribution',
      h('p', null, 'Depuis l’appareil qui a servi au dépôt, la page « Mes contributions » permet de modifier ou de retirer vos articles. Depuis un autre appareil, ou si vous avez effacé vos données de navigation, adressez-vous à l’administrateur : il peut modifier ou supprimer n’importe quel contenu, y compris à votre demande.')),
    section('Ce qui est conservé dans votre navigateur',
      h('p', null, 'Pour vous éviter de tout ressaisir, vos informations de contributeur et les clés de modification de vos articles sont enregistrées dans votre navigateur, sur votre appareil uniquement. Elles ne sont envoyées à personne et la page « Mes contributions » permet de les effacer. Le site n’utilise ni publicité, ni mesure d’audience, ni cookie de suivi.')),
    section('Photos',
      h('p', null, 'Les photos sont réduites et réenregistrées avant l’envoi : les métadonnées des appareils, dont la position GPS, sont supprimées. N’importez que des photos que vous avez le droit de partager, et demandez l’accord des personnes reconnaissables. Toute personne figurant sur une photo peut en demander le retrait.')),
    section('Vos droits',
      h('p', null, 'Vous pouvez demander à tout moment l’accès, la rectification ou l’effacement des informations vous concernant, en vous adressant à l’administrateur. Ces droits vous sont reconnus par le RGPD. En cas de difficulté, vous pouvez saisir la CNIL (cnil.fr).')),
    section('Hébergement',
      h('p', null, 'Le site est publié par GitHub Pages ; les textes, les photos et les événements sont hébergés par Supabase, dans une région européenne. Les polices de caractères sont servies par le site lui-même.'))));
}
