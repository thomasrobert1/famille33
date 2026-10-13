-- =====================================================================
-- Famille 33 — Migration 3/4 : Row Level Security et privilèges
-- =====================================================================
-- Le site est public en lecture. Les visiteurs peuvent déposer des
-- contributions, mais ne peuvent ni les modifier ni en supprimer
-- directement : la modification passe par le jeton remis à l'auteur
-- (fonctions *_with_token), la modération par le compte master.
-- =====================================================================

alter table public.admins             enable row level security;
alter table public.site_settings      enable row level security;
alter table public.post_categories    enable row level security;
alter table public.posts              enable row level security;
alter table public.post_images        enable row level security;
alter table public.comments           enable row level security;
alter table public.albums             enable row level security;
alter table public.photos             enable row level security;
alter table public.event_categories   enable row level security;
alter table public.recurrence_options enable row level security;
alter table public.events             enable row level security;
alter table public.event_overrides    enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.storage_trash      enable row level security;  -- aucune politique : service_role seul

grant usage on schema app to anon, authenticated, service_role;
grant execute on all functions in schema app to anon, authenticated, service_role;

-- Point de départ : plus aucun droit pour les visiteurs, puis on accorde
-- précisément ce qui est nécessaire.
revoke all on all tables in schema public from anon, authenticated;

-- Lecture publique
grant select on public.site_settings, public.post_categories, public.albums,
                 public.event_categories, public.recurrence_options,
                 public.post_images, public.comments, public.event_overrides
  to anon, authenticated;

-- Les contributions sont lisibles SAUF leur jeton secret : il est exclu des
-- colonnes accordées, donc invisible dans toute requête d'un visiteur.
grant select (id, category_id, title, subtitle, body, author_first_name, author_last_name,
              author_number, author_promo, author_bucque, author_email, author_company,
              author_job, author_sector, author_status, author_city, author_region,
              author_country, author_note, show_contact, status, is_hidden, created_at, updated_at)
  on public.posts to anon, authenticated;
grant select (id, path, thumb_path, width, height, caption, album_id, event_id, promo, taken_on,
              author_first_name, author_last_name, author_number, author_promo, author_bucque,
              status, is_hidden, created_at, updated_at)
  on public.photos to anon, authenticated;
grant select (id, category_id, title, description, start_date, start_time, end_date, end_time,
              location, organizer, link, recurrence_unit, recurrence_interval, recurrence_until,
              author_first_name, author_last_name, author_number, author_promo, author_bucque,
              status, created_at, updated_at)
  on public.events to anon, authenticated;

-- Dépôt de contributions
grant insert on public.posts, public.post_images, public.comments, public.photos, public.events
  to anon, authenticated;

-- Le master, une fois connecté, administre tout. Les trois tables portant un
-- jeton reçoivent l'écriture mais PAS de select global : la lecture reste
-- limitée aux colonnes accordées plus haut, pour que le jeton d'un auteur ne
-- soit lisible par personne, pas même par un compte connecté.
grant insert, update, delete on public.posts, public.photos, public.events to authenticated;
grant select, insert, update, delete on public.post_images, public.comments,
  public.event_overrides, public.post_categories, public.albums,
  public.event_categories, public.recurrence_options, public.site_settings to authenticated;
grant select on public.audit_logs, public.admins to authenticated;

grant execute on function public.contributors(text) to anon, authenticated;
grant execute on function public.my_posts(uuid[]) to anon, authenticated;
grant execute on function public.update_post_with_token(uuid, uuid, text, text, text, uuid) to anon, authenticated;
grant execute on function public.delete_post_with_token(uuid, uuid) to anon, authenticated;
grant execute on function public.delete_photo_with_token(uuid, uuid) to anon, authenticated;
grant execute on function public.delete_event_with_token(uuid, uuid) to anon, authenticated;
revoke execute on function public.admin_touch_login() from anon;
grant execute on function public.admin_touch_login() to authenticated;
revoke execute on function public.admin_storage_trash() from anon;
grant execute on function public.admin_storage_trash() to authenticated;
revoke execute on function public.admin_storage_trash_clear(bigint[]) from anon;
grant execute on function public.admin_storage_trash_clear(bigint[]) to authenticated;

-- ---------------------------------------------------------------------
-- Politiques
-- ---------------------------------------------------------------------
create policy "admins : se lire soi-même" on public.admins
  for select to authenticated using (id = (select auth.uid()));

create policy "paramètres : lecture publique" on public.site_settings
  for select to anon, authenticated using (true);
create policy "paramètres : écriture master" on public.site_settings
  for all to authenticated using (app.is_master()) with check (app.is_master());

-- Référentiels
create policy "rubriques : lecture publique" on public.post_categories
  for select to anon, authenticated using (true);
create policy "rubriques : master" on public.post_categories
  for all to authenticated using (app.is_master()) with check (app.is_master());
create policy "albums : lecture publique" on public.albums
  for select to anon, authenticated using (true);
create policy "albums : master" on public.albums
  for all to authenticated using (app.is_master()) with check (app.is_master());
create policy "catégories d'événements : lecture publique" on public.event_categories
  for select to anon, authenticated using (true);
create policy "catégories d'événements : master" on public.event_categories
  for all to authenticated using (app.is_master()) with check (app.is_master());
create policy "fréquences : lecture publique" on public.recurrence_options
  for select to anon, authenticated using (true);
create policy "fréquences : master" on public.recurrence_options
  for all to authenticated using (app.is_master()) with check (app.is_master());

-- Articles
create policy "articles : lecture publique" on public.posts
  for select to anon, authenticated
  using ((status = 'published' and not is_hidden) or app.is_master());
create policy "articles : dépôt libre" on public.posts
  for insert to anon, authenticated
  with check (app.setting_bool('posts.open', true) and app.under_rate_limit('posts'));
create policy "articles : modification master" on public.posts
  for update to authenticated using (app.is_master()) with check (app.is_master());
create policy "articles : suppression master" on public.posts
  for delete to authenticated using (app.is_master());

create policy "images d'articles : lecture publique" on public.post_images
  for select to anon, authenticated
  using (exists (select 1 from public.posts p where p.id = post_id));
create policy "images d'articles : ajout" on public.post_images
  for insert to anon, authenticated
  with check (exists (select 1 from public.posts p
                      where p.id = post_id and p.created_at > now() - interval '1 hour')
              or app.is_master());
create policy "images d'articles : master" on public.post_images
  for all to authenticated using (app.is_master()) with check (app.is_master());

create policy "commentaires : lecture publique" on public.comments
  for select to anon, authenticated
  using ((not is_hidden and exists (select 1 from public.posts p where p.id = post_id)) or app.is_master());
create policy "commentaires : dépôt libre" on public.comments
  for insert to anon, authenticated
  with check (app.setting_bool('comments.enabled', true)
              and app.under_rate_limit('comments')
              and exists (select 1 from public.posts p
                          where p.id = post_id and p.status = 'published' and not p.is_hidden));
create policy "commentaires : master" on public.comments
  for all to authenticated using (app.is_master()) with check (app.is_master());

-- Photos
create policy "photos : lecture publique" on public.photos
  for select to anon, authenticated
  using ((status = 'published' and not is_hidden) or app.is_master());
create policy "photos : dépôt libre" on public.photos
  for insert to anon, authenticated
  with check (app.setting_bool('photos.open', true) and app.under_rate_limit('photos'));
create policy "photos : master" on public.photos
  for all to authenticated using (app.is_master()) with check (app.is_master());

-- Événements
create policy "événements : lecture publique" on public.events
  for select to anon, authenticated
  using (status = 'published' or app.is_master());
create policy "événements : dépôt libre" on public.events
  for insert to anon, authenticated
  with check (app.setting_bool('events.open', true) and app.under_rate_limit('events'));
create policy "événements : master" on public.events
  for all to authenticated using (app.is_master()) with check (app.is_master());

create policy "occurrences : lecture publique" on public.event_overrides
  for select to anon, authenticated
  using (exists (select 1 from public.events e where e.id = event_id));
create policy "occurrences : master" on public.event_overrides
  for all to authenticated using (app.is_master()) with check (app.is_master());

-- Journal
create policy "journal : lecture master" on public.audit_logs
  for select to authenticated using (app.is_master());
