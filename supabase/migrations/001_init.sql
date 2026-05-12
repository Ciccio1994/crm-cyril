-- ============================================================================
-- CRM Cyril — Migration initiale
-- Schéma complet : enums, tables, triggers, RLS
-- Single-user : RLS permissives. À restreindre par user_id en V2 si multi-user.
-- ============================================================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- ENUMS
-- ============================================================================

CREATE TYPE statut_commercial AS ENUM (
  'prospect',
  'client_actif',
  'client_inactif',
  'pas_interesse',
  'prospect_abandonne',
  'ferme',
  'contentieux'
);

CREATE TYPE type_etablissement AS ENUM (
  'restaurant',
  'caviste',
  'hotel',
  'epicerie_fine',
  'cave_altitude',
  'bar',
  'autre'
);

CREATE TYPE groupe_prix AS ENUM ('economique', 'standard', 'premium', 'luxe');

CREATE TYPE motif_visite_manquee AS ENUM (
  'ferme',
  'patron_absent',
  'pas_le_temps',
  'autre'
);

CREATE TYPE canal_rappel AS ENUM (
  'whatsapp',
  'mail',
  'telephone',
  'sms',
  'autre'
);

CREATE TYPE statut_rappel AS ENUM ('a_faire', 'fait', 'annule');

-- ============================================================================
-- TRIGGER HELPER : updated_at automatique
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- TABLES
-- ============================================================================

CREATE TABLE zone (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE tournee (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom TEXT NOT NULL,
  zone_id UUID REFERENCES zone(id),
  frequence_semaines INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE entreprise (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE etablissement (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enseigne TEXT NOT NULL,
  type_etablissement type_etablissement,
  statut statut_commercial NOT NULL DEFAULT 'prospect',
  groupe_prix groupe_prix,
  adresse TEXT,
  ville TEXT,
  code_postal TEXT,
  telephone TEXT,
  email TEXT,
  notes TEXT,
  entreprise_id UUID REFERENCES entreprise(id),
  tournee_id UUID REFERENCES tournee(id),
  derniere_visite_at TIMESTAMPTZ,
  derniere_commande_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE contact (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  etablissement_id UUID NOT NULL REFERENCES etablissement(id) ON DELETE CASCADE,
  prenom TEXT,
  nom TEXT NOT NULL,
  role TEXT,
  telephone TEXT,
  email TEXT,
  est_principal BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE visite (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  etablissement_id UUID NOT NULL REFERENCES etablissement(id) ON DELETE CASCADE,
  date_visite TIMESTAMPTZ NOT NULL,
  duree_minutes INTEGER,
  notes TEXT,
  est_manquee BOOLEAN DEFAULT false,
  motif_manquee motif_visite_manquee,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE rappel (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titre TEXT NOT NULL,
  description TEXT,
  echeance TIMESTAMPTZ NOT NULL,
  statut statut_rappel NOT NULL DEFAULT 'a_faire',
  canal canal_rappel,
  etablissement_id UUID REFERENCES etablissement(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE offre (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titre TEXT NOT NULL,
  description TEXT,
  cuvee TEXT,
  prix_ht NUMERIC(10, 2),
  date_debut DATE,
  date_fin DATE,
  conditions TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE parametre (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE conversation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  etablissement_id UUID REFERENCES etablissement(id) ON DELETE SET NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- TRIGGERS : updated_at sur chaque table
-- ============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'zone','tournee','entreprise','etablissement','contact',
    'visite','rappel','offre','parametre','conversation'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t
    );
  END LOOP;
END $$;

-- ============================================================================
-- TRIGGER : maj automatique de etablissement.derniere_visite_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_derniere_visite()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT NEW.est_manquee THEN
    UPDATE etablissement
    SET derniere_visite_at = NEW.date_visite
    WHERE id = NEW.etablissement_id
      AND (derniere_visite_at IS NULL OR NEW.date_visite > derniere_visite_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_visite_derniere_visite
AFTER INSERT ON visite
FOR EACH ROW EXECUTE FUNCTION update_derniere_visite();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ⚠️ Note de sécurité V1 : ces policies sont volontairement permissives car
-- le CRM est en mode single-user solo. Elles devront être restreintes par
-- user_id en V2 si un autre utilisateur est ajouté.
-- ============================================================================

ALTER TABLE zone ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournee ENABLE ROW LEVEL SECURITY;
ALTER TABLE entreprise ENABLE ROW LEVEL SECURITY;
ALTER TABLE etablissement ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE visite ENABLE ROW LEVEL SECURITY;
ALTER TABLE rappel ENABLE ROW LEVEL SECURITY;
ALTER TABLE offre ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametre ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'zone','tournee','entreprise','etablissement','contact',
    'visite','rappel','offre','parametre','conversation'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "%s_auth_all" ON %s FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t
    );
  END LOOP;
END $$;