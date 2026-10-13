-- =====================================================================
-- Tests des politiques d'accès du site public.
-- Exécution : tests/sql/run_rls_tests.sh (PostgreSQL local).
-- =====================================================================
\set QUIET on
\pset format unaligned
\pset tuples_only on

create schema if not exists t;
create table t.results (n serial, label text, got text, expected text, ok boolean);
grant usage on schema t to anon, authenticated, service_role;
grant all on t.results to anon, authenticated, service_role;
grant usage, select on sequence t.results_n_seq to anon, authenticated, service_role;

create function t.try(p_sql text) returns text language plpgsql as $$
declare n integer;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return 'ok:' || n;
exception when others then
  return 'err';
end $$;
create function t.val(p_sql text) returns text language plpgsql as $$
declare v text;
begin
  execute p_sql into v;
  return coalesce(v, '∅');
exception when others then
  return 'err';
end $$;
create function t.check(p_label text, p_got text, p_expected text) returns void language sql as $$
  insert into t.results (label, got, expected, ok) values (p_label, p_got, p_expected, p_got = p_expected);
$$;
create function t.as_user(p_uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    case when p_uid is null then '' else json_build_object('sub', p_uid)::text end, false);
$$;
grant execute on all functions in schema t to anon, authenticated, service_role;

-- Compte d'administration
insert into auth.users (id, email) values ('00000000-0000-0000-0000-00000000000a', 'master33@x');
insert into public.admins (id, identifier, display_name)
  values ('00000000-0000-0000-0000-00000000000a', 'master33', 'Administration');

-- Publication déjà en ligne, déposée par un visiteur
insert into public.posts (id, title, body, author_first_name, author_last_name, author_number,
                          author_promo, author_bucque, author_email, author_company, show_contact, status)
values ('10000000-0000-0000-0000-000000000001', 'Retour sur le dîner', 'Texte',
        'Camille', 'Arnaud', 33, 225, 'Tourne-Broche', 'camille@exemple.fr', 'Safran', true, 'published');

-- ---------------------------------------------------------------------
-- Contraintes d'identité du formulaire
-- ---------------------------------------------------------------------
select t.check('numéro hors 33/67/133 refusé', t.try($$insert into public.posts (title, body, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('Titre', '', 'A', 'B', 34, 225, 'Bucque')$$), 'err');
select t.check('promotion sous 140 refusée', t.try($$insert into public.posts (title, body, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('Titre', '', 'A', 'B', 33, 139, 'Bucque')$$), 'err');
select t.check('promotion au-dessus de 250 refusée', t.try($$insert into public.posts (title, body, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('Titre', '', 'A', 'B', 33, 251, 'Bucque')$$), 'err');
select t.check('bucque obligatoire', t.try($$insert into public.posts (title, body, author_first_name, author_last_name, author_number, author_promo) values ('Titre', '', 'A', 'B', 33, 225)$$), 'err');
select t.check('bucque vide refusée', t.try($$insert into public.posts (title, body, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('Titre', '', 'A', 'B', 33, 225, '   ')$$), 'err');
select t.check('prénom obligatoire', t.try($$insert into public.posts (title, body, author_last_name, author_number, author_promo, author_bucque) values ('Titre', '', 'B', 33, 225, 'Bucque')$$), 'err');
select t.check('titre trop court refusé', t.try($$insert into public.posts (title, body, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('ab', '', 'A', 'B', 33, 225, 'Bucque')$$), 'err');
select t.check('adresse e-mail invalide refusée', t.try($$insert into public.posts (title, body, author_first_name, author_last_name, author_number, author_promo, author_bucque, author_email) values ('Titre', '', 'A', 'B', 33, 225, 'Bucque', 'pasunemail')$$), 'err');

-- ---------------------------------------------------------------------
-- Visiteur non connecté
-- ---------------------------------------------------------------------
set role anon;
select t.as_user(null);
select t.check('visiteur : lit les articles publiés', t.val($$select title from public.posts where id = '10000000-0000-0000-0000-000000000001'$$), 'Retour sur le dîner');
select t.check('visiteur : lit les paramètres du site', t.val($$select (count(*) > 5)::text from public.site_settings$$), 'true');
select t.check('visiteur : lit l''annuaire des contributeurs', t.val($$select bucque from public.contributors()$$), 'Tourne-Broche');
select t.check('visiteur : le jeton de modification est illisible', t.try($$select edit_token from public.posts$$), 'err');
select t.check('visiteur : jeton illisible même via select *', t.try($$select * from public.posts$$), 'err');
select t.check('visiteur : journal inaccessible', t.try('select * from public.audit_logs'), 'err');
select t.check('visiteur : liste des administrateurs inaccessible', t.try('select * from public.admins'), 'err');
select t.check('visiteur : file de purge inaccessible', t.try('select * from public.storage_trash'), 'err');

-- Dépôt d'un article
select t.check('visiteur : dépose un article', t.try($$insert into public.posts (id, title, body, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('10000000-0000-0000-0000-000000000002', 'Nouvelle publication', 'Bonjour', 'Hugo', 'Bellec', 67, 224, 'Fend-la-Bise')$$), 'ok:1');
reset role;
select t.check('article déposé : mis en attente de validation', t.val($$select status from public.posts where id = '10000000-0000-0000-0000-000000000002'$$), 'pending');
set role anon;
select t.as_user(null);
select t.check('visiteur : ne voit pas un article en attente', t.val($$select count(*)::text from public.posts where id = '10000000-0000-0000-0000-000000000002'$$), '0');
select t.check('visiteur : ne force pas la publication', t.try($$insert into public.posts (id, title, body, author_first_name, author_last_name, author_number, author_promo, author_bucque, status, is_hidden) values ('10000000-0000-0000-0000-000000000003', 'Tentative', '', 'X', 'Y', 33, 200, 'Bucque', 'published', false)$$), 'ok:1');
reset role;
select t.check('statut forcé à « en attente »', t.val($$select status from public.posts where id = '10000000-0000-0000-0000-000000000003'$$), 'pending');
set role anon;
select t.as_user(null);

-- Un dépôt ne doit jamais relire la ligne créée : en attente de validation,
-- elle est invisible du public, et PostgreSQL refuse alors INSERT ... RETURNING.
-- Le site tire donc lui-même l'identifiant avant d'envoyer la contribution.
select t.check('dépôt avec relecture de la ligne : refusé', t.try($$insert into public.posts (title, body, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('Avec retour', '', 'A', 'B', 33, 225, 'Bucque') returning id$$), 'err');
select t.check('dépôt avec identifiant fourni : accepté', t.try($$insert into public.posts (id, title, body, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('10000000-0000-0000-0000-00000000000a', 'Identifiant fourni', '', 'A', 'B', 33, 225, 'Bucque')$$), 'ok:1');
select t.check('photo : identifiant fourni accepté', t.try($$insert into public.photos (id, path, thumb_path, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('30000000-0000-0000-0000-00000000000a', 'gal/x.jpg', 'gal/x_t.jpg', 'A', 'B', 33, 225, 'Bucque')$$), 'ok:1');
select t.check('événement : identifiant fourni accepté', t.try($$insert into public.events (id, title, start_date, end_date, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('20000000-0000-0000-0000-00000000000a', 'Événement', '2026-07-01', '2026-07-01', 'A', 'B', 33, 225, 'Bucque')$$), 'ok:1');

-- Modification et suppression
select t.check('visiteur : ne modifie pas un article', t.try($$update public.posts set title = 'Piraté' where id = '10000000-0000-0000-0000-000000000001'$$), 'err');
select t.check('visiteur : ne supprime pas un article', t.try($$delete from public.posts where id = '10000000-0000-0000-0000-000000000001'$$), 'err');
select t.check('visiteur : ne modifie pas les paramètres', t.try($$update public.site_settings set value = 'false' where key = 'comments.enabled'$$), 'err');
select t.check('visiteur : ne crée pas de catégorie', t.try($$insert into public.event_categories (name) values ('Pirate')$$), 'err');
select t.check('visiteur : ne masque pas un article', t.try($$update public.posts set is_hidden = true$$), 'err');

-- Commentaires
select t.check('visiteur : commente un article publié', t.try($$insert into public.comments (id, post_id, body, author_name, author_bucque, author_promo) values ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Bravo !', 'Inès Carrel', 'Perce-Neige', 225)$$), 'ok:1');
select t.check('visiteur : ne commente pas un article en attente', t.try($$insert into public.comments (post_id, body, author_name) values ('10000000-0000-0000-0000-000000000002', 'x', 'Anonyme')$$), 'err');
select t.check('visiteur : commentaire vide refusé', t.try($$insert into public.comments (post_id, body, author_name) values ('10000000-0000-0000-0000-000000000001', '   ', 'Anonyme')$$), 'err');
select t.check('visiteur : nom obligatoire sur un commentaire', t.try($$insert into public.comments (post_id, body) values ('10000000-0000-0000-0000-000000000001', 'Bonjour')$$), 'err');

-- Photos et événements
select t.check('visiteur : dépose une photo', t.try($$insert into public.photos (id, path, thumb_path, caption, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('30000000-0000-0000-0000-000000000001', 'gal/a.jpg', 'gal/a_t.jpg', 'Souvenir', 'Camille', 'Arnaud', 33, 225, 'Tourne-Broche')$$), 'ok:1');
select t.check('visiteur : photo sans identité refusée', t.try($$insert into public.photos (path, thumb_path) values ('gal/b.jpg', 'gal/b_t.jpg')$$), 'err');
select t.check('visiteur : propose un événement', t.try($$insert into public.events (id, title, start_date, end_date, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('20000000-0000-0000-0000-000000000001', 'Dîner annuel', '2026-03-14', '2026-03-14', 'Hugo', 'Bellec', 67, 224, 'Fend-la-Bise')$$), 'ok:1');
select t.check('visiteur : date de fin avant le début refusée', t.try($$insert into public.events (title, start_date, end_date, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('Test', '2026-05-10', '2026-05-09', 'A', 'B', 33, 225, 'Bucque')$$), 'err');
select t.check('visiteur : lien non http refusé', t.try($$insert into public.events (title, start_date, end_date, link, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('Test', '2026-05-10', '2026-05-10', 'javascript:alert(1)', 'A', 'B', 33, 225, 'Bucque')$$), 'err');
select t.check('visiteur : ne voit pas un événement en attente', t.val($$select count(*)::text from public.events where id = '20000000-0000-0000-0000-000000000001'$$), '0');

-- Modifier une seule date d'une série revient à modifier la série : réservé
-- à l'administrateur. L'auteur, lui, retire l'ensemble de sa proposition.
select t.check('visiteur : ne retire pas une seule date d''une série', t.try($$insert into public.event_overrides (event_id, occurrence_date, cancelled) values ('20000000-0000-0000-0000-000000000001', '2027-03-14', true)$$), 'err');

-- Confidentialité des coordonnées
select t.check('annuaire : e-mail visible si l''auteur l''accepte', t.val($$select email from public.contributors() where bucque = 'Tourne-Broche'$$), 'camille@exemple.fr');
reset role;
update public.posts set show_contact = false where id = '10000000-0000-0000-0000-000000000001';
set role anon;
select t.as_user(null);
select t.check('annuaire : e-mail masqué sinon', t.val($$select email from public.contributors() where bucque = 'Tourne-Broche'$$), '∅');
select t.check('annuaire : recherche par entreprise', t.val($$select bucque from public.contributors('safran')$$), 'Tourne-Broche');
select t.check('annuaire : joker neutralisé', t.val($$select count(*)::text from public.contributors('%')$$), '0');
select t.check('annuaire : compte les articles', t.val($$select posts_count::text from public.contributors() where bucque = 'Tourne-Broche'$$), '1');

-- Jeton de modification
reset role;
select set_config('t.token', (select edit_token::text from public.posts where id = '10000000-0000-0000-0000-000000000001'), false);
set role anon;
select t.as_user(null);
select t.check('auteur : modifie son article avec son jeton', t.val($$select public.update_post_with_token('10000000-0000-0000-0000-000000000001', current_setting('t.token')::uuid, 'Titre corrigé', null, 'Nouveau texte', null)::text$$), 'true');
select t.check('modification appliquée', t.val($$select title from public.posts where id = '10000000-0000-0000-0000-000000000001'$$), 'Titre corrigé');
select t.check('jeton erroné : modification refusée', t.val($$select public.update_post_with_token('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ff', 'Piraté', null, 'x', null)::text$$), 'false');
select t.check('article inchangé', t.val($$select title from public.posts where id = '10000000-0000-0000-0000-000000000001'$$), 'Titre corrigé');
select t.check('jeton erroné : suppression refusée', t.val($$select public.delete_post_with_token('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000ff')::text$$), 'false');
reset role;
select t.check('modification par jeton : identité préservée', t.val($$select author_bucque from public.posts where id = '10000000-0000-0000-0000-000000000001'$$), 'Tourne-Broche');

-- Retrouver ses contributions en attente grâce à son jeton
reset role;
select set_config('t.token2', (select edit_token::text from public.posts where id = '10000000-0000-0000-0000-000000000002'), false);
set role anon;
select t.as_user(null);
select t.check('auteur : retrouve son article en attente', t.val($$select title from public.my_posts(array[current_setting('t.token2')::uuid])$$), 'Nouvelle publication');
select t.check('auteur : voit qu''il est en attente', t.val($$select status from public.my_posts(array[current_setting('t.token2')::uuid])$$), 'pending');
select t.check('jeton inconnu : aucune contribution', t.val($$select count(*)::text from public.my_posts(array['00000000-0000-0000-0000-0000000000ff'::uuid])$$), '0');
select t.check('liste vide : aucune contribution', t.val($$select count(*)::text from public.my_posts('{}'::uuid[])$$), '0');

-- Débit horaire
reset role;
update public.site_settings set value = '1' where key = 'limits.posts_per_hour';
set role anon;
select t.as_user(null);
select t.check('débit horaire atteint : dépôt refusé', t.try($$insert into public.posts (title, body, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('Inondation', '', 'A', 'B', 33, 225, 'Bucque')$$), 'err');
reset role;
update public.site_settings set value = '30' where key = 'limits.posts_per_hour';

-- Fermeture des dépôts
update public.site_settings set value = 'false' where key = 'posts.open';
set role anon;
select t.as_user(null);
select t.check('dépôts fermés : article refusé', t.try($$insert into public.posts (title, body, author_first_name, author_last_name, author_number, author_promo, author_bucque) values ('Après fermeture', '', 'A', 'B', 33, 225, 'Bucque')$$), 'err');
reset role;
update public.site_settings set value = 'true' where key = 'posts.open';

-- ---------------------------------------------------------------------
-- Compte connecté sans être administrateur
-- ---------------------------------------------------------------------
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000b2', 'intrus@x');
set role authenticated;
select t.as_user('00000000-0000-0000-0000-0000000000b2');
select t.check('intrus connecté : ne voit pas les articles en attente', t.val($$select count(*)::text from public.posts where status = 'pending'$$), '0');
select t.check('intrus connecté : ne modifie pas un article', t.try($$update public.posts set title = 'Piraté' where id = '10000000-0000-0000-0000-000000000001'$$), 'ok:0');
select t.check('intrus connecté : ne supprime pas', t.try($$delete from public.posts$$), 'ok:0');
select t.check('intrus connecté : ne modifie pas les paramètres', t.try($$update public.site_settings set value = 'false' where key = 'posts.open'$$), 'ok:0');
select t.check('intrus connecté : journal illisible', t.val($$select count(*)::text from public.audit_logs$$), '0');
select t.check('intrus connecté : ne lit pas les jetons', t.try($$select edit_token from public.posts$$), 'err');
select t.check('intrus connecté : ne vide pas la file de purge', t.try($$select public.admin_storage_trash_clear(array[1]::bigint[])$$), 'err');

-- ---------------------------------------------------------------------
-- Administrateur
-- ---------------------------------------------------------------------
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('master : voit les articles en attente', t.val($$select (count(*) >= 2)::text from public.posts where status = 'pending'$$), 'true');
select t.check('master : valide un article', t.try($$update public.posts set status = 'published' where id = '10000000-0000-0000-0000-000000000002'$$), 'ok:1');
select t.check('master : validation journalisée', t.val($$select actor || '/' || action || '/' || entity from public.audit_logs order by id desc limit 1$$), 'master33/update/posts');
select t.check('master : masque un article', t.try($$update public.posts set is_hidden = true where id = '10000000-0000-0000-0000-000000000003'$$), 'ok:1');
select t.check('master : modifie un paramètre', t.try($$update public.site_settings set value = 'false' where key = 'comments.enabled'$$), 'ok:1');
select t.check('master : crée une catégorie', t.try($$insert into public.event_categories (name, color, icon) values ('Gala', '#123456', 'star')$$), 'ok:1');
select t.check('master : couleur invalide refusée', t.try($$insert into public.event_categories (name, color) values ('Mauvaise', 'rouge')$$), 'err');
select t.check('master : supprime un commentaire', t.try($$delete from public.comments where id = '40000000-0000-0000-0000-000000000001'$$), 'ok:1');
select t.check('master : valide une photo', t.try($$update public.photos set status = 'published' where id = '30000000-0000-0000-0000-000000000001'$$), 'ok:1');
select t.check('master : lit le journal', t.val($$select (count(*) >= 4)::text from public.audit_logs$$), 'true');

set role anon;
select t.as_user(null);
select t.check('visiteur : voit l''article validé', t.val($$select title from public.posts where id = '10000000-0000-0000-0000-000000000002'$$), 'Nouvelle publication');
select t.check('visiteur : ne voit pas l''article masqué', t.val($$select count(*)::text from public.posts where id = '10000000-0000-0000-0000-000000000003'$$), '0');
select t.check('visiteur : voit la photo validée', t.val($$select caption from public.photos where id = '30000000-0000-0000-0000-000000000001'$$), 'Souvenir');
select t.check('commentaires fermés : dépôt refusé', t.try($$insert into public.comments (post_id, body, author_name) values ('10000000-0000-0000-0000-000000000001', 'Trop tard', 'Anonyme')$$), 'err');

-- Suppression par le master et purge des fichiers
set role authenticated;
select t.as_user('00000000-0000-0000-0000-00000000000a');
select t.check('master : supprime une photo', t.try($$delete from public.photos where id = '30000000-0000-0000-0000-000000000001'$$), 'ok:1');
select t.check('fichiers mis en file de purge', t.val($$select count(*)::text from public.admin_storage_trash()$$), '2');
select t.check('master : vide la file de purge', t.val($$select (public.admin_storage_trash_clear((select array_agg(id) from public.admin_storage_trash())) = 2)::text$$), 'true');
select t.check('purge journalisée', t.val($$select action from public.audit_logs order by id desc limit 1$$), 'purge_storage');
reset role;

-- Le rôle de maintenance (clé secrète, scripts, sauvegardes) accède à tout
set role service_role;
select t.check('service_role : lit la table des administrateurs', t.val('select identifier from public.admins'), 'master33');
select t.check('service_role : crée un administrateur', t.try($$insert into public.admins (id, identifier) values ('00000000-0000-0000-0000-0000000000b2', 'secondaire')$$), 'ok:1');
select t.check('service_role : supprime cet administrateur', t.try($$delete from public.admins where identifier = 'secondaire'$$), 'ok:1');
select t.check('service_role : lit les articles en attente', t.val($$select (count(*) > 0)::text from public.posts where status = 'pending'$$), 'true');
select t.check('service_role : lit la file de purge', t.try('select * from public.storage_trash'), 'ok:0');
reset role;

-- 11e image d'un article
do $$ begin
  for i in 1..10 loop
    insert into public.post_images (post_id, path) values ('10000000-0000-0000-0000-000000000001', 'img/' || i);
  end loop;
end $$;
select t.check('11e image d''un article refusée', t.try($$insert into public.post_images (post_id, path) values ('10000000-0000-0000-0000-000000000001', 'img/11')$$), 'err');

select (case when ok then 'OK     ' else 'ÉCHEC  ' end) || label || case when ok then '' else ' (obtenu : ' || got || ', attendu : ' || expected || ')' end
from t.results order by n;
select '';
select count(*) filter (where ok) || ' / ' || count(*) || ' tests réussis' from t.results;
