# V1d — Offres temporelles

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à Cyril de gérer ses offres Schenk (cuvée + prix promo + fenêtre temporelle + PDF joint), avec une page `/admin/offres` (liste + CRUD + upload PDF), un widget « Offres en cours » sur la fiche établissement, et un widget « Offres du moment » sur la home.

**Architecture:** Logique métier isolée dans `src/lib/offres/regles.ts` (statut d'une offre selon la date locale Zurich), 100% testée. Server Actions pour CRUD + upload PDF vers Supabase Storage (bucket public en lecture, upload authentifié via RLS). Pages Next.js Server Components pour la lecture, Client Components uniquement pour le formulaire et le picker de fichier.

**Tech Stack:** Next.js 16 Server Actions, React 19, Supabase Storage, Vitest, Zod

**Décisions verrouillées** :
- `offre.date_debut` / `offre.date_fin` sont des **DATE** Postgres (pas TIMESTAMPTZ) → comparaisons YYYY-MM-DD, pas de fuseau horaire pour la date elle-même.
- Une offre est active si `date_debut ≤ aujourd'hui (Zurich) ≤ date_fin`. Les 2 dates incluses.
- « Pas de sync ni cron » : le statut est calculé au vol côté serveur à chaque lecture.
- Bucket Storage : `offres` **public en lecture**, écriture réservée aux utilisateurs authentifiés (RLS Supabase).
- Aucun changement au schéma DB `offre` (V1a-1) — les colonnes existent déjà.
- Pas de sélection d'établissements ciblés en V1d : une offre est **globale** (visible sur toutes les fiches). V2 introduira le ciblage par tournée/statut.

---

## Fichiers créés / modifiés

| Fichier | Rôle |
|---------|------|
| `supabase/migrations/006_v1d_storage_offres.sql` | Bucket `offres` + policies RLS (à exécuter Dashboard) |
| `src/lib/offres/regles.ts` | Fonctions pures : `statutOffre`, `joursAvantExpiration` |
| `src/test/lib/offres/regles.test.ts` | Tests exhaustifs |
| `src/lib/validation/offre.ts` | Zod : `OffreCreateSchema`, `OffreUpdateSchema` (avec cross-validation date_fin ≥ date_debut) |
| `src/actions/offres.ts` | CRUD + upload PDF (Server Actions) |
| `src/test/actions/offres.test.ts` | Tests Server Actions (Supabase mocké) |
| `src/components/offres/carte-offre.tsx` | Item liste avec badge statut + expiration |
| `src/components/offres/liste-offres.tsx` | Client : filtre Actives/Toutes/Expirées |
| `src/components/offres/formulaire-offre.tsx` | Client : création/édition + upload PDF |
| `src/components/offres/widget-offres-fiche.tsx` | Widget compact (liste d'offres actives sur fiche etab) |
| `src/components/offres/widget-offres-accueil.tsx` | Widget très compact pour la home |
| `src/app/(app)/admin/offres/page.tsx` | Server Component liste |
| `src/app/(app)/admin/offres/nouvelle/page.tsx` | Route création |
| `src/app/(app)/admin/offres/[id]/modifier/page.tsx` | Route édition |
| `src/components/etablissements/fiche-etablissement.tsx` | Injecter `<WidgetOffresFiche />` dans onglet Info |
| `src/app/(app)/page.tsx` | Injecter `<WidgetOffresAccueil />` sous le compteur |

---

## Tâche 1 — Règles pures offres (TDD) + migration Storage

**Objectif :** Livrer 2 fonctions pures : `statutOffre(offre, now)` renvoie `'en_cours' | 'a_venir' | 'expiree'`, et `joursAvantExpiration(offre, now)` renvoie le nombre de jours restants (négatif si expirée). Ajouter la migration 006 pour le bucket Storage.

**Fichiers :**
- Créer : `supabase/migrations/006_v1d_storage_offres.sql`
- Créer : `src/lib/offres/regles.ts`, `src/test/lib/offres/regles.test.ts`

**Étapes :**

- [ ] **Créer** `supabase/migrations/006_v1d_storage_offres.sql` :

```sql
-- ============================================================================
-- CRM Cyril — Migration 006 : Storage bucket `offres`
-- ⚠️  À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================================

-- Bucket public en lecture (les PDF sont accessibles via URL sans auth)
INSERT INTO storage.buckets (id, name, public)
VALUES ('offres', 'offres', true)
ON CONFLICT (id) DO NOTHING;

-- Écriture réservée aux utilisateurs authentifiés
DROP POLICY IF EXISTS "offres_upload_authenticated" ON storage.objects;
CREATE POLICY "offres_upload_authenticated"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'offres');

DROP POLICY IF EXISTS "offres_update_authenticated" ON storage.objects;
CREATE POLICY "offres_update_authenticated"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'offres');

DROP POLICY IF EXISTS "offres_delete_authenticated" ON storage.objects;
CREATE POLICY "offres_delete_authenticated"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'offres');

-- Lecture publique (les PDF sont accessibles via signed/public URL)
DROP POLICY IF EXISTS "offres_read_public" ON storage.objects;
CREATE POLICY "offres_read_public"
  ON storage.objects FOR SELECT
  TO public
  USING (bucket_id = 'offres');
```

- [ ] **Écrire les tests** `src/test/lib/offres/regles.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { statutOffre, joursAvantExpiration } from '@/lib/offres/regles'
import type { Offre } from '@/types/database'

function o(overrides: Partial<Offre> = {}): Offre {
  return {
    id: 'x',
    cuvee_text: 'Fendant',
    cuvee_id: null,
    prix_promo_chf: 12.5,
    date_debut: null,
    date_fin: null,
    conditions: null,
    source_pdf_url: null,
    notes: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  }
}

const NOW = '2026-07-28T12:00:00Z'

describe('statutOffre', () => {
  it("en_cours si aujourd'hui entre date_debut et date_fin", () => {
    expect(statutOffre(o({ date_debut: '2026-07-01', date_fin: '2026-08-15' }), NOW)).toBe('en_cours')
  })

  it("en_cours si aujourd'hui = date_debut (inclusif)", () => {
    expect(statutOffre(o({ date_debut: '2026-07-28', date_fin: '2026-08-15' }), NOW)).toBe('en_cours')
  })

  it("en_cours si aujourd'hui = date_fin (inclusif)", () => {
    expect(statutOffre(o({ date_debut: '2026-07-01', date_fin: '2026-07-28' }), NOW)).toBe('en_cours')
  })

  it("a_venir si date_debut > aujourd'hui", () => {
    expect(statutOffre(o({ date_debut: '2026-08-01', date_fin: '2026-08-15' }), NOW)).toBe('a_venir')
  })

  it("expiree si date_fin < aujourd'hui", () => {
    expect(statutOffre(o({ date_debut: '2026-06-01', date_fin: '2026-07-15' }), NOW)).toBe('expiree')
  })

  it("en_cours si aucune date renseignée (offre permanente)", () => {
    expect(statutOffre(o(), NOW)).toBe('en_cours')
  })

  it("respecte la timezone Zurich (23h30 UTC = jour suivant Zurich)", () => {
    // 2026-07-28 23:30 UTC = 2026-07-29 01:30 Zurich (été)
    const now = '2026-07-28T23:30:00Z'
    expect(statutOffre(o({ date_debut: '2026-07-29', date_fin: '2026-07-29' }), now)).toBe('en_cours')
  })
})

describe('joursAvantExpiration', () => {
  it("renvoie null si pas de date_fin", () => {
    expect(joursAvantExpiration(o(), NOW)).toBeNull()
  })

  it("renvoie 0 si date_fin = aujourd'hui", () => {
    expect(joursAvantExpiration(o({ date_fin: '2026-07-28' }), NOW)).toBe(0)
  })

  it("renvoie 7 si date_fin dans 7 jours", () => {
    expect(joursAvantExpiration(o({ date_fin: '2026-08-04' }), NOW)).toBe(7)
  })

  it("renvoie -3 si date_fin il y a 3 jours (expirée)", () => {
    expect(joursAvantExpiration(o({ date_fin: '2026-07-25' }), NOW)).toBe(-3)
  })
})
```

- [ ] **Lancer** — doivent échouer :

```bash
npm test src/test/lib/offres/regles.test.ts
```

- [ ] **Écrire** `src/lib/offres/regles.ts` :

```ts
import { dateJourLocal } from '@/lib/objectif/regles'
import type { Offre } from '@/types/database'

export type StatutOffre = 'en_cours' | 'a_venir' | 'expiree'

export function statutOffre(offre: Offre, maintenantIso: string = new Date().toISOString()): StatutOffre {
  const jour = dateJourLocal(maintenantIso)
  const { date_debut, date_fin } = offre
  if (date_debut && jour < date_debut) return 'a_venir'
  if (date_fin && jour > date_fin) return 'expiree'
  return 'en_cours'
}

export function joursAvantExpiration(offre: Offre, maintenantIso: string = new Date().toISOString()): number | null {
  if (!offre.date_fin) return null
  const jour = dateJourLocal(maintenantIso)
  const [jy, jm, jj] = jour.split('-').map(Number)
  const [fy, fm, fj] = offre.date_fin.split('-').map(Number)
  const now = Date.UTC(jy, jm - 1, jj)
  const fin = Date.UTC(fy, fm - 1, fj)
  return Math.round((fin - now) / (1000 * 60 * 60 * 24))
}
```

- [ ] **Lancer** les tests — tous verts (~10 tests).

- [ ] **Committer** :

```bash
git add supabase/migrations/006_v1d_storage_offres.sql src/lib/offres/regles.ts src/test/lib/offres/regles.test.ts
git commit -m "feat(v1d): règles pures offres (statut + expiration) + migration Storage bucket (tache 1)"
```

**Critère de fin :** ~10 tests verts, migration 006 committée (à exécuter Supabase Dashboard avant test terrain).

---

## Tâche 2 — Server Actions offres CRUD + upload PDF + Zod

**Objectif :** Fournir `creerOffre`, `mettreAJourOffre`, `supprimerOffre`, `lireOffres(filtres?)`, `lireOffresActives()`, `lireOffreParId(id)`, `uploadOffrePdf(FormData)`. Zod avec cross-validation `date_fin ≥ date_debut`.

**Fichiers :**
- Créer : `src/lib/validation/offre.ts`
- Créer : `src/actions/offres.ts`, `src/test/actions/offres.test.ts`

**Étapes :**

- [ ] **Créer** `src/lib/validation/offre.ts` :

```ts
import { z } from 'zod'

const dateIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Format attendu YYYY-MM-DD')

const base = {
  cuvee_text:     z.string().min(1, 'Cuvée obligatoire').max(200),
  prix_promo_chf: z.number().positive().max(100000).nullable().optional(),
  date_debut:     dateIso.nullable().optional(),
  date_fin:       dateIso.nullable().optional(),
  conditions:     z.string().max(1000).nullable().optional(),
  notes:          z.string().max(2000).nullable().optional(),
  source_pdf_url: z.string().url().nullable().optional(),
}

function crossValideDates(v: { date_debut?: string | null; date_fin?: string | null }) {
  if (v.date_debut && v.date_fin && v.date_fin < v.date_debut) {
    return { message: 'date_fin doit être ≥ date_debut', path: ['date_fin'] as const }
  }
  return null
}

export const OffreCreateSchema = z.object(base).superRefine((v, ctx) => {
  const err = crossValideDates(v)
  if (err) ctx.addIssue({ code: 'custom', ...err })
})

export const OffreUpdateSchema = z.object(base).partial().superRefine((v, ctx) => {
  const err = crossValideDates(v)
  if (err) ctx.addIssue({ code: 'custom', ...err })
})

export type OffreCreateInput = z.infer<typeof OffreCreateSchema>
export type OffreUpdateInput = z.infer<typeof OffreUpdateSchema>
```

- [ ] **Écrire les tests** `src/test/actions/offres.test.ts` :

```ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import {
  creerOffre, mettreAJourOffre, supprimerOffre,
  lireOffres, lireOffresActives, lireOffreParId, uploadOffrePdf,
} from '@/actions/offres'
import { createClient } from '@/lib/supabase/server'

function singleOk(data: unknown = { id: 'o1' }) {
  const chain = {
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
    eq:     vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockResolvedValue({ data: [data], error: null }),
    lte:    vi.fn().mockReturnThis(),
    gte:    vi.fn().mockReturnThis(),
  }
  return { from: vi.fn().mockReturnValue(chain), chain }
}

describe('creerOffre', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejette cuvee_text vide', async () => {
    const r = await creerOffre({ cuvee_text: '' })
    expect(r.erreur).toBeDefined()
  })

  it('rejette si date_fin < date_debut', async () => {
    const r = await creerOffre({
      cuvee_text: 'Fendant',
      date_debut: '2026-08-15',
      date_fin: '2026-08-01',
    })
    expect(r.erreur).toBeDefined()
  })

  it('insère quand valide', async () => {
    const mock = singleOk({ id: 'o_new' })
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await creerOffre({ cuvee_text: 'Fendant', prix_promo_chf: 12.5 })
    expect(r.data?.id).toBe('o_new')
  })
})

describe('lireOffresActives', () => {
  it("retourne uniquement les offres dont la fenêtre couvre aujourd'hui", async () => {
    const mock = singleOk({ id: 'o1', cuvee_text: 'A' })
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireOffresActives()
    expect(r.data?.length).toBe(1)
    // Vérifie les 2 filtres date_debut ≤ today ET date_fin ≥ today
    expect(mock.chain.lte).toHaveBeenCalled()
    expect(mock.chain.gte).toHaveBeenCalled()
  })
})

describe('mettreAJourOffre', () => {
  it('met à jour avec payload valide', async () => {
    const mock = singleOk({ id: 'o1', cuvee_text: 'Nouvelle' })
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await mettreAJourOffre('o1', { cuvee_text: 'Nouvelle' })
    expect(r.data?.id).toBe('o1')
  })
})

describe('supprimerOffre', () => {
  it('soft-delete', async () => {
    const chain = {
      update: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockResolvedValue({ error: null }),
    }
    vi.mocked(createClient).mockResolvedValue({ from: vi.fn().mockReturnValue(chain) } as never)
    const r = await supprimerOffre('o1')
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ deleted_at: expect.any(String) }),
    )
    expect(r.erreur).toBeUndefined()
  })
})

describe('lireOffres', () => {
  it("liste toutes offres (filtre 'toutes' par défaut)", async () => {
    const mock = singleOk({ id: 'o1' })
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireOffres()
    expect(r.data?.length).toBe(1)
  })
})

describe('lireOffreParId', () => {
  it("renvoie l'offre par id", async () => {
    const mock = singleOk({ id: 'o1', cuvee_text: 'X' })
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireOffreParId('o1')
    expect(r.data?.cuvee_text).toBe('X')
  })
})

describe('uploadOffrePdf', () => {
  it('rejette si pas de fichier', async () => {
    const fd = new FormData()
    const r = await uploadOffrePdf(fd)
    expect(r.erreur).toBeDefined()
  })

  it('upload vers bucket "offres" et retourne l\'URL publique', async () => {
    const uploadRes = { data: { path: 'abc.pdf' }, error: null }
    const publicUrlRes = { data: { publicUrl: 'https://x.co/abc.pdf' } }
    const supabase = {
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue(uploadRes),
          getPublicUrl: vi.fn().mockReturnValue(publicUrlRes),
        }),
      },
    }
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const fd = new FormData()
    fd.append('fichier', new Blob(['%PDF-1.4'], { type: 'application/pdf' }), 'test.pdf')
    const r = await uploadOffrePdf(fd)
    expect(r.data).toBe('https://x.co/abc.pdf')
  })
})
```

- [ ] **Écrire** `src/actions/offres.ts` :

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { OffreCreateSchema, OffreUpdateSchema } from '@/lib/validation/offre'
import { dateJourLocal } from '@/lib/objectif/regles'
import type { Offre } from '@/types/database'

type ActionResult<T> = { data?: T; erreur?: string }

export interface FiltresOffres {
  statut?: 'actives' | 'toutes' | 'expirees'
}

export async function creerOffre(input: unknown): Promise<ActionResult<Offre>> {
  const parsed = OffreCreateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? 'Payload invalide' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('offre').insert(parsed.data).select().single()
  if (error) return { erreur: error.message }
  revalidatePath('/admin/offres')
  revalidatePath('/')
  return { data: data as Offre }
}

export async function mettreAJourOffre(id: string, input: unknown): Promise<ActionResult<Offre>> {
  const parsed = OffreUpdateSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.issues[0]?.message ?? 'Payload invalide' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('offre').update(parsed.data).eq('id', id).select().single()
  if (error) return { erreur: error.message }
  revalidatePath('/admin/offres')
  revalidatePath(`/admin/offres/${id}/modifier`)
  revalidatePath('/')
  return { data: data as Offre }
}

export async function supprimerOffre(id: string): Promise<ActionResult<void>> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('offre').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return { erreur: error.message }
  revalidatePath('/admin/offres')
  return {}
}

export async function lireOffres(filtres: FiltresOffres = {}): Promise<ActionResult<Offre[]>> {
  const supabase = await createClient()
  let query = supabase.from('offre').select('*').is('deleted_at', null)
  const jour = dateJourLocal(new Date().toISOString())
  if (filtres.statut === 'actives') {
    query = query.lte('date_debut', jour).gte('date_fin', jour)
  } else if (filtres.statut === 'expirees') {
    query = query.lte('date_fin', jour)
  }
  const { data, error } = await query.order('date_fin', {
    ascending: false, nullsFirst: false,
  })
  if (error) return { erreur: error.message }
  return { data: (data ?? []) as Offre[] }
}

export async function lireOffresActives(): Promise<ActionResult<Offre[]>> {
  const supabase = await createClient()
  const jour = dateJourLocal(new Date().toISOString())
  const { data, error } = await supabase
    .from('offre').select('*').is('deleted_at', null)
    .lte('date_debut', jour).gte('date_fin', jour)
    .order('date_fin', { ascending: true })
  if (error) return { erreur: error.message }
  return { data: (data ?? []) as Offre[] }
}

export async function lireOffreParId(id: string): Promise<ActionResult<Offre>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('offre').select('*').eq('id', id).is('deleted_at', null).single()
  if (error) return { erreur: error.message }
  return { data: data as Offre }
}

export async function uploadOffrePdf(formData: FormData): Promise<ActionResult<string>> {
  const fichier = formData.get('fichier')
  if (!(fichier instanceof Blob) || fichier.size === 0) {
    return { erreur: 'Aucun fichier reçu' }
  }
  const nom = fichier instanceof File ? fichier.name : 'offre.pdf'
  const cleanNom = nom.replace(/[^\w.\-]/g, '_').slice(-100)
  const path = `${Date.now()}-${cleanNom}`

  const supabase = await createClient()
  const { error } = await supabase.storage
    .from('offres')
    .upload(path, fichier, { cacheControl: '3600', upsert: false })
  if (error) return { erreur: `Upload : ${error.message}` }

  const { data } = supabase.storage.from('offres').getPublicUrl(path)
  return { data: data.publicUrl }
}
```

- [ ] **Lancer les tests** — tous verts (~9 tests).

- [ ] **Committer** :

```bash
git add src/lib/validation/offre.ts src/actions/offres.ts src/test/actions/offres.test.ts
git commit -m "feat(v1d): Server Actions offres CRUD + upload PDF + Zod cross-validation dates (tache 2)"
```

**Critère de fin :** tests verts, `npm run type-check` OK.

---

## Tâche 3 — Page `/admin/offres` : liste + filtre + badge statut

**Objectif :** Livrer `carte-offre.tsx` (item avec badge coloré selon statut + urgence expiration), `liste-offres.tsx` (client, filtre 3 valeurs), page Server Component.

**Fichiers :**
- Créer : `src/components/offres/carte-offre.tsx`, `src/components/offres/liste-offres.tsx`
- Créer : `src/app/(app)/admin/offres/page.tsx`

**Étapes :**

- [ ] **Créer** `src/components/offres/carte-offre.tsx` :

```tsx
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { statutOffre, joursAvantExpiration } from '@/lib/offres/regles'
import { formatCHF, formatDateSuisse } from '@/lib/format'
import type { Offre } from '@/types/database'

function libelleStatut(s: ReturnType<typeof statutOffre>) {
  if (s === 'en_cours') return 'En cours'
  if (s === 'a_venir')  return 'À venir'
  return 'Expirée'
}

function variantStatut(s: ReturnType<typeof statutOffre>) {
  if (s === 'en_cours') return 'default' as const
  if (s === 'a_venir')  return 'secondary' as const
  return 'outline' as const
}

function BadgeExpiration({ jours }: { jours: number | null }) {
  if (jours === null || jours < 0) return null
  const style =
    jours <= 2
      ? 'bg-red-500 text-white'
      : jours <= 7
        ? 'bg-orange-500 text-white'
        : 'bg-slate-200 text-slate-700'
  return (
    <Badge className={style}>
      {jours === 0 ? "Expire aujourd'hui" : `Expire dans ${jours} j`}
    </Badge>
  )
}

export function CarteOffre({ offre, href }: { offre: Offre; href?: string }) {
  const now = new Date().toISOString()
  const s = statutOffre(offre, now)
  const jours = joursAvantExpiration(offre, now)
  const content = (
    <Card className="p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium">{offre.cuvee_text}</p>
          <p className="text-xs text-muted-foreground">
            {offre.date_debut && offre.date_fin
              ? `${formatDateSuisse(offre.date_debut)} → ${formatDateSuisse(offre.date_fin)}`
              : 'Sans dates'}
            {offre.prix_promo_chf !== null && ` · ${formatCHF(offre.prix_promo_chf)}`}
          </p>
          {offre.conditions && (
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {offre.conditions}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <Badge variant={variantStatut(s)}>{libelleStatut(s)}</Badge>
          {s === 'en_cours' && <BadgeExpiration jours={jours} />}
        </div>
      </div>
    </Card>
  )
  return href ? <Link href={href}>{content}</Link> : content
}
```

- [ ] **Créer** `src/components/offres/liste-offres.tsx` :

```tsx
'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { buttonVariants } from '@/components/ui/button'
import { CarteOffre } from './carte-offre'
import { statutOffre } from '@/lib/offres/regles'
import { cn } from '@/lib/utils'
import type { Offre } from '@/types/database'

type Filtre = 'actives' | 'toutes' | 'expirees'

export function ListeOffres({ offres }: { offres: Offre[] }) {
  const [filtre, setFiltre] = useState<Filtre>('actives')
  const now = new Date().toISOString()

  const filtrees = useMemo(() => {
    if (filtre === 'toutes') return offres
    return offres.filter((o) => {
      const s = statutOffre(o, now)
      return filtre === 'actives'
        ? s === 'en_cours' || s === 'a_venir'
        : s === 'expiree'
    })
  }, [offres, filtre, now])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Select value={filtre} onValueChange={(v) => v && setFiltre(v as Filtre)}>
          <SelectTrigger className="h-10 flex-1 text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="actives">Actives (en cours + à venir)</SelectItem>
            <SelectItem value="toutes">Toutes</SelectItem>
            <SelectItem value="expirees">Expirées</SelectItem>
          </SelectContent>
        </Select>
        <span className="shrink-0 text-xs text-muted-foreground">
          {filtrees.length}/{offres.length}
        </span>
      </div>

      {filtrees.length === 0 ? (
        <p className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Aucune offre à afficher.
        </p>
      ) : (
        <ul className="space-y-2">
          {filtrees.map((o) => (
            <li key={o.id}>
              <CarteOffre offre={o} href={`/admin/offres/${o.id}/modifier`} />
            </li>
          ))}
        </ul>
      )}

      <Link
        href="/admin/offres/nouvelle"
        className={cn(
          buttonVariants({ variant: 'default' }),
          'fixed bottom-24 right-4 z-40 h-14 gap-1 rounded-full px-5 shadow-lg',
        )}
      >
        <span aria-hidden className="text-lg leading-none">+</span>
        Nouvelle
      </Link>
    </div>
  )
}
```

- [ ] **Créer** `src/app/(app)/admin/offres/page.tsx` :

```tsx
import { lireOffres } from '@/actions/offres'
import { ListeOffres } from '@/components/offres/liste-offres'

export default async function AdminOffresPage() {
  const r = await lireOffres()
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-xl font-semibold">Offres Schenk</h1>
        <p className="text-sm text-muted-foreground">
          Gestion des cuvées en promotion.
        </p>
      </header>
      <ListeOffres offres={r.data ?? []} />
    </div>
  )
}
```

- [ ] **Vérifier** : `npm run type-check`, ouvrir `/admin/offres` — page rendue.

- [ ] **Committer** :

```bash
git add src/components/offres/carte-offre.tsx src/components/offres/liste-offres.tsx "src/app/(app)/admin/offres/page.tsx"
git commit -m "feat(v1d): page /admin/offres — liste + filtres + badges statut et expiration (tache 3)"
```

**Critère de fin :** page rendue, filtre fonctionne, bouton flottant vers `/admin/offres/nouvelle` cliquable.

---

## Tâche 4 — Formulaire offre (création + édition + upload PDF)

**Objectif :** Client component `formulaire-offre.tsx` gérant les 2 modes + upload PDF (bouton « Joindre un PDF » → appelle `uploadOffrePdf`, met à jour `source_pdf_url` dans le state, affiche « ✓ PDF joint »). Bouton « Voir PDF » si `source_pdf_url` défini.

**Fichiers :**
- Créer : `src/components/offres/formulaire-offre.tsx`
- Créer : `src/app/(app)/admin/offres/nouvelle/page.tsx`
- Créer : `src/app/(app)/admin/offres/[id]/modifier/page.tsx`

**Étapes :**

- [ ] **Créer** `src/components/offres/formulaire-offre.tsx` :

```tsx
'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import {
  creerOffre, mettreAJourOffre, supprimerOffre, uploadOffrePdf,
} from '@/actions/offres'
import type { Offre } from '@/types/database'

interface Props { mode: 'creation' | 'edition'; initial?: Offre }

type FormState = {
  cuvee_text: string
  prix_promo_chf: string
  date_debut: string
  date_fin: string
  conditions: string
  notes: string
  source_pdf_url: string | null
}

function initFrom(o?: Offre): FormState {
  return {
    cuvee_text:     o?.cuvee_text ?? '',
    prix_promo_chf: o?.prix_promo_chf?.toString() ?? '',
    date_debut:     o?.date_debut ?? '',
    date_fin:       o?.date_fin ?? '',
    conditions:     o?.conditions ?? '',
    notes:          o?.notes ?? '',
    source_pdf_url: o?.source_pdf_url ?? null,
  }
}

function payloadFromState(s: FormState) {
  const clean = (v: string) => (v.trim() === '' ? null : v.trim())
  const prix = clean(s.prix_promo_chf)
  return {
    cuvee_text:     s.cuvee_text.trim(),
    prix_promo_chf: prix ? Number(prix) : null,
    date_debut:     clean(s.date_debut),
    date_fin:       clean(s.date_fin),
    conditions:     clean(s.conditions),
    notes:          clean(s.notes),
    source_pdf_url: s.source_pdf_url,
  }
}

export function FormulaireOffre({ mode, initial }: Props) {
  const router = useRouter()
  const [state, setState] = useState<FormState>(() => initFrom(initial))
  const [erreur, setErreur] = useState<string | null>(null)
  const [messagePdf, setMessagePdf] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [pending, startTransition] = useTransition()

  function set<K extends keyof FormState>(k: K, v: FormState[K]) {
    setState((s) => ({ ...s, [k]: v }))
  }

  async function onPdfChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    setMessagePdf(null)
    const fd = new FormData()
    fd.append('fichier', file)
    const r = await uploadOffrePdf(fd)
    setUploading(false)
    if (r.erreur || !r.data) {
      setMessagePdf(`Erreur : ${r.erreur ?? 'inconnue'}`)
      return
    }
    set('source_pdf_url', r.data)
    setMessagePdf('✓ PDF joint')
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErreur(null)
    if (!state.cuvee_text.trim()) {
      setErreur('Cuvée obligatoire.')
      return
    }
    const payload = payloadFromState(state)
    startTransition(async () => {
      const r = mode === 'creation'
        ? await creerOffre(payload)
        : await mettreAJourOffre(initial!.id, payload)
      if (r.erreur) {
        setErreur(r.erreur)
        return
      }
      router.push('/admin/offres')
    })
  }

  async function onSupprimer() {
    if (!initial) return
    if (!window.confirm(`Supprimer l'offre "${initial.cuvee_text}" ?`)) return
    startTransition(async () => {
      await supprimerOffre(initial.id)
      router.push('/admin/offres')
    })
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-white/95 px-4 py-3 backdrop-blur">
        <button
          type="button" onClick={() => router.back()}
          className="tap-target -ml-2 rounded-md text-xl leading-none"
          aria-label="Retour"
        >‹</button>
        <h1 className="flex-1 truncate text-lg font-semibold">
          {mode === 'creation' ? 'Nouvelle offre' : 'Modifier offre'}
        </h1>
      </header>

      <div className="flex flex-col gap-4 px-4 py-4 pb-32">
        <div className="space-y-1.5">
          <Label htmlFor="cuvee">Cuvée *</Label>
          <Input
            id="cuvee" value={state.cuvee_text}
            onChange={(e) => set('cuvee_text', e.target.value)}
            required placeholder="Fendant Mont d'Or 2023"
            className="h-12 text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="prix">Prix promo (CHF)</Label>
          <Input
            id="prix" type="number" inputMode="decimal" step="0.05" min="0"
            value={state.prix_promo_chf}
            onChange={(e) => set('prix_promo_chf', e.target.value)}
            className="h-12 text-base"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="dd">Date début</Label>
            <Input
              id="dd" type="date" value={state.date_debut}
              onChange={(e) => set('date_debut', e.target.value)}
              className="h-12 text-base"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="df">Date fin</Label>
            <Input
              id="df" type="date" value={state.date_fin}
              onChange={(e) => set('date_fin', e.target.value)}
              className="h-12 text-base"
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="cond">Conditions</Label>
          <Textarea
            id="cond" rows={3} placeholder="Sur 6 bouteilles minimum"
            value={state.conditions}
            onChange={(e) => set('conditions', e.target.value)}
            className="text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes internes</Label>
          <Textarea
            id="notes" rows={3}
            value={state.notes}
            onChange={(e) => set('notes', e.target.value)}
            className="text-base"
          />
        </div>

        <div className="space-y-1.5">
          <Label>PDF joint</Label>
          <label
            className={cn(
              buttonVariants({ variant: 'outline' }),
              'flex h-12 cursor-pointer items-center justify-center text-base',
            )}
          >
            <input
              type="file" accept="application/pdf"
              onChange={onPdfChange} disabled={uploading}
              className="sr-only"
            />
            {uploading ? 'Upload…' : state.source_pdf_url ? 'Remplacer le PDF' : 'Joindre un PDF'}
          </label>
          {state.source_pdf_url && (
            <a
              href={state.source_pdf_url}
              target="_blank" rel="noreferrer"
              className="block text-center text-sm underline"
            >
              Voir PDF
            </a>
          )}
          {messagePdf && (
            <p className={`text-xs ${messagePdf.startsWith('✓') ? 'text-emerald-600' : 'text-destructive'}`}>
              {messagePdf}
            </p>
          )}
        </div>

        {mode === 'edition' && (
          <Button
            type="button" variant="destructive"
            onClick={onSupprimer} disabled={pending}
            className="h-12 text-base"
          >
            Supprimer l&apos;offre
          </Button>
        )}

        {erreur && (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
            {erreur}
          </p>
        )}
      </div>

      <div className="fixed inset-x-0 bottom-16 z-40 border-t bg-white/95 px-4 py-3 safe-bottom backdrop-blur">
        <div className="flex gap-2">
          <Link
            href="/admin/offres"
            className={cn(buttonVariants({ variant: 'outline' }), 'h-12 flex-1 text-base')}
          >
            Annuler
          </Link>
          <Button
            type="submit" disabled={pending || uploading}
            className="h-12 flex-1 text-base"
          >
            {pending ? 'Enregistrement…' : 'Enregistrer'}
          </Button>
        </div>
      </div>
    </form>
  )
}
```

- [ ] **Créer** `src/app/(app)/admin/offres/nouvelle/page.tsx` :

```tsx
import { FormulaireOffre } from '@/components/offres/formulaire-offre'
export default function NouvelleOffrePage() {
  return <FormulaireOffre mode="creation" />
}
```

- [ ] **Créer** `src/app/(app)/admin/offres/[id]/modifier/page.tsx` :

```tsx
import { notFound } from 'next/navigation'
import { lireOffreParId } from '@/actions/offres'
import { FormulaireOffre } from '@/components/offres/formulaire-offre'

export default async function ModifierOffrePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const r = await lireOffreParId(id)
  if (r.erreur || !r.data) notFound()
  return <FormulaireOffre mode="edition" initial={r.data} />
}
```

- [ ] **Vérifier** : `npm run type-check`, `npm run build`, uploader un PDF, voir le lien « Voir PDF », supprimer une offre.

- [ ] **Committer** :

```bash
git add src/components/offres/formulaire-offre.tsx "src/app/(app)/admin/offres/nouvelle/" "src/app/(app)/admin/offres/[id]/"
git commit -m "feat(v1d): formulaire offre création/édition + upload PDF Supabase Storage (tache 4)"
```

**Critère de fin :** créer une offre avec PDF → apparaît dans la liste, PDF visible via lien externe.

---

## Tâche 5 — Widgets fiche + accueil + push

**Objectif :** Livrer 2 widgets Server Components qui affichent les offres actives. Push final.

**Fichiers :**
- Créer : `src/components/offres/widget-offres-fiche.tsx`, `src/components/offres/widget-offres-accueil.tsx`
- Modifier : `src/components/etablissements/fiche-etablissement.tsx`, `src/app/(app)/page.tsx`

**Étapes :**

- [ ] **Créer** `src/components/offres/widget-offres-fiche.tsx` (Server Component) :

```tsx
import { lireOffresActives } from '@/actions/offres'
import { CarteOffre } from './carte-offre'

export async function WidgetOffresFiche() {
  const r = await lireOffresActives()
  const offres = r.data ?? []
  if (offres.length === 0) return null

  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        Offres en cours ({offres.length})
      </h3>
      <ul className="space-y-2">
        {offres.map((o) => (
          <li key={o.id}>
            <CarteOffre offre={o} href={`/admin/offres/${o.id}/modifier`} />
          </li>
        ))}
      </ul>
    </section>
  )
}
```

- [ ] **Créer** `src/components/offres/widget-offres-accueil.tsx` (Server Component, format ultra compact) :

```tsx
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { lireOffresActives } from '@/actions/offres'
import { joursAvantExpiration } from '@/lib/offres/regles'

export async function WidgetOffresAccueil() {
  const r = await lireOffresActives()
  const offres = r.data ?? []
  if (offres.length === 0) return null

  const now = new Date().toISOString()

  return (
    <Card className="p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Offres du moment ({offres.length})
        </h2>
        <Link href="/admin/offres" className="text-xs underline">
          Voir tout
        </Link>
      </div>
      <ul className="space-y-1.5">
        {offres.slice(0, 3).map((o) => {
          const j = joursAvantExpiration(o, now)
          return (
            <li key={o.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{o.cuvee_text}</span>
              {j !== null && (
                <Badge variant={j <= 2 ? 'destructive' : 'secondary'} className="shrink-0">
                  {j === 0 ? "Expire aujourd'hui" : `${j} j`}
                </Badge>
              )}
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
```

- [ ] **Modifier** `src/components/etablissements/fiche-etablissement.tsx` — ajouter le widget dans `TabsContent value="info"`, juste sous le dernier `<BlocInfos />` :

Repérer la ligne :

```tsx
{etablissement.notes_internes && (
```

Et **ajouter juste avant** :

```tsx
<WidgetOffresFiche />
```

Puis, en tête du fichier, ajouter l'import :

```tsx
import { WidgetOffresFiche } from '@/components/offres/widget-offres-fiche'
```

Note : `WidgetOffresFiche` est un Server Component asynchrone. Il est utilisé ici depuis un Client Component (`fiche-etablissement.tsx` est marqué `'use client'`). C'est un cas où on doit passer les données en props au lieu d'inclure directement le composant server. **Refactor** :
- Charger les offres actives dans `src/app/(app)/etablissements/[id]/page.tsx` (Server Component parent) via `lireOffresActives()`.
- Passer le résultat en prop à `<FicheEtablissement offresActives={...} />`.
- Injecter le rendu dans l'onglet Info comme composant client léger.

Concrètement :

**Modifier** `src/app/(app)/etablissements/[id]/page.tsx` :

```tsx
import { notFound } from 'next/navigation'
import { lireEtablissement } from '@/actions/etablissement'
import { lireContacts } from '@/actions/contact'
import { lireVisites } from '@/actions/visite'
import { lireOffresActives } from '@/actions/offres'
import { FicheEtablissement } from '@/components/etablissements/fiche-etablissement'

export default async function EtablissementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [etabRes, contactsRes, visitesRes, offresRes] = await Promise.all([
    lireEtablissement(id),
    lireContacts(id),
    lireVisites(id),
    lireOffresActives(),
  ])
  if (etabRes.erreur || !etabRes.data) notFound()
  return (
    <FicheEtablissement
      etablissement={etabRes.data}
      contacts={contactsRes.data ?? []}
      visites={visitesRes.data ?? []}
      offresActives={offresRes.data ?? []}
    />
  )
}
```

**Modifier** `src/components/etablissements/fiche-etablissement.tsx` :

- Ajouter import :

```tsx
import { CarteOffre } from '@/components/offres/carte-offre'
import type { Offre } from '@/types/database'
```

- Étendre les props :

```tsx
export function FicheEtablissement({
  etablissement,
  contacts,
  visites,
  offresActives,
}: {
  etablissement: Etablissement
  contacts: Contact[]
  visites: Visite[]
  offresActives: Offre[]
}) {
```

- Dans `TabsContent value="info"`, ajouter avant le bloc notes_internes :

```tsx
{offresActives.length > 0 && (
  <section className="space-y-2">
    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
      Offres en cours ({offresActives.length})
    </h3>
    <ul className="space-y-2">
      {offresActives.map((o) => (
        <li key={o.id}>
          <CarteOffre offre={o} href={`/admin/offres/${o.id}/modifier`} />
        </li>
      ))}
    </ul>
  </section>
)}
```

- [ ] **Modifier** `src/app/(app)/page.tsx` — ajouter `<WidgetOffresAccueil />` juste après `<WidgetObjectif />` :

```tsx
import { WidgetOffresAccueil } from '@/components/offres/widget-offres-accueil'
// ...
<WidgetObjectif />
<WidgetOffresAccueil />
<SuggestionsAujourdhui ... />
```

- [ ] **Vérifier** :

```bash
npm run type-check
npm test
npm run build
```

- [ ] **Committer** :

```bash
git add src/components/offres/widget-offres-fiche.tsx src/components/offres/widget-offres-accueil.tsx src/components/etablissements/fiche-etablissement.tsx "src/app/(app)/etablissements/[id]/page.tsx" "src/app/(app)/page.tsx"
git commit -m "feat(v1d): widgets 'Offres en cours' sur fiche + 'Offres du moment' sur accueil (tache 5)"
```

- [ ] **Push** :

```bash
git push origin main
```

- [ ] **Action externe** : exécuter `supabase/migrations/006_v1d_storage_offres.sql` dans Supabase Dashboard **avant** de tester en prod (sinon les uploads échouent).

**Critère de fin :** Vercel redéploie, offres visibles sur `/`, sur fiche, page `/admin/offres` fonctionnelle avec CRUD + PDF.

---

## Résumé V1d

| # | Tâche | Durée estimée |
|---|-------|---------------|
| 1 | Règles pures + migration Storage | ~15 min |
| 2 | Server Actions CRUD + upload PDF + Zod | ~25 min |
| 3 | Page /admin/offres + liste + filtres | ~20 min |
| 4 | Formulaire création/édition + PDF | ~25 min |
| 5 | Widgets fiche + accueil + push | ~15 min |
| **Total** | | **~1h40** |

**Critère de sortie V1d** :
- Cyril crée une offre « Fendant Mont d'Or 2023 · 12.50 CHF · du 01.08 au 31.08 » sur `/admin/offres/nouvelle`, joint un PDF → l'offre apparaît en liste avec badge « À venir ».
- Le 1er août, l'offre passe automatiquement à « En cours » avec badge « Expire dans 30 j ».
- Cyril ouvre `/` → widget « Offres du moment » affiche la cuvée compacte.
- Cyril ouvre une fiche établissement → onglet Info → section « Offres en cours » avec la carte offre + lien vers `/admin/offres/{id}/modifier`.
- `npm test` : 192 → ~210 verts.

---

**Deux options d'exécution :**

**1. Subagent-Driven (recommandé)** — un sous-agent par tâche, revue entre chaque, itération rapide. Lancer avec `/subagent-driven-development`.

**2. Inline** — exécution dans cette session avec `executing-plans`, checkpoints à chaque tâche.
