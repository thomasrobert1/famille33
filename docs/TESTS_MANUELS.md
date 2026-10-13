# Procédure de test manuel

À dérouler sur le site en ligne après la mise en service, puis après chaque modification importante. Prévoyez deux navigateurs (ou une fenêtre de navigation privée) : l'un en simple visiteur, l'autre connecté en administrateur.

## 1. Consultation libre

| # | Action | Résultat attendu |
|---|--------|------------------|
| 1.1 | Ouvrir l'adresse du site en navigation privée | Le fil s'affiche sans aucune demande de connexion |
| 1.2 | Parcourir Fil, Galerie, Planning, Annuaire | Tout est consultable |
| 1.3 | Ouvrir un article, agrandir une photo | La visionneuse s'ouvre, les flèches et Échap fonctionnent |
| 1.4 | Ouvrir `#/admin` | Formulaire de connexion ; aucun contenu d'administration visible |

## 2. Dépôt d'un article par un visiteur

| # | Action | Résultat attendu |
|---|--------|------------------|
| 2.1 | « Déposer un article », envoyer le formulaire vide | Prénom, nom, bucque, promotion et numéro signalés comme obligatoires |
| 2.2 | Saisir la promotion 300, puis 139 | Message « Indiquez un nombre entier entre 140 et 250 » |
| 2.3 | Saisir une promotion valide | L'erreur disparaît ; le texte sous les numéros annonce le cousinage |
| 2.4 | Choisir le numéro 33, promotion 225 | « Vous êtes 33 ch 225 (entrée en 2025), cousin de 67 ch 225 et 133 ch 225 » |
| 2.5 | Déplier « En dire un peu plus », remplir entreprise, ville, région, pays | Champs facultatifs enregistrés |
| 2.6 | Saisir un e-mail sans cocher la case d'affichage | L'e-mail n'apparaît nulle part sur le site |
| 2.7 | Écrire un texte avec **gras**, liste et lien, onglet Aperçu | L'aperçu correspond au rendu final |
| 2.8 | Ajouter 2 ou 3 photos, puis déposer | Message de confirmation ; mention de la relecture si elle est activée |
| 2.9 | Saisir `<script>alert(1)</script>` dans le texte | Le texte s'affiche tel quel, rien ne s'exécute |
| 2.10 | Revenir au fil | L'article n'apparaît pas tant qu'il n'est pas validé |
| 2.11 | Page « Mes contributions » | L'article y figure, avec l'étiquette « En attente de validation » |

## 3. Modification par l'auteur

| # | Action | Résultat attendu |
|---|--------|------------------|
| 3.1 | « Mes contributions » › Modifier | Le formulaire s'ouvre, l'identité de l'auteur est rappelée et non modifiable |
| 3.2 | Changer le titre, enregistrer | Modification visible |
| 3.3 | Ouvrir le même article depuis un autre navigateur, chercher « Modifier » | Aucune action proposée |
| 3.4 | Ouvrir `#/fil/<identifiant>/modifier` depuis cet autre navigateur | Message « Modification impossible depuis cet appareil » |
| 3.5 | « Mes contributions » › Retirer | Confirmation demandée, puis l'article disparaît du site |
| 3.6 | « Effacer ces informations » | Le prochain dépôt repart d'un formulaire vide |

## 4. Commentaires, photos, événements

| # | Action | Résultat attendu |
|---|--------|------------------|
| 4.1 | Commenter un article sans indiquer de nom | Le nom est signalé obligatoire |
| 4.2 | Commenter avec nom, bucque et promotion | Le commentaire s'affiche signé |
| 4.3 | Galerie › « Ajouter des photos » | L'identité est demandée avant l'envoi |
| 4.4 | Envoyer un fichier qui n'est pas une image, ou de plus de 30 Mo | Message d'erreur explicite |
| 4.5 | Planning › « Ajouter un événement », date de fin avant le début | « La date de fin ne peut pas précéder la date de début » |
| 4.6 | Créer un événement récurrent mensuel | Une occurrence par mois sur la frise |

## 5. Administration

| # | Action | Résultat attendu |
|---|--------|------------------|
| 5.1 | `#/admin`, identifiant `master33` et mauvais mot de passe | « Identifiant ou mot de passe incorrect » |
| 5.2 | Se connecter avec le bon mot de passe | Tableau de bord, avec le nombre de contributions à valider |
| 5.3 | Contenus › Articles › Valider | L'article apparaît dans le fil pour les visiteurs |
| 5.4 | Masquer un article | Il disparaît pour les visiteurs ; l'action figure au Journal |
| 5.5 | Supprimer un commentaire | Suppression immédiate |
| 5.6 | Valider une photo, puis la masquer | La galerie suit |
| 5.7 | Catégories et listes : créer une catégorie d'événement avec couleur et pictogramme | Elle est proposée dans le formulaire et colorée sur la frise |
| 5.8 | Paramètres : fermer le dépôt d'articles | Le bouton « Déposer un article » devient inopérant pour les visiteurs, avec un message |
| 5.9 | Paramètres : décocher la relecture des articles | Un nouvel article apparaît aussitôt dans le fil |
| 5.10 | Paramètres : limiter les articles à 1 par heure, déposer deux articles | Le second est refusé avec un message clair |
| 5.11 | Export : contributeurs (CSV) | Le fichier s'ouvre correctement dans Excel (accents, colonnes) |
| 5.12 | Paramètres › Purger les fichiers supprimés | Message indiquant le nombre de fichiers retirés |
| 5.13 | Quitter l'administration, revenir sur `#/admin` | Connexion redemandée |

## 6. Annuaire et confidentialité

| # | Action | Résultat attendu |
|---|--------|------------------|
| 6.1 | Annuaire | Une entrée par contributeur, regroupée par promotion |
| 6.2 | Ouvrir une fiche | Informations publiées, cousinage, nombre d'articles |
| 6.3 | Vérifier une personne n'ayant pas coché l'affichage de son e-mail | Aucune adresse affichée |
| 6.4 | Rechercher par entreprise, ville, bucque | Résultats cohérents |
| 6.5 | Page Confidentialité | Accessible sans connexion, contact renseigné |

## 7. Affichage, accessibilité, domaine

| # | Action | Résultat attendu |
|---|--------|------------------|
| 7.1 | Parcourir tout le site au clavier (Tab, Entrée, Échap) | Focus visible ; menus et fenêtres utilisables |
| 7.2 | Zoom du navigateur à 200 % | Aucun contenu coupé |
| 7.3 | iPhone (Safari) et Android (Chrome) | Navigation basse, bouton de dépôt flottant, boutons faciles à toucher |
| 7.4 | Galerie sur ordinateur, tablette, téléphone | 3 photos par ligne au moins sur ordinateur et tablette, 1 sur téléphone |
| 7.5 | `https://votre-adresse` | Cadenas HTTPS ; `http://` redirige vers `https://` |
| 7.6 | Console du navigateur (F12) sur chaque page | Aucune erreur rouge |
