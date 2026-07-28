-- ============================================================================
-- CRM Cyril — Migration 005 : code Schenk (import Excel)
-- Ajoute la colonne code_schenk sur etablissement + index unique partiel
-- ⚠️  À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================================

-- Nouvelle colonne
ALTER TABLE etablissement
  ADD COLUMN IF NOT EXISTS code_schenk TEXT;

-- Index unique partiel : deux etabs non supprimés ne peuvent pas avoir le même code Schenk.
-- Les etabs sans code Schenk (NULL) sont autorisés en nombre illimité.
CREATE UNIQUE INDEX IF NOT EXISTS idx_etablissement_code_schenk_unique
  ON etablissement (code_schenk)
  WHERE code_schenk IS NOT NULL AND deleted_at IS NULL;
