-- =====================================================================
-- Famille 33 — Droits de maintenance
-- =====================================================================
-- Le rôle « service_role » est celui qu'emprunte la clé secrète utilisée
-- depuis l'ordinateur de l'administrateur (script npm run admin) et par les
-- sauvegardes. Selon l'âge du projet Supabase, il ne reçoit pas toujours
-- automatiquement les droits sur les tables créées par les migrations :
-- on les accorde donc explicitement.
--
-- Cela ne change rien pour les visiteurs : la clé publique emprunte le rôle
-- « anon », dont les droits restent ceux de la migration de sécurité.
-- =====================================================================

grant usage on schema public, app to service_role;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant all privileges on all routines in schema public to service_role;
grant execute on all routines in schema app to service_role;

-- Et pour les tables ajoutées par de futures migrations
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines to service_role;
