# V1f — Chat Claude + Rappels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer le module central du spec V1 — un chat Claude contextuel qui crée des rappels via tool use, et une vue rappels organisée par échéance avec badge de navigation.

**Architecture:**
- **Rappels** : Server Actions CRUD (Zod validé), page `/rappels` avec 3 sections (Aujourd'hui / Cette semaine / Plus tard), formulaire bottom-sheet, badge count sur nav. Créés par utilisateur OU par Claude.
- **Chat** : page `/chat` (nouvelle conversation + historique), Server Action `envoyerMessage` avec boucle tool use manuelle (SDK Anthropic déjà installé V0-T11), 1 seul outil V1 = `creer_rappel`, streaming coté client, monitoring tokens dans `parametre`. Contexte facultatif (établissement/visite) injecté dans le system prompt.
- **Persistance** : Table `rappel` (déjà créée mig 001) étendue via mig 009 avec `visite_id`, `fait_at`, `push_active`, `cree_par`. Table `conversation` (déjà créée) suffit. Bucket Storage `chat-images` pour V1f.5 (screenshots).

**Tech Stack:**
- SDK : `@anthropic-ai/sdk` (déjà installé)
- Modèle : `claude-haiku-4-5` (choix Cyril — coût contenu, latence faible, suffisant pour V1)
- UI : shadcn/ui base-nova (Button, Sheet, Dialog, Card, Tabs, Badge, Textarea)
- Validation : Zod
- Tests : Vitest + fake-indexeddb + jsdom + @testing-library/react
- Fuseau : Europe/Zurich pour tout calcul d'échéance

---

## Task 1: Migration 009 + types + Server Actions rappels (TDD)

**Objectif :** Étendre la table `rappel`, poser les types TS/Zod, et implémenter la couche métier CRUD avec tests.

**Files:**
- Create: `supabase/migrations/009_v1f_rappel_chat.sql`
- Create: `src/types/rappel.ts`
- Create: `src/lib/rappels/regroupement.ts`
- Create: `src/lib/rappels/regroupement.test.ts`
- Create: `src/actions/rappels.ts`
- Create: `src/actions/rappels.test.ts`

- [ ] **Step 1.1 : Écrire la migration 009**

```sql
-- 009_v1f_rappel_chat.sql
-- Étend la table rappel pour V1f (Chat Claude + module Rappels)

CREATE TYPE cree_par_type AS ENUM ('utilisateur', 'claude');

ALTER TABLE rappel
  ADD COLUMN IF NOT EXISTS visite_id UUID REFERENCES visite(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS fait_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS push_active BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS cree_par cree_par_type NOT NULL DEFAULT 'utilisateur',
  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES conversation(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rappel_echeance_statut
  ON rappel (echeance) WHERE statut = 'a_faire' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_rappel_etablissement
  ON rappel (etablissement_id) WHERE deleted_at IS NULL;

-- Bucket Storage pour screenshots du chat (privé, lecture via signed URL)
INSERT INTO storage.buckets (id, name, public)
VALUES ('chat-images', 'chat-images', false)
ON CONFLICT (id) DO NOTHING;
```

- [ ] **Step 1.2 : Types TS et schéma Zod**

```typescript
// src/types/rappel.ts
import { z } from 'zod'

export type StatutRappel = 'a_faire' | 'fait' | 'annule'
export type CanalRappel = 'whatsapp' | 'mail' | 'telephone' | 'sms' | 'autre'
export type CreePar = 'utilisateur' | 'claude'

export const rappelInputSchema = z.object({
  titre: z.string().min(1, 'Titre requis').max(200),
  description: z.string().max(2000).nullable().optional(),
  echeance: z.string().datetime({ offset: true }),
  canal: z.enum(['whatsapp', 'mail', 'telephone', 'sms', 'autre']).nullable().optional(),
  etablissement_id: z.string().uuid().nullable().optional(),
  visite_id: z.string().uuid().nullable().optional(),
  push_active: z.boolean().default(true),
})
export type RappelInput = z.infer<typeof rappelInputSchema>

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
  cree_par: CreePar
  conversation_id: string | null
  created_at: string
  updated_at: string
  etablissement?: { enseigne: string } | null
}

export interface RappelsRegroupes {
  aujourdhui: Rappel[]
  cetteSemaine: Rappel[]
  plusTard: Rappel[]
  enRetard: Rappel[]
}
```

- [ ] **Step 1.3 : Écrire le test rouge — `regrouperRappels`**

```typescript
// src/lib/rappels/regroupement.test.ts
import { describe, it, expect } from 'vitest'
import { regrouperRappels } from './regroupement'
import type { Rappel } from '@/types/rappel'

function mkRappel(id: string, echeance: string, statut: 'a_faire' | 'fait' = 'a_faire'): Rappel {
  return {
    id, titre: id, description: null, echeance, statut, canal: null,
    etablissement_id: null, visite_id: null, fait_at: null, push_active: true,
    cree_par: 'utilisateur', conversation_id: null,
    created_at: '2026-07-29T08:00:00+02:00', updated_at: '2026-07-29T08:00:00+02:00',
  }
}

describe('regrouperRappels (fuseau Europe/Zurich)', () => {
  const now = '2026-07-29T10:00:00+02:00' // mercredi 29 juillet 2026, 10h

  it('classe les rappels du jour dans "aujourdhui"', () => {
    const r = mkRappel('a', '2026-07-29T18:00:00+02:00')
    const g = regrouperRappels([r], now)
    expect(g.aujourdhui).toHaveLength(1)
    expect(g.cetteSemaine).toHaveLength(0)
    expect(g.enRetard).toHaveLength(0)
  })

  it('classe les rappels de demain à dimanche dans "cetteSemaine"', () => {
    const r = mkRappel('b', '2026-08-02T10:00:00+02:00') // dimanche
    const g = regrouperRappels([r], now)
    expect(g.cetteSemaine).toHaveLength(1)
  })

  it('classe les rappels de lundi prochain et après dans "plusTard"', () => {
    const r = mkRappel('c', '2026-08-03T10:00:00+02:00') // lundi suivant
    const g = regrouperRappels([r], now)
    expect(g.plusTard).toHaveLength(1)
  })

  it('classe les rappels d\'hier et avant dans "enRetard"', () => {
    const r = mkRappel('d', '2026-07-28T18:00:00+02:00')
    const g = regrouperRappels([r], now)
    expect(g.enRetard).toHaveLength(1)
  })

  it('exclut les rappels statut=fait', () => {
    const r = mkRappel('e', '2026-07-29T18:00:00+02:00', 'fait')
    const g = regrouperRappels([r], now)
    expect(g.aujourdhui).toHaveLength(0)
  })

  it('trie chaque groupe par échéance croissante', () => {
    const a = mkRappel('a', '2026-07-29T18:00:00+02:00')
    const b = mkRappel('b', '2026-07-29T09:00:00+02:00')
    const g = regrouperRappels([a, b], now)
    expect(g.aujourdhui.map(r => r.id)).toEqual(['b', 'a'])
  })
})
```

- [ ] **Step 1.4 : Vérifier que le test échoue**

Run: `npm test -- src/lib/rappels/regroupement.test.ts`
Expected: FAIL — module `./regroupement` introuvable.

- [ ] **Step 1.5 : Implémenter `regrouperRappels`**

```typescript
// src/lib/rappels/regroupement.ts
import type { Rappel, RappelsRegroupes } from '@/types/rappel'

// Retourne YYYY-MM-DD au fuseau Europe/Zurich pour un ISO donné.
function jourZurich(iso: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return fmt.format(new Date(iso))
}

// Décale d'un nombre de jours (positif ou négatif) au fuseau Europe/Zurich.
function decalerJours(iso: string, deltaJours: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + deltaJours)
  return jourZurich(d.toISOString())
}

// Renvoie le jour de la semaine (1 = lundi, 7 = dimanche) au fuseau Europe/Zurich.
function jourSemaine(iso: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Zurich', weekday: 'long' })
  const map: Record<string, number> = {
    Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4,
    Friday: 5, Saturday: 6, Sunday: 7,
  }
  return map[fmt.format(new Date(iso))] ?? 1
}

export function regrouperRappels(rappels: Rappel[], nowIso: string): RappelsRegroupes {
  const jourAujourdhui = jourZurich(nowIso)
  const jourSem = jourSemaine(nowIso)
  const finSemaine = decalerJours(nowIso, 7 - jourSem) // dimanche courant

  const actifs = rappels.filter(r => r.statut === 'a_faire')
  const par = <K extends keyof RappelsRegroupes>(bucket: K, r: Rappel) => ({ bucket, r })

  const classes = actifs.map((r) => {
    const j = jourZurich(r.echeance)
    if (j < jourAujourdhui) return par('enRetard', r)
    if (j === jourAujourdhui) return par('aujourdhui', r)
    if (j <= finSemaine) return par('cetteSemaine', r)
    return par('plusTard', r)
  })

  const sortByEcheance = (a: Rappel, b: Rappel) => a.echeance.localeCompare(b.echeance)
  const collect = (bucket: keyof RappelsRegroupes) =>
    classes.filter(c => c.bucket === bucket).map(c => c.r).sort(sortByEcheance)

  return {
    enRetard: collect('enRetard'),
    aujourdhui: collect('aujourdhui'),
    cetteSemaine: collect('cetteSemaine'),
    plusTard: collect('plusTard'),
  }
}
```

- [ ] **Step 1.6 : Vérifier que le test passe**

Run: `npm test -- src/lib/rappels/regroupement.test.ts`
Expected: PASS — 6 tests verts.

- [ ] **Step 1.7 : Écrire le test rouge pour `creerRappel` Server Action**

```typescript
// src/actions/rappels.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { creerRappel } from './rappels'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(),
}))

describe('creerRappel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('valide et insère un rappel utilisateur', async () => {
    const { createClient } = await import('@/lib/supabase/server')
    const insert = vi.fn().mockReturnThis()
    const select = vi.fn().mockReturnThis()
    const single = vi.fn().mockResolvedValue({
      data: { id: '11111111-1111-4111-8111-111111111111', titre: 'Rappeler M. Dupont' },
      error: null,
    })
    ;(createClient as any).mockResolvedValue({
      from: () => ({ insert, select, single }),
    })

    const r = await creerRappel({
      titre: 'Rappeler M. Dupont',
      echeance: '2026-07-30T14:00:00+02:00',
      push_active: true,
    })

    expect(r.erreur).toBeUndefined()
    expect(r.data?.id).toBeTruthy()
    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      titre: 'Rappeler M. Dupont',
      cree_par: 'utilisateur',
    }))
  })

  it('refuse un titre vide', async () => {
    const r = await creerRappel({ titre: '', echeance: '2026-07-30T14:00:00+02:00', push_active: true })
    expect(r.erreur).toMatch(/titre/i)
  })
})
```

- [ ] **Step 1.8 : Vérifier échec + implémenter Server Actions rappels**

Run: `npm test -- src/actions/rappels.test.ts` → FAIL (module introuvable).

```typescript
// src/actions/rappels.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { rappelInputSchema, type Rappel, type RappelInput } from '@/types/rappel'
import type { CreePar } from '@/types/rappel'

type ActionResult<T> = { data?: T; erreur?: string }

export async function creerRappel(
  input: RappelInput,
  origine: CreePar = 'utilisateur',
  conversationId: string | null = null,
): Promise<ActionResult<Rappel>> {
  const parsed = rappelInputSchema.safeParse(input)
  if (!parsed.success) {
    return { erreur: parsed.error.issues.map(i => i.message).join(' — ') }
  }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rappel')
    .insert({ ...parsed.data, cree_par: origine, conversation_id: conversationId })
    .select('*, etablissement:etablissement_id (enseigne)')
    .single()
  if (error || !data) return { erreur: error?.message ?? 'Erreur inconnue' }
  return { data: data as Rappel }
}

export async function marquerRappelFait(id: string): Promise<ActionResult<Rappel>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rappel')
    .update({ statut: 'fait', fait_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error || !data) return { erreur: error?.message ?? 'Introuvable' }
  return { data: data as Rappel }
}

export async function annulerRappel(id: string): Promise<ActionResult<Rappel>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rappel')
    .update({ statut: 'annule' })
    .eq('id', id)
    .select()
    .single()
  if (error || !data) return { erreur: error?.message ?? 'Introuvable' }
  return { data: data as Rappel }
}

export async function modifierRappel(id: string, input: RappelInput): Promise<ActionResult<Rappel>> {
  const parsed = rappelInputSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.issues.map(i => i.message).join(' — ') }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rappel')
    .update(parsed.data)
    .eq('id', id)
    .select()
    .single()
  if (error || !data) return { erreur: error?.message ?? 'Introuvable' }
  return { data: data as Rappel }
}

export async function lireRappels(): Promise<Rappel[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('rappel')
    .select('*, etablissement:etablissement_id (enseigne)')
    .is('deleted_at', null)
    .neq('statut', 'annule')
    .order('echeance', { ascending: true })
  return (data ?? []) as Rappel[]
}

export async function compterRappelsDus(): Promise<number> {
  const supabase = await createClient()
  const finJourZurich = new Date()
  finJourZurich.setHours(23, 59, 59, 999)
  const { count } = await supabase
    .from('rappel')
    .select('*', { count: 'exact', head: true })
    .eq('statut', 'a_faire')
    .is('deleted_at', null)
    .lte('echeance', finJourZurich.toISOString())
  return count ?? 0
}
```

Run: `npm test -- src/actions/rappels.test.ts` → PASS.

- [ ] **Step 1.9 : Commit**

```bash
git add supabase/migrations/009_v1f_rappel_chat.sql src/types/rappel.ts src/lib/rappels/ src/actions/rappels.ts src/actions/rappels.test.ts
git commit -m "feat(v1f): tâche 1 — migration 009 + Server Actions rappels + tests (TDD)"
```

---

## Task 2: Page /rappels + composants + badge nav

**Objectif :** Livrer l'UI des rappels : liste triée en 4 sections, actions rapides (fait / snooze / éditer), badge sur nav bottom.

**Files:**
- Modify: `src/app/(app)/rappels/page.tsx` (remplacer le placeholder)
- Create: `src/components/rappels/liste-rappels.tsx`
- Create: `src/components/rappels/carte-rappel.tsx`
- Create: `src/components/rappels/badge-nav-rappels.tsx`
- Modify: `src/components/layout/bottom-nav.tsx` (ajouter badge)

- [ ] **Step 2.1 : Composant `CarteRappel` (mobile-first)**

```typescript
// src/components/rappels/carte-rappel.tsx
'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { marquerRappelFait } from '@/actions/rappels'
import { notifierChangement } from '@/lib/sync/revalidation'
import type { Rappel } from '@/types/rappel'

function formaterHeure(iso: string): string {
  return new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

export function CarteRappel({ rappel, enRetard = false }: { rappel: Rappel; enRetard?: boolean }) {
  const [pending, startTransition] = useTransition()

  function onFait() {
    startTransition(async () => {
      const r = await marquerRappelFait(rappel.id)
      if (!r.erreur) notifierChangement()
    })
  }

  return (
    <Card className="flex flex-col gap-2 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {enRetard && <Badge variant="destructive">En retard</Badge>}
            {rappel.cree_par === 'claude' && <Badge variant="outline">✨ Claude</Badge>}
            {rappel.canal && <Badge variant="secondary">{rappel.canal}</Badge>}
          </div>
          <h4 className="mt-1 truncate font-medium leading-tight">{rappel.titre}</h4>
          {rappel.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{rappel.description}</p>
          )}
          <div className="mt-1 text-xs text-muted-foreground">
            {formaterHeure(rappel.echeance)}
            {rappel.etablissement && (
              <>
                {' · '}
                <Link href={`/etablissements/${rappel.etablissement_id}`} className="underline">
                  {rappel.etablissement.enseigne}
                </Link>
              </>
            )}
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onFait}
          disabled={pending}
          className="h-9"
        >
          ✓ Fait
        </Button>
      </div>
    </Card>
  )
}
```

- [ ] **Step 2.2 : Composant `ListeRappels` (Client Component avec sections)**

```typescript
// src/components/rappels/liste-rappels.tsx
'use client'

import { useEffect, useState } from 'react'
import { CarteRappel } from './carte-rappel'
import { lireRappels } from '@/actions/rappels'
import { regrouperRappels } from '@/lib/rappels/regroupement'
import { useRevalidation } from '@/lib/sync/revalidation'
import type { Rappel } from '@/types/rappel'

function Section({ titre, rappels, enRetard = false }: {
  titre: string; rappels: Rappel[]; enRetard?: boolean
}) {
  if (rappels.length === 0) return null
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {titre} ({rappels.length})
      </h3>
      <ul className="space-y-2">
        {rappels.map((r) => (
          <li key={r.id}><CarteRappel rappel={r} enRetard={enRetard} /></li>
        ))}
      </ul>
    </section>
  )
}

export function ListeRappels({ rappelsInitiaux }: { rappelsInitiaux: Rappel[] }) {
  const [rappels, setRappels] = useState(rappelsInitiaux)
  const version = useRevalidation()

  useEffect(() => {
    void lireRappels().then(setRappels)
  }, [version])

  const g = regrouperRappels(rappels, new Date().toISOString())

  if ([...g.enRetard, ...g.aujourdhui, ...g.cetteSemaine, ...g.plusTard].length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
        Aucun rappel actif. Utilise le chat Claude ou le bouton « + » pour en créer.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <Section titre="En retard" rappels={g.enRetard} enRetard />
      <Section titre="Aujourd'hui" rappels={g.aujourdhui} />
      <Section titre="Cette semaine" rappels={g.cetteSemaine} />
      <Section titre="Plus tard" rappels={g.plusTard} />
    </div>
  )
}
```

- [ ] **Step 2.3 : Page `/rappels`**

```typescript
// src/app/(app)/rappels/page.tsx
import { lireRappels } from '@/actions/rappels'
import { ListeRappels } from '@/components/rappels/liste-rappels'
import { BoutonNouveauRappel } from '@/components/rappels/bouton-nouveau-rappel'

export const dynamic = 'force-dynamic'

export default async function PageRappels() {
  const rappels = await lireRappels()
  return (
    <div className="flex flex-col gap-4 px-4 pb-24 pt-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Rappels</h1>
        <BoutonNouveauRappel />
      </header>
      <ListeRappels rappelsInitiaux={rappels} />
    </div>
  )
}
```

- [ ] **Step 2.4 : Badge nav bottom**

```typescript
// src/components/rappels/badge-nav-rappels.tsx
'use client'

import { useEffect, useState } from 'react'
import { compterRappelsDus } from '@/actions/rappels'
import { useRevalidation } from '@/lib/sync/revalidation'

export function BadgeNavRappels() {
  const [count, setCount] = useState<number>(0)
  const version = useRevalidation()

  useEffect(() => {
    void compterRappelsDus().then(setCount)
    const id = setInterval(() => void compterRappelsDus().then(setCount), 60_000)
    return () => clearInterval(id)
  }, [version])

  if (count === 0) return null
  return (
    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
      {count > 99 ? '99+' : count}
    </span>
  )
}
```

Intégrer dans `bottom-nav.tsx` : autour de l'icône Rappels, wrapper `<span className="relative">…<BadgeNavRappels /></span>`.

- [ ] **Step 2.5 : Vérification visuelle mobile**

Run: `npm run dev`
Ouvrir `http://localhost:3000/rappels` sur mobile (ou DevTools mobile). Vérifier :
- Sections apparaissent triées (en retard, aujourd'hui, cette semaine, plus tard).
- Message vide si aucun rappel.
- Badge nav visible dès qu'un rappel est dû.
- Bouton « ✓ Fait » retire la carte immédiatement (revalidation pub/sub).

- [ ] **Step 2.6 : Commit**

```bash
git add src/app/\(app\)/rappels/page.tsx src/components/rappels/ src/components/layout/bottom-nav.tsx
git commit -m "feat(v1f): tâche 2 — page /rappels + sections triées + badge nav"
```

---

## Task 3: Formulaire création/édition rappel (bottom-sheet)

**Objectif :** Bouton « + » sur `/rappels` qui ouvre une Sheet de saisie ; réutilisable pour édition future.

**Files:**
- Create: `src/components/rappels/bouton-nouveau-rappel.tsx`
- Create: `src/components/rappels/formulaire-rappel.tsx`

- [ ] **Step 3.1 : Formulaire `FormulaireRappel`**

```typescript
// src/components/rappels/formulaire-rappel.tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { creerRappel } from '@/actions/rappels'
import { notifierChangement } from '@/lib/sync/revalidation'

// Retourne l'ISO complet à la précision minute pour un input datetime-local.
function toISOZurich(datetimeLocal: string): string {
  // datetime-local n'a pas de fuseau ; on ajoute l'offset Europe/Zurich courant.
  const d = new Date(datetimeLocal)
  return d.toISOString()
}

interface Props {
  etablissementId?: string
  onSuccess?: () => void
}

export function FormulaireRappel({ etablissementId, onSuccess }: Props) {
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [echeance, setEcheance] = useState('')
  const [canal, setCanal] = useState<'whatsapp' | 'mail' | 'telephone' | 'sms' | 'autre' | ''>('')
  const [pending, startTransition] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErreur(null)
    startTransition(async () => {
      const r = await creerRappel({
        titre,
        description: description || null,
        echeance: toISOZurich(echeance),
        canal: canal || null,
        etablissement_id: etablissementId ?? null,
        push_active: true,
      })
      if (r.erreur) {
        setErreur(r.erreur)
        return
      }
      notifierChangement()
      onSuccess?.()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="titre">Titre *</Label>
        <Input id="titre" value={titre} onChange={e => setTitre(e.target.value)} required maxLength={200} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="echeance">Échéance *</Label>
        <Input
          id="echeance"
          type="datetime-local"
          value={echeance}
          onChange={e => setEcheance(e.target.value)}
          required
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="canal">Canal (indicatif)</Label>
        <select
          id="canal"
          value={canal}
          onChange={e => setCanal(e.target.value as typeof canal)}
          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
        >
          <option value="">—</option>
          <option value="whatsapp">WhatsApp</option>
          <option value="mail">Mail</option>
          <option value="telephone">Téléphone</option>
          <option value="sms">SMS</option>
          <option value="autre">Autre</option>
        </select>
      </div>
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      <Button type="submit" disabled={pending} className="h-12 w-full text-base">
        {pending ? 'Enregistrement…' : 'Créer le rappel'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 3.2 : Bouton + Sheet**

```typescript
// src/components/rappels/bouton-nouveau-rappel.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { FormulaireRappel } from './formulaire-rappel'

export function BoutonNouveauRappel({ etablissementId }: { etablissementId?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="lg" className="h-10">+ Nouveau</Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nouveau rappel</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <FormulaireRappel
            etablissementId={etablissementId}
            onSuccess={() => setOpen(false)}
          />
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 3.3 : Test manuel + commit**

Ouvrir `/rappels`, cliquer « + Nouveau », remplir, submit. Vérifier apparition immédiate.

```bash
git add src/components/rappels/bouton-nouveau-rappel.tsx src/components/rappels/formulaire-rappel.tsx
git commit -m "feat(v1f): tâche 3 — formulaire rappel bottom-sheet"
```

---

## Task 4: Chat — Server Action `envoyerMessage` + tool use loop + monitoring (TDD)

**Objectif :** Cœur du chat. Une Server Action qui prend un texte utilisateur + optionnellement un `conversation_id` + un contexte fiche/visite, appelle Claude via boucle tool use manuelle (`stop_reason === 'tool_use'`), exécute `creer_rappel` si demandé, persiste tokens.

**Files:**
- Create: `src/lib/claude/systeme.ts`
- Create: `src/lib/claude/outils.ts`
- Create: `src/lib/claude/monitoring.ts`
- Create: `src/lib/claude/monitoring.test.ts`
- Create: `src/actions/chat.ts`
- Create: `src/actions/chat.test.ts`

- [ ] **Step 4.1 : Prompt système et description de l'outil**

```typescript
// src/lib/claude/systeme.ts
export function construireSystemePrompt(contexte?: {
  etablissement?: { enseigne: string; ville: string | null; statut: string }
  visite?: { id: string; date: string; notes: string | null }
  dateLocale: string
}): string {
  const parts: string[] = [
    "Tu es l'assistant personnel de Cyril Cicero, commercial en vins pour Schenk/Obrist en Valais.",
    "Ton UNIQUE mission en V1 : créer des rappels structurés à partir de son intention en langage naturel.",
    "",
    "Règles strictes :",
    "- Tu utilises exclusivement l'outil `creer_rappel` pour concrétiser une action.",
    "- Tu ne réponds jamais aux questions analytiques (CA, agenda, historique) — dis simplement que ce n'est pas dispo en V1.",
    "- Tu n'envoies aucun message externe (WhatsApp, mail, SMS). Cyril agit lui-même après notification.",
    "- Le canal (whatsapp/mail/telephone/sms) est indicatif : c'est un rappel personnel, pas un envoi.",
    "- Format date pour l'outil : ISO 8601 avec offset (ex 2026-08-05T14:00:00+02:00). Fuseau Europe/Zurich.",
    "- Si l'intention est ambiguë (date/heure manquante), pose UNE seule question courte avant de créer.",
  ]
  if (contexte?.dateLocale) parts.push('', `Date/heure actuelle (Europe/Zurich) : ${contexte.dateLocale}.`)
  if (contexte?.etablissement) {
    parts.push('', `Contexte fiche : ${contexte.etablissement.enseigne}` +
      (contexte.etablissement.ville ? ` (${contexte.etablissement.ville})` : '') +
      ` — statut ${contexte.etablissement.statut}.`)
  }
  if (contexte?.visite) {
    parts.push(`Visite en cours du ${contexte.visite.date}. Notes : ${contexte.visite.notes ?? '(aucune)'}.`)
  }
  return parts.join('\n')
}
```

```typescript
// src/lib/claude/outils.ts
import type Anthropic from '@anthropic-ai/sdk'

export const OUTIL_CREER_RAPPEL: Anthropic.Tool = {
  name: 'creer_rappel',
  description:
    'Crée un rappel dans le CRM. À utiliser dès que Cyril exprime une intention d\'action ' +
    'future (rappeler, relancer, envoyer un devis, penser à). Un seul rappel par appel.',
  input_schema: {
    type: 'object',
    properties: {
      titre: {
        type: 'string',
        description: 'Titre concis (< 200 caractères), à l\'impératif. Ex : "Rappeler M. Dupont au sujet du Fendant".',
      },
      description: {
        type: 'string',
        description: 'Détails optionnels (contexte, offre concernée, notes).',
      },
      echeance: {
        type: 'string',
        description: 'ISO 8601 avec offset Europe/Zurich, ex 2026-08-05T14:00:00+02:00.',
      },
      canal: {
        type: 'string',
        enum: ['whatsapp', 'mail', 'telephone', 'sms', 'autre'],
        description: 'Canal indicatif (non exécuté par le CRM).',
      },
      etablissement_id: {
        type: 'string',
        description: 'UUID de l\'établissement si le contexte est présent.',
      },
    },
    required: ['titre', 'echeance'],
  },
}
```

- [ ] **Step 4.2 : Monitoring tokens (TDD)**

```typescript
// src/lib/claude/monitoring.test.ts
import { describe, it, expect } from 'vitest'
import { calculerCoutCHF } from './monitoring'

describe('calculerCoutCHF (claude-haiku-4-5)', () => {
  it('applique les tarifs haiku-4-5 : 1$/1M input, 5$/1M output', () => {
    // 10_000 input + 2_000 output → (10000/1e6)*1 + (2000/1e6)*5 = 0.01 + 0.01 = 0.02 USD
    // Taux USD→CHF ~0.88 (approx figé pour V1 dans la constante)
    const cout = calculerCoutCHF(10_000, 2_000)
    expect(cout).toBeGreaterThan(0.015)
    expect(cout).toBeLessThan(0.025)
  })

  it('retourne 0 si aucun token', () => {
    expect(calculerCoutCHF(0, 0)).toBe(0)
  })
})
```

Run → FAIL, puis implémenter :

```typescript
// src/lib/claude/monitoring.ts
import { createClient } from '@/lib/supabase/server'

const HAIKU_INPUT_USD_PER_1M = 1
const HAIKU_OUTPUT_USD_PER_1M = 5
const USD_TO_CHF = 0.88 // figé V1, révisable via /admin/parametres

export function calculerCoutCHF(tokensInput: number, tokensOutput: number): number {
  const usd = (tokensInput / 1e6) * HAIKU_INPUT_USD_PER_1M
    + (tokensOutput / 1e6) * HAIKU_OUTPUT_USD_PER_1M
  return Math.round(usd * USD_TO_CHF * 10000) / 10000
}

export async function ajouterConsommation(tokensInput: number, tokensOutput: number): Promise<void> {
  const supabase = await createClient()
  const cle = 'monitoring_consommation_claude'
  const { data } = await supabase.from('parametre').select('valeur').eq('cle', cle).maybeSingle()
  const prec = data?.valeur
    ? JSON.parse(data.valeur) as { tokens_mois_courant: number; cout_chf_mois_courant: number }
    : { tokens_mois_courant: 0, cout_chf_mois_courant: 0 }
  const total = tokensInput + tokensOutput
  const nouveau = {
    tokens_mois_courant: prec.tokens_mois_courant + total,
    cout_chf_mois_courant: Math.round((prec.cout_chf_mois_courant + calculerCoutCHF(tokensInput, tokensOutput)) * 10000) / 10000,
  }
  await supabase.from('parametre').upsert({ cle, valeur: JSON.stringify(nouveau) })
}
```

Run → PASS.

- [ ] **Step 4.3 : Server Action `envoyerMessage` (boucle tool use manuelle)**

```typescript
// src/actions/chat.ts
'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { construireSystemePrompt } from '@/lib/claude/systeme'
import { OUTIL_CREER_RAPPEL } from '@/lib/claude/outils'
import { ajouterConsommation } from '@/lib/claude/monitoring'
import { creerRappel } from '@/actions/rappels'
import { rappelInputSchema } from '@/types/rappel'

const client = new Anthropic()
const MODELE = 'claude-haiku-4-5'
const MAX_ITERATIONS = 5

type ActionResult<T> = { data?: T; erreur?: string }

export interface ReponseChat {
  conversation_id: string
  texte_final: string
  rappels_crees: Array<{ id: string; titre: string }>
}

interface ContexteChat {
  etablissement_id?: string
  visite_id?: string
}

export async function envoyerMessage(
  texteUtilisateur: string,
  conversationId: string | null,
  contexte: ContexteChat = {},
): Promise<ActionResult<ReponseChat>> {
  if (!texteUtilisateur.trim()) return { erreur: 'Message vide' }

  const supabase = await createClient()

  // 1. Charger contexte fiche/visite si fourni
  let contexteBloc: Parameters<typeof construireSystemePrompt>[0] = {
    dateLocale: new Intl.DateTimeFormat('fr-CH', {
      timeZone: 'Europe/Zurich', dateStyle: 'full', timeStyle: 'short',
    }).format(new Date()),
  }
  if (contexte.etablissement_id) {
    const { data } = await supabase
      .from('etablissement')
      .select('enseigne, ville, statut')
      .eq('id', contexte.etablissement_id)
      .single()
    if (data) contexteBloc.etablissement = data
  }
  if (contexte.visite_id) {
    const { data } = await supabase
      .from('visite')
      .select('id, date_visite, notes')
      .eq('id', contexte.visite_id)
      .single()
    if (data) contexteBloc.visite = { id: data.id, date: data.date_visite, notes: data.notes }
  }

  // 2. Charger la conversation existante ou en créer une nouvelle
  const { data: convExistante } = conversationId
    ? await supabase.from('conversation').select('*').eq('id', conversationId).single()
    : { data: null }

  const historique = (convExistante?.messages ?? []) as Anthropic.MessageParam[]
  const messages: Anthropic.MessageParam[] = [
    ...historique,
    { role: 'user', content: texteUtilisateur },
  ]

  // 3. Boucle tool use
  const rappelsCrees: Array<{ id: string; titre: string }> = []
  let texteFinal = ''
  let tokensInputTotal = 0
  let tokensOutputTotal = 0

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const response = await client.messages.create({
      model: MODELE,
      max_tokens: 4096,
      system: construireSystemePrompt(contexteBloc),
      tools: [OUTIL_CREER_RAPPEL],
      messages,
    })

    tokensInputTotal += response.usage.input_tokens
    tokensOutputTotal += response.usage.output_tokens

    messages.push({ role: 'assistant', content: response.content })

    if (response.stop_reason === 'end_turn') {
      texteFinal = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map(b => b.text)
        .join('\n')
      break
    }

    if (response.stop_reason !== 'tool_use') break

    // 4. Exécuter les tool_use côté serveur
    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of response.content) {
      if (block.type !== 'tool_use') continue
      if (block.name === 'creer_rappel') {
        const parsed = rappelInputSchema.safeParse({
          ...(block.input as Record<string, unknown>),
          etablissement_id:
            (block.input as Record<string, unknown>).etablissement_id
            ?? contexte.etablissement_id
            ?? null,
          push_active: true,
        })
        if (!parsed.success) {
          toolResults.push({
            type: 'tool_result', tool_use_id: block.id, is_error: true,
            content: `Erreur validation : ${parsed.error.issues.map(i => i.message).join(' — ')}`,
          })
          continue
        }
        const r = await creerRappel(parsed.data, 'claude', convExistante?.id ?? null)
        if (r.erreur || !r.data) {
          toolResults.push({
            type: 'tool_result', tool_use_id: block.id, is_error: true,
            content: `Erreur BDD : ${r.erreur ?? 'inconnue'}`,
          })
        } else {
          rappelsCrees.push({ id: r.data.id, titre: r.data.titre })
          toolResults.push({
            type: 'tool_result', tool_use_id: block.id,
            content: `Rappel créé : ${r.data.titre} (id ${r.data.id}).`,
          })
        }
      }
    }
    messages.push({ role: 'user', content: toolResults })
  }

  // 5. Persister conversation + monitoring
  const payloadConv = {
    etablissement_id: contexte.etablissement_id ?? null,
    messages,
    tokens_input: (convExistante?.tokens_input ?? 0) + tokensInputTotal,
    tokens_output: (convExistante?.tokens_output ?? 0) + tokensOutputTotal,
  }
  const { data: convFinale, error: errU } = convExistante
    ? await supabase.from('conversation').update(payloadConv).eq('id', convExistante.id).select().single()
    : await supabase.from('conversation').insert(payloadConv).select().single()

  if (errU || !convFinale) return { erreur: `Persistance conversation : ${errU?.message}` }

  await ajouterConsommation(tokensInputTotal, tokensOutputTotal)

  return {
    data: {
      conversation_id: convFinale.id,
      texte_final: texteFinal,
      rappels_crees: rappelsCrees,
    },
  }
}

export async function lireConversation(id: string): Promise<Anthropic.MessageParam[] | null> {
  const supabase = await createClient()
  const { data } = await supabase.from('conversation').select('messages').eq('id', id).single()
  return (data?.messages as Anthropic.MessageParam[]) ?? null
}

export async function lireConversations(): Promise<Array<{ id: string; updated_at: string; premier_message: string }>> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('conversation')
    .select('id, updated_at, messages')
    .order('updated_at', { ascending: false })
    .limit(50)
  return (data ?? []).map((c) => {
    const premierUser = (c.messages as Anthropic.MessageParam[])
      .find((m) => m.role === 'user')
    const texte = typeof premierUser?.content === 'string'
      ? premierUser.content
      : Array.isArray(premierUser?.content)
        ? premierUser.content.find((b: any) => b.type === 'text')?.text ?? ''
        : ''
    return { id: c.id, updated_at: c.updated_at, premier_message: texte.slice(0, 80) }
  })
}
```

- [ ] **Step 4.4 : Test `envoyerMessage` (mock SDK)**

```typescript
// src/actions/chat.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockResolvedValue({
    from: (t: string) => {
      const chain = {
        select: () => chain, eq: () => chain, single: () => Promise.resolve({ data: null }),
        maybeSingle: () => Promise.resolve({ data: null }),
        insert: () => chain, update: () => chain, upsert: () => chain, order: () => chain, limit: () => chain,
      }
      if (t === 'conversation') {
        return {
          ...chain,
          insert: () => ({ select: () => ({ single: () => Promise.resolve({ data: { id: 'conv-1' }, error: null }) }) }),
        }
      }
      return chain
    },
  }),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    messages = {
      create: vi.fn().mockResolvedValue({
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
        content: [{ type: 'text', text: 'D\'accord.' }],
      }),
    }
  },
}))

vi.mock('@/actions/rappels', () => ({ creerRappel: vi.fn() }))
vi.mock('@/lib/claude/monitoring', () => ({ ajouterConsommation: vi.fn() }))

describe('envoyerMessage', () => {
  beforeEach(() => vi.clearAllMocks())

  it('refuse un message vide', async () => {
    const { envoyerMessage } = await import('./chat')
    const r = await envoyerMessage('  ', null)
    expect(r.erreur).toBe('Message vide')
  })

  it('crée une nouvelle conversation et renvoie le texte final', async () => {
    const { envoyerMessage } = await import('./chat')
    const r = await envoyerMessage('Bonjour', null)
    expect(r.data?.conversation_id).toBe('conv-1')
    expect(r.data?.texte_final).toBe('D\'accord.')
    expect(r.data?.rappels_crees).toEqual([])
  })
})
```

Run: `npm test -- src/actions/chat.test.ts src/lib/claude/monitoring.test.ts` → PASS.

- [ ] **Step 4.5 : Commit**

```bash
git add src/lib/claude/ src/actions/chat.ts src/actions/chat.test.ts
git commit -m "feat(v1f): tâche 4 — Server Action chat + boucle tool use + monitoring tokens (TDD)"
```

---

## Task 5: Page /chat + interface (nouveau + historique + composer)

**Objectif :** Livrer l'écran chat mobile : liste des conversations, drawer nouvelle conversation, composer texte, affichage messages + rappels créés.

**Files:**
- Modify: `src/app/(app)/chat/page.tsx` (remplacer placeholder)
- Create: `src/components/chat/interface-chat.tsx`
- Create: `src/components/chat/liste-conversations.tsx`
- Create: `src/components/chat/composer.tsx`
- Create: `src/components/chat/bulle-message.tsx`

- [ ] **Step 5.1 : Bulle message**

```typescript
// src/components/chat/bulle-message.tsx
'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type Anthropic from '@anthropic-ai/sdk'

interface Props {
  message: Anthropic.MessageParam
  rappelsCrees?: Array<{ id: string; titre: string }>
}

export function BulleMessage({ message, rappelsCrees = [] }: Props) {
  const estUser = message.role === 'user'
  const texte = typeof message.content === 'string'
    ? message.content
    : Array.isArray(message.content)
      ? message.content
          .filter((b: any) => b.type === 'text')
          .map((b: any) => b.text)
          .join('\n')
      : ''

  if (!texte && rappelsCrees.length === 0) return null

  return (
    <div className={`flex ${estUser ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[85%] space-y-1">
        {texte && (
          <Card className={`whitespace-pre-wrap p-3 text-sm ${estUser ? 'bg-primary text-primary-foreground' : ''}`}>
            {texte}
          </Card>
        )}
        {rappelsCrees.map((r) => (
          <Link key={r.id} href="/rappels" className="block">
            <Card className="border-emerald-300 bg-emerald-50 p-2 text-sm">
              <Badge className="mr-2 bg-emerald-500">✨ Rappel créé</Badge>
              {r.titre}
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5.2 : Composer**

```typescript
// src/components/chat/composer.tsx
'use client'

import { useState, useTransition } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'

interface Props {
  onEnvoyer: (texte: string) => Promise<void>
  disabled?: boolean
}

export function Composer({ onEnvoyer, disabled = false }: Props) {
  const [texte, setTexte] = useState('')
  const [pending, startTransition] = useTransition()

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!texte.trim()) return
    const capture = texte
    setTexte('')
    startTransition(async () => { await onEnvoyer(capture) })
  }

  return (
    <form onSubmit={onSubmit} className="sticky bottom-0 flex gap-2 border-t bg-white p-3 pb-safe">
      <Textarea
        value={texte}
        onChange={e => setTexte(e.target.value)}
        placeholder="Ex : Rappelle-moi de rappeler M. Dupont demain à 14h"
        rows={2}
        className="flex-1"
        disabled={disabled || pending}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            ;(e.currentTarget.form as HTMLFormElement).requestSubmit()
          }
        }}
      />
      <Button type="submit" disabled={disabled || pending || !texte.trim()} className="h-full">
        Envoyer
      </Button>
    </form>
  )
}
```

- [ ] **Step 5.3 : Interface chat (état local, appelle Server Action)**

```typescript
// src/components/chat/interface-chat.tsx
'use client'

import { useState, useEffect } from 'react'
import { envoyerMessage, lireConversation } from '@/actions/chat'
import { BulleMessage } from './bulle-message'
import { Composer } from './composer'
import { notifierChangement } from '@/lib/sync/revalidation'
import type Anthropic from '@anthropic-ai/sdk'

interface Props {
  conversationIdInitial?: string | null
  etablissementId?: string
  visiteId?: string
}

interface EntreeAffichee {
  message: Anthropic.MessageParam
  rappelsCrees?: Array<{ id: string; titre: string }>
}

export function InterfaceChat({ conversationIdInitial = null, etablissementId, visiteId }: Props) {
  const [conversationId, setConversationId] = useState<string | null>(conversationIdInitial)
  const [entrees, setEntrees] = useState<EntreeAffichee[]>([])
  const [pending, setPending] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)

  useEffect(() => {
    if (!conversationIdInitial) return
    void lireConversation(conversationIdInitial).then((msgs) => {
      if (msgs) setEntrees(msgs.map(m => ({ message: m })))
    })
  }, [conversationIdInitial])

  async function onEnvoyer(texte: string) {
    setErreur(null)
    setPending(true)
    const userEntry: EntreeAffichee = { message: { role: 'user', content: texte } }
    setEntrees(e => [...e, userEntry])

    const r = await envoyerMessage(texte, conversationId, { etablissement_id: etablissementId, visite_id: visiteId })
    setPending(false)

    if (r.erreur || !r.data) {
      setErreur(r.erreur ?? 'Erreur inconnue')
      return
    }
    setConversationId(r.data.conversation_id)
    setEntrees(e => [...e, {
      message: { role: 'assistant', content: r.data!.texte_final },
      rappelsCrees: r.data!.rappels_crees,
    }])
    if (r.data.rappels_crees.length > 0) notifierChangement()
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pt-3">
        {entrees.length === 0 && !pending && (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            Écris une intention en langage naturel — je crée le rappel.
          </div>
        )}
        {entrees.map((e, i) => (
          <BulleMessage key={i} message={e.message} rappelsCrees={e.rappelsCrees} />
        ))}
        {pending && (
          <div className="text-sm italic text-muted-foreground">Claude réfléchit…</div>
        )}
        {erreur && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">❌ {erreur}</div>
        )}
      </div>
      <Composer onEnvoyer={onEnvoyer} disabled={pending} />
    </div>
  )
}
```

- [ ] **Step 5.4 : Liste conversations + page**

```typescript
// src/components/chat/liste-conversations.tsx
'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'

interface Props {
  conversations: Array<{ id: string; updated_at: string; premier_message: string }>
}

export function ListeConversations({ conversations }: Props) {
  return (
    <ul className="space-y-2">
      {conversations.map((c) => (
        <li key={c.id}>
          <Link href={`/chat?c=${c.id}`}>
            <Card className="p-3">
              <div className="text-xs text-muted-foreground">
                {new Intl.DateTimeFormat('fr-CH', {
                  timeZone: 'Europe/Zurich', dateStyle: 'short', timeStyle: 'short',
                }).format(new Date(c.updated_at))}
              </div>
              <div className="mt-0.5 truncate text-sm">{c.premier_message}</div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

```typescript
// src/app/(app)/chat/page.tsx
import { lireConversations } from '@/actions/chat'
import { InterfaceChat } from '@/components/chat/interface-chat'
import { ListeConversations } from '@/components/chat/liste-conversations'

export const dynamic = 'force-dynamic'

export default async function PageChat({ searchParams }: { searchParams: Promise<{ c?: string }> }) {
  const params = await searchParams
  const conversationId = params.c ?? null
  const conversations = conversationId ? [] : await lireConversations()

  return (
    <div className="flex flex-col">
      {conversationId ? (
        <InterfaceChat conversationIdInitial={conversationId} />
      ) : conversations.length === 0 ? (
        <InterfaceChat />
      ) : (
        <div className="space-y-4 px-4 pb-24 pt-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-semibold">Chat</h1>
            <a
              href="/chat?c=new"
              className="rounded-md border px-3 py-2 text-sm font-medium"
            >
              + Nouvelle
            </a>
          </div>
          <ListeConversations conversations={conversations} />
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5.5 : Test terrain + commit**

Envoyer « Rappelle-moi de rappeler M. Martin demain à 10h » → vérifier :
- Bulle utilisateur, réponse Claude, encart vert « Rappel créé ».
- Vérifier `/rappels` : le rappel apparaît avec badge « ✨ Claude ».
- Vérifier dans Supabase table `conversation` : messages persistés, tokens > 0.

```bash
git add src/app/\(app\)/chat/page.tsx src/components/chat/
git commit -m "feat(v1f): tâche 5 — page /chat + interface + composer + historique"
```

---

## Task 6: Chat contextuel depuis la fiche + drawer

**Objectif :** Depuis une fiche établissement, permettre d'ouvrir le chat en injectant automatiquement le contexte (id établissement + visite courante si applicable).

**Files:**
- Create: `src/components/etablissements/bouton-chat-contextuel.tsx`
- Modify: `src/components/etablissements/fiche-etablissement.tsx` (ajouter le bouton)

- [ ] **Step 6.1 : Bouton contextuel**

```typescript
// src/components/etablissements/bouton-chat-contextuel.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { InterfaceChat } from '@/components/chat/interface-chat'

interface Props {
  etablissementId: string
  enseigne: string
  visiteId?: string
}

export function BoutonChatContextuel({ etablissementId, enseigne, visiteId }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen(true)}
        className="h-10"
      >
        💬 Chat
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" className="w-full sm:max-w-lg">
          <SheetHeader>
            <SheetTitle className="truncate">Chat — {enseigne}</SheetTitle>
          </SheetHeader>
          <div className="mt-2">
            <InterfaceChat etablissementId={etablissementId} visiteId={visiteId} />
          </div>
        </SheetContent>
      </Sheet>
    </>
  )
}
```

- [ ] **Step 6.2 : Intégrer dans la fiche**

Ajouter dans `fiche-etablissement.tsx` (header, à côté du bouton Modifier) :

```tsx
<BoutonChatContextuel
  etablissementId={etablissement.id}
  enseigne={etablissement.enseigne}
/>
```

- [ ] **Step 6.3 : Test terrain**

Ouvrir une fiche, cliquer « 💬 Chat », taper « Rappelle-moi de leur envoyer l'offre Fendant vendredi à 9h ». Vérifier que le rappel créé est lié à l'établissement (badge visible sur la fiche établissement dans la carte du rappel).

- [ ] **Step 6.4 : Commit**

```bash
git add src/components/etablissements/bouton-chat-contextuel.tsx src/components/etablissements/fiche-etablissement.tsx
git commit -m "feat(v1f): tâche 6 — chat contextuel depuis fiche établissement"
```

---

## Task 7: Support images (upload + envoi multimodal)

**Objectif :** Permettre à Cyril de prendre une photo (étiquette, ardoise de menu, carte des vins) et l'envoyer avec sa question. Migration 009 crée déjà le bucket ; il reste l'upload + intégration au composer.

**Files:**
- Create: `src/lib/chat/upload-image.ts`
- Modify: `src/components/chat/composer.tsx` (ajouter input file + preview)
- Modify: `src/actions/chat.ts` (accepter un tableau d'URLs image)

- [ ] **Step 7.1 : Helper upload**

```typescript
// src/lib/chat/upload-image.ts
'use client'

import { createBrowserClient } from '@/lib/supabase/client'

const MAX_MO = 5
const TYPES_ACCEPTES = ['image/jpeg', 'image/png', 'image/webp']

export async function uploaderImageChat(fichier: File): Promise<{ url: string } | { erreur: string }> {
  if (!TYPES_ACCEPTES.includes(fichier.type)) return { erreur: 'Format non supporté (JPEG/PNG/WebP)' }
  if (fichier.size > MAX_MO * 1024 * 1024) return { erreur: `Fichier > ${MAX_MO} Mo` }

  const supabase = createBrowserClient()
  const chemin = `${crypto.randomUUID()}-${fichier.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
  const { error } = await supabase.storage.from('chat-images').upload(chemin, fichier, { upsert: false })
  if (error) return { erreur: error.message }

  const { data } = await supabase.storage.from('chat-images').createSignedUrl(chemin, 3600)
  if (!data?.signedUrl) return { erreur: 'Impossible de générer URL signée' }
  return { url: data.signedUrl }
}
```

- [ ] **Step 7.2 : Composer avec image**

Modifier `composer.tsx` pour accepter un fichier optionnel :

```typescript
// Extrait — ajouter dans le composant existant
const [image, setImage] = useState<{ file: File; preview: string } | null>(null)

// Dans le JSX, au-dessus du Textarea :
<input
  type="file"
  accept="image/jpeg,image/png,image/webp"
  capture="environment"
  onChange={(e) => {
    const f = e.target.files?.[0]
    if (f) setImage({ file: f, preview: URL.createObjectURL(f) })
  }}
  className="hidden"
  id="chat-photo"
/>
<label htmlFor="chat-photo" className="cursor-pointer text-sm underline">
  📷 Ajouter photo
</label>
{image && (
  <div className="relative inline-block">
    <img src={image.preview} alt="" className="h-20 rounded" />
    <button type="button" onClick={() => setImage(null)} className="absolute -top-1 -right-1 rounded-full bg-destructive px-1.5 text-xs text-white">×</button>
  </div>
)}
```

Puis dans `onSubmit`, uploader l'image avant d'appeler `onEnvoyer(texte, urlImage)`. Modifier la signature de `onEnvoyer` en `(texte: string, imageUrl?: string) => Promise<void>`.

- [ ] **Step 7.3 : Server Action accepte une image URL**

Modifier `envoyerMessage` : ajouter un paramètre `imageUrl?: string` ; si présent, construire un message multimodal :

```typescript
const contenu: Anthropic.ContentBlockParam[] = imageUrl
  ? [
      { type: 'image', source: { type: 'url', url: imageUrl } },
      { type: 'text', text: texteUtilisateur },
    ]
  : [{ type: 'text', text: texteUtilisateur }]

messages.push({ role: 'user', content: contenu })
```

- [ ] **Step 7.4 : Test manuel**

Ouvrir `/chat`, prendre une photo d'une carte des vins, taper « Rappelle-moi de leur proposer une alternative à ce Chasselas vendredi à 10h ». Vérifier que Claude cite la carte dans sa compréhension et crée le rappel.

- [ ] **Step 7.5 : Commit**

```bash
git add src/lib/chat/upload-image.ts src/components/chat/composer.tsx src/actions/chat.ts
git commit -m "feat(v1f): tâche 7 — support images multimodales dans chat"
```

---

## Task 8: Polish + tests type-check + push

**Objectif :** Nettoyer le code, garantir type-check et Vitest verts, mettre à jour le CLAUDE.md et push.

- [ ] **Step 8.1 : Type-check + tests**

```bash
npm run type-check
npm test
```

Corriger toute erreur (imports manquants, types incorrects, mocks incomplets).

- [ ] **Step 8.2 : Vérification manuelle golden path**

- [ ] Créer un rappel depuis `/rappels` (bouton +)
- [ ] Marquer un rappel « fait » → disparaît de la liste + badge nav décrémente
- [ ] Créer un rappel depuis le chat (« Rappelle-moi de X demain à 14h »)
- [ ] Ouvrir le chat depuis une fiche → contexte affiché dans réponse Claude
- [ ] Upload image + question → Claude répond en tenant compte de l'image
- [ ] Vérifier BDD : `parametre.monitoring_consommation_claude` a des tokens et un coût CHF > 0

- [ ] **Step 8.3 : Nettoyage**

Retirer tous les `console.log` de debug. Vérifier que `.env.local` contient bien `ANTHROPIC_API_KEY` et le documenter dans `.env.local.example`.

- [ ] **Step 8.4 : Commit final + push**

```bash
git add -A
git commit -m "chore(v1f): polish + type-check vert + docs env"
git push origin main
```

- [ ] **Step 8.5 : Vérifier déploiement Vercel**

Ouvrir le lien Vercel, tester `/chat` et `/rappels` sur mobile réel.

---

## Notes de conception

- **Modèle** : `claude-haiku-4-5` — choix Cyril, coût contenu et latence faible. Suffisant pour créer des rappels via un seul outil. Si besoin monter en gamme, changer `MODELE` dans `src/actions/chat.ts`.
- **Boucle tool use manuelle** : préférée au tool runner du SDK car on veut contrôler la persistance conversation à chaque itération et gérer proprement les erreurs de validation Zod côté serveur.
- **Streaming** : reporté à V1f.5. En V1, la Server Action attend la réponse complète (`stop_reason === 'end_turn'`) puis renvoie le texte final. `pending` affiché coté UI.
- **Notifications push VAPID** : hors scope V1f (V2). Le badge nav MVP suffit pour V1.
- **Un seul outil `creer_rappel`** conformément au spec §4.6. `lire_etablissement`, `lire_visites`, suggestions → V2.
- **Fuseau** : toutes les dates de rappel sont stockées ISO avec offset (par défaut Europe/Zurich). Le regroupement et l'affichage utilisent `Intl.DateTimeFormat` avec `timeZone: 'Europe/Zurich'`.
