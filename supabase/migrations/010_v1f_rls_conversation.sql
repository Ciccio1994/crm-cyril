-- 010_v1f_rls_conversation.sql
-- Réaligne la table conversation avec le code V1f :
-- - Migration 003 avait supprimé etablissement_id, tokens_input, tokens_output
--   et ajouté contexte_initial, tokens_consommes (jamais utilisés dans le code).
-- - Cette migration restitue le schéma attendu par le code.

-- Réajouter etablissement_id (supprimé par 003)
ALTER TABLE conversation
  ADD COLUMN IF NOT EXISTS etablissement_id UUID REFERENCES etablissement(id) ON DELETE SET NULL;

-- Réajouter tokens_input et tokens_output (supprimés par 003)
ALTER TABLE conversation
  ADD COLUMN IF NOT EXISTS tokens_input INTEGER NOT NULL DEFAULT 0;
ALTER TABLE conversation
  ADD COLUMN IF NOT EXISTS tokens_output INTEGER NOT NULL DEFAULT 0;

-- Supprimer les colonnes ajoutées par 003 mais jamais utilisées dans le code
ALTER TABLE conversation
  DROP COLUMN IF EXISTS contexte_initial,
  DROP COLUMN IF EXISTS tokens_consommes;
