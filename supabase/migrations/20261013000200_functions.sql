-- =====================================================================
-- Famille 33 — Migration 2/4 : fonctions, triggers, RPC
-- =====================================================================

-- ---------------------------------------------------------------------
-- Rôle administrateur
-- ---------------------------------------------------------------------
create or replace function app.is_master()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.admins a where a.id = (select auth.uid()));
$$;

-- Vrai pour les opérations de maintenance : service_role (scripts, sauvegardes)
-- et éditeur SQL. Les visiteurs arrivent toujours avec le rôle anon, et le
-- master avec le rôle authenticated.
-- On lit le paramètre « role » et non current_user : à l'intérieur d'une
-- fonction SECURITY DEFINER, current_user désigne le propriétaire de la
-- fonction, ce qui accorderait les droits de maintenance à tout le monde.
create or replace function app.is_privileged()
returns boolean
language sql stable
as $$
  select coalesce(current_setting('role', true), 'none') not in ('anon', 'authenticated');
$$;

create or replace function app.setting_bool(p_key text, p_default boolean)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select case when jsonb_typeof(s.value) = 'boolean' then s.value::boolean end
       from public.site_settings s where s.key = p_key),
    p_default);
$$;

create or replace function app.setting_int(p_key text, p_default integer)
returns integer
language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select case when jsonb_typeof(s.value) = 'number' then s.value::integer end
       from public.site_settings s where s.key = p_key),
    p_default);
$$;

-- ---------------------------------------------------------------------
-- Garde-fous contre les abus
-- ---------------------------------------------------------------------
-- Le site accepte les dépôts sans compte : on limite le débit global de
-- chaque type de contribution sur une heure glissante. Les seuils sont
-- réglables dans Administration > Paramètres.
create or replace function app.under_rate_limit(p_table text)
returns boolean
language plpgsql stable security definer set search_path = ''
as $$
declare
  recent integer;
  maximum integer := app.setting_int('limits.' || p_table || '_per_hour',
                                     case p_table when 'posts' then 30
                                                  when 'comments' then 120
                                                  when 'photos' then 200
                                                  else 30 end);
begin
  if app.is_master() or app.is_privileged() then
    return true;
  end if;
  execute format('select count(*) from public.%I where created_at > now() - interval ''1 hour''', p_table)
    into recent;
  return recent < maximum;
end;
$$;

-- Les contributions des visiteurs sont publiées ou mises en attente selon
-- le réglage du master, qui seul peut masquer ou valider.
create or replace function app.guard_contribution()
returns trigger
language plpgsql
as $$
declare
  setting_key text := tg_argv[0];
begin
  if app.is_master() or app.is_privileged() then
    if tg_op = 'UPDATE' then
      new.created_at := old.created_at;
      new.edit_token := old.edit_token;
    end if;
    new.updated_at := now();
    return new;
  end if;

  -- La table events n'a pas de colonne is_hidden : on ne la touche que
  -- lorsqu'elle existe.
  if tg_op = 'INSERT' then
    new.status := case when app.setting_bool(setting_key, false) then 'pending' else 'published' end;
    if to_jsonb(new) ? 'is_hidden' then
      new := jsonb_populate_record(new, '{"is_hidden": false}'::jsonb);
    end if;
    new.created_at := now();
    new.updated_at := now();
  else
    -- Modification par l'auteur (via son jeton) : identité, statut et dates
    -- techniques restent ceux de l'enregistrement d'origine.
    new.status := old.status;
    if to_jsonb(new) ? 'is_hidden' then
      new := jsonb_populate_record(new, jsonb_build_object('is_hidden', to_jsonb(old) -> 'is_hidden'));
    end if;
    new.edit_token := old.edit_token;
    new.created_at := old.created_at;
    new.updated_at := now();
    new.author_first_name := old.author_first_name;
    new.author_last_name := old.author_last_name;
    new.author_number := old.author_number;
    new.author_promo := old.author_promo;
    new.author_bucque := old.author_bucque;
  end if;
  return new;
end;
$$;

create or replace function app.guard_comment()
returns trigger
language plpgsql
as $$
begin
  if not (app.is_master() or app.is_privileged()) then
    new.is_hidden := false;
    new.created_at := now();
  end if;
  return new;
end;
$$;

create or replace function app.touch_updated_at()
returns trigger
language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function app.reset_event_overrides()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (new.start_date, new.recurrence_unit, new.recurrence_interval)
     is distinct from (old.start_date, old.recurrence_unit, old.recurrence_interval) then
    delete from public.event_overrides where event_id = new.id;
  end if;
  return null;
end;
$$;

create or replace function app.limit_post_images()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.post_images where post_id = new.post_id) >= 10 then
    raise exception using errcode = 'P0001',
      message = 'Une publication peut contenir au maximum 10 photos.';
  end if;
  return new;
end;
$$;

create or replace function app.trash_files()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  i integer;
  old_path text;
begin
  for i in 1 .. tg_nargs - 1 loop
    old_path := to_jsonb(old) ->> tg_argv[i];
    if old_path is not null then
      insert into public.storage_trash (bucket, path) values (tg_argv[0], old_path);
    end if;
  end loop;
  return null;
end;
$$;

-- Journal : actions du master sur les contenus et la configuration
create or replace function app.audit_master_action()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  rec jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  changed text[];
begin
  if not app.is_master() then
    return null;
  end if;
  if tg_op = 'UPDATE' then
    select array_agg(n.key order by n.key) into changed
    from jsonb_each(to_jsonb(new)) n
    where n.key not in ('updated_at', 'search')
      and (to_jsonb(old) -> n.key) is distinct from n.value;
    if changed is null then
      return null;
    end if;
  end if;
  insert into public.audit_logs (actor, action, entity, entity_id, details)
  select a.identifier, lower(tg_op), tg_table_name,
         coalesce(rec ->> 'id', rec ->> 'key', rec ->> 'event_id'),
         jsonb_strip_nulls(jsonb_build_object(
           'label', coalesce(rec ->> 'title', rec ->> 'name', rec ->> 'label', rec ->> 'key',
                             left(rec ->> 'body', 60), rec ->> 'caption'),
           'fields', to_jsonb(changed),
           'value', case when tg_table_name = 'site_settings' then rec -> 'value' end))
  from public.admins a where a.id = (select auth.uid());
  return null;
end;
$$;

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create trigger posts_guard before insert or update on public.posts
  for each row execute function app.guard_contribution('posts.require_approval');
create trigger photos_guard before insert or update on public.photos
  for each row execute function app.guard_contribution('photos.require_approval');
create trigger events_guard before insert or update on public.events
  for each row execute function app.guard_contribution('events.require_approval');
create trigger comments_guard before insert or update on public.comments
  for each row execute function app.guard_comment();

create trigger events_reset_overrides after update on public.events
  for each row execute function app.reset_event_overrides();
create trigger event_overrides_touch before update on public.event_overrides
  for each row execute function app.touch_updated_at();
create trigger post_images_limit before insert on public.post_images
  for each row execute function app.limit_post_images();
create trigger site_settings_touch before update on public.site_settings
  for each row execute function app.touch_updated_at();

create trigger post_images_trash after delete on public.post_images
  for each row execute function app.trash_files('post-images', 'path');
create trigger photos_trash after delete on public.photos
  for each row execute function app.trash_files('gallery', 'path', 'thumb_path');

create trigger posts_audit after update or delete on public.posts
  for each row execute function app.audit_master_action();
create trigger comments_audit after update or delete on public.comments
  for each row execute function app.audit_master_action();
create trigger photos_audit after update or delete on public.photos
  for each row execute function app.audit_master_action();
create trigger events_audit after update or delete on public.events
  for each row execute function app.audit_master_action();
create trigger post_categories_audit after insert or update or delete on public.post_categories
  for each row execute function app.audit_master_action();
create trigger albums_audit after insert or update or delete on public.albums
  for each row execute function app.audit_master_action();
create trigger event_categories_audit after insert or update or delete on public.event_categories
  for each row execute function app.audit_master_action();
create trigger recurrence_options_audit after insert or update or delete on public.recurrence_options
  for each row execute function app.audit_master_action();
create trigger site_settings_audit after insert or update or delete on public.site_settings
  for each row execute function app.audit_master_action();

-- ---------------------------------------------------------------------
-- Modification et suppression par l'auteur, au moyen de son jeton
-- ---------------------------------------------------------------------
-- Le jeton est remis à l'auteur au moment du dépôt (lien « Modifier »).
-- Ces fonctions sont les seules à pouvoir l'utiliser : la colonne elle-même
-- n'est jamais lisible par les visiteurs.

create or replace function public.update_post_with_token(
  p_id uuid, p_token uuid, p_title text, p_subtitle text, p_body text, p_category_id uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  ok boolean;
begin
  update public.posts
     set title = p_title, subtitle = p_subtitle, body = p_body, category_id = p_category_id
   where id = p_id and edit_token = p_token
  returning true into ok;
  return coalesce(ok, false);
end;
$$;

create or replace function public.delete_post_with_token(p_id uuid, p_token uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  ok boolean;
begin
  delete from public.posts where id = p_id and edit_token = p_token returning true into ok;
  return coalesce(ok, false);
end;
$$;

create or replace function public.delete_photo_with_token(p_id uuid, p_token uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  ok boolean;
begin
  delete from public.photos where id = p_id and edit_token = p_token returning true into ok;
  return coalesce(ok, false);
end;
$$;

create or replace function public.delete_event_with_token(p_id uuid, p_token uuid)
returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  ok boolean;
begin
  delete from public.events where id = p_id and edit_token = p_token returning true into ok;
  return coalesce(ok, false);
end;
$$;

-- Retrouver ses propres contributions, y compris celles qui attendent la
-- validation : elles sont invisibles au public, mais leur auteur les retrouve
-- en présentant les jetons conservés par son navigateur.
create or replace function public.my_posts(p_tokens uuid[])
returns table (
  id uuid, title text, status text, is_hidden boolean, created_at timestamptz, image_paths text[])
language sql stable security definer set search_path = ''
as $$
  select p.id, p.title, p.status, p.is_hidden, p.created_at,
         coalesce(array_agg(i.path) filter (where i.path is not null), '{}')
  from public.posts p
  left join public.post_images i on i.post_id = p.id
  where p.edit_token = any (p_tokens)
  group by p.id, p.title, p.status, p.is_hidden, p.created_at
  order by p.created_at desc
  limit 200;
$$;

-- ---------------------------------------------------------------------
-- Annuaire des contributeurs
-- ---------------------------------------------------------------------
-- Construit à partir des articles publiés : une entrée par personne
-- (numéro + promotion + bucque), avec les informations de sa contribution
-- la plus récente. Les coordonnées n'apparaissent que si l'auteur a coché
-- « afficher mes coordonnées ».
create or replace function public.contributors(p_query text default null)
returns table (
  first_name text, last_name text, bucque text, number smallint, promo smallint,
  company text, job text, sector text, status text, city text, region text, country text,
  note text, email text, posts_count bigint, last_post_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  with ranked as (
    select p.*, row_number() over (
             partition by p.author_number, p.author_promo, lower(btrim(p.author_bucque))
             order by p.created_at desc) as rn,
           count(*) over (
             partition by p.author_number, p.author_promo, lower(btrim(p.author_bucque))) as total,
           max(p.created_at) over (
             partition by p.author_number, p.author_promo, lower(btrim(p.author_bucque))) as last_at
    from public.posts p
    where p.status = 'published' and not p.is_hidden
  )
  select r.author_first_name, r.author_last_name, r.author_bucque, r.author_number, r.author_promo,
         r.author_company, r.author_job, r.author_sector, r.author_status,
         r.author_city, r.author_region, r.author_country, r.author_note,
         case when r.show_contact then r.author_email end,
         r.total, r.last_at
  from ranked r
  where r.rn = 1
    and (btrim(coalesce(p_query, '')) = ''
         or concat_ws(' ', r.author_first_name, r.author_last_name, r.author_bucque,
                      r.author_company, r.author_job, r.author_sector, r.author_city,
                      r.author_region, r.author_country)
            ilike '%' || replace(replace(replace(btrim(p_query), '\', '\\'), '%', '\%'), '_', '\_') || '%')
  order by r.author_promo desc, r.author_number, lower(r.author_bucque)
  limit 2000;
$$;

-- ---------------------------------------------------------------------
-- Administration
-- ---------------------------------------------------------------------
create or replace function public.admin_touch_login()
returns void
language sql security definer set search_path = ''
as $$
  update public.admins set last_login_at = now() where id = (select auth.uid());
$$;

create or replace function public.admin_storage_trash()
returns table (id bigint, bucket text, path text)
language sql security definer set search_path = ''
as $$
  select t.id, t.bucket, t.path from public.storage_trash t
  where app.is_master() order by t.id limit 500;
$$;

create or replace function public.admin_storage_trash_clear(p_ids bigint[])
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  removed integer;
begin
  if not app.is_master() then
    raise exception using errcode = '42501', message = 'Action réservée à l’administrateur.';
  end if;
  delete from public.storage_trash where id = any (p_ids);
  get diagnostics removed = row_count;
  if removed > 0 then
    insert into public.audit_logs (actor, action, entity, details)
    select a.identifier, 'purge_storage', 'storage', jsonb_build_object('files', removed)
    from public.admins a where a.id = (select auth.uid());
  end if;
  return removed;
end;
$$;
