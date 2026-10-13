-- =====================================================================
-- Famille 33 — Chemin de recherche fixé sur les fonctions internes
-- =====================================================================
-- Répond à l'avertissement « Function Search Path Mutable » de l'analyseur
-- de sécurité Supabase : sans chemin fixe, un objet homonyme placé dans un
-- autre schéma pourrait être appelé à la place de celui attendu. Toutes les
-- références de ces fonctions sont déjà qualifiées (app.…, public.…) ou
-- appartiennent à pg_catalog, toujours accessible.
alter function app.is_privileged() set search_path = '';
alter function app.guard_contribution() set search_path = '';
alter function app.guard_comment() set search_path = '';
