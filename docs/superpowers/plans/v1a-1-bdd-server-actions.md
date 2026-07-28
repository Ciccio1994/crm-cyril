# V1a-1 — BDD & Server Actions

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Aligner le schéma Supabase sur la spec V1, installer la base locale Dexie, écrire les types TypeScript, les schémas Zod et les Server Actions CRUD pour établissement, contact et visite.

**Architecture:** Les Server Actions (Next.js `'use server'`) écrivent dans Supabase. Dexie (IndexedDB) est la base locale lue par l'UI pour la performance offline. La synchronisation complète Dexie ↔ Supabase arrive en V1f ; ici on pose l'infrastructure. Validation Zod sur toutes les entrées, jamais de `any`.

**Tech Stack:** Next.js 15 App Router Server Actions, Supabase (Postgres + RLS), Dexie.js 4, Zod 3, Vitest

---

## Fichiers créés / modifiés

| Fichier | Rôle |
|---------|------|
| `supabase/migrations/003_v1a_schema.sql` | Correction enums + colonnes (à exécuter dans Supabase Dashboard) |
| `supabase/migrations/004_v1a_seeds.sql` | Reset zones/tournées/paramètres (à exécuter après 003) |
| `src/types/database.ts` | Interfaces TypeScript miroir du schéma DB |
| `src/lib/validation/etablissement.ts` | Zod schemas établissement |
| `src/lib/validation/contact.ts` | Zod schemas contact |
| `src/lib/validation/visite.ts` | Zod schemas visite (normale + manquée) |
| `src/lib/db/dexie.ts` | Instance Dexie + tables IndexedDB |
| `src/actions/etablissement.ts` | Server Actions CRUD établissement |
| `src/actions/contact.ts` | Server Actions CRUD contact |
| `src/actions/visite.ts` | Server Actions CRUD visite |
| `src/test/actions/etablissement.test.ts` | Tests Server Actions établissement |
| `src/test/actions/contact.test.ts` | Tests Server Actions contact |
| `src/test/actions/visite.test.ts` | Tests Server Actions visite |
| `src/test/lib/validation.test.ts` | Tests Zod schemas |

---

## Tâche 1 — Migration 003 : corriger le schéma

> Exécuter dans **Supabase Dashboard → SQL Editor** (pas de Supabase CLI pour l'instant).
> La migration est committée dans le repo mais exécutée manuellement.

**Fichiers :**
- Créer : `supabase/migrations/003_v1a_schema.sql`

- [ ] **Écrire le fichier** `supabase/migrations/003_v1a_schema.sql` :

```sql
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
```

- [ ] **Committer** le fichier (ne pas exécuter encore — attendre tâche 2 pour exécuter les deux d'un coup) :

```bash
git add supabase/migrations/003_v1a_schema.sql
git commit -m "chore(v1a): migration 003 — correction schéma V1 (enums + colonnes)"
```

---

## Tâche 2 — Migration 004 : reset des paramètres

> **Décision V1** : pas de zones macro. Les 18 tournées Excel sont déjà en DB (seed 002).
> Cette migration ne touche donc plus qu'à la table `parametre` (reset au format JSONB).

**Fichiers :**
- Créer : `supabase/migrations/004_v1a_seeds.sql`

- [ ] **Écrire le fichier** `supabase/migrations/004_v1a_seeds.sql` :

```sql
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
```

- [ ] **Exécuter dans Supabase Dashboard → SQL Editor** dans cet ordre :
  1. Coller et exécuter `003_v1a_schema.sql`
  2. Vérifier qu'il n'y a pas d'erreur
  3. Coller et exécuter `004_v1a_seeds.sql`
  4. Vérifier dans Table Editor : table `zone` vide, 18 tournées inchangées, 5 paramètres avec valeurs JSONB

- [ ] **Committer** :

```bash
git add supabase/migrations/004_v1a_seeds.sql
git commit -m "chore(v1a): migration 004 — reset seeds (4 zones, 19 tournées, params JSONB)"
```

---

## Tâche 3 — Types TypeScript

**Fichiers :**
- Créer : `src/types/database.ts`

- [ ] **Écrire** `src/types/database.ts` :

```ts
// Enums (miroir des types Postgres)
export type StatutCommercial =
  | 'prospect'
  | 'client_actif'
  | 'client_inactif'
  | 'pas_interesse'
  | 'prospect_abandonne'
  | 'ferme'
  | 'contentieux'

export type TypeEtablissement =
  | 'restaurant' | 'bar' | 'hotel' | 'cafe_tearoom' | 'caviste'
  | 'epicerie' | 'cabane_montagne' | 'institution' | 'association'
  | 'revendeur' | 'particulier' | 'autre'

export type GroupePrix =
  | 'HORECA' | 'PART' | 'EPI' | 'REVENDEURS' | 'NEG' | 'HORECASRB' | 'HELICO'

export type MotifVisiteManquee = 'ferme' | 'absent' | 'urgence_personnelle' | 'autre'

export type CanalRappel = 'whatsapp' | 'mail' | 'telephone' | 'sms' | 'autre'

export type StatutRappel = 'a_faire' | 'fait' | 'annule'

// Tables
export interface Zone {
  id: string
  nom: string
  code: string
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// Note V1 : Zone reste comme placeholder (table vide en V1, réservée V2+)
// Tournee n'a donc pas de zone_id côté TS — le join ne remonte pas la zone.
export interface Tournee {
  id: string
  nom: string
  frequence_semaines: number
  jour_prefere: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Entreprise {
  id: string
  raison_sociale: string
  forme_juridique: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Etablissement {
  id: string
  enseigne: string
  type_etablissement: TypeEtablissement | null
  statut: StatutCommercial
  groupe_prix: GroupePrix | null
  adresse_ligne_1: string | null
  adresse_ligne_2: string | null
  code_postal: string | null
  ville: string | null
  latitude: number | null
  longitude: number | null
  telephone_principal: string | null
  telephone_mobile: string | null
  email: string | null
  site_web: string | null
  horaires_libre: string | null
  notes_internes: string | null
  seuil_inactivite_mois: number
  entreprise_id: string | null
  tournee_id: string | null
  derniere_visite_at: string | null
  derniere_commande_at: string | null
  // Relations (optionnelles, chargées si select avec join)
  tournee?: Tournee
  entreprise?: Entreprise
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Contact {
  id: string
  etablissement_id: string
  prenom: string | null
  nom: string
  fonction: string | null
  telephone: string | null
  email: string | null
  est_principal: boolean
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Visite {
  id: string
  etablissement_id: string
  contact_id: string | null
  date_visite: string
  duree_minutes: number | null
  notes: string | null
  est_manquee: boolean
  motif_manquee: MotifVisiteManquee | null
  prochaine_action: string | null
  synced_at: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Rappel {
  id: string
  titre: string
  description: string | null
  echeance: string
  statut: StatutRappel
  canal: CanalRappel | null
  etablissement_id: string | null
  visite_id: string | null
  fait_at: string | null
  push_active: boolean
  cree_par: 'utilisateur' | 'claude'
  created_at: string
  updated_at: string
  deleted_at: string | null
}

export interface Offre {
  id: string
  cuvee_text: string
  cuvee_id: string | null
  prix_promo_chf: number | null
  date_debut: string | null
  date_fin: string | null
  conditions: string | null
  source_pdf_url: string | null
  notes: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
}

// EtablissementAvecRetard : type enrichi pour l'affichage (calculé côté client)
export interface EtablissementAvecRetard extends Etablissement {
  jours_depuis_visite: number | null
  est_en_retard: boolean
}
```

- [ ] **Vérifier** que `npm run type-check` passe sans erreur.

- [ ] **Committer** :

```bash
git add src/types/database.ts
git commit -m "chore(v1a): types TypeScript miroir schéma DB (tache 3)"
```

---

## Tâche 4 — Dexie : base locale IndexedDB

**Fichiers :**
- Créer : `src/lib/db/dexie.ts`

- [ ] **Installer Dexie** :

```bash
npm install dexie
```

- [ ] **Écrire** `src/lib/db/dexie.ts` :

```ts
import Dexie, { type Table } from 'dexie'
import type {
  Etablissement,
  Contact,
  Visite,
  Rappel,
  Tournee,
  Zone,
  Offre,
} from '@/types/database'

export class CrmDatabase extends Dexie {
  etablissements!: Table<Etablissement>
  contacts!: Table<Contact>
  visites!: Table<Visite>
  rappels!: Table<Rappel>
  tournees!: Table<Tournee>
  zones!: Table<Zone>
  offres!: Table<Offre>

  constructor() {
    super('crm-cyril')
    this.version(1).stores({
      etablissements: 'id, tournee_id, statut, derniere_visite_at, deleted_at, updated_at',
      contacts:       'id, etablissement_id, deleted_at',
      visites:        'id, etablissement_id, date_visite, est_manquee, deleted_at',
      rappels:        'id, etablissement_id, echeance, statut, canal, deleted_at',
      tournees:       'id, zone_id',
      zones:          'id, code',
      offres:         'id, date_fin, deleted_at',
    })
  }
}

export const db = new CrmDatabase()
```

> Les index secondaires permettront le tri par `derniere_visite_at` pour le badge retard, le filtre par `statut` et `tournee_id` pour les listes, et le filtre `echeance` pour les rappels dus.

- [ ] **Vérifier** `npm run type-check` passe.

- [ ] **Committer** :

```bash
git add src/lib/db/dexie.ts package.json package-lock.json
git commit -m "feat(v1a): Dexie IndexedDB — schéma local 7 tables (tache 4)"
```

---

## Tâche 5 — Zod schemas + tests validation

**Fichiers :**
- Créer : `src/lib/validation/etablissement.ts`
- Créer : `src/lib/validation/contact.ts`
- Créer : `src/lib/validation/visite.ts`
- Créer : `src/test/lib/validation.test.ts`

- [ ] **Écrire les tests d'abord** `src/test/lib/validation.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { EtablissementCreateSchema } from '@/lib/validation/etablissement'
import { ContactCreateSchema } from '@/lib/validation/contact'
import { VisiteCreateSchema, VisiteManqueeCreateSchema } from '@/lib/validation/visite'

describe('EtablissementCreateSchema', () => {
  it('accepte un payload minimal valide', () => {
    const result = EtablissementCreateSchema.safeParse({ enseigne: 'Test' })
    expect(result.success).toBe(true)
  })
  it('rejette une enseigne vide', () => {
    const result = EtablissementCreateSchema.safeParse({ enseigne: '' })
    expect(result.success).toBe(false)
  })
  it('rejette un statut inconnu', () => {
    const result = EtablissementCreateSchema.safeParse({
      enseigne: 'Test',
      statut: 'inventé',
    })
    expect(result.success).toBe(false)
  })
})

describe('ContactCreateSchema', () => {
  it('accepte payload minimal', () => {
    const result = ContactCreateSchema.safeParse({
      etablissement_id: '00000000-0000-0000-0000-000000000001',
      nom: 'Dupont',
    })
    expect(result.success).toBe(true)
  })
  it('rejette sans etablissement_id', () => {
    const result = ContactCreateSchema.safeParse({ nom: 'Dupont' })
    expect(result.success).toBe(false)
  })
})

describe('VisiteCreateSchema', () => {
  it('accepte visite normale minimale', () => {
    const result = VisiteCreateSchema.safeParse({
      etablissement_id: '00000000-0000-0000-0000-000000000001',
      date_visite: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
  })
  it('rejette duree_minutes négative', () => {
    const result = VisiteCreateSchema.safeParse({
      etablissement_id: '00000000-0000-0000-0000-000000000001',
      date_visite: new Date().toISOString(),
      duree_minutes: -5,
    })
    expect(result.success).toBe(false)
  })
})

describe('VisiteManqueeCreateSchema', () => {
  it('accepte visite manquée sans motif', () => {
    const result = VisiteManqueeCreateSchema.safeParse({
      etablissement_id: '00000000-0000-0000-0000-000000000001',
      date_visite: new Date().toISOString(),
    })
    expect(result.success).toBe(true)
  })
  it('accepte un motif valide', () => {
    const result = VisiteManqueeCreateSchema.safeParse({
      etablissement_id: '00000000-0000-0000-0000-000000000001',
      date_visite: new Date().toISOString(),
      motif_manquee: 'ferme',
    })
    expect(result.success).toBe(true)
  })
  it('rejette un motif invalide', () => {
    const result = VisiteManqueeCreateSchema.safeParse({
      etablissement_id: '00000000-0000-0000-0000-000000000001',
      date_visite: new Date().toISOString(),
      motif_manquee: 'pas_envie',
    })
    expect(result.success).toBe(false)
  })
})
```

- [ ] **Lancer les tests** — ils doivent échouer (modules inexistants) :

```bash
npm test src/test/lib/validation.test.ts
```

Résultat attendu : `FAIL` (Cannot find module)

- [ ] **Écrire** `src/lib/validation/etablissement.ts` :

```ts
import { z } from 'zod'

const STATUTS = [
  'prospect', 'client_actif', 'client_inactif',
  'pas_interesse', 'prospect_abandonne', 'ferme', 'contentieux',
] as const

const TYPES_ETAB = [
  'restaurant', 'bar', 'hotel', 'cafe_tearoom', 'caviste',
  'epicerie', 'cabane_montagne', 'institution', 'association',
  'revendeur', 'particulier', 'autre',
] as const

const GROUPES_PRIX = [
  'HORECA', 'PART', 'EPI', 'REVENDEURS', 'NEG', 'HORECASRB', 'HELICO',
] as const

export const EtablissementCreateSchema = z.object({
  enseigne:              z.string().min(1, 'Enseigne obligatoire').max(200),
  statut:                z.enum(STATUTS).default('prospect'),
  type_etablissement:    z.enum(TYPES_ETAB).nullable().optional(),
  groupe_prix:           z.enum(GROUPES_PRIX).nullable().optional(),
  entreprise_id:         z.string().uuid().nullable().optional(),
  tournee_id:            z.string().uuid().nullable().optional(),
  adresse_ligne_1:       z.string().max(200).nullable().optional(),
  adresse_ligne_2:       z.string().max(200).nullable().optional(),
  code_postal:           z.string().max(20).nullable().optional(),
  ville:                 z.string().max(100).nullable().optional(),
  telephone_principal:   z.string().max(30).nullable().optional(),
  telephone_mobile:      z.string().max(30).nullable().optional(),
  email:                 z.string().email().nullable().optional(),
  site_web:              z.string().url().nullable().optional(),
  horaires_libre:        z.string().nullable().optional(),
  notes_internes:        z.string().nullable().optional(),
  seuil_inactivite_mois: z.number().int().min(1).max(60).default(12),
})

export const EtablissementUpdateSchema = EtablissementCreateSchema.partial()

export type EtablissementCreateInput = z.infer<typeof EtablissementCreateSchema>
export type EtablissementUpdateInput = z.infer<typeof EtablissementUpdateSchema>
```

- [ ] **Écrire** `src/lib/validation/contact.ts` :

```ts
import { z } from 'zod'

export const ContactCreateSchema = z.object({
  etablissement_id: z.string().uuid(),
  nom:              z.string().min(1, 'Nom obligatoire').max(100),
  prenom:           z.string().max(100).nullable().optional(),
  fonction:         z.string().max(100).nullable().optional(),
  telephone:        z.string().max(30).nullable().optional(),
  email:            z.string().email().nullable().optional(),
  est_principal:    z.boolean().default(false),
  notes:            z.string().nullable().optional(),
})

export const ContactUpdateSchema = ContactCreateSchema.omit({ etablissement_id: true }).partial()

export type ContactCreateInput = z.infer<typeof ContactCreateSchema>
export type ContactUpdateInput = z.infer<typeof ContactUpdateSchema>
```

- [ ] **Écrire** `src/lib/validation/visite.ts` :

```ts
import { z } from 'zod'

const MOTIFS_MANQUEE = ['ferme', 'absent', 'urgence_personnelle', 'autre'] as const

export const VisiteCreateSchema = z.object({
  etablissement_id: z.string().uuid(),
  contact_id:       z.string().uuid().nullable().optional(),
  date_visite:      z.string().datetime(),
  duree_minutes:    z.number().int().min(1).max(480).nullable().optional(),
  notes:            z.string().nullable().optional(),
  prochaine_action: z.string().max(500).nullable().optional(),
})

export const VisiteManqueeCreateSchema = z.object({
  etablissement_id: z.string().uuid(),
  date_visite:      z.string().datetime(),
  motif_manquee:    z.enum(MOTIFS_MANQUEE).nullable().optional(),
})

export const VisiteUpdateSchema = z.object({
  notes:            z.string().nullable().optional(),
  duree_minutes:    z.number().int().min(1).max(480).nullable().optional(),
  prochaine_action: z.string().max(500).nullable().optional(),
})

export type VisiteCreateInput = z.infer<typeof VisiteCreateSchema>
export type VisiteManqueeCreateInput = z.infer<typeof VisiteManqueeCreateSchema>
export type VisiteUpdateInput = z.infer<typeof VisiteUpdateSchema>
```

- [ ] **Lancer les tests** — ils doivent passer :

```bash
npm test src/test/lib/validation.test.ts
```

Résultat attendu : `PASS` (4 suites, ~10 tests verts)

- [ ] **Committer** :

```bash
git add src/lib/validation/ src/test/lib/validation.test.ts
git commit -m "feat(v1a): Zod schemas établissement/contact/visite + tests (tache 5)"
```

---

## Tâche 6 — Server Actions : établissement (write)

**Fichiers :**
- Créer : `src/actions/etablissement.ts`
- Créer : `src/test/actions/etablissement.test.ts`

- [ ] **Écrire les tests d'abord** `src/test/actions/etablissement.test.ts` :

```ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { creerEtablissement, mettreAJourEtablissement, supprimerEtablissement }
  from '@/actions/etablissement'
import { createClient } from '@/lib/supabase/server'

function mockChain(overrides: Record<string, unknown> = {}) {
  const chain: Record<string, unknown> = {
    insert:  vi.fn().mockReturnThis(),
    update:  vi.fn().mockReturnThis(),
    select:  vi.fn().mockReturnThis(),
    single:  vi.fn().mockResolvedValue({ data: { id: 'abc123', enseigne: 'Test' }, error: null }),
    eq:      vi.fn().mockReturnThis(),
    is:      vi.fn().mockReturnThis(),
    order:   vi.fn().mockReturnThis(),
    ...overrides,
  }
  return {
    supabase: { from: vi.fn().mockReturnValue(chain), auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user1' } } }) } },
    chain,
  }
}

describe('creerEtablissement', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne une erreur si enseigne vide', async () => {
    const result = await creerEtablissement({ enseigne: '' })
    expect(result.erreur).toBeDefined()
    expect(result.data).toBeUndefined()
  })

  it('insère dans Supabase et retourne la ligne créée', async () => {
    const { supabase } = mockChain()
    vi.mocked(createClient).mockResolvedValue(supabase as any)

    const result = await creerEtablissement({ enseigne: 'Restaurant Alpha', statut: 'prospect' })
    expect(result.data).toEqual({ id: 'abc123', enseigne: 'Test' })
    expect(result.erreur).toBeUndefined()
  })

  it('remonte l'erreur Supabase', async () => {
    const chain: Record<string, unknown> = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } }),
    }
    const supabase = { from: vi.fn().mockReturnValue(chain), auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } } }) } }
    vi.mocked(createClient).mockResolvedValue(supabase as any)

    const result = await creerEtablissement({ enseigne: 'Test' })
    expect(result.erreur).toBeDefined()
  })
})

describe('mettreAJourEtablissement', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejette un id invalide', async () => {
    const result = await mettreAJourEtablissement('pas-un-uuid', { enseigne: 'Test' })
    expect(result.erreur).toBeDefined()
  })

  it('met à jour dans Supabase', async () => {
    const { supabase } = mockChain()
    vi.mocked(createClient).mockResolvedValue(supabase as any)

    const result = await mettreAJourEtablissement(
      '00000000-0000-0000-0000-000000000001',
      { notes_internes: 'Bon client' }
    )
    expect(result.data).toBeDefined()
  })
})

describe('supprimerEtablissement', () => {
  beforeEach(() => vi.clearAllMocks())

  it('soft-delete (deleted_at) dans Supabase', async () => {
    const { supabase, chain } = mockChain()
    vi.mocked(createClient).mockResolvedValue(supabase as any)

    await supprimerEtablissement('00000000-0000-0000-0000-000000000001')
    expect(supabase.from).toHaveBeenCalledWith('etablissement')
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    )
  })
})
```

- [ ] **Lancer les tests** — ils doivent échouer (module inexistant) :

```bash
npm test src/test/actions/etablissement.test.ts
```

Résultat attendu : `FAIL` (Cannot find module)

- [ ] **Écrire** `src/actions/etablissement.ts` :

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  EtablissementCreateSchema,
  EtablissementUpdateSchema,
} from '@/lib/validation/etablissement'
import type { Etablissement } from '@/types/database'

type ActionResult<T> = { data?: T; erreur?: unknown }

export async function creerEtablissement(input: unknown): Promise<ActionResult<Etablissement>> {
  const parsed = EtablissementCreateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('etablissement')
    .insert(parsed.data)
    .select()
    .single()

  if (error) return { erreur: { message: error.message } }
  revalidatePath('/etablissements')
  return { data: data as Etablissement }
}

export async function mettreAJourEtablissement(
  id: unknown,
  input: unknown
): Promise<ActionResult<Etablissement>> {
  if (typeof id !== 'string' || !id.match(/^[0-9a-f-]{36}$/i)) {
    return { erreur: { message: 'ID invalide' } }
  }
  const parsed = EtablissementUpdateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('etablissement')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return { erreur: { message: error.message } }
  revalidatePath('/etablissements')
  revalidatePath(`/etablissements/${id}`)
  return { data: data as Etablissement }
}

export async function supprimerEtablissement(id: string): Promise<ActionResult<void>> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('etablissement')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { erreur: { message: error.message } }
  revalidatePath('/etablissements')
  return {}
}
```

- [ ] **Lancer les tests** — ils doivent passer :

```bash
npm test src/test/actions/etablissement.test.ts
```

Résultat attendu : `PASS`

- [ ] **Vérifier** `npm run type-check` passe.

- [ ] **Committer** :

```bash
git add src/actions/etablissement.ts src/test/actions/etablissement.test.ts
git commit -m "feat(v1a): Server Actions établissement (create/update/delete) + tests (tache 6)"
```

---

## Tâche 7 — Server Actions : établissement (lecture)

**Fichiers :**
- Modifier : `src/actions/etablissement.ts`
- Modifier : `src/test/actions/etablissement.test.ts`

- [ ] **Ajouter les tests** en bas de `src/test/actions/etablissement.test.ts` :

```ts
// Importer en haut du fichier :
// import { lireEtablissements, lireEtablissement } from '@/actions/etablissement'

describe('lireEtablissements', () => {
  beforeEach(() => vi.clearAllMocks())

  it('retourne la liste depuis Supabase', async () => {
    const list = [{ id: 'a', enseigne: 'Alpha' }, { id: 'b', enseigne: 'Beta' }]
    const chain = {
      select: vi.fn().mockReturnThis(),
      is:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: list, error: null }),
      eq:     vi.fn().mockReturnThis(),
      or:     vi.fn().mockReturnThis(),
      ilike:  vi.fn().mockReturnThis(),
    }
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as any)

    const result = await lireEtablissements()
    expect(result.data).toHaveLength(2)
  })

  it('filtre par tournee_id si fourni', async () => {
    const chain = {
      select: vi.fn().mockReturnThis(),
      is:     vi.fn().mockReturnThis(),
      order:  vi.fn().mockResolvedValue({ data: [], error: null }),
      eq:     vi.fn().mockReturnThis(),
      or:     vi.fn().mockReturnThis(),
      ilike:  vi.fn().mockReturnThis(),
    }
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as any)

    await lireEtablissements({ tournee_id: '11111111-0000-0000-0000-000000000001' })
    expect(chain.eq).toHaveBeenCalledWith('tournee_id', '11111111-0000-0000-0000-000000000001')
  })
})

describe('lireEtablissement', () => {
  it('retourne un établissement par id', async () => {
    const etab = { id: 'abc', enseigne: 'Test' }
    const chain = {
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      is:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: etab, error: null }),
    }
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as any)

    const result = await lireEtablissement('abc')
    expect(result.data?.enseigne).toBe('Test')
  })
})
```

- [ ] **Lancer les tests** — doivent échouer (`lireEtablissements` pas encore exportée) :

```bash
npm test src/test/actions/etablissement.test.ts
```

- [ ] **Ajouter** ces fonctions en bas de `src/actions/etablissement.ts` :

```ts
export interface FiltresEtablissement {
  tournee_id?: string
  statut?: string
  recherche?: string
}

export async function lireEtablissements(
  filtres: FiltresEtablissement = {}
): Promise<ActionResult<Etablissement[]>> {
  const supabase = await createClient()

  let query = supabase
    .from('etablissement')
    .select('*, tournee(id, nom, frequence_semaines)')
    .is('deleted_at', null)
    .order('enseigne', { ascending: true })

  if (filtres.tournee_id) query = query.eq('tournee_id', filtres.tournee_id)
  if (filtres.statut)     query = query.eq('statut', filtres.statut)
  if (filtres.recherche) {
    const q = `%${filtres.recherche}%`
    query = query.or(`enseigne.ilike.${q},ville.ilike.${q},code_postal.ilike.${q}`)
  }

  const { data, error } = await query
  if (error) return { erreur: { message: error.message } }
  return { data: data as Etablissement[] }
}

export async function lireEtablissement(id: string): Promise<ActionResult<Etablissement>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('etablissement')
    .select('*, tournee(id, nom, frequence_semaines), entreprise(*)')
    .eq('id', id)
    .is('deleted_at', null)
    .single()

  if (error) return { erreur: { message: error.message } }
  return { data: data as Etablissement }
}
```

- [ ] **Lancer les tests** — doivent passer :

```bash
npm test src/test/actions/etablissement.test.ts
```

Résultat attendu : `PASS` (toutes les suites)

- [ ] **Committer** :

```bash
git add src/actions/etablissement.ts src/test/actions/etablissement.test.ts
git commit -m "feat(v1a): Server Actions établissement (lecture + filtres) + tests (tache 7)"
```

---

## Tâche 8 — Server Actions : contact

**Fichiers :**
- Créer : `src/actions/contact.ts`
- Créer : `src/test/actions/contact.test.ts`

- [ ] **Écrire les tests** `src/test/actions/contact.test.ts` :

```ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { creerContact, mettreAJourContact, supprimerContact, lireContacts }
  from '@/actions/contact'
import { createClient } from '@/lib/supabase/server'

function singleOk(payload = { id: 'c1', nom: 'Dupont' }) {
  const chain = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: payload, error: null }),
    eq:     vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockResolvedValue({ data: [payload], error: null }),
  }
  return { from: vi.fn().mockReturnValue(chain), chain }
}

describe('creerContact', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejette sans etablissement_id', async () => {
    const r = await creerContact({ nom: 'Dupont' })
    expect(r.erreur).toBeDefined()
  })

  it('insère et retourne le contact', async () => {
    const mock = singleOk()
    vi.mocked(createClient).mockResolvedValue(mock as any)
    const r = await creerContact({
      etablissement_id: '00000000-0000-0000-0000-000000000001',
      nom: 'Dupont',
    })
    expect(r.data?.nom).toBe('Dupont')
  })
})

describe('lireContacts', () => {
  it('retourne les contacts d'un établissement', async () => {
    const mock = singleOk()
    vi.mocked(createClient).mockResolvedValue(mock as any)
    const r = await lireContacts('00000000-0000-0000-0000-000000000001')
    expect(r.data).toHaveLength(1)
  })
})

describe('mettreAJourContact', () => {
  it('met à jour avec payload valide', async () => {
    const mock = singleOk()
    vi.mocked(createClient).mockResolvedValue(mock as any)
    const r = await mettreAJourContact('c1', { fonction: 'Sommelier' })
    expect(r.data).toBeDefined()
  })
})

describe('supprimerContact', () => {
  it('soft-delete', async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: null }),
    }
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as any)
    const r = await supprimerContact('c1')
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) })
    )
    expect(r.erreur).toBeUndefined()
  })
})
```

- [ ] **Lancer les tests** — doivent échouer :

```bash
npm test src/test/actions/contact.test.ts
```

- [ ] **Écrire** `src/actions/contact.ts` :

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { ContactCreateSchema, ContactUpdateSchema } from '@/lib/validation/contact'
import type { Contact } from '@/types/database'

type ActionResult<T> = { data?: T; erreur?: unknown }

export async function creerContact(input: unknown): Promise<ActionResult<Contact>> {
  const parsed = ContactCreateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contact')
    .insert(parsed.data)
    .select()
    .single()

  if (error) return { erreur: { message: error.message } }
  revalidatePath(`/etablissements/${parsed.data.etablissement_id}`)
  return { data: data as Contact }
}

export async function lireContacts(etablissementId: string): Promise<ActionResult<Contact[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contact')
    .select('*')
    .eq('etablissement_id', etablissementId)
    .is('deleted_at', null)
    .order('est_principal', { ascending: false })

  if (error) return { erreur: { message: error.message } }
  return { data: data as Contact[] }
}

export async function mettreAJourContact(
  id: string,
  input: unknown
): Promise<ActionResult<Contact>> {
  const parsed = ContactUpdateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('contact')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return { erreur: { message: error.message } }
  return { data: data as Contact }
}

export async function supprimerContact(id: string): Promise<ActionResult<void>> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('contact')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { erreur: { message: error.message } }
  return {}
}
```

- [ ] **Lancer les tests** — doivent passer :

```bash
npm test src/test/actions/contact.test.ts
```

- [ ] **Committer** :

```bash
git add src/actions/contact.ts src/test/actions/contact.test.ts
git commit -m "feat(v1a): Server Actions contact CRUD + tests (tache 8)"
```

---

## Tâche 9 — Server Actions : visite

**Fichiers :**
- Créer : `src/actions/visite.ts`
- Créer : `src/test/actions/visite.test.ts`

- [ ] **Écrire les tests** `src/test/actions/visite.test.ts` :

```ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { creerVisite, creerVisiteManquee, lireVisites, mettreAJourVisite }
  from '@/actions/visite'
import { createClient } from '@/lib/supabase/server'

const ETAB_ID = '00000000-0000-0000-0000-000000000001'
const NOW = new Date().toISOString()

function chainOk(payload: unknown = { id: 'v1' }) {
  const c = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: payload, error: null }),
    eq:     vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockResolvedValue({ data: [payload], error: null }),
  }
  return { from: vi.fn().mockReturnValue(c), c }
}

describe('creerVisite', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejette sans date_visite', async () => {
    const r = await creerVisite({ etablissement_id: ETAB_ID })
    expect(r.erreur).toBeDefined()
  })

  it('rejette duree_minutes négative', async () => {
    const r = await creerVisite({ etablissement_id: ETAB_ID, date_visite: NOW, duree_minutes: -1 })
    expect(r.erreur).toBeDefined()
  })

  it('insère avec est_manquee false', async () => {
    const { from, c } = chainOk()
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    const r = await creerVisite({ etablissement_id: ETAB_ID, date_visite: NOW, duree_minutes: 60 })
    expect(c.insert).toHaveBeenCalledWith(
      expect.objectContaining({ est_manquee: false })
    )
    expect(r.data).toBeDefined()
  })
})

describe('creerVisiteManquee', () => {
  beforeEach(() => vi.clearAllMocks())

  it('insère avec est_manquee true', async () => {
    const { from, c } = chainOk()
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    await creerVisiteManquee({ etablissement_id: ETAB_ID, date_visite: NOW })
    expect(c.insert).toHaveBeenCalledWith(
      expect.objectContaining({ est_manquee: true })
    )
  })

  it('rejette un motif invalide', async () => {
    const r = await creerVisiteManquee({
      etablissement_id: ETAB_ID,
      date_visite: NOW,
      motif_manquee: 'pas_envie',
    })
    expect(r.erreur).toBeDefined()
  })
})

describe('lireVisites', () => {
  it('retourne les visites triées par date desc', async () => {
    const { from } = chainOk([{ id: 'v1', date_visite: NOW }])
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    const r = await lireVisites(ETAB_ID)
    expect(r.data).toBeDefined()
  })
})

describe('mettreAJourVisite', () => {
  it('rejette un payload invalide', async () => {
    const r = await mettreAJourVisite('v1', { duree_minutes: -5 })
    expect(r.erreur).toBeDefined()
  })

  it('met à jour les notes', async () => {
    const { from } = chainOk({ id: 'v1', notes: 'Nouveau contenu' })
    vi.mocked(createClient).mockResolvedValue({ from } as any)
    const r = await mettreAJourVisite('v1', { notes: 'Nouveau contenu' })
    expect(r.data).toBeDefined()
  })
})
```

- [ ] **Lancer les tests** — doivent échouer :

```bash
npm test src/test/actions/visite.test.ts
```

- [ ] **Écrire** `src/actions/visite.ts` :

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import {
  VisiteCreateSchema,
  VisiteManqueeCreateSchema,
  VisiteUpdateSchema,
} from '@/lib/validation/visite'
import type { Visite } from '@/types/database'

type ActionResult<T> = { data?: T; erreur?: unknown }

export async function creerVisite(input: unknown): Promise<ActionResult<Visite>> {
  const parsed = VisiteCreateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visite')
    .insert({ ...parsed.data, est_manquee: false })
    .select()
    .single()

  if (error) return { erreur: { message: error.message } }
  revalidatePath(`/etablissements/${parsed.data.etablissement_id}`)
  return { data: data as Visite }
}

export async function creerVisiteManquee(input: unknown): Promise<ActionResult<Visite>> {
  const parsed = VisiteManqueeCreateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visite')
    .insert({ ...parsed.data, est_manquee: true })
    .select()
    .single()

  if (error) return { erreur: { message: error.message } }
  revalidatePath(`/etablissements/${parsed.data.etablissement_id}`)
  return { data: data as Visite }
}

export async function lireVisites(etablissementId: string): Promise<ActionResult<Visite[]>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visite')
    .select('*')
    .eq('etablissement_id', etablissementId)
    .is('deleted_at', null)
    .order('date_visite', { ascending: false })

  if (error) return { erreur: { message: error.message } }
  return { data: data as Visite[] }
}

export async function mettreAJourVisite(
  id: string,
  input: unknown
): Promise<ActionResult<Visite>> {
  const parsed = VisiteUpdateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.flatten() }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visite')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()

  if (error) return { erreur: { message: error.message } }
  return { data: data as Visite }
}
```

- [ ] **Lancer tous les tests** — doivent passer :

```bash
npm test
```

Résultat attendu : `PASS` — tous les fichiers de test passent.

- [ ] **Vérifier** `npm run type-check` passe sans erreur.

- [ ] **Committer** :

```bash
git add src/actions/visite.ts src/test/actions/visite.test.ts
git commit -m "feat(v1a): Server Actions visite (normale + manquée + lecture + update) + tests (tache 9)"
```

---

## Résumé V1a-1

| # | Tâche | Durée |
|---|-------|-------|
| 1 | Migration 003 SQL (schema) | ~10 min |
| 2 | Migration 004 SQL (seeds) | ~5 min |
| 3 | Types TypeScript | ~5 min |
| 4 | Dexie setup | ~5 min |
| 5 | Zod schemas + tests | ~10 min |
| 6 | Server Actions établissement (write) + tests | ~10 min |
| 7 | Server Actions établissement (lecture) + tests | ~5 min |
| 8 | Server Actions contact + tests | ~5 min |
| 9 | Server Actions visite + tests | ~10 min |
| **Total** | | **~65 min** |

**Critère de sortie :** `npm test` passe (toutes suites vertes), `npm run type-check` passe, migrations 003 et 004 exécutées dans Supabase Dashboard, 4 zones + 19 tournées visibles en Table Editor.

---

**Plan complet et sauvegardé dans `docs/superpowers/plans/v1a-1-bdd-server-actions.md`.**

**Deux options d'exécution :**

**1. Subagent-Driven (recommandé)** — un sous-agent par tâche, revue entre chaque, itération rapide. Lancer avec `/subagent-driven-development`.

**2. Inline** — exécution dans cette session avec `executing-plans`, checkpoints à chaque tâche.
