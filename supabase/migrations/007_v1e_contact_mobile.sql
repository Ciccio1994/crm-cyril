-- ============================================================================
-- CRM Cyril — Migration 007 : contact.telephone_mobile
-- Permet de séparer le fixe et le portable côté contact (comme etablissement).
-- ⚠️  À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================================

ALTER TABLE contact
  ADD COLUMN IF NOT EXISTS telephone_mobile TEXT;
