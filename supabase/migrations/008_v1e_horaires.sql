-- ============================================================================
-- CRM Cyril — Migration 008 : horaires d'ouverture
-- ⚠️  À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================================

ALTER TABLE etablissement
  ADD COLUMN IF NOT EXISTS horaires_ouverture JSONB,
  ADD COLUMN IF NOT EXISTS jours_fermeture_annuelle TEXT[];
