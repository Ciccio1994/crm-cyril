-- ============================================================================
-- CRM Cyril — Migration 004 : seeds V1a
-- Reset paramètres avec clés V1 et format JSONB
-- (zones/tournées : conservées telles quelles en DB — pas de zones macro V1)
-- ⚠️  À exécuter APRÈS 003 dans Supabase Dashboard > SQL Editor
-- ============================================================================

-- Supprimer les anciens paramètres (recréés en JSONB)
DELETE FROM parametre;

-- ===========================================================================
-- Paramètres par défaut (format JSONB)
-- ===========================================================================
INSERT INTO parametre (cle, valeur) VALUES
  ('objectif_visites_clients_par_jour',   '6'),
  ('objectif_visites_prospects_par_jour', '2'),
  ('seuil_inactivite_mois_global',        '12'),
  ('claude_chat_active',                  'true'),
  ('monitoring_consommation_claude',
   '{"tokens_mois_courant": 0, "seuil_alerte_chf": 50}');
