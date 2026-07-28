-- ============================================================================
-- CRM Cyril — Migration 003 : schéma V1a
-- Aligne les enums et colonnes sur la spec 2026-05-05-crm-cyril-v1-design.md
-- ⚠️  À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================================

-- ===========================================================================
-- 1. type_etablissement : recréation complète (valeurs spec V1)
-- ===========================================================================
ALTER TABLE etablissement ALTER COLUMN type_etablissement TYPE TEXT;
DROP TYPE IF EXISTS type_etablissement;
CREATE TYPE type_etablissement AS ENUM (
  'restaurant', 'bar', 'hotel', 'cafe_tearoom', 'caviste',
  'epicerie', 'cabane_montagne', 'institution', 'association',
  'revendeur', 'particulier', 'autre'
);
ALTER TABLE etablissement
  ALTER COLUMN type_etablissement TYPE type_etablissement
  USING NULL;

-- ===========================================================================
-- 2. groupe_prix : codes Schenk réels (HORECA, PART, EPI, …)
-- ===========================================================================
ALTER TABLE etablissement ALTER COLUMN groupe_prix TYPE TEXT;
DROP TYPE IF EXISTS groupe_prix;
CREATE TYPE groupe_prix AS ENUM (
  'HORECA', 'PART', 'EPI', 'REVENDEURS', 'NEG', 'HORECASRB', 'HELICO'
);
ALTER TABLE etablissement
  ALTER COLUMN groupe_prix TYPE groupe_prix
  USING NULL;

-- ===========================================================================
-- 3. motif_visite_manquee : correction des libellés
-- ===========================================================================
ALTER TABLE visite ALTER COLUMN motif_manquee TYPE TEXT;
DROP TYPE IF EXISTS motif_visite_manquee;
CREATE TYPE motif_visite_manquee AS ENUM (
  'ferme', 'absent', 'urgence_personnelle', 'autre'
);
ALTER TABLE visite
  ALTER COLUMN motif_manquee TYPE motif_visite_manquee
  USING NULL;

-- ===========================================================================
-- 4. Table etablissement : colonnes
-- ===========================================================================
ALTER TABLE etablissement RENAME COLUMN adresse   TO adresse_ligne_1;
ALTER TABLE etablissement RENAME COLUMN telephone  TO telephone_principal;
ALTER TABLE etablissement RENAME COLUMN notes      TO notes_internes;

ALTER TABLE etablissement
  ADD COLUMN IF NOT EXISTS adresse_ligne_2      TEXT,
  ADD COLUMN IF NOT EXISTS telephone_mobile     TEXT,
  ADD COLUMN IF NOT EXISTS site_web             TEXT,
  ADD COLUMN IF NOT EXISTS horaires_libre       TEXT,
  ADD COLUMN IF NOT EXISTS seuil_inactivite_mois INTEGER DEFAULT 12,
  ADD COLUMN IF NOT EXISTS latitude             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude            DOUBLE PRECISION;

-- ===========================================================================
-- 5. Table entreprise : nom → raison_sociale + forme_juridique
-- ===========================================================================
ALTER TABLE entreprise RENAME COLUMN nom TO raison_sociale;
ALTER TABLE entreprise
  ADD COLUMN IF NOT EXISTS forme_juridique TEXT;

-- ===========================================================================
-- 6. Table tournee : ajouter jour_prefere
-- ===========================================================================
ALTER TABLE tournee
  ADD COLUMN IF NOT EXISTS jour_prefere TEXT;

-- ===========================================================================
-- 7. Table contact : role → fonction
-- ===========================================================================
ALTER TABLE contact RENAME COLUMN role TO fonction;

-- ===========================================================================
-- 8. Table visite : colonnes manquantes
-- ===========================================================================
ALTER TABLE visite
  ADD COLUMN IF NOT EXISTS contact_id       UUID REFERENCES contact(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prochaine_action TEXT,
  ADD COLUMN IF NOT EXISTS synced_at        TIMESTAMPTZ;

-- ===========================================================================
-- 9. Table rappel : colonnes manquantes
-- ===========================================================================
ALTER TABLE rappel
  ADD COLUMN IF NOT EXISTS visite_id   UUID REFERENCES visite(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fait_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS push_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cree_par    TEXT    NOT NULL DEFAULT 'utilisateur'
    CHECK (cree_par IN ('utilisateur', 'claude'));

-- ===========================================================================
-- 10. Table offre : restructuration
--     V0 : titre, description, cuvee, prix_ht, date_debut, date_fin, conditions, pdf_url
--     V1 : cuvee_text, notes, prix_promo_chf, date_debut, date_fin, conditions, source_pdf_url
-- ===========================================================================
ALTER TABLE offre RENAME COLUMN cuvee       TO cuvee_text;
ALTER TABLE offre RENAME COLUMN prix_ht     TO prix_promo_chf;
ALTER TABLE offre RENAME COLUMN pdf_url     TO source_pdf_url;
ALTER TABLE offre RENAME COLUMN description TO notes;
ALTER TABLE offre DROP COLUMN IF EXISTS titre;
ALTER TABLE offre ADD COLUMN IF NOT EXISTS cuvee_id UUID;

-- ===========================================================================
-- 11. Table parametre : valeur TEXT → JSONB
--     Les valeurs '6', '2', '[]' sont du JSON valide → cast direct
-- ===========================================================================
ALTER TABLE parametre ADD COLUMN IF NOT EXISTS valeur_jsonb JSONB;
UPDATE parametre SET valeur_jsonb = valeur::jsonb;
ALTER TABLE parametre DROP COLUMN valeur;
ALTER TABLE parametre RENAME COLUMN valeur_jsonb TO valeur;
ALTER TABLE parametre ALTER COLUMN valeur SET NOT NULL;

-- ===========================================================================
-- 12. Table conversation : restructuration
-- ===========================================================================
ALTER TABLE conversation DROP COLUMN IF EXISTS etablissement_id;
ALTER TABLE conversation DROP COLUMN IF EXISTS tokens_input;
ALTER TABLE conversation DROP COLUMN IF EXISTS tokens_output;
ALTER TABLE conversation
  ADD COLUMN IF NOT EXISTS contexte_initial  JSONB,
  ADD COLUMN IF NOT EXISTS tokens_consommes  INTEGER NOT NULL DEFAULT 0;

-- Trigger updated_at sur conversation (manquait dans 001)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_conversation_updated_at'
  ) THEN
    CREATE TRIGGER trg_conversation_updated_at
    BEFORE UPDATE ON conversation
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;
