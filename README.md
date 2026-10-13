# Famille 33 — espace public des Arts et Métiers

Site communautaire de la Famille 33 : fil d'actualités, galerie photographique, planning annuel et annuaire. Le site est **public** : il se consulte sans compte, et toute personne peut y déposer un article en se présentant (prénom, nom, numéro, promotion, bucque). Un seul compte existe, **`master33`**, qui modère et administre.

- **Fil** : articles avec titre, sous-titre, texte mis en forme, photos, rubriques, recherche et commentaires signés.
- **Dépôt libre** : chaque contribution porte l'identité de son auteur. Les informations professionnelles et géographiques sont facultatives ; l'adresse e-mail n'est affichée que si l'auteur le demande.
- **Galerie** : photos réduites et nettoyées de leurs métadonnées GPS dans le navigateur, albums, filtres par année, album ou événement, visionneuse plein écran.
- **Planning** : frise annuelle en forme de réglet gradué, agenda, vue mensuelle, événements sur plusieurs jours, récurrences, export vers l'agenda du téléphone.
- **Annuaire** : construit automatiquement à partir des articles déposés, une entrée par personne.
- **Administration** : relecture et validation des contributions, modération, catégories, paramètres, limites de dépôt, journal et exports.

---

## 1. Architecture et choix techniques

| Élément | Choix | Pourquoi |
|---|---|---|
| Interface | HTML, CSS et JavaScript modulaire, compilés par **Vite** (sans framework) | Peu de dépendances, code lisible, maintenance facile sur plusieurs années |
| Hébergement | **GitHub Pages**, publié par GitHub Actions | Gratuit, HTTPS, domaine personnalisé, aucun serveur à administrer |
| Base de données | **Supabase PostgreSQL** avec **Row Level Security** sur chaque table | Lecture publique, dépôt encadré et administration réservée sont décidés par la base, pas par l'interface |
| Administration | **Supabase Auth** pour le seul compte `master33` | Mot de passe vérifié et conservé chiffré chez Supabase, qui limite les tentatives |
| Fichiers | **Supabase Storage**, deux espaces publics en lecture | Le site étant public, les photos n'ont pas besoin d'URL signées |
| Polices | Grenze Gotisch (titres) et Atkinson Hyperlegible Next (textes), **hébergées par le site** | Lisibilité pour tous les âges ; aucune requête vers Google Fonts (RGPD) |
| Navigation | Adresses de la forme `/#/fil` | Fonctionne sur GitHub Pages sans configuration serveur |

### Qui peut faire quoi

| | Visiteur | Administrateur (`master33`) |
|---|---|---|
| Lire le site | oui | oui |
| Déposer article, photo, événement, commentaire | oui | oui |
| Modifier ou retirer **sa propre** contribution | oui, depuis l'appareil du dépôt | — |
| Valider, masquer, modifier, supprimer **toute** contribution | non | oui |
| Catégories, albums, paramètres, limites, exports | non | oui |

### L'identité des contributeurs

Chaque contribution porte cinq informations obligatoires : prénom, nom, numéro (33, 67 ou 133), promotion (nombre entre 140 et 250) et bucque. S'y ajoutent, au choix de l'auteur : e-mail, statut, entreprise, fonction, secteur, ville, région, pays et quelques mots de présentation.

La base refuse toute contribution dont l'identité est incomplète ou hors de ces bornes : ce n'est pas seulement un contrôle à l'écran. La promotion suit la convention des Arts et Métiers (Ch 225 = entrée en 2025), et les numéros 33, 67 et 133 d'une même promotion sont cousins, ce que le formulaire rappelle à la saisie.

### Comment un auteur retrouve sa contribution

Il n'y a pas de compte pour les visiteurs. Au moment du dépôt, le navigateur tire une clé aléatoire, l'envoie avec l'article et la conserve sur l'appareil. Cette clé permet ensuite de modifier ou de retirer l'article depuis la page « Mes contributions », et elle permet aussi d'y voir un article encore en attente de validation, que le public ne voit pas.

Cette clé n'est lisible par personne d'autre : la colonne qui la contient est exclue des droits de lecture, y compris pour un compte connecté. Conséquence à connaître : en changeant d'appareil ou en effaçant les données de navigation, l'auteur perd cette possibilité. L'administrateur peut alors intervenir à sa place.

### Garde-fous contre les abus

Le dépôt étant ouvert à tous, quatre protections se combinent :

- **relecture avant publication**, activée par défaut pour les articles, les photos et les événements ;
- **limites horaires** sur chaque type de contribution et sur les envois de fichiers, réglables dans l'administration ;
- **fermeture possible** de chaque type de dépôt, sans toucher au code ;
- **modération complète** par l'administrateur : masquer, modifier, supprimer.

### Arborescence

```
├── index.html                  Page unique (politique de sécurité du contenu incluse)
├── public/favicon.svg
├── src/
│   ├── main.js                 Routes et session d'administration
│   ├── styles/main.css         Identité graphique complète
│   ├── components/             Emblème, structure de page, visionneuse, formulaire d'identité
│   ├── lib/                    Utilitaires : contributeur, stockage, dates, récurrences,
│   │                           Markdown sécurisé, validation, export CSV/iCalendar…
│   └── views/                  Pages : fil, article, dépôt, galerie, planning, annuaire,
│       └── admin/              mes contributions, confidentialité, administration
├── scripts/
│   ├── admin.mjs               Compte d'administration (npm run admin)
│   └── build-preview.mjs       Aperçu hors ligne (npm run apercu)
├── supabase/migrations/        Schéma, fonctions, règles d'accès, stockage, paramètres
├── tests/
│   ├── unit/                   Tests Vitest (identité, Markdown, dates, récurrences…)
│   ├── sql/                    Tests des règles d'accès sur PostgreSQL local
│   └── e2e/                    Parcours du site dans Chromium (faux Supabase)
├── docs/TESTS_MANUELS.md       Procédure de recette
└── .github/workflows/deploy.yml
```

### Modèle de données

| Table | Contenu | Accès |
|---|---|---|
| `posts` | Articles et identité de leur auteur | Lecture publique des articles publiés ; dépôt libre ; modification par la clé de l'auteur ou par l'administrateur |
| `post_images`, `comments` | Photos et commentaires d'un article | Idem, commentaires signés d'un nom |
| `photos`, `albums` | Galerie | Idem |
| `events`, `event_overrides` | Planning ; une ligne d'`event_overrides` modifie ou annule une seule date d'une série | Idem |
| `post_categories`, `event_categories`, `recurrence_options` | Listes administrables | Lecture publique, écriture administrateur |
| `site_settings` | Textes, libellés, règles de contribution, limites, listes du formulaire | Lecture publique, écriture administrateur |
| `admins` | Le compte d'administration | Lecture par lui-même |
| `audit_logs` | Journal des actions d'administration | Lecture administrateur ; écriture par la base |
| `storage_trash` | Fichiers à purger | Aucun accès depuis le navigateur |

Une conséquence à connaître si vous modifiez le code : un dépôt ne doit jamais demander à la base de renvoyer la ligne créée (`.select()` après un `insert`). Une contribution en attente de validation est invisible du public, et PostgreSQL refuse alors l'opération entière. Le navigateur tire donc lui-même l'identifiant avant d'envoyer la contribution. Un test le vérifie.

Des déclencheurs empêchent un visiteur de publier sans relecture, de masquer un contenu, de modifier l'identité d'un auteur ou les dates techniques, et placent les fichiers des contenus supprimés dans une file de purge.

---

## 2. Lancer le site

**`index.html` ne s'ouvre pas d'un double-clic** : c'est le point d'entrée du code source, que Vite doit compiler. Deux façons de voir le site.

Prérequis : **Node.js 20.19 ou plus récent** (version LTS sur nodejs.org). Ouvrez un terminal **dans le dossier du projet** (celui qui contient `package.json`), puis `npm install`.

### 2.1 Aperçu hors ligne, sans Supabase

```bash
npm run apercu
```

Ouvrez ensuite `apercu/famille33-apercu.html` d'un double-clic. Les données sont fictives, tout est en mémoire. Pour voir l'administration : identifiant `master33`, n'importe quel mot de passe. Ce fichier sert à la démonstration : ne le publiez pas.

### 2.2 Développement avec votre projet Supabase

```bash
cp .env.example .env.local      # Windows : copy .env.example .env.local
# renseignez VITE_SUPABASE_URL et VITE_SUPABASE_ANON_KEY
npm run dev
```

Ouvrez l'adresse affichée, en général http://localhost:5173.

### 2.3 Dépannage

| Symptôme | Cause et solution |
|---|---|
| Page bloquée sur « Chargement… » | `index.html` ouvert directement. Utilisez `npm run dev` ou l'aperçu. |
| `'vite' n'est pas reconnu` | Dépendances non installées : `npm install`. |
| « npm n'est pas reconnu » | Node.js absent : installez la version LTS, puis rouvrez le terminal. |
| « Could not read package.json » | Le terminal n'est pas dans le dossier `famille33`. |
| « Configuration incomplète » | `.env.local` absent ou incomplet. Corrigez, puis relancez `npm run dev`. |
| « Identifiant ou mot de passe incorrect » | Le compte d'administration n'existe pas encore (section 3.4). |
| « Clé refusée par Supabase » | `SUPABASE_SERVICE_KEY` contient la clé publique, ou vient d'un autre projet. Les deux formats sont acceptés : `ey…` (service_role) et `sb_secret_…` (clé secrète). |

---

## 3. Configuration de Supabase

### 3.1 Créer le projet

1. Sur supabase.com, créez un projet **dans une région européenne** (Paris ou Francfort). Conservez le mot de passe de la base dans un gestionnaire de mots de passe.
2. **Authentication › Sign In / Providers** : laissez le fournisseur **Email** activé et **désactivez « Allow new users to sign up »**. Les visiteurs n'ont pas de compte, et personne ne doit pouvoir en créer un.
3. Relevez l'**URL du projet** et la **clé publique** (bouton **Connect**, ou Project Settings › API Keys).

### 3.2 Appliquer le schéma

```bash
npx supabase login
npx supabase link --project-ref VOTRE_REF
npx supabase db push
```

À défaut : copiez le contenu de chaque fichier de `supabase/migrations/`, dans l'ordre des noms, dans **SQL Editor › New query**.

Si la base porte déjà d'anciennes migrations et que `db push` répond « Remote migration versions not found », repartez d'une base vide avec `npx supabase db reset --linked`, ou créez un nouveau projet.

Vérifiez ensuite dans **Table Editor** la présence de `posts`, `photos`, `events` et `admins`, et dans **Storage** les espaces `post-images` et `gallery`, marqués publics.

### 3.3 Renseigner la configuration locale

```bash
cp .env.example .env.local
```

```bash
VITE_SUPABASE_URL=https://VOTRE_REF.supabase.co
VITE_SUPABASE_ANON_KEY=VOTRE_CLE_PUBLIQUE
SUPABASE_SERVICE_KEY=VOTRE_CLE_SERVICE_ROLE
```

Les deux premières valeurs sont publiques : elles figurent aussi dans les variables GitHub. La troisième est **secrète** ; elle ne sert qu'au script d'administration, sur votre ordinateur, et `.gitignore` empêche sa publication.

### 3.4 Créer le compte d'administration

```bash
npm run admin -- creer
```

Le script demande le mot de passe **à la saisie** : il n'apparaît ni à l'écran, ni dans l'historique du terminal, ni dans le dépôt. Seule son empreinte chiffrée existe, chez Supabase. Minimum 12 caractères.

```bash
npm run admin -- motdepasse    # changer le mot de passe
npm run admin -- etat          # vérifier le compte et compter les contributions
```

Connectez-vous ensuite sur le site, menu « … » › **Accès administrateur** (adresse `#/admin`), avec l'identifiant `master33`.

---

## 4. Publication sur GitHub et domaine personnalisé

### 4.1 Dépôt et déploiement automatique

1. Créez un dépôt GitHub **public** (le code ne contient aucun secret) et poussez le projet :
   ```bash
   git init && git add . && git commit -m "Famille 33 : première version"
   git branch -M main
   git remote add origin https://github.com/VOTRE_COMPTE/famille33.git
   git push -u origin main
   ```
2. **Settings › Pages › Build and deployment › Source : GitHub Actions**.
3. **Settings › Secrets and variables › Actions › onglet Variables** : créez `VITE_SUPABASE_URL` et `VITE_SUPABASE_ANON_KEY`. N'y mettez jamais `SUPABASE_SERVICE_KEY`.
4. Chaque `push` sur `main` lance `.github/workflows/deploy.yml` : tests unitaires, tests des règles d'accès sur un PostgreSQL éphémère, compilation, puis publication. Une erreur de test bloque la mise en ligne.

GitHub Pages sur un dépôt privé nécessite un abonnement payant ; sinon, utilisez un dépôt public.

### 4.2 Domaine personnalisé

1. Chez votre registraire, créez les enregistrements DNS :
   - domaine nu : **A** vers `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`, et **AAAA** vers `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` ;
   - sous-domaine `www` : **CNAME** vers `VOTRE_COMPTE.github.io`.
2. **Settings › Pages › Custom domain** : saisissez le domaine, puis cochez **Enforce HTTPS** dès que le certificat est prêt (jusqu'à 24 h).
3. Recommandé : vérifiez le domaine dans les paramètres de votre compte GitHub (enregistrement TXT), pour empêcher qu'un tiers ne le réutilise.

Si vous utilisez un domaine personnalisé pour Supabase, ajoutez-le aux directives `img-src` et `connect-src` de `index.html`.

---

## 5. Tests

| Commande | Ce qui est vérifié | Prérequis |
|---|---|---|
| `npm test` | 40 tests : le script d'administration face à un faux serveur Supabase, et identité du contributeur (numéros, promotions, bucque), rendu Markdown et injections, dates et fuseau, récurrences, validation des événements, exports | Node.js |
| `npm run test:sql` | 89 tests des règles d'accès : lecture publique, dépôt libre, statut imposé, clé de modification illisible, limites horaires, séparation visiteur/administrateur, droits du rôle de maintenance | PostgreSQL 15+ local |
| `npm run test:e2e` | Parcours complet du site dans Chromium, sur ordinateur et téléphone, avec un faux Supabase en mémoire ; échoue à la moindre erreur JavaScript ; captures dans `tests/e2e/screenshots/` | Python 3, `pip install playwright` puis `playwright install chromium` |

Après la mise en service, déroulez aussi `docs/TESTS_MANUELS.md` sur le site en ligne.

---

## 6. Sauvegarde et restauration

- **Base de données** :
  ```bash
  npx supabase db dump --linked -f sauvegarde-schema.sql
  npx supabase db dump --linked --data-only -f sauvegarde-donnees-$(date +%F).sql
  ```
- **Photos** : téléchargez périodiquement les espaces de stockage depuis l'interface Supabase.
- **Exports** : Administration › Export fournit contributeurs, articles, événements, photos et journal (CSV/JSON).
- Conservez ces fichiers hors du dépôt GitHub : ils contiennent des données personnelles. Le `.gitignore` exclut déjà `*.csv` et `exports/`.
- Les sauvegardes automatiques et la mise en veille des projets inactifs dépendent de votre formule Supabase ; vérifiez les conditions sur supabase.com/pricing.

---

## 7. Données personnelles (RGPD)

Le site étant public, **tout ce qui y est déposé est lisible par n'importe qui**, moteurs de recherche compris. Cela mérite d'être dit clairement aux membres avant qu'ils ne publient.

- Les contributions affichent le prénom, le nom, la bucque, le numéro et la promotion de leur auteur, plus ce qu'il a choisi d'ajouter.
- L'adresse e-mail fait exception : elle reste masquée tant que l'auteur ne coche pas la case prévue.
- Les métadonnées des photos (dont la position GPS) sont supprimées avant l'envoi.
- La page **Confidentialité** informe les visiteurs ; complétez l'adresse de contact dans Administration › Paramètres.
- Toute personne peut demander la rectification ou la suppression de ce qui la concerne ; l'administrateur peut modifier ou supprimer n'importe quel contenu.
- La relecture avant publication, activée par défaut, est votre principale protection : elle vous laisse écarter une publication inappropriée avant qu'elle ne soit visible.
- À faire par l'association : tenir un registre simple des traitements et rappeler aux contributeurs de n'importer que des photos qu'ils ont le droit de partager.

---

## 8. Maintenance

- **Modifier le schéma** : ajoutez un fichier `supabase/migrations/AAAAMMJJHHMMSS_description.sql` (ne modifiez jamais une migration appliquée), ajoutez les tests dans `tests/sql/rls_test.sql`, puis `npx supabase db push`.
- **Toute nouvelle table** doit recevoir `enable row level security` et des politiques explicites.
- **Dépendances** : `npm outdated`, puis `npm update` et relance de tous les tests.
- **Textes, onglets, catégories, listes, limites** : modifiables sans code dans l'administration.

---

## 9. Éléments restant à configurer manuellement

- [ ] Créer le projet Supabase en région européenne et fermer l'inscription libre (3.1)
- [ ] Appliquer les migrations (3.2)
- [ ] Renseigner `.env.local` (3.3)
- [ ] Créer le compte d'administration et noter son mot de passe (3.4)
- [ ] Créer le dépôt GitHub, activer Pages, définir les deux variables publiques (4.1)
- [ ] Configurer le DNS, le domaine personnalisé et HTTPS (4.2)
- [ ] Renseigner l'adresse de contact « données personnelles » (Administration › Paramètres)
- [ ] Ajuster catégories, albums, listes et limites (Administration)
- [ ] Dérouler `docs/TESTS_MANUELS.md` sur le site en ligne
- [ ] Mettre en place les sauvegardes (section 6)

---

## 10. Limites connues

- **Dépôt anonyme** : rien ne prouve qu'un contributeur est bien la personne qu'il déclare être. La relecture avant publication est la réponse prévue ; laissez-la activée.
- **Changement d'appareil** : un auteur qui change de navigateur ou efface ses données perd la possibilité de modifier ses contributions. L'administrateur prend le relais.
- **Limites horaires globales** : elles comptent toutes les contributions, sans distinguer les visiteurs. Un afflux légitime peut donc être freiné ; les seuils se relèvent dans l'administration.
- **En-têtes de sécurité** : GitHub Pages ne permet pas d'ajouter des en-têtes HTTP ; la politique de sécurité du contenu est déclarée dans `index.html`.
- **Corbeille** : non implémentée ; le masquage sert de mise à l'écart réversible, la suppression est définitive.
- **Notifications** (e-mail, push) : non incluses. Pensez à consulter le tableau de bord régulièrement pour traiter les contributions en attente.
- **Avertissements de l'analyseur Supabase** : l'onglet Advisors signale les fonctions « SECURITY DEFINER » appelables sans connexion. C'est voulu : ce sont celles qui font vivre un site public (annuaire, retrouver ses contributions par clé, modifier son article). Chacune vérifie elle-même ce qu'elle a le droit de renvoyer, et les tests de `npm run test:sql` le contrôlent. Ces lignes resteront affichées.
- **Photos HEIC** : acceptées si le navigateur sait les lire ; les iPhone convertissent généralement en JPEG à l'envoi.
