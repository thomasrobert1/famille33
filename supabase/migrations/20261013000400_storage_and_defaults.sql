-- =====================================================================
-- Famille 33 — Migration 4/4 : stockage des fichiers et configuration
-- =====================================================================

-- Les photos du site sont visibles de tous : les espaces de stockage sont
-- publics en lecture. L'envoi reste contrôlé par les politiques ci-dessous.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('post-images', 'post-images', true, 10485760, array['image/jpeg', 'image/png', 'image/webp']),
  ('gallery',     'gallery',     true, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- Nettoyage des règles de l'ancienne version du site (espace réservé aux
-- membres). Sans effet sur une base neuve ; indispensable sur une base qui a
-- connu cette version, car ces règles appellent des fonctions supprimées.
drop policy if exists "f33 : lecture des fichiers par les membres" on storage.objects;
drop policy if exists "f33 : import dans son propre dossier" on storage.objects;
drop policy if exists "f33 : suppression de ses fichiers ou master" on storage.objects;
drop policy if exists "f33 : dépôt dans son propre dossier" on storage.objects;

drop policy if exists "f33 : lecture publique des fichiers" on storage.objects;
create policy "f33 : lecture publique des fichiers" on storage.objects
  for select to anon, authenticated
  using (bucket_id in ('post-images', 'gallery'));

-- Dépôt libre, borné par un débit horaire global (anti-inondation).
drop policy if exists "f33 : dépôt de fichiers" on storage.objects;
create policy "f33 : dépôt de fichiers" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id in ('post-images', 'gallery')
    and (app.is_master() or (
      select count(*) from storage.objects o
      where o.bucket_id in ('post-images', 'gallery')
        and o.created_at > now() - interval '1 hour'
    ) < app.setting_int('limits.uploads_per_hour', 400)));

drop policy if exists "f33 : suppression master" on storage.objects;
create policy "f33 : suppression master" on storage.objects
  for delete to authenticated
  using (bucket_id in ('post-images', 'gallery') and app.is_master());

-- ---------------------------------------------------------------------
-- Paramètres par défaut (Administration > Paramètres)
-- ---------------------------------------------------------------------
insert into public.site_settings (key, value, description) values
  ('site.name', '"Famille 33"', 'Nom affiché dans l''en-tête'),
  ('site.tagline', '"Tradition, transmission, camaraderie"', 'Accroche affichée en page d''accueil'),
  ('site.intro', '"Cet espace rassemble les nouvelles, les souvenirs et les rendez-vous de la Famille 33 des Arts et Métiers. Chacun peut y déposer un article en se présentant."', 'Texte d''introduction du fil'),
  ('privacy.contact', '""', 'Adresse de contact pour les questions de données personnelles'),
  ('nav.labels', '{"feed": "Fil", "gallery": "Galerie", "planning": "Planning"}', 'Libellés des onglets'),
  ('posts.open', 'true', 'Le dépôt d''articles est ouvert'),
  ('posts.require_approval', 'true', 'Les articles déposés attendent la validation de l''administrateur'),
  ('posts.page_size', '10', 'Nombre d''articles chargés à la fois'),
  ('comments.enabled', 'true', 'Les commentaires sont ouverts'),
  ('photos.open', 'true', 'Le dépôt de photos est ouvert'),
  ('photos.require_approval', 'true', 'Les photos déposées attendent la validation'),
  ('events.open', 'true', 'Le dépôt d''événements est ouvert'),
  ('events.require_approval', 'true', 'Les événements déposés attendent la validation'),
  ('limits.posts_per_hour', '30', 'Articles acceptés par heure, tous visiteurs confondus'),
  ('limits.comments_per_hour', '120', 'Commentaires acceptés par heure'),
  ('limits.photos_per_hour', '200', 'Photos acceptées par heure'),
  ('limits.events_per_hour', '30', 'Événements acceptés par heure'),
  ('limits.uploads_per_hour', '400', 'Fichiers envoyés par heure'),
  ('form.options', '{
      "regions": ["Auvergne-Rhône-Alpes", "Bourgogne-Franche-Comté", "Bretagne", "Centre-Val de Loire",
                  "Corse", "Grand Est", "Hauts-de-France", "Île-de-France", "Normandie",
                  "Nouvelle-Aquitaine", "Occitanie", "Pays de la Loire", "Provence-Alpes-Côte d''Azur",
                  "Outre-mer"],
      "countries": ["France", "Allemagne", "Belgique", "Canada", "Espagne", "États-Unis", "Italie",
                    "Luxembourg", "Maroc", "Royaume-Uni", "Suisse", "Autre"],
      "statuses": ["Étudiant", "Actif", "Entrepreneur", "Indépendant", "Retraité", "Autre"],
      "sectors": ["Aéronautique et spatial", "Automobile et mobilité", "BTP et génie civil",
                  "Conseil", "Énergie", "Enseignement et recherche", "Finance", "Industrie",
                  "Numérique", "Santé", "Secteur public et défense", "Autre"]
    }', 'Listes proposées dans le formulaire de dépôt')
on conflict (key) do nothing;

insert into public.event_categories (name, color, icon, description, sort_order) values
  ('Réunion de famille',  '#6D1A2A', 'users',     'Rencontres entre membres de la Famille 33', 10),
  ('Tradition',           '#8A6A2E', 'landmark',  'Cérémonies et temps forts de la tradition', 20),
  ('Repas et soirée',     '#14213A', 'utensils',  'Dîners, banquets, soirées', 30),
  ('Sortie',              '#2F5D50', 'mountain',  'Visites, randonnées, week-ends', 40),
  ('Vie professionnelle', '#4A4E69', 'briefcase', 'Conférences, rencontres métiers, parrainage', 50),
  ('Autre',               '#5B6270', 'calendar',  null, 90)
on conflict (name) do nothing;

insert into public.recurrence_options (label, unit, interval_count, sort_order) values
  ('Chaque semaine', 'week', 1, 10), ('Toutes les 2 semaines', 'week', 2, 20),
  ('Chaque mois', 'month', 1, 30), ('Chaque année', 'year', 1, 40)
on conflict (unit, interval_count) do nothing;

insert into public.post_categories (name, sort_order) values
  ('Nouvelles', 10), ('Carrières', 20), ('Souvenirs', 30), ('Annonces', 40)
on conflict (name) do nothing;
