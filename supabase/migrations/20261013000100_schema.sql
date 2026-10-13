-- =====================================================================
-- Famille 33 — Schéma de données (site public)
-- Migration 1/4 : tables, contraintes, index
-- =====================================================================
-- Principe : le site est consultable sans compte, et toute personne peut
-- déposer un article en indiquant qui elle est. Un seul compte existe,
-- « master33 », qui modère et administre.
--
-- Chaque contribution porte l'identité de son auteur (prénom, nom, numéro,
-- promotion, bucque) et un jeton secret (edit_token) qui permet à l'auteur
-- de revenir modifier ou supprimer son texte. Ce jeton n'est jamais lisible
-- par les visiteurs : il est retiré des droits de lecture (migration 3).
--
-- Les dates d'événements sont des dates civiles (heure locale, Europe/Paris) ;
-- les horodatages techniques sont en timestamptz.
-- =====================================================================

create schema if not exists app;

-- ---------------------------------------------------------------------
-- Administration : une seule ligne, le compte master
-- ---------------------------------------------------------------------
create table public.admins (
  id            uuid primary key references auth.users (id) on delete cascade,
  identifier    text not null unique check (identifier ~ '^[a-z0-9_-]{3,30}$'),
  display_name  text check (char_length(display_name) <= 80),
  last_login_at timestamptz,
  created_at    timestamptz not null default now()
);

comment on table public.admins is 'Comptes d''administration. Une seule ligne en pratique : master33.';

-- ---------------------------------------------------------------------
-- Paramètres du site
-- ---------------------------------------------------------------------
create table public.site_settings (
  key         text primary key check (key ~ '^[a-z0-9_.]{1,60}$'),
  value       jsonb not null,
  description text check (char_length(description) <= 300),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- Identité d'un contributeur, répétée sur chaque contribution.
-- Ces colonnes sont regroupées ici pour mémoire ; elles sont déclarées
-- sur chaque table car PostgreSQL n'a pas d'héritage pratique ici.
--   author_first_name   obligatoire
--   author_last_name    obligatoire
--   author_number       obligatoire : 33, 67 ou 133
--   author_promo        obligatoire : 140 à 250
--   author_bucque       obligatoire : nom de baptême aux Arts et Métiers
--   le reste est facultatif
-- ---------------------------------------------------------------------

create table public.post_categories (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (char_length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.posts (
  id          uuid primary key default gen_random_uuid(),
  edit_token  uuid not null default gen_random_uuid(),
  category_id uuid references public.post_categories (id) on delete set null,
  title       text not null check (char_length(btrim(title)) between 3 and 200),
  subtitle    text check (char_length(subtitle) <= 300),
  body        text not null default '' check (char_length(body) <= 20000),

  -- Identité de l'auteur (obligatoire)
  author_first_name text not null check (char_length(btrim(author_first_name)) between 1 and 80),
  author_last_name  text not null check (char_length(btrim(author_last_name)) between 1 and 80),
  author_number     smallint not null check (author_number in (33, 67, 133)),
  author_promo      smallint not null check (author_promo between 140 and 250),
  author_bucque     text not null check (char_length(btrim(author_bucque)) between 1 and 80),

  -- Facultatif
  author_email    text check (char_length(author_email) <= 254
                              and author_email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  author_company  text check (char_length(author_company) <= 120),
  author_job      text check (char_length(author_job) <= 120),
  author_sector   text check (char_length(author_sector) <= 80),
  author_status   text check (char_length(author_status) <= 40),
  author_city     text check (char_length(author_city) <= 80),
  author_region   text check (char_length(author_region) <= 80),
  author_country  text check (char_length(author_country) <= 80),
  author_note     text check (char_length(author_note) <= 500),
  -- Les coordonnées ne sont montrées aux visiteurs que si l'auteur l'accepte.
  show_contact    boolean not null default false,

  status     text not null default 'published' check (status in ('published', 'pending')),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search     tsvector generated always as (
               to_tsvector('french'::regconfig,
                 coalesce(title, '') || ' ' || coalesce(subtitle, '') || ' ' || coalesce(body, '')
                 || ' ' || coalesce(author_first_name, '') || ' ' || coalesce(author_last_name, '')
                 || ' ' || coalesce(author_bucque, ''))) stored
);
create index posts_created_idx on public.posts (created_at desc);
create index posts_category_idx on public.posts (category_id);
create index posts_search_idx on public.posts using gin (search);
create index posts_author_idx on public.posts (author_promo, author_number, author_bucque);
create index posts_status_idx on public.posts (status) where status = 'pending';

create table public.post_images (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid not null references public.posts (id) on delete cascade,
  path       text not null unique check (char_length(path) <= 300),
  width      integer check (width between 1 and 20000),
  height     integer check (height between 1 and 20000),
  position   smallint not null default 0,
  created_at timestamptz not null default now()
);
create index post_images_post_idx on public.post_images (post_id, position);

create table public.comments (
  id          uuid primary key default gen_random_uuid(),
  post_id     uuid not null references public.posts (id) on delete cascade,
  body        text not null check (char_length(btrim(body)) between 1 and 4000),
  author_name text not null check (char_length(btrim(author_name)) between 1 and 100),
  author_bucque text check (char_length(author_bucque) <= 80),
  author_promo  smallint check (author_promo between 140 and 250),
  is_hidden   boolean not null default false,
  created_at  timestamptz not null default now()
);
create index comments_post_idx on public.comments (post_id, created_at);

-- ---------------------------------------------------------------------
-- Galerie
-- ---------------------------------------------------------------------
create table public.albums (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(btrim(name)) between 1 and 80),
  description text check (char_length(description) <= 500),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

create table public.photos (
  id          uuid primary key default gen_random_uuid(),
  edit_token  uuid not null default gen_random_uuid(),
  path        text not null unique check (char_length(path) <= 300),
  thumb_path  text not null unique check (char_length(thumb_path) <= 300),
  width       integer check (width between 1 and 20000),
  height      integer check (height between 1 and 20000),
  caption     text check (char_length(caption) <= 500),
  album_id    uuid references public.albums (id) on delete set null,
  event_id    uuid,
  promo       smallint check (promo between 140 and 250),
  taken_on    date check (taken_on between date '1850-01-01' and date '2200-12-31'),

  author_first_name text not null check (char_length(btrim(author_first_name)) between 1 and 80),
  author_last_name  text not null check (char_length(btrim(author_last_name)) between 1 and 80),
  author_number     smallint not null check (author_number in (33, 67, 133)),
  author_promo      smallint not null check (author_promo between 140 and 250),
  author_bucque     text not null check (char_length(btrim(author_bucque)) between 1 and 80),

  status     text not null default 'published' check (status in ('published', 'pending')),
  is_hidden  boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index photos_created_idx on public.photos (created_at desc);
create index photos_album_idx on public.photos (album_id);
create index photos_event_idx on public.photos (event_id);
create index photos_taken_idx on public.photos (taken_on);

-- ---------------------------------------------------------------------
-- Planning
-- ---------------------------------------------------------------------
create table public.event_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique check (char_length(btrim(name)) between 1 and 60),
  color       text not null default '#14213A' check (color ~ '^#[0-9a-fA-F]{6}$'),
  icon        text not null default 'calendar' check (icon ~ '^[a-z0-9-]{1,40}$'),
  description text check (char_length(description) <= 300),
  sort_order  integer not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.recurrence_options (
  id             uuid primary key default gen_random_uuid(),
  label          text not null check (char_length(btrim(label)) between 1 and 60),
  unit           text not null check (unit in ('day', 'week', 'month', 'year')),
  interval_count smallint not null default 1 check (interval_count between 1 and 365),
  sort_order     integer not null default 0,
  is_active      boolean not null default true,
  created_at     timestamptz not null default now(),
  unique (unit, interval_count)
);

create table public.events (
  id                  uuid primary key default gen_random_uuid(),
  edit_token          uuid not null default gen_random_uuid(),
  category_id         uuid references public.event_categories (id) on delete set null,
  title               text not null check (char_length(btrim(title)) between 3 and 150),
  description         text check (char_length(description) <= 5000),
  start_date          date not null,
  start_time          time,
  end_date            date not null,
  end_time            time,
  location            text check (char_length(location) <= 200),
  organizer           text check (char_length(organizer) <= 200),
  link                text check (char_length(link) <= 500 and link ~* '^https?://[^[:space:]]+$'),
  recurrence_unit     text check (recurrence_unit in ('day', 'week', 'month', 'year')),
  recurrence_interval smallint check (recurrence_interval between 1 and 365),
  recurrence_until    date,

  author_first_name text not null check (char_length(btrim(author_first_name)) between 1 and 80),
  author_last_name  text not null check (char_length(btrim(author_last_name)) between 1 and 80),
  author_number     smallint not null check (author_number in (33, 67, 133)),
  author_promo      smallint not null check (author_promo between 140 and 250),
  author_bucque     text not null check (char_length(btrim(author_bucque)) between 1 and 80),

  status     text not null default 'published' check (status in ('published', 'pending')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint events_dates_order check (
    end_date > start_date
    or (end_date = start_date and (start_time is null or end_time is null or end_time >= start_time))),
  constraint events_recurrence_pair check ((recurrence_unit is null) = (recurrence_interval is null)),
  constraint events_recurrence_until check (
    recurrence_until is null or (recurrence_unit is not null and recurrence_until >= start_date)),
  constraint events_year_range check (start_date between date '1900-01-01' and date '2200-12-31'
                                      and end_date <= start_date + 366)
);
create index events_start_idx on public.events (start_date);
create index events_end_idx on public.events (end_date);
create index events_recurring_idx on public.events (recurrence_unit) where recurrence_unit is not null;
create index events_status_idx on public.events (status) where status = 'pending';

alter table public.photos
  add constraint photos_event_fk foreign key (event_id) references public.events (id) on delete set null;

create table public.event_overrides (
  event_id        uuid not null references public.events (id) on delete cascade,
  occurrence_date date not null,
  cancelled       boolean not null default false,
  title           text check (char_length(btrim(title)) between 1 and 150),
  description     text check (char_length(description) <= 5000),
  start_date      date,
  start_time      time,
  end_date        date,
  end_time        time,
  location        text check (char_length(location) <= 200),
  updated_at      timestamptz not null default now(),
  primary key (event_id, occurrence_date),
  constraint overrides_complete check (
    cancelled or (title is not null and start_date is not null and end_date is not null)),
  constraint overrides_dates_order check (
    end_date is null or start_date is null or end_date > start_date
    or (end_date = start_date and (start_time is null or end_time is null or end_time >= start_time)))
);

-- ---------------------------------------------------------------------
-- Journal d'administration
-- ---------------------------------------------------------------------
create table public.audit_logs (
  id         bigint generated always as identity primary key,
  actor      text,
  action     text not null check (char_length(action) <= 60),
  entity     text not null check (char_length(entity) <= 60),
  entity_id  text check (char_length(entity_id) <= 100),
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);

-- ---------------------------------------------------------------------
-- Fichiers des contenus supprimés, en attente de purge
-- ---------------------------------------------------------------------
create table public.storage_trash (
  id         bigint generated always as identity primary key,
  bucket     text not null,
  path       text not null,
  created_at timestamptz not null default now()
);
