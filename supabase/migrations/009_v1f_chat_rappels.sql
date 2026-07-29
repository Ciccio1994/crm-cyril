-- 009_v1f_chat_rappels.sql
-- Extension schéma V1f : rappels enrichis + conversation enrichie + bucket chat-images

CREATE TYPE cree_par_type AS ENUM ('utilisateur', 'claude');
CREATE TYPE modele_claude AS ENUM ('haiku', 'sonnet');

ALTER TABLE rappel
  ADD COLUMN IF NOT EXISTS visite_id UUID REFERENCES visite(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversation(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fait_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS push_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cree_par cree_par_type NOT NULL DEFAULT 'utilisateur';

CREATE INDEX IF NOT EXISTS idx_rappel_echeance_actif
  ON rappel (echeance) WHERE statut = 'a_faire' AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_rappel_etablissement
  ON rappel (etablissement_id) WHERE deleted_at IS NULL;

ALTER TABLE conversation
  ADD COLUMN IF NOT EXISTS titre TEXT,
  ADD COLUMN IF NOT EXISTS modele modele_claude NOT NULL DEFAULT 'haiku',
  ADD COLUMN IF NOT EXISTS alerte_seuil_envoyee_at TIMESTAMPTZ;

-- Bucket privé pour images du chat (analyse multimodale)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', false)
ON CONFLICT (id) DO NOTHING;
