# V1f — Chat Claude conversationnel + Rappels Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal :** Livrer le module central du spec V1 — chat Claude conversationnel avec 6 outils (rappels, visites, horaires, édition, lecture, recherche), streaming SSE, confirmation user obligatoire pour toute modification, upload images multimodales, historique persistant. Et le module Rappels complet : 4 sections (aujourd'hui / cette semaine / plus tard / terminés), reporter, filtre client, badge nav, widget accueil.

**Architecture :**
- **Rappels** — Server Actions CRUD (Zod), page `/rappels` avec sections, bottom-sheet création/reporter, badge nav, widget « Aujourd'hui » sur home.
- **Chat** — page `/chat` avec sidebar historique + interface style Claude.ai. **Streaming SSE** via Route Handler `/api/chat/stream` (Server Actions ne supportent pas les SSE proprement). Boucle tool use manuelle server-side : outils lecture auto-exécutés, outils modification bufferisés et présentés à l'utilisateur pour confirmation avant exécution. Titre auto-généré par Claude après le premier échange. Modèle par défaut `claude-haiku-4-5` (économique), toggle « Réfléchir plus » vers `claude-sonnet-4-6`. Monitoring tokens/coût CHF dans `parametre.monitoring_consommation_claude`, bannière d'alerte à >80 % du seuil.
- **Chat contextuel fiche** — bouton « 💬 Demander à Claude » ouvre une conversation avec un système prompt enrichi : enseigne, contacts, 3 dernières visites, offres actives, horaires.
- **Images** — bucket privé `chat-images` (mig 009), upload signed URL, message multimodal envoyé à Claude. Bouton « Appliquer à la fiche » sur données structurées extraites (horaires, contact, offre).
- **Persistance** — table `rappel` (déjà créée mig 001) étendue mig 009 avec `visite_id`, `fait_at`, `push_active`, `cree_par`, `conversation_id`. Table `conversation` (déjà créée) étendue mig 009 avec `titre`, `modele`, `alertes_seuil_derniere`.
- **Notifications** — badge nav (rappels dus aujourd'hui) + widget home. **Push VAPID et email digest reportés V2** (hors scope V1f).

**Tech Stack :**
- SDK : `@anthropic-ai/sdk` (déjà installé V0-T11)
- Modèles : `claude-haiku-4-5` (défaut, 1 $/1M in, 5 $/1M out) ; `claude-sonnet-4-6` (option, 3 $/1M in, 15 $/1M out)
- UI : shadcn/ui base-nova (Button, Sheet, Dialog, Card, Tabs, Badge, Textarea, Popover)
- Streaming : Next.js Route Handler + `client.messages.stream()` + SSE
- Storage : Supabase bucket privé `chat-images` (signed URL 1 h)
- Validation : Zod partout côté serveur
- Tests : Vitest + jsdom + @testing-library/react + mock SDK Anthropic
- Fuseau : Europe/Zurich pour tout calcul d'échéance et affichage horaire

---

## Task 1 : Migration 009 + types + Server Actions rappels (TDD)

**Objectif :** Extension du schéma BDD, types TS/Zod pour rappels et conversation, couche métier CRUD rappels avec tests.

**Files :**
- Create : `supabase/migrations/009_v1f_chat_rappels.sql`
- Create : `src/types/rappel.ts`
- Create : `src/types/conversation.ts`
- Create : `src/lib/rappels/regroupement.ts`
- Create : `src/lib/rappels/regroupement.test.ts`
- Create : `src/actions/rappels.ts`
- Create : `src/actions/rappels.test.ts`

- [ ] **Step 1.1 : Migration 009**

```sql
-- 009_v1f_chat_rappels.sql
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
```

- [ ] **Step 1.2 : Types TS + Zod rappels**

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
  conversation_id: string | null
  fait_at: string | null
  push_active: boolean
  cree_par: CreePar
  created_at: string
  updated_at: string
  etablissement?: { enseigne: string } | null
}

export interface RappelsRegroupes {
  enRetard: Rappel[]
  aujourdhui: Rappel[]
  cetteSemaine: Rappel[]
  plusTard: Rappel[]
  termines: Rappel[]
}
```

```typescript
// src/types/conversation.ts
import type Anthropic from '@anthropic-ai/sdk'

export type ModeleClaude = 'haiku' | 'sonnet'

export const MODELES: Record<ModeleClaude, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
}

export interface Conversation {
  id: string
  etablissement_id: string | null
  titre: string | null
  modele: ModeleClaude
  messages: Anthropic.MessageParam[]
  tokens_input: number
  tokens_output: number
  alerte_seuil_envoyee_at: string | null
  created_at: string
  updated_at: string
}

export interface ActionEnAttente {
  tool_use_id: string
  nom_outil: string
  parametres: Record<string, unknown>
  description_humaine: string    // ex "Créer un rappel : Rappeler M. Dupont demain 14h"
}
```

- [ ] **Step 1.3 : Test rouge — `regrouperRappels` (TDD)**

```typescript
// src/lib/rappels/regroupement.test.ts
import { describe, it, expect } from 'vitest'
import { regrouperRappels } from './regroupement'
import type { Rappel } from '@/types/rappel'

function mk(id: string, echeance: string, statut: 'a_faire' | 'fait' | 'annule' = 'a_faire'): Rappel {
  return {
    id, titre: id, description: null, echeance, statut, canal: null,
    etablissement_id: null, visite_id: null, conversation_id: null,
    fait_at: statut === 'fait' ? echeance : null, push_active: true,
    cree_par: 'utilisateur',
    created_at: '2026-07-29T08:00:00+02:00', updated_at: '2026-07-29T08:00:00+02:00',
  }
}

describe('regrouperRappels (Europe/Zurich)', () => {
  const now = '2026-07-29T10:00:00+02:00' // mercredi

  it('groupe "aujourdhui" pour rappels du jour', () => {
    const g = regrouperRappels([mk('a', '2026-07-29T18:00:00+02:00')], now)
    expect(g.aujourdhui).toHaveLength(1)
    expect(g.cetteSemaine).toHaveLength(0)
  })

  it('groupe "cetteSemaine" pour demain à dimanche', () => {
    const g = regrouperRappels([mk('a', '2026-08-02T10:00:00+02:00')], now)
    expect(g.cetteSemaine).toHaveLength(1)
  })

  it('groupe "plusTard" pour lundi prochain et au-delà', () => {
    const g = regrouperRappels([mk('a', '2026-08-03T10:00:00+02:00')], now)
    expect(g.plusTard).toHaveLength(1)
  })

  it('groupe "enRetard" pour hier et avant', () => {
    const g = regrouperRappels([mk('a', '2026-07-28T18:00:00+02:00')], now)
    expect(g.enRetard).toHaveLength(1)
  })

  it('groupe "termines" pour statut = fait', () => {
    const g = regrouperRappels([mk('a', '2026-07-29T18:00:00+02:00', 'fait')], now)
    expect(g.termines).toHaveLength(1)
    expect(g.aujourdhui).toHaveLength(0)
  })

  it('exclut les rappels statut = annule', () => {
    const g = regrouperRappels([mk('a', '2026-07-29T18:00:00+02:00', 'annule')], now)
    expect(g.aujourdhui).toHaveLength(0)
    expect(g.termines).toHaveLength(0)
  })

  it('trie chaque groupe par échéance croissante', () => {
    const g = regrouperRappels([
      mk('tard', '2026-07-29T18:00:00+02:00'),
      mk('tot',  '2026-07-29T09:00:00+02:00'),
    ], now)
    expect(g.aujourdhui.map(r => r.id)).toEqual(['tot', 'tard'])
  })
})
```

- [ ] **Step 1.4 : Vérifier échec + implémenter**

Run: `npm test -- src/lib/rappels/regroupement.test.ts` → FAIL (module manquant).

```typescript
// src/lib/rappels/regroupement.ts
import type { Rappel, RappelsRegroupes } from '@/types/rappel'

function jourZurich(iso: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return fmt.format(new Date(iso))
}

function decalerJours(iso: string, delta: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + delta)
  return jourZurich(d.toISOString())
}

function jourSemaine(iso: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Zurich', weekday: 'long' })
  const map: Record<string, number> = {
    Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4,
    Friday: 5, Saturday: 6, Sunday: 7,
  }
  return map[fmt.format(new Date(iso))] ?? 1
}

export function regrouperRappels(rappels: Rappel[], nowIso: string): RappelsRegroupes {
  const jourAuj = jourZurich(nowIso)
  const jSem = jourSemaine(nowIso)
  const finSemaine = decalerJours(nowIso, 7 - jSem)
  const trierParEcheance = (a: Rappel, b: Rappel) => a.echeance.localeCompare(b.echeance)

  const res: RappelsRegroupes = {
    enRetard: [], aujourdhui: [], cetteSemaine: [], plusTard: [], termines: [],
  }

  for (const r of rappels) {
    if (r.statut === 'annule') continue
    if (r.statut === 'fait') { res.termines.push(r); continue }
    const j = jourZurich(r.echeance)
    if (j < jourAuj) res.enRetard.push(r)
    else if (j === jourAuj) res.aujourdhui.push(r)
    else if (j <= finSemaine) res.cetteSemaine.push(r)
    else res.plusTard.push(r)
  }

  for (const k of Object.keys(res) as (keyof RappelsRegroupes)[]) {
    res[k].sort(trierParEcheance)
  }
  return res
}
```

Run → PASS (7/7).

- [ ] **Step 1.5 : Server Actions rappels + tests**

```typescript
// src/actions/rappels.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { rappelInputSchema, type Rappel, type RappelInput, type CreePar } from '@/types/rappel'

type ActionResult<T> = { data?: T; erreur?: string }

const SELECT_RAPPEL = '*, etablissement:etablissement_id (id, enseigne)'

export async function creerRappel(
  input: RappelInput,
  origine: CreePar = 'utilisateur',
  conversationId: string | null = null,
): Promise<ActionResult<Rappel>> {
  const parsed = rappelInputSchema.safeParse(input)
  if (!parsed.success) return { erreur: parsed.error.issues.map(i => i.message).join(' — ') }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rappel')
    .insert({ ...parsed.data, cree_par: origine, conversation_id: conversationId })
    .select(SELECT_RAPPEL)
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
    .select(SELECT_RAPPEL)
    .single()
  if (error || !data) return { erreur: error?.message ?? 'Introuvable' }
  return { data: data as Rappel }
}

export async function reporterRappel(id: string, nouvelleEcheance: string): Promise<ActionResult<Rappel>> {
  const echeance = rappelInputSchema.shape.echeance.safeParse(nouvelleEcheance)
  if (!echeance.success) return { erreur: 'Date invalide' }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('rappel')
    .update({ echeance: echeance.data })
    .eq('id', id)
    .select(SELECT_RAPPEL)
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
    .select(SELECT_RAPPEL)
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
    .select(SELECT_RAPPEL)
    .single()
  if (error || !data) return { erreur: error?.message ?? 'Introuvable' }
  return { data: data as Rappel }
}

export async function lireRappels(etabId?: string): Promise<Rappel[]> {
  const supabase = await createClient()
  let q = supabase.from('rappel').select(SELECT_RAPPEL).is('deleted_at', null)
  if (etabId) q = q.eq('etablissement_id', etabId)
  const { data } = await q.order('echeance', { ascending: true })
  return (data ?? []) as Rappel[]
}

export async function compterRappelsDus(): Promise<number> {
  const supabase = await createClient()
  const finJour = new Date()
  finJour.setHours(23, 59, 59, 999)
  const { count } = await supabase
    .from('rappel')
    .select('*', { count: 'exact', head: true })
    .eq('statut', 'a_faire')
    .is('deleted_at', null)
    .lte('echeance', finJour.toISOString())
  return count ?? 0
}
```

Tests parallèles dans `src/actions/rappels.test.ts` (voir cadre TDD Task 4 pour le mock Supabase — même pattern) : au moins 3 cas (creerRappel valide/invalide, marquerFait, reporter avec date invalide).

Run → PASS.

- [ ] **Step 1.6 : Commit**

```bash
git add supabase/migrations/009_v1f_chat_rappels.sql src/types/rappel.ts src/types/conversation.ts src/lib/rappels/ src/actions/rappels.ts src/actions/rappels.test.ts
git commit -m "feat(v1f): tâche 1 — migration 009 + Server Actions rappels + regroupement TDD"
```

---

## Task 2 : Page /rappels + composants + badge nav + widget accueil

**Objectif :** UI Rappels complète — sections triées, filtre client, actions rapides, badge nav bottom, widget « Aujourd'hui » sur home.

**Files :**
- Modify : `src/app/(app)/rappels/page.tsx` (remplacer placeholder)
- Create : `src/components/rappels/liste-rappels.tsx`
- Create : `src/components/rappels/carte-rappel.tsx`
- Create : `src/components/rappels/filtre-etablissement.tsx`
- Create : `src/components/rappels/badge-nav-rappels.tsx`
- Create : `src/components/rappels/widget-rappels-aujourdhui.tsx`
- Modify : `src/components/layout/bottom-nav.tsx` (injecter badge)
- Modify : `src/app/(app)/page.tsx` (injecter widget)

- [ ] **Step 2.1 : Composant `CarteRappel`**

```typescript
// src/components/rappels/carte-rappel.tsx
'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { marquerRappelFait, annulerRappel } from '@/actions/rappels'
import { notifierChangement } from '@/lib/sync/revalidation'
import type { Rappel } from '@/types/rappel'

const CANAL_ICONE: Record<NonNullable<Rappel['canal']>, string> = {
  whatsapp: '💬', mail: '📧', telephone: '📞', sms: '📱', autre: '📌',
}

function formaterHeure(iso: string): string {
  return new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich', hour: '2-digit', minute: '2-digit',
  }).format(new Date(iso))
}

function formaterDateComplete(iso: string): string {
  return new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(iso))
}

interface Props {
  rappel: Rappel
  variante: 'auj' | 'sem' | 'tard' | 'retard' | 'termine'
  onReporter?: (r: Rappel) => void
}

export function CarteRappel({ rappel, variante, onReporter }: Props) {
  const [pending, startTransition] = useTransition()

  function onFait() {
    startTransition(async () => {
      const r = await marquerRappelFait(rappel.id)
      if (!r.erreur) notifierChangement()
    })
  }
  function onAnnuler() {
    startTransition(async () => {
      const r = await annulerRappel(rappel.id)
      if (!r.erreur) notifierChangement()
    })
  }

  const dateAffichee = variante === 'auj' ? formaterHeure(rappel.echeance) : formaterDateComplete(rappel.echeance)

  return (
    <Card className={`p-3 ${variante === 'termine' ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={variante === 'termine'}
          disabled={pending || variante === 'termine'}
          onChange={onFait}
          className="mt-1 size-5"
          aria-label="Marquer comme fait"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {variante === 'retard' && <Badge variant="destructive">En retard</Badge>}
            {rappel.cree_par === 'claude' && <Badge variant="outline">✨ IA</Badge>}
            {rappel.canal && (
              <span className="text-xs text-muted-foreground">
                {CANAL_ICONE[rappel.canal]} {rappel.canal}
              </span>
            )}
          </div>
          <h4 className="mt-1 truncate font-medium leading-tight">{rappel.titre}</h4>
          {rappel.description && (
            <p className="mt-0.5 line-clamp-2 text-sm text-muted-foreground">{rappel.description}</p>
          )}
          <div className="mt-1 text-xs text-muted-foreground">
            {dateAffichee}
            {rappel.etablissement && (
              <>
                {' · '}
                <Link href={`/etablissements/${rappel.etablissement_id}`} className="underline">
                  {rappel.etablissement.enseigne}
                </Link>
              </>
            )}
          </div>
          {variante !== 'termine' && (
            <div className="mt-2 flex gap-2">
              {onReporter && (
                <Button type="button" variant="outline" size="sm" onClick={() => onReporter(rappel)}>
                  📅 Reporter
                </Button>
              )}
              <Button type="button" variant="ghost" size="sm" onClick={onAnnuler} disabled={pending}>
                Annuler
              </Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  )
}
```

- [ ] **Step 2.2 : Filtre établissement**

```typescript
// src/components/rappels/filtre-etablissement.tsx
'use client'

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

interface Props {
  etablissements: Array<{ id: string; enseigne: string }>
  valeur: string | null
  onChange: (id: string | null) => void
}

export function FiltreEtablissement({ etablissements, valeur, onChange }: Props) {
  return (
    <Select
      value={valeur ?? 'tous'}
      onValueChange={(v) => onChange(v === 'tous' ? null : v)}
    >
      <SelectTrigger className="h-10 w-full text-sm">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="tous">Tous les clients</SelectItem>
        {etablissements.map((e) => (
          <SelectItem key={e.id} value={e.id}>{e.enseigne}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
```

- [ ] **Step 2.3 : Liste rappels avec sections + bottom sheet reporter**

```typescript
// src/components/rappels/liste-rappels.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { CarteRappel } from './carte-rappel'
import { FiltreEtablissement } from './filtre-etablissement'
import { BottomSheetReporter } from './bottom-sheet-reporter'
import { lireRappels } from '@/actions/rappels'
import { regrouperRappels } from '@/lib/rappels/regroupement'
import { useRevalidation } from '@/lib/sync/revalidation'
import type { Rappel } from '@/types/rappel'

function Section({ titre, icone, rappels, variante, onReporter }: {
  titre: string; icone: string; rappels: Rappel[];
  variante: 'auj' | 'sem' | 'tard' | 'retard' | 'termine'
  onReporter?: (r: Rappel) => void
}) {
  if (rappels.length === 0) return null
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {icone} {titre} ({rappels.length})
      </h3>
      <ul className="space-y-2">
        {rappels.map((r) => (
          <li key={r.id}>
            <CarteRappel rappel={r} variante={variante} onReporter={onReporter} />
          </li>
        ))}
      </ul>
    </section>
  )
}

export function ListeRappels({ rappelsInitiaux }: { rappelsInitiaux: Rappel[] }) {
  const [rappels, setRappels] = useState(rappelsInitiaux)
  const [filtreEtabId, setFiltreEtabId] = useState<string | null>(null)
  const [rappelReporter, setRappelReporter] = useState<Rappel | null>(null)
  const version = useRevalidation()

  useEffect(() => {
    void lireRappels().then(setRappels)
  }, [version])

  const etablissements = useMemo(() => {
    const map = new Map<string, string>()
    for (const r of rappels) {
      if (r.etablissement_id && r.etablissement) {
        map.set(r.etablissement_id, r.etablissement.enseigne)
      }
    }
    return Array.from(map, ([id, enseigne]) => ({ id, enseigne }))
      .sort((a, b) => a.enseigne.localeCompare(b.enseigne, 'fr'))
  }, [rappels])

  const rappelsFiltres = useMemo(() => (
    filtreEtabId ? rappels.filter(r => r.etablissement_id === filtreEtabId) : rappels
  ), [rappels, filtreEtabId])

  const g = regrouperRappels(rappelsFiltres, new Date().toISOString())
  const total = g.enRetard.length + g.aujourdhui.length + g.cetteSemaine.length + g.plusTard.length + g.termines.length

  return (
    <div className="space-y-4">
      {etablissements.length > 0 && (
        <FiltreEtablissement
          etablissements={etablissements}
          valeur={filtreEtabId}
          onChange={setFiltreEtabId}
        />
      )}
      {total === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground">
          Aucun rappel actif. Utilise le chat Claude ou le bouton « + » pour en créer.
        </div>
      ) : (
        <div className="space-y-6">
          <Section titre="En retard"     icone="⚠️" rappels={g.enRetard}     variante="retard"  onReporter={setRappelReporter} />
          <Section titre="Aujourd'hui"   icone="⏰" rappels={g.aujourdhui}   variante="auj"     onReporter={setRappelReporter} />
          <Section titre="Cette semaine" icone="📅" rappels={g.cetteSemaine} variante="sem"     onReporter={setRappelReporter} />
          <Section titre="Plus tard"     icone="📆" rappels={g.plusTard}     variante="tard"    onReporter={setRappelReporter} />
          <Section titre="Terminés"      icone="✅" rappels={g.termines}     variante="termine" />
        </div>
      )}
      <BottomSheetReporter rappel={rappelReporter} onClose={() => setRappelReporter(null)} />
    </div>
  )
}
```

- [ ] **Step 2.4 : Bottom-sheet « Reporter »**

```typescript
// src/components/rappels/bottom-sheet-reporter.tsx
'use client'

import { useState, useTransition } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { reporterRappel } from '@/actions/rappels'
import { notifierChangement } from '@/lib/sync/revalidation'
import type { Rappel } from '@/types/rappel'

export function BottomSheetReporter({ rappel, onClose }: { rappel: Rappel | null; onClose: () => void }) {
  const [nouvelleDate, setNouvelleDate] = useState('')
  const [pending, startTransition] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)

  function onValider() {
    if (!rappel) return
    startTransition(async () => {
      const r = await reporterRappel(rappel.id, new Date(nouvelleDate).toISOString())
      if (r.erreur) { setErreur(r.erreur); return }
      notifierChangement()
      onClose()
    })
  }

  return (
    <Sheet open={rappel !== null} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom">
        <SheetHeader>
          <SheetTitle>Reporter « {rappel?.titre} »</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="nvdate">Nouvelle échéance</Label>
            <Input
              id="nvdate"
              type="datetime-local"
              value={nouvelleDate}
              onChange={e => setNouvelleDate(e.target.value)}
              className="h-12 text-base"
            />
          </div>
          {erreur && <p className="text-sm text-destructive">{erreur}</p>}
          <Button onClick={onValider} disabled={pending || !nouvelleDate} className="h-12 w-full">
            {pending ? 'Enregistrement…' : 'Reporter'}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 2.5 : Badge nav + widget accueil**

```typescript
// src/components/rappels/badge-nav-rappels.tsx
'use client'

import { useEffect, useState } from 'react'
import { compterRappelsDus } from '@/actions/rappels'
import { useRevalidation } from '@/lib/sync/revalidation'

export function BadgeNavRappels() {
  const [count, setCount] = useState(0)
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

```typescript
// src/components/rappels/widget-rappels-aujourdhui.tsx
'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { compterRappelsDus } from '@/actions/rappels'
import { useRevalidation } from '@/lib/sync/revalidation'

export function WidgetRappelsAujourdhui() {
  const [count, setCount] = useState(0)
  const version = useRevalidation()

  useEffect(() => { void compterRappelsDus().then(setCount) }, [version])

  if (count === 0) return null
  return (
    <Link href="/rappels">
      <Card className="flex items-center gap-3 p-4">
        <div className="text-3xl">⏰</div>
        <div>
          <p className="font-medium">{count} rappel{count > 1 ? 's' : ''} aujourd'hui</p>
          <p className="text-sm text-muted-foreground">Tape pour consulter</p>
        </div>
      </Card>
    </Link>
  )
}
```

Injecter dans `bottom-nav.tsx` (autour de l'icône Rappels : `<span className="relative">…<BadgeNavRappels /></span>`) et dans la page home au-dessus du widget objectif.

- [ ] **Step 2.6 : Page `/rappels`**

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

- [ ] **Step 2.7 : Vérification manuelle + commit**

Ouvrir `/rappels` mobile, tester : sections, filtre client, marquer fait, reporter (bottom sheet), annuler, badge nav, widget home.

```bash
git add src/app/\(app\)/rappels/page.tsx src/components/rappels/ src/components/layout/bottom-nav.tsx src/app/\(app\)/page.tsx
git commit -m "feat(v1f): tâche 2 — page /rappels sections + filtre client + badge nav + widget home"
```

---

## Task 3 : Formulaire création rappel (bottom-sheet, autocomplete client)

**Objectif :** Bouton « + » qui ouvre un formulaire de saisie avec autocomplete établissement.

**Files :**
- Create : `src/components/rappels/bouton-nouveau-rappel.tsx`
- Create : `src/components/rappels/formulaire-rappel.tsx`
- Create : `src/components/rappels/autocomplete-etablissement.tsx`

- [ ] **Step 3.1 : Autocomplete établissement (utilise recherche V1e-fix2)**

```typescript
// src/components/rappels/autocomplete-etablissement.tsx
'use client'

import { useEffect, useMemo, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { lireEtablissements } from '@/actions/etablissement'
import { correspondRecherche, normaliserRecherche } from '@/lib/etablissements/recherche'
import type { Etablissement } from '@/types/database'

interface Props {
  valeurId: string | null
  onSelect: (etab: { id: string; enseigne: string } | null) => void
}

export function AutocompleteEtablissement({ valeurId, onSelect }: Props) {
  const [tous, setTous] = useState<Etablissement[]>([])
  const [q, setQ] = useState('')
  const [selection, setSelection] = useState<{ id: string; enseigne: string } | null>(null)

  useEffect(() => {
    void lireEtablissements().then(r => {
      if (r.data) setTous(r.data)
      if (valeurId) {
        const e = r.data?.find(x => x.id === valeurId)
        if (e) setSelection({ id: e.id, enseigne: e.enseigne })
      }
    })
  }, [valeurId])

  const suggestions = useMemo(() => {
    if (!q || selection) return []
    const norm = normaliserRecherche(q)
    return tous.filter(e => correspondRecherche(e, norm)).slice(0, 6)
  }, [q, tous, selection])

  if (selection) {
    return (
      <div className="flex items-center justify-between rounded-md border bg-muted/40 p-3">
        <span className="truncate text-sm">{selection.enseigne}</span>
        <button
          type="button"
          onClick={() => { setSelection(null); setQ(''); onSelect(null) }}
          className="text-xs underline"
        >
          Changer
        </button>
      </div>
    )
  }
  return (
    <div className="relative">
      <Input
        placeholder="Rechercher un établissement…"
        value={q}
        onChange={e => setQ(e.target.value)}
        className="h-12 text-base"
      />
      {suggestions.length > 0 && (
        <Card className="absolute z-10 mt-1 max-h-64 w-full overflow-y-auto p-1">
          {suggestions.map(e => (
            <button
              key={e.id}
              type="button"
              onClick={() => { setSelection({ id: e.id, enseigne: e.enseigne }); onSelect({ id: e.id, enseigne: e.enseigne }) }}
              className="block w-full rounded-sm px-3 py-2 text-left text-sm hover:bg-accent"
            >
              {e.enseigne}
              {e.ville && <span className="ml-2 text-xs text-muted-foreground">{e.ville}</span>}
            </button>
          ))}
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Step 3.2 : Formulaire rappel**

```typescript
// src/components/rappels/formulaire-rappel.tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { AutocompleteEtablissement } from './autocomplete-etablissement'
import { creerRappel } from '@/actions/rappels'
import { notifierChangement } from '@/lib/sync/revalidation'

type Canal = 'whatsapp' | 'mail' | 'telephone' | 'sms' | 'autre'

export function FormulaireRappel({ etablissementIdInitial, onSuccess }: {
  etablissementIdInitial?: string
  onSuccess: () => void
}) {
  const [titre, setTitre] = useState('')
  const [description, setDescription] = useState('')
  const [echeance, setEcheance] = useState('')
  const [canal, setCanal] = useState<Canal | ''>('')
  const [etabId, setEtabId] = useState<string | null>(etablissementIdInitial ?? null)
  const [pending, startTransition] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)

  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setErreur(null)
    startTransition(async () => {
      const r = await creerRappel({
        titre,
        description: description || null,
        echeance: new Date(echeance).toISOString(),
        canal: canal || null,
        etablissement_id: etabId,
        push_active: true,
      })
      if (r.erreur) { setErreur(r.erreur); return }
      notifierChangement()
      onSuccess()
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="titre">Titre *</Label>
        <Input id="titre" value={titre} onChange={e => setTitre(e.target.value)} required maxLength={200} className="h-12 text-base" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={description} onChange={e => setDescription(e.target.value)} rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="echeance">Date / heure *</Label>
        <Input id="echeance" type="datetime-local" value={echeance} onChange={e => setEcheance(e.target.value)} required className="h-12 text-base" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="canal">Canal</Label>
        <select id="canal" value={canal} onChange={e => setCanal(e.target.value as Canal | '')} className="h-12 w-full rounded-md border bg-background px-3 text-base">
          <option value="">—</option>
          <option value="whatsapp">💬 WhatsApp</option>
          <option value="mail">📧 Mail</option>
          <option value="telephone">📞 Téléphone</option>
          <option value="sms">📱 SMS</option>
          <option value="autre">📌 Autre</option>
        </select>
      </div>
      <div className="space-y-1.5">
        <Label>Client lié (optionnel)</Label>
        <AutocompleteEtablissement valeurId={etabId} onSelect={e => setEtabId(e?.id ?? null)} />
      </div>
      {erreur && <p className="text-sm text-destructive">{erreur}</p>}
      <Button type="submit" disabled={pending} className="h-12 w-full text-base">
        {pending ? 'Enregistrement…' : 'Créer le rappel'}
      </Button>
    </form>
  )
}
```

- [ ] **Step 3.3 : Bouton flottant + Sheet**

```typescript
// src/components/rappels/bouton-nouveau-rappel.tsx
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { FormulaireRappel } from './formulaire-rappel'

export function BoutonNouveauRappel({ etablissementIdInitial }: { etablissementIdInitial?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <Button size="lg" className="h-10" onClick={() => setOpen(true)}>+ Nouveau</Button>
      <SheetContent side="bottom" className="max-h-[92vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Nouveau rappel</SheetTitle>
        </SheetHeader>
        <div className="mt-4">
          <FormulaireRappel etablissementIdInitial={etablissementIdInitial} onSuccess={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

- [ ] **Step 3.4 : Commit**

```bash
git add src/components/rappels/bouton-nouveau-rappel.tsx src/components/rappels/formulaire-rappel.tsx src/components/rappels/autocomplete-etablissement.tsx
git commit -m "feat(v1f): tâche 3 — formulaire rappel bottom-sheet + autocomplete client"
```

---

## Task 4 : Chat — Outils + prompt système + monitoring tokens (TDD)

**Objectif :** Définir les 6 outils Claude, le prompt système contextuel, et le monitoring tokens avec alerte seuil. Toute la logique pure testable en TDD.

**Files :**
- Create : `src/lib/claude/systeme.ts`
- Create : `src/lib/claude/outils.ts`
- Create : `src/lib/claude/outils.test.ts` (description humaine + validation Zod des inputs)
- Create : `src/lib/claude/monitoring.ts`
- Create : `src/lib/claude/monitoring.test.ts`
- Create : `src/lib/claude/executeur-outils.ts` (exécute un tool_use côté serveur)
- Create : `src/lib/claude/executeur-outils.test.ts`

- [ ] **Step 4.1 : Prompt système contextuel**

```typescript
// src/lib/claude/systeme.ts
import type { Etablissement, Contact, Visite, Offre } from '@/types/database'
import type { Horaires } from '@/types/horaires'

export interface ContexteFiche {
  etablissement: Etablissement
  contacts: Contact[]
  dernieres_visites: Visite[]         // max 3
  offres_actives: Offre[]
  horaires: Horaires | null
}

function formaterDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich', dateStyle: 'full', timeStyle: 'short',
  }).format(new Date(iso))
}

export function construireSystemePrompt(contexte?: ContexteFiche): string {
  const parts: string[] = [
    "Tu es l'assistant CRM de Cyril Cicero, commercial en vins pour Schenk/Obrist en Valais.",
    "",
    "Ta mission : l'aider à gérer ses clients, rappels, visites et offres, en langage naturel.",
    "",
    "Règles importantes :",
    "- Tu peux LIRE (lireVisites, chercherEtablissements) sans confirmation.",
    "- Toute action de MODIFICATION (creerRappel, creerVisite, mettreAJourHoraires, mettreAJourEtablissement) sera soumise à Cyril pour confirmation avant d'être exécutée. Tu n'as pas besoin de demander sa permission dans la conversation : le CRM gère la validation.",
    "- Tu n'envoies AUCUN message externe (WhatsApp, mail, SMS). Cyril agit lui-même après notification.",
    "- Format date pour les outils : ISO 8601 avec offset (ex 2026-08-05T14:00:00+02:00). Fuseau Europe/Zurich.",
    "- Réponses concises, orales, en français suisse. Pas de préambule (« D'accord, je vais… »).",
    "- Si tu as besoin d'un champ manquant (date/heure floue, établissement ambigu), pose UNE seule question courte.",
    "",
    `Date/heure actuelle : ${formaterDate(new Date().toISOString())}.`,
  ]

  if (contexte) {
    const { etablissement: e, contacts, dernieres_visites: visites, offres_actives, horaires } = contexte
    parts.push('', `### Contexte fiche : ${e.enseigne}`)
    if (e.code_schenk) parts.push(`Code Schenk : ${e.code_schenk}`)
    parts.push(`Statut : ${e.statut}`)
    if (e.ville) parts.push(`Ville : ${e.code_postal ?? ''} ${e.ville}`.trim())
    if (e.adresse_ligne_1) parts.push(`Adresse : ${e.adresse_ligne_1}`)
    if (e.telephone_principal) parts.push(`Tél : ${e.telephone_principal}`)
    if (contacts.length > 0) {
      parts.push('', 'Contacts :')
      for (const c of contacts) {
        parts.push(`- ${[c.prenom, c.nom].filter(Boolean).join(' ')}${c.fonction ? ` (${c.fonction})` : ''}${c.telephone ? ` — ${c.telephone}` : ''}`)
      }
    }
    if (visites.length > 0) {
      parts.push('', 'Dernières visites :')
      for (const v of visites) {
        parts.push(`- ${v.date_visite}${v.est_manquee ? ' [manquée]' : ''}${v.notes ? ` — ${v.notes.slice(0, 100)}` : ''}`)
      }
    }
    if (offres_actives.length > 0) {
      parts.push('', 'Offres actives :')
      for (const o of offres_actives) parts.push(`- ${o.cuvee_text}${o.prix_promo_chf ? ` — ${o.prix_promo_chf} CHF` : ''}`)
    }
    if (horaires) parts.push('', `Horaires : ${JSON.stringify(horaires)}`)
    parts.push('', `ID de cet établissement (à passer aux outils) : ${e.id}`)
  }

  return parts.join('\n')
}
```

- [ ] **Step 4.2 : Définition des 6 outils Claude (Anthropic.Tool[])**

```typescript
// src/lib/claude/outils.ts
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

export type NomOutil =
  | 'creerRappel' | 'creerVisite' | 'mettreAJourHoraires'
  | 'mettreAJourEtablissement' | 'lireVisites' | 'chercherEtablissements'

// Outils "lecture" — exécutés automatiquement sans confirmation.
export const OUTILS_LECTURE: NomOutil[] = ['lireVisites', 'chercherEtablissements']
// Outils "modification" — bufferisés, confirmation utilisateur obligatoire.
export const OUTILS_MODIFICATION: NomOutil[] = ['creerRappel', 'creerVisite', 'mettreAJourHoraires', 'mettreAJourEtablissement']

// Schémas Zod par outil (validation server-side avant exécution).
export const SCHEMAS_OUTILS = {
  creerRappel: z.object({
    titre: z.string().min(1).max(200),
    echeance: z.string().datetime({ offset: true }),
    canal: z.enum(['whatsapp', 'mail', 'telephone', 'sms', 'autre']).nullable().optional(),
    etablissement_id: z.string().uuid().nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
  }),
  creerVisite: z.object({
    etablissement_id: z.string().uuid(),
    duree_minutes: z.number().int().min(1).max(600),
    notes: z.string().max(4000).nullable().optional(),
  }),
  mettreAJourHoraires: z.object({
    etablissement_id: z.string().uuid(),
    horaires: z.record(z.string(), z.union([
      z.array(z.object({ debut: z.string(), fin: z.string() })),
      z.null(),
    ])),
  }),
  mettreAJourEtablissement: z.object({
    id: z.string().uuid(),
    champs: z.object({
      enseigne:            z.string().optional(),
      adresse_ligne_1:     z.string().nullable().optional(),
      code_postal:         z.string().nullable().optional(),
      ville:               z.string().nullable().optional(),
      telephone_principal: z.string().nullable().optional(),
      telephone_mobile:    z.string().nullable().optional(),
      email:               z.string().email().nullable().optional(),
      site_web:            z.string().url().nullable().optional(),
      notes_internes:      z.string().nullable().optional(),
    }).refine((c) => Object.keys(c).length > 0, 'Au moins un champ requis'),
  }),
  lireVisites: z.object({
    etablissement_id: z.string().uuid(),
    limite: z.number().int().min(1).max(50).default(10),
  }),
  chercherEtablissements: z.object({
    requete: z.string().min(1).max(200),
    limite: z.number().int().min(1).max(50).default(20),
  }),
} as const

// Description "humaine" affichée dans l'UI pour la confirmation.
export function descriptionHumaine(nom: NomOutil, params: Record<string, unknown>): string {
  switch (nom) {
    case 'creerRappel':
      return `Créer un rappel : « ${params.titre} » pour le ${new Intl.DateTimeFormat('fr-CH', {
        timeZone: 'Europe/Zurich', dateStyle: 'short', timeStyle: 'short',
      }).format(new Date(params.echeance as string))}`
    case 'creerVisite':
      return `Enregistrer une visite (${params.duree_minutes} min)`
    case 'mettreAJourHoraires':
      return `Mettre à jour les horaires d'ouverture`
    case 'mettreAJourEtablissement': {
      const champs = Object.keys(params.champs as object)
      return `Modifier la fiche : ${champs.join(', ')}`
    }
    default:
      return nom
  }
}

// Définitions envoyées à Claude (Anthropic.Tool[]).
export const OUTILS_CLAUDE: Anthropic.Tool[] = [
  {
    name: 'creerRappel',
    description: 'Crée un rappel/tâche à échéance donnée. À utiliser dès que Cyril exprime une intention d\'action future.',
    input_schema: {
      type: 'object',
      properties: {
        titre: { type: 'string', description: 'Titre concis à l\'impératif (< 200 caractères).' },
        echeance: { type: 'string', description: 'ISO 8601 avec offset Europe/Zurich.' },
        canal: { type: 'string', enum: ['whatsapp', 'mail', 'telephone', 'sms', 'autre'], description: 'Canal indicatif (non exécuté).' },
        etablissement_id: { type: 'string', description: 'UUID du client si contexte présent.' },
        description: { type: 'string', description: 'Détails optionnels.' },
      },
      required: ['titre', 'echeance'],
    },
  },
  {
    name: 'creerVisite',
    description: 'Enregistre une visite (passage chez un client) avec durée et notes libres.',
    input_schema: {
      type: 'object',
      properties: {
        etablissement_id: { type: 'string', description: 'UUID du client.' },
        duree_minutes: { type: 'number', description: 'Durée en minutes (typiquement 60 ou 120).' },
        notes: { type: 'string', description: 'Compte rendu libre (dégustations, remarques…).' },
      },
      required: ['etablissement_id', 'duree_minutes'],
    },
  },
  {
    name: 'mettreAJourHoraires',
    description: 'Met à jour les horaires d\'ouverture hebdomadaires d\'un établissement.',
    input_schema: {
      type: 'object',
      properties: {
        etablissement_id: { type: 'string', description: 'UUID du client.' },
        horaires: {
          type: 'object',
          description: 'Objet { lundi: [{debut, fin}, ...] | null, mardi: ..., ... }. Format HH:mm.',
        },
      },
      required: ['etablissement_id', 'horaires'],
    },
  },
  {
    name: 'mettreAJourEtablissement',
    description: 'Modifie un ou plusieurs champs d\'une fiche établissement (enseigne, adresse, téléphone, email…).',
    input_schema: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'UUID du client.' },
        champs: {
          type: 'object',
          description: 'Champs à modifier. Ne pas inclure les champs inchangés.',
        },
      },
      required: ['id', 'champs'],
    },
  },
  {
    name: 'lireVisites',
    description: 'Lit les dernières visites d\'un client (pour répondre "quand j\'ai vu X la dernière fois ?").',
    input_schema: {
      type: 'object',
      properties: {
        etablissement_id: { type: 'string', description: 'UUID du client.' },
        limite: { type: 'number', description: 'Nombre max de visites à retourner (défaut 10).' },
      },
      required: ['etablissement_id'],
    },
  },
  {
    name: 'chercherEtablissements',
    description: 'Recherche des établissements par nom, ville, code, adresse, téléphone ou contact (recherche multi-champs).',
    input_schema: {
      type: 'object',
      properties: {
        requete: { type: 'string', description: 'Termes de recherche (ex "HORECA Verbier").' },
        limite: { type: 'number', description: 'Nombre max de résultats (défaut 20).' },
      },
      required: ['requete'],
    },
  },
]
```

- [ ] **Step 4.3 : Test rouge — `descriptionHumaine`**

```typescript
// src/lib/claude/outils.test.ts
import { describe, it, expect } from 'vitest'
import { descriptionHumaine, SCHEMAS_OUTILS, OUTILS_LECTURE, OUTILS_MODIFICATION } from './outils'

describe('descriptionHumaine', () => {
  it('creerRappel : titre + date formatée fr-CH', () => {
    const d = descriptionHumaine('creerRappel', {
      titre: 'Rappeler M. Dupont',
      echeance: '2026-08-05T14:00:00+02:00',
    })
    expect(d).toContain('Rappeler M. Dupont')
    expect(d).toMatch(/05\.08\.2026/)
  })

  it('mettreAJourEtablissement : liste des champs modifiés', () => {
    const d = descriptionHumaine('mettreAJourEtablissement', {
      id: '11111111-1111-4111-8111-111111111111',
      champs: { enseigne: 'Nouveau', ville: 'Sion' },
    })
    expect(d).toContain('enseigne')
    expect(d).toContain('ville')
  })
})

describe('SCHEMAS_OUTILS', () => {
  it('creerRappel refuse un titre vide', () => {
    const r = SCHEMAS_OUTILS.creerRappel.safeParse({ titre: '', echeance: '2026-08-05T14:00:00+02:00' })
    expect(r.success).toBe(false)
  })
  it('mettreAJourEtablissement refuse un objet champs vide', () => {
    const r = SCHEMAS_OUTILS.mettreAJourEtablissement.safeParse({
      id: '11111111-1111-4111-8111-111111111111', champs: {},
    })
    expect(r.success).toBe(false)
  })
})

describe('classification lecture / modification', () => {
  it('les 6 outils sont classés', () => {
    expect([...OUTILS_LECTURE, ...OUTILS_MODIFICATION].sort()).toEqual(
      ['chercherEtablissements', 'creerRappel', 'creerVisite', 'lireVisites', 'mettreAJourEtablissement', 'mettreAJourHoraires'],
    )
  })
})
```

Run → PASS.

- [ ] **Step 4.4 : Exécuteur d'outils (TDD)**

```typescript
// src/lib/claude/executeur-outils.ts
import { SCHEMAS_OUTILS, type NomOutil } from './outils'
import { creerRappel } from '@/actions/rappels'
import { creerVisite } from '@/actions/visite'
import { mettreAJourEtablissement } from '@/actions/etablissement'
import { lireEtablissements } from '@/actions/etablissement'
import { createClient } from '@/lib/supabase/server'
import { correspondRecherche, normaliserRecherche } from '@/lib/etablissements/recherche'

export type ResultatOutil =
  | { ok: true;  contenu: string }
  | { ok: false; erreur: string }

export async function executerOutil(
  nom: NomOutil,
  input: unknown,
  conversationId: string | null,
): Promise<ResultatOutil> {
  switch (nom) {
    case 'creerRappel': {
      const p = SCHEMAS_OUTILS.creerRappel.safeParse(input)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      const r = await creerRappel({ ...p.data, push_active: true }, 'claude', conversationId)
      return r.erreur ? { ok: false, erreur: r.erreur } : { ok: true, contenu: `Rappel créé (id ${r.data!.id})` }
    }
    case 'creerVisite': {
      const p = SCHEMAS_OUTILS.creerVisite.safeParse(input)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      const r = await creerVisite({
        ...p.data,
        date_visite: new Date().toISOString().slice(0, 10),
        est_manquee: false,
      })
      return r.erreur ? { ok: false, erreur: String(r.erreur) } : { ok: true, contenu: `Visite créée (id ${r.data!.id})` }
    }
    case 'mettreAJourHoraires': {
      const p = SCHEMAS_OUTILS.mettreAJourHoraires.safeParse(input)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      const r = await mettreAJourEtablissement(p.data.etablissement_id, { horaires_ouverture: p.data.horaires })
      return r.erreur ? { ok: false, erreur: String(r.erreur) } : { ok: true, contenu: 'Horaires mis à jour' }
    }
    case 'mettreAJourEtablissement': {
      const p = SCHEMAS_OUTILS.mettreAJourEtablissement.safeParse(input)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      const r = await mettreAJourEtablissement(p.data.id, p.data.champs)
      return r.erreur ? { ok: false, erreur: String(r.erreur) } : { ok: true, contenu: 'Fiche mise à jour' }
    }
    case 'lireVisites': {
      const p = SCHEMAS_OUTILS.lireVisites.safeParse(input)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      const supabase = await createClient()
      const { data } = await supabase
        .from('visite')
        .select('date_visite, duree_minutes, notes, est_manquee')
        .eq('etablissement_id', p.data.etablissement_id)
        .is('deleted_at', null)
        .order('date_visite', { ascending: false })
        .limit(p.data.limite)
      return { ok: true, contenu: JSON.stringify(data ?? []) }
    }
    case 'chercherEtablissements': {
      const p = SCHEMAS_OUTILS.chercherEtablissements.safeParse(input)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      const r = await lireEtablissements()
      if (!r.data) return { ok: false, erreur: 'Erreur lecture' }
      const norm = normaliserRecherche(p.data.requete)
      const matches = r.data
        .filter((e) => correspondRecherche(e, norm))
        .slice(0, p.data.limite)
        .map((e) => ({ id: e.id, enseigne: e.enseigne, ville: e.ville, statut: e.statut, code_schenk: e.code_schenk }))
      return { ok: true, contenu: JSON.stringify(matches) }
    }
  }
}
```

Test parallèle : 3 cas minimum (creerRappel valide, mettreAJourEtablissement Zod refus, chercherEtablissements avec mock). Voir cadre TDD Task 1.

- [ ] **Step 4.5 : Monitoring tokens + alerte seuil (TDD)**

```typescript
// src/lib/claude/monitoring.test.ts
import { describe, it, expect } from 'vitest'
import { calculerCoutCHF, estAuDelaSeuil } from './monitoring'

describe('calculerCoutCHF', () => {
  it('claude-haiku-4-5 : 1$/1M in + 5$/1M out, converti CHF (~0.88)', () => {
    const c = calculerCoutCHF('haiku', 10_000, 2_000)
    // (10k/1M)*1 + (2k/1M)*5 = 0.01 + 0.01 = 0.02 USD ≈ 0.0176 CHF
    expect(c).toBeGreaterThan(0.015)
    expect(c).toBeLessThan(0.025)
  })

  it('claude-sonnet-4-6 est 3× plus cher que haiku sur input', () => {
    const haiku = calculerCoutCHF('haiku', 100_000, 0)
    const sonnet = calculerCoutCHF('sonnet', 100_000, 0)
    expect(sonnet / haiku).toBeCloseTo(3, 1)
  })
})

describe('estAuDelaSeuil', () => {
  it('true quand cumulé >= 80% du seuil', () => {
    expect(estAuDelaSeuil(80, 100)).toBe(true)
    expect(estAuDelaSeuil(79.99, 100)).toBe(false)
  })
  it('false quand seuil = 0 (désactivé)', () => {
    expect(estAuDelaSeuil(50, 0)).toBe(false)
  })
})
```

```typescript
// src/lib/claude/monitoring.ts
import { createClient } from '@/lib/supabase/server'
import type { ModeleClaude } from '@/types/conversation'

const TARIFS_USD: Record<ModeleClaude, { input: number; output: number }> = {
  haiku:  { input: 1, output: 5 },   // $ / 1M tokens
  sonnet: { input: 3, output: 15 },
}
const USD_TO_CHF = 0.88

export function calculerCoutCHF(modele: ModeleClaude, tokensIn: number, tokensOut: number): number {
  const t = TARIFS_USD[modele]
  const usd = (tokensIn / 1e6) * t.input + (tokensOut / 1e6) * t.output
  return Math.round(usd * USD_TO_CHF * 10000) / 10000
}

export function estAuDelaSeuil(cumuleCHF: number, seuilCHF: number): boolean {
  if (seuilCHF <= 0) return false
  return cumuleCHF >= seuilCHF * 0.8
}

export interface EtatMonitoring {
  tokens_mois: number
  cout_chf_mois: number
  seuil_chf: number
  au_dela_seuil: boolean
}

export async function ajouterConsommation(
  modele: ModeleClaude,
  tokensIn: number,
  tokensOut: number,
): Promise<EtatMonitoring> {
  const supabase = await createClient()
  const cle = 'monitoring_consommation_claude'
  const { data } = await supabase.from('parametre').select('valeur').eq('cle', cle).maybeSingle()
  const prec = data?.valeur
    ? JSON.parse(data.valeur) as { tokens_mois: number; cout_chf_mois: number; seuil_chf: number }
    : { tokens_mois: 0, cout_chf_mois: 0, seuil_chf: 30 }

  const nouveau: EtatMonitoring = {
    tokens_mois: prec.tokens_mois + tokensIn + tokensOut,
    cout_chf_mois: Math.round((prec.cout_chf_mois + calculerCoutCHF(modele, tokensIn, tokensOut)) * 10000) / 10000,
    seuil_chf: prec.seuil_chf,
    au_dela_seuil: false,
  }
  nouveau.au_dela_seuil = estAuDelaSeuil(nouveau.cout_chf_mois, nouveau.seuil_chf)

  await supabase.from('parametre').upsert({
    cle,
    valeur: JSON.stringify({
      tokens_mois: nouveau.tokens_mois,
      cout_chf_mois: nouveau.cout_chf_mois,
      seuil_chf: nouveau.seuil_chf,
    }),
  })
  return nouveau
}

export async function lireMonitoring(): Promise<EtatMonitoring> {
  const supabase = await createClient()
  const { data } = await supabase.from('parametre').select('valeur').eq('cle', 'monitoring_consommation_claude').maybeSingle()
  const p = data?.valeur
    ? JSON.parse(data.valeur) as { tokens_mois: number; cout_chf_mois: number; seuil_chf: number }
    : { tokens_mois: 0, cout_chf_mois: 0, seuil_chf: 30 }
  return { ...p, au_dela_seuil: estAuDelaSeuil(p.cout_chf_mois, p.seuil_chf) }
}
```

Run → PASS.

- [ ] **Step 4.6 : Commit**

```bash
git add src/lib/claude/
git commit -m "feat(v1f): tâche 4 — outils Claude + exécuteur + monitoring tokens (TDD)"
```

---

## Task 5 : Streaming SSE — Route Handler + hook client

**Objectif :** Endpoint SSE `/api/chat/stream` qui gère la boucle tool use côté serveur, exécute les outils lecture automatiquement, bufferise les outils modification pour confirmation client, streame la réponse texte token par token.

**Files :**
- Create : `src/app/api/chat/stream/route.ts`
- Create : `src/app/api/chat/confirmer/route.ts` (exécute action confirmée + reprend la boucle)
- Create : `src/actions/chat.ts` (créer/lire/lister conversations, titre auto)
- Create : `src/hooks/use-chat.ts` (hook client SSE)

- [ ] **Step 5.1 : Server Actions chat (CRUD + titre auto)**

```typescript
// src/actions/chat.ts
'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { MODELES, type Conversation, type ModeleClaude } from '@/types/conversation'

const client = new Anthropic()

type ActionResult<T> = { data?: T; erreur?: string }

export async function creerConversation(modele: ModeleClaude, etablissementId: string | null): Promise<ActionResult<Conversation>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('conversation')
    .insert({ modele, etablissement_id: etablissementId, messages: [] })
    .select().single()
  if (error || !data) return { erreur: error?.message ?? 'Erreur' }
  return { data: data as Conversation }
}

export async function lireConversation(id: string): Promise<ActionResult<Conversation>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('conversation').select('*').eq('id', id).single()
  if (error || !data) return { erreur: 'Introuvable' }
  return { data: data as Conversation }
}

export async function lireConversations(): Promise<Conversation[]> {
  const supabase = await createClient()
  const { data } = await supabase.from('conversation').select('*').order('updated_at', { ascending: false }).limit(100)
  return (data ?? []) as Conversation[]
}

// Génère un titre court (< 60 caractères) à partir du 1er échange, appelé après le
// premier "end_turn" côté serveur. Utilise haiku pour économiser.
export async function genererTitreConversation(id: string): Promise<void> {
  const supabase = await createClient()
  const { data } = await supabase.from('conversation').select('titre, messages').eq('id', id).single()
  if (!data || data.titre) return
  const messages = data.messages as Anthropic.MessageParam[]
  if (messages.length < 2) return

  const r = await client.messages.create({
    model: MODELES.haiku,
    max_tokens: 60,
    system: 'Résume le sujet de cet échange en 4-8 mots, sans ponctuation finale, en français. Réponds UNIQUEMENT par le titre.',
    messages: messages.slice(0, 2),
  })
  const bloc = r.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  const titre = bloc?.text.trim().slice(0, 80) ?? null
  if (titre) await supabase.from('conversation').update({ titre }).eq('id', id)
}
```

- [ ] **Step 5.2 : Route handler SSE — `/api/chat/stream`**

Le handler POST reçoit `{ conversationId, message, imageUrl?, etablissementId? }`. Il :
1. Charge la conversation, appelle Claude avec `messages.stream()`
2. Streame les text deltas au client (SSE `event: text_delta`)
3. À chaque `content_block_stop` sur un `tool_use` :
   - Si outil lecture → exécute + continue la boucle (nouveau `stream()` avec le tool_result)
   - Si outil modification → bufferise et envoie `event: pending_action` au client, puis termine le stream (le client renverra une requête via `/api/chat/confirmer`)
4. À `end_turn` → persiste conversation + tokens, appelle `genererTitreConversation` en fire-and-forget, envoie `event: done`.

```typescript
// src/app/api/chat/stream/route.ts
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { MODELES, type ModeleClaude } from '@/types/conversation'
import { construireSystemePrompt } from '@/lib/claude/systeme'
import { OUTILS_CLAUDE, OUTILS_LECTURE, OUTILS_MODIFICATION, descriptionHumaine, type NomOutil } from '@/lib/claude/outils'
import { executerOutil } from '@/lib/claude/executeur-outils'
import { ajouterConsommation } from '@/lib/claude/monitoring'
import { genererTitreConversation } from '@/actions/chat'
import { chargerContexteFiche } from '@/lib/claude/contexte-fiche'

const client = new Anthropic()
const MAX_ITERATIONS = 6

export async function POST(req: NextRequest) {
  const { conversationId, message, imageUrl, etablissementId } = await req.json() as {
    conversationId: string; message: string; imageUrl?: string; etablissementId?: string
  }

  const supabase = await createClient()
  const { data: conv } = await supabase.from('conversation').select('*').eq('id', conversationId).single()
  if (!conv) return new Response('Conversation introuvable', { status: 404 })

  const modele = conv.modele as ModeleClaude
  const contexte = etablissementId ? await chargerContexteFiche(etablissementId) : null

  // Construit le contenu utilisateur (multimodal si image)
  const userContent: Anthropic.ContentBlockParam[] = imageUrl
    ? [{ type: 'image', source: { type: 'url', url: imageUrl } }, { type: 'text', text: message }]
    : [{ type: 'text', text: message }]

  const messages: Anthropic.MessageParam[] = [
    ...(conv.messages as Anthropic.MessageParam[]),
    { role: 'user', content: userContent },
  ]

  let tokensIn = 0, tokensOut = 0
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }

      try {
        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          const anthStream = client.messages.stream({
            model: MODELES[modele],
            max_tokens: 4096,
            system: construireSystemePrompt(contexte ?? undefined),
            tools: OUTILS_CLAUDE,
            messages,
          })

          // Streame les text deltas
          anthStream.on('text', (delta) => send('text_delta', { delta }))

          const finalMsg = await anthStream.finalMessage()
          tokensIn += finalMsg.usage.input_tokens
          tokensOut += finalMsg.usage.output_tokens
          messages.push({ role: 'assistant', content: finalMsg.content })

          if (finalMsg.stop_reason === 'end_turn') break

          if (finalMsg.stop_reason !== 'tool_use') {
            send('erreur', { message: `Stop reason inattendue : ${finalMsg.stop_reason}` })
            break
          }

          // Sépare tool_use en lecture (auto) vs modification (buffer)
          const toolUses = finalMsg.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
          const modifications = toolUses.filter(t => OUTILS_MODIFICATION.includes(t.name as NomOutil))

          if (modifications.length > 0) {
            // Bufferise : renvoie les pending_action au client et sort de la boucle
            for (const t of modifications) {
              send('pending_action', {
                tool_use_id: t.id,
                nom_outil: t.name,
                parametres: t.input,
                description_humaine: descriptionHumaine(t.name as NomOutil, t.input as Record<string, unknown>),
              })
            }
            // Persiste conversation en l'état (tool_use bufferisé, en attente de tool_result)
            await supabase.from('conversation').update({
              messages, tokens_input: conv.tokens_input + tokensIn, tokens_output: conv.tokens_output + tokensOut,
            }).eq('id', conversationId)
            const monitoring = await ajouterConsommation(modele, tokensIn, tokensOut)
            send('monitoring', monitoring)
            send('done', { conversation_id: conversationId, en_attente: true })
            controller.close()
            return
          }

          // Toutes lectures : exécute et continue la boucle
          const results: Anthropic.ToolResultBlockParam[] = []
          for (const t of toolUses) {
            const r = await executerOutil(t.name as NomOutil, t.input, conversationId)
            results.push({
              type: 'tool_result', tool_use_id: t.id,
              content: r.ok ? r.contenu : `Erreur : ${r.erreur}`,
              is_error: !r.ok,
            })
          }
          messages.push({ role: 'user', content: results })
        }

        // Persistance finale + titre auto (fire and forget)
        await supabase.from('conversation').update({
          messages, tokens_input: conv.tokens_input + tokensIn, tokens_output: conv.tokens_output + tokensOut,
        }).eq('id', conversationId)
        const monitoring = await ajouterConsommation(modele, tokensIn, tokensOut)
        send('monitoring', monitoring)
        void genererTitreConversation(conversationId).catch(() => {})
        send('done', { conversation_id: conversationId, en_attente: false })
      } catch (e) {
        send('erreur', { message: e instanceof Error ? e.message : 'Erreur inconnue' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 5.3 : Chargement contexte fiche**

```typescript
// src/lib/claude/contexte-fiche.ts
import { createClient } from '@/lib/supabase/server'
import type { ContexteFiche } from './systeme'

export async function chargerContexteFiche(etablissementId: string): Promise<ContexteFiche | null> {
  const supabase = await createClient()
  const [{ data: e }, { data: c }, { data: v }, { data: o }] = await Promise.all([
    supabase.from('etablissement').select('*').eq('id', etablissementId).single(),
    supabase.from('contact').select('*').eq('etablissement_id', etablissementId).is('deleted_at', null),
    supabase.from('visite').select('*').eq('etablissement_id', etablissementId)
      .is('deleted_at', null).order('date_visite', { ascending: false }).limit(3),
    supabase.from('offre').select('*').is('deleted_at', null),
  ])
  if (!e) return null
  const jour = new Date().toISOString().slice(0, 10)
  const offresActives = (o ?? []).filter((x) => (!x.date_debut || jour >= x.date_debut) && (!x.date_fin || jour <= x.date_fin))
  return {
    etablissement: e,
    contacts: c ?? [],
    dernieres_visites: v ?? [],
    offres_actives: offresActives,
    horaires: e.horaires_ouverture,
  }
}
```

- [ ] **Step 5.4 : Route `/api/chat/confirmer` (exécute action bufferisée + reprend boucle)**

```typescript
// src/app/api/chat/confirmer/route.ts
import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { MODELES, type ModeleClaude } from '@/types/conversation'
import { construireSystemePrompt } from '@/lib/claude/systeme'
import { OUTILS_CLAUDE, type NomOutil } from '@/lib/claude/outils'
import { executerOutil } from '@/lib/claude/executeur-outils'
import { ajouterConsommation } from '@/lib/claude/monitoring'
import { chargerContexteFiche } from '@/lib/claude/contexte-fiche'

interface Body {
  conversationId: string
  etablissementId?: string
  decisions: Array<{ tool_use_id: string; nom_outil: NomOutil; parametres: unknown; accepte: boolean }>
}

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const body = await req.json() as Body
  const supabase = await createClient()
  const { data: conv } = await supabase.from('conversation').select('*').eq('id', body.conversationId).single()
  if (!conv) return new Response('Conversation introuvable', { status: 404 })

  const modele = conv.modele as ModeleClaude
  const contexte = body.etablissementId ? await chargerContexteFiche(body.etablissementId) : null
  const messages = conv.messages as Anthropic.MessageParam[]

  // Construit les tool_result pour chaque décision
  const results: Anthropic.ToolResultBlockParam[] = []
  for (const d of body.decisions) {
    if (!d.accepte) {
      results.push({ type: 'tool_result', tool_use_id: d.tool_use_id, content: 'Utilisateur a refusé cette action.', is_error: false })
      continue
    }
    const r = await executerOutil(d.nom_outil, d.parametres, body.conversationId)
    results.push({
      type: 'tool_result', tool_use_id: d.tool_use_id,
      content: r.ok ? r.contenu : `Erreur : ${r.erreur}`, is_error: !r.ok,
    })
  }
  messages.push({ role: 'user', content: results })

  const encoder = new TextEncoder()
  let tokensIn = 0, tokensOut = 0

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      try {
        const anthStream = client.messages.stream({
          model: MODELES[modele],
          max_tokens: 4096,
          system: construireSystemePrompt(contexte ?? undefined),
          tools: OUTILS_CLAUDE,
          messages,
        })
        anthStream.on('text', (delta) => send('text_delta', { delta }))
        const finalMsg = await anthStream.finalMessage()
        tokensIn += finalMsg.usage.input_tokens
        tokensOut += finalMsg.usage.output_tokens
        messages.push({ role: 'assistant', content: finalMsg.content })

        await supabase.from('conversation').update({
          messages, tokens_input: conv.tokens_input + tokensIn, tokens_output: conv.tokens_output + tokensOut,
        }).eq('id', body.conversationId)
        const monitoring = await ajouterConsommation(modele, tokensIn, tokensOut)
        send('monitoring', monitoring)
        send('done', { conversation_id: body.conversationId, en_attente: false })
      } catch (e) {
        send('erreur', { message: e instanceof Error ? e.message : 'Erreur inconnue' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
```

- [ ] **Step 5.5 : Hook client `useChat` (consomme SSE)**

```typescript
// src/hooks/use-chat.ts
'use client'

import { useCallback, useRef, useState } from 'react'
import type { ActionEnAttente } from '@/types/conversation'
import type { EtatMonitoring } from '@/lib/claude/monitoring'

export interface EchangeChat {
  role: 'user' | 'assistant'
  texte: string
  actions_faites?: Array<{ nom: string; description: string }>
}

interface EtatChat {
  echanges: EchangeChat[]
  enCours: boolean
  actionsEnAttente: ActionEnAttente[]
  monitoring: EtatMonitoring | null
  erreur: string | null
}

export function useChat(conversationId: string, etablissementId?: string) {
  const [etat, setEtat] = useState<EtatChat>({
    echanges: [], enCours: false, actionsEnAttente: [], monitoring: null, erreur: null,
  })
  const abortRef = useRef<AbortController | null>(null)

  const consommerSSE = useCallback(async (url: string, body: unknown) => {
    setEtat(s => ({ ...s, enCours: true, erreur: null, actionsEnAttente: [] }))
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    let assistantBuf = ''
    try {
      const resp = await fetch(url, {
        method: 'POST', body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      })
      if (!resp.body) throw new Error('Pas de body SSE')
      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const events = buffer.split('\n\n')
        buffer = events.pop() ?? ''
        for (const raw of events) {
          const lignes = raw.split('\n')
          const event = lignes.find(l => l.startsWith('event: '))?.slice(7)
          const data = JSON.parse(lignes.find(l => l.startsWith('data: '))?.slice(6) ?? 'null')
          if (event === 'text_delta') {
            assistantBuf += data.delta
            setEtat(s => {
              const echanges = [...s.echanges]
              if (echanges.at(-1)?.role !== 'assistant') echanges.push({ role: 'assistant', texte: '' })
              echanges[echanges.length - 1] = { role: 'assistant', texte: assistantBuf }
              return { ...s, echanges }
            })
          } else if (event === 'pending_action') {
            setEtat(s => ({ ...s, actionsEnAttente: [...s.actionsEnAttente, data] }))
          } else if (event === 'monitoring') {
            setEtat(s => ({ ...s, monitoring: data }))
          } else if (event === 'erreur') {
            setEtat(s => ({ ...s, erreur: data.message }))
          } else if (event === 'done') {
            setEtat(s => ({ ...s, enCours: false }))
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setEtat(s => ({ ...s, enCours: false, erreur: (e as Error).message }))
    }
  }, [])

  const envoyerMessage = useCallback((message: string, imageUrl?: string) => {
    setEtat(s => ({ ...s, echanges: [...s.echanges, { role: 'user', texte: message }] }))
    return consommerSSE('/api/chat/stream', { conversationId, message, imageUrl, etablissementId })
  }, [conversationId, etablissementId, consommerSSE])

  const confirmerActions = useCallback((decisions: Array<{ tool_use_id: string; nom_outil: string; parametres: unknown; accepte: boolean }>) => {
    return consommerSSE('/api/chat/confirmer', { conversationId, etablissementId, decisions })
  }, [conversationId, etablissementId, consommerSSE])

  return { etat, envoyerMessage, confirmerActions, chargerHistorique: (echanges: EchangeChat[]) => setEtat(s => ({ ...s, echanges })) }
}
```

- [ ] **Step 5.6 : Test manuel + commit**

Créer une conversation en BDD (via Server Action), appeler l'endpoint manuellement avec un curl SSE pour vérifier le flux :

```bash
curl -N -X POST http://localhost:3000/api/chat/stream \
  -H "Content-Type: application/json" \
  -d '{"conversationId":"<uuid>","message":"Bonjour"}'
```

Attendu : réception d'événements `text_delta` puis `done`.

```bash
git add src/app/api/chat/ src/actions/chat.ts src/hooks/use-chat.ts src/lib/claude/contexte-fiche.ts
git commit -m "feat(v1f): tâche 5 — streaming SSE + Route Handlers + hook useChat + titre auto"
```

---

## Task 6 : Page /chat — sidebar historique + interface + composer + confirmations

**Objectif :** UI complète du chat avec sidebar liste conversations, bulles user/assistant, composer + toggle « Réfléchir plus » (Sonnet), cartes confirmation d'actions.

**Files :**
- Modify : `src/app/(app)/chat/page.tsx` (remplacer placeholder)
- Create : `src/components/chat/sidebar-conversations.tsx`
- Create : `src/components/chat/bulle-message.tsx`
- Create : `src/components/chat/composer.tsx` (upload image + toggle Sonnet)
- Create : `src/components/chat/carte-action-en-attente.tsx`
- Create : `src/components/chat/banniere-monitoring.tsx`
- Create : `src/components/chat/interface-chat.tsx`

- [ ] **Step 6.1 : Bulle message**

```typescript
// src/components/chat/bulle-message.tsx
'use client'

import { Card } from '@/components/ui/card'
import type { EchangeChat } from '@/hooks/use-chat'

export function BulleMessage({ echange }: { echange: EchangeChat }) {
  const estUser = echange.role === 'user'
  return (
    <div className={`flex ${estUser ? 'justify-end' : 'justify-start'}`}>
      <Card className={`max-w-[85%] whitespace-pre-wrap p-3 text-sm ${estUser ? 'bg-primary text-primary-foreground' : ''}`}>
        {echange.texte}
      </Card>
    </div>
  )
}
```

- [ ] **Step 6.2 : Composer avec image + toggle modèle**

```typescript
// src/components/chat/composer.tsx
'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { uploaderImageChat } from '@/lib/chat/upload-image'

interface Props {
  onEnvoyer: (texte: string, imageUrl?: string) => void
  desactive: boolean
  modele: 'haiku' | 'sonnet'
  onChangerModele: (m: 'haiku' | 'sonnet') => void
}

export function Composer({ onEnvoyer, desactive, modele, onChangerModele }: Props) {
  const [texte, setTexte] = useState('')
  const [image, setImage] = useState<{ file: File; preview: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [erreurImg, setErreurImg] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!texte.trim() && !image) return
    let imageUrl: string | undefined
    if (image) {
      setUploading(true)
      const r = await uploaderImageChat(image.file)
      setUploading(false)
      if ('erreur' in r) { setErreurImg(r.erreur); return }
      imageUrl = r.url
    }
    const capture = texte
    setTexte(''); setImage(null); setErreurImg(null)
    onEnvoyer(capture, imageUrl)
  }

  return (
    <form onSubmit={onSubmit} className="sticky bottom-0 flex flex-col gap-2 border-t bg-white p-3 pb-safe">
      {image && (
        <div className="relative inline-block">
          <img src={image.preview} alt="" className="h-20 rounded" />
          <button type="button" onClick={() => setImage(null)} className="absolute -right-1 -top-1 rounded-full bg-destructive px-1.5 text-xs text-white">×</button>
        </div>
      )}
      {erreurImg && <p className="text-xs text-destructive">{erreurImg}</p>}
      <div className="flex items-end gap-2">
        <input
          ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setImage({ file: f, preview: URL.createObjectURL(f) })
          }}
          className="hidden"
        />
        <Button type="button" variant="outline" size="icon" onClick={() => inputRef.current?.click()} disabled={desactive}>📎</Button>
        <Textarea
          value={texte} onChange={e => setTexte(e.target.value)}
          placeholder="Ex : Rappelle-moi de rappeler M. Dupont demain à 14h"
          rows={2} className="flex-1" disabled={desactive || uploading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ;(e.currentTarget.form as HTMLFormElement).requestSubmit()
            }
          }}
        />
        <Button type="submit" disabled={desactive || uploading || (!texte.trim() && !image)}>Envoyer</Button>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input type="checkbox" checked={modele === 'sonnet'} onChange={e => onChangerModele(e.target.checked ? 'sonnet' : 'haiku')} />
        🧠 Réfléchir plus (Sonnet, plus lent et plus cher)
      </label>
    </form>
  )
}
```

- [ ] **Step 6.3 : Carte confirmation d'action**

```typescript
// src/components/chat/carte-action-en-attente.tsx
'use client'

import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { ActionEnAttente } from '@/types/conversation'

interface Props {
  action: ActionEnAttente
  onDecider: (accepte: boolean) => void
}

export function CarteActionEnAttente({ action, onDecider }: Props) {
  return (
    <Card className="space-y-2 border-amber-300 bg-amber-50 p-3">
      <div className="flex items-center gap-2 text-xs font-medium uppercase text-amber-800">
        ⚡ Confirmation requise
      </div>
      <p className="text-sm">{action.description_humaine}</p>
      <details className="text-xs text-muted-foreground">
        <summary>Détails</summary>
        <pre className="mt-1 overflow-x-auto rounded bg-white p-2">{JSON.stringify(action.parametres, null, 2)}</pre>
      </details>
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={() => onDecider(true)}>✓ Confirmer</Button>
        <Button type="button" variant="outline" size="sm" onClick={() => onDecider(false)}>Refuser</Button>
      </div>
    </Card>
  )
}
```

- [ ] **Step 6.4 : Bannière monitoring (alerte >80% seuil)**

```typescript
// src/components/chat/banniere-monitoring.tsx
'use client'

import type { EtatMonitoring } from '@/lib/claude/monitoring'

export function BanniereMonitoring({ monitoring }: { monitoring: EtatMonitoring | null }) {
  if (!monitoring || !monitoring.au_dela_seuil) return null
  const pct = monitoring.seuil_chf > 0 ? Math.round((monitoring.cout_chf_mois / monitoring.seuil_chf) * 100) : 0
  return (
    <div className="border-b bg-amber-50 px-4 py-2 text-xs text-amber-900">
      ⚠️ Consommation Claude : {monitoring.cout_chf_mois.toFixed(2)} CHF / {monitoring.seuil_chf} CHF ({pct} %)
    </div>
  )
}
```

- [ ] **Step 6.5 : Interface chat (assemble le tout)**

```typescript
// src/components/chat/interface-chat.tsx
'use client'

import { useEffect, useState } from 'react'
import { useChat } from '@/hooks/use-chat'
import { lireConversation } from '@/actions/chat'
import { BulleMessage } from './bulle-message'
import { Composer } from './composer'
import { CarteActionEnAttente } from './carte-action-en-attente'
import { BanniereMonitoring } from './banniere-monitoring'
import { notifierChangement } from '@/lib/sync/revalidation'
import type { ModeleClaude, ActionEnAttente } from '@/types/conversation'
import type Anthropic from '@anthropic-ai/sdk'

interface Props {
  conversationId: string
  etablissementId?: string
  modeleInitial: ModeleClaude
}

function extraireTexte(content: Anthropic.MessageParam['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
}

export function InterfaceChat({ conversationId, etablissementId, modeleInitial }: Props) {
  const [modele, setModele] = useState<ModeleClaude>(modeleInitial)
  const { etat, envoyerMessage, confirmerActions, chargerHistorique } = useChat(conversationId, etablissementId)

  useEffect(() => {
    void lireConversation(conversationId).then((r) => {
      if (r.data?.messages) {
        chargerHistorique(r.data.messages.map(m => ({
          role: m.role, texte: extraireTexte(m.content),
        })).filter(e => e.texte))
      }
    })
  }, [conversationId, chargerHistorique])

  function onDeciderAction(action: ActionEnAttente, accepte: boolean) {
    void confirmerActions([{
      tool_use_id: action.tool_use_id,
      nom_outil: action.nom_outil, parametres: action.parametres, accepte,
    }])
    if (accepte) notifierChangement()
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <BanniereMonitoring monitoring={etat.monitoring} />
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pt-3">
        {etat.echanges.length === 0 && !etat.enCours && (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            Écris ton intention en langage naturel — je peux créer rappels, visites, horaires, chercher des clients…
          </div>
        )}
        {etat.echanges.map((e, i) => <BulleMessage key={i} echange={e} />)}
        {etat.actionsEnAttente.map((a) => (
          <CarteActionEnAttente key={a.tool_use_id} action={a} onDecider={(ok) => onDeciderAction(a, ok)} />
        ))}
        {etat.enCours && <div className="text-sm italic text-muted-foreground">Claude réfléchit…</div>}
        {etat.erreur && <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">❌ {etat.erreur}</div>}
      </div>
      <Composer
        onEnvoyer={envoyerMessage}
        desactive={etat.enCours || etat.actionsEnAttente.length > 0}
        modele={modele} onChangerModele={setModele}
      />
    </div>
  )
}
```

- [ ] **Step 6.6 : Sidebar conversations + page /chat**

```typescript
// src/components/chat/sidebar-conversations.tsx
'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import type { Conversation } from '@/types/conversation'

function formaterDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich', dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(iso))
}

export function SidebarConversations({ conversations, actifId }: { conversations: Conversation[]; actifId?: string }) {
  return (
    <aside className="hidden w-72 shrink-0 border-r bg-muted/20 p-3 sm:block">
      <Link href="/chat?new=1" className="mb-3 block rounded-md border bg-white p-3 text-center text-sm font-medium hover:bg-accent">
        + Nouveau chat
      </Link>
      <ul className="space-y-1">
        {conversations.map((c) => (
          <li key={c.id}>
            <Link href={`/chat?c=${c.id}`}>
              <Card className={`p-2 text-xs ${c.id === actifId ? 'bg-accent' : ''}`}>
                <div className="truncate font-medium">{c.titre ?? '(sans titre)'}</div>
                <div className="text-muted-foreground">{formaterDate(c.updated_at)}</div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
```

```typescript
// src/app/(app)/chat/page.tsx
import { redirect } from 'next/navigation'
import { creerConversation, lireConversations } from '@/actions/chat'
import { SidebarConversations } from '@/components/chat/sidebar-conversations'
import { InterfaceChat } from '@/components/chat/interface-chat'

export const dynamic = 'force-dynamic'

export default async function PageChat({ searchParams }: {
  searchParams: Promise<{ c?: string; new?: string; etab?: string }>
}) {
  const params = await searchParams
  let conversationId = params.c

  if (params.new === '1' || !conversationId) {
    const r = await creerConversation('haiku', params.etab ?? null)
    if (r.data) redirect(`/chat?c=${r.data.id}${params.etab ? `&etab=${params.etab}` : ''}`)
  }

  const conversations = await lireConversations()
  return (
    <div className="flex">
      <SidebarConversations conversations={conversations} actifId={conversationId} />
      <div className="flex-1">
        <InterfaceChat
          conversationId={conversationId!}
          etablissementId={params.etab}
          modeleInitial="haiku"
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 6.7 : Test terrain + commit**

Envoyer « Rappelle-moi de rappeler M. Martin demain à 10h ». Vérifier :
- Streaming visible (texte apparaît token par token)
- Carte confirmation apparaît avec « Créer un rappel : … »
- « ✓ Confirmer » → apparition du rappel dans `/rappels` avec badge « ✨ IA »
- Rechargement de la page charge l'historique
- Titre de la conversation généré automatiquement

```bash
git add src/app/\(app\)/chat/ src/components/chat/ src/hooks/use-chat.ts
git commit -m "feat(v1f): tâche 6 — interface /chat sidebar + composer + confirmations + streaming"
```

---

## Task 7 : Chat contextuel depuis fiche + upload image + « Appliquer à la fiche »

**Objectif :** Bouton sur la fiche établissement qui ouvre une nouvelle conversation avec contexte pré-injecté. Upload image côté Storage (bucket créé mig 009). Extraction de données structurées (horaires depuis screenshot Maps, contact depuis carte de visite) présentée avec bouton « Appliquer ».

**Files :**
- Create : `src/components/etablissements/bouton-chat-fiche.tsx`
- Modify : `src/components/etablissements/fiche-etablissement.tsx` (injecter bouton)
- Create : `src/lib/chat/upload-image.ts`

- [ ] **Step 7.1 : Upload image côté client**

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
  const nomFichier = `${crypto.randomUUID()}-${fichier.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
  const { error } = await supabase.storage.from('chat-images').upload(nomFichier, fichier, { upsert: false })
  if (error) return { erreur: error.message }

  const { data } = await supabase.storage.from('chat-images').createSignedUrl(nomFichier, 3600)
  if (!data?.signedUrl) return { erreur: 'URL signée impossible' }
  return { url: data.signedUrl }
}
```

- [ ] **Step 7.2 : Bouton chat contextuel sur fiche**

```typescript
// src/components/etablissements/bouton-chat-fiche.tsx
'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export function BoutonChatFiche({ etablissementId }: { etablissementId: string }) {
  return (
    <Link
      href={`/chat?new=1&etab=${etablissementId}`}
      className={cn(buttonVariants({ variant: 'outline' }), 'h-9 gap-1 px-3 text-sm')}
    >
      💬 Demander à Claude
    </Link>
  )
}
```

Injecter dans le header de `fiche-etablissement.tsx` à côté du bouton Modifier.

- [ ] **Step 7.3 : « Appliquer à la fiche » — via outil `mettreAJourEtablissement` naturel**

Le flux naturel : Cyril envoie une photo (ex carte de visite) + « Ajoute ce contact à la fiche ». Claude analyse, propose `mettreAJourEtablissement(id, champs={...})`, l'utilisateur clique « ✓ Confirmer » sur la carte d'action → l'outil s'exécute → la fiche est mise à jour automatiquement (revalidation via `notifierChangement`).

Aucun code spécifique « Appliquer à la fiche » nécessaire : la carte de confirmation Task 6 + les outils Task 4 le font déjà. La description humaine détaille ce qui va être modifié.

- [ ] **Step 7.4 : Politique RLS bucket chat-images (dans migration 009 déjà, à valider en Supabase Studio)**

```sql
-- Ajouter à 009_v1f_chat_rappels.sql, section policies :
CREATE POLICY "chat_images_owner_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'chat-images' AND auth.uid() = owner);
CREATE POLICY "chat_images_owner_write" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'chat-images' AND auth.uid() = owner);
```

- [ ] **Step 7.5 : Test terrain + commit**

Depuis une fiche, cliquer « 💬 Demander à Claude ». Uploader une photo d'une ardoise horaires. Demander « Extrais les horaires ». Vérifier la carte de confirmation `mettreAJourHoraires`. Confirmer → horaires apparaissent sur la fiche.

```bash
git add src/lib/chat/upload-image.ts src/components/etablissements/bouton-chat-fiche.tsx src/components/etablissements/fiche-etablissement.tsx supabase/migrations/009_v1f_chat_rappels.sql
git commit -m "feat(v1f): tâche 7 — chat contextuel fiche + upload image Storage + policies RLS"
```

---

## Task 8 : Bouton toggle Sonnet côté serveur + rafraîchissement modèle par conversation

**Objectif :** Le toggle « Réfléchir plus » du composer doit persister sur la conversation. Chaque nouvelle requête utilise le modèle actuel de la conversation en BDD.

**Files :**
- Create : `src/actions/chat-modele.ts`
- Modify : `src/components/chat/interface-chat.tsx` (sync modèle → BDD)

- [ ] **Step 8.1 : Action de mise à jour modèle**

```typescript
// src/actions/chat-modele.ts
'use server'

import { createClient } from '@/lib/supabase/server'
import type { ModeleClaude } from '@/types/conversation'

export async function definirModeleConversation(id: string, modele: ModeleClaude): Promise<{ erreur?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('conversation').update({ modele }).eq('id', id)
  if (error) return { erreur: error.message }
  return {}
}
```

- [ ] **Step 8.2 : Sync côté client**

Dans `InterfaceChat`, au changement de `modele`, appeler `definirModeleConversation(conversationId, nouveauModele)`. Le prochain message utilisera automatiquement le nouveau modèle car le Route Handler relit la conversation à chaque appel.

```typescript
// Ajouter dans interface-chat.tsx :
useEffect(() => {
  void definirModeleConversation(conversationId, modele)
}, [modele, conversationId])
```

- [ ] **Step 8.3 : Test manuel + commit**

Basculer sur Sonnet en cours de conversation → nouveau message → observer latence plus élevée et coût plus élevé dans le monitoring.

```bash
git add src/actions/chat-modele.ts src/components/chat/interface-chat.tsx
git commit -m "feat(v1f): tâche 8 — persistance modèle par conversation (toggle Sonnet)"
```

---

## Task 9 : Polish + tests type-check + push

**Objectif :** Cleanup, type-check propre, suite Vitest verte, `.env.local.example` mis à jour, push final.

- [ ] **Step 9.1 : Type-check + tests**

```bash
npm run type-check
npm test
```

Corriger les erreurs (imports circulaires, types SDK Anthropic, mocks incomplets).

- [ ] **Step 9.2 : Vérification golden path complet**

- [ ] Créer un rappel manuellement (bouton +) → apparaît dans « Aujourd'hui »
- [ ] Marquer fait → passe en « Terminés » + badge nav décrémente
- [ ] Reporter → nouvelle échéance appliquée
- [ ] Depuis chat : « Rappelle-moi de X demain à 14h » → carte confirmation → confirmer → rappel visible avec badge « ✨ IA »
- [ ] Depuis fiche : « 💬 Demander à Claude » → contexte visible dans la réponse (Claude cite le nom du client)
- [ ] Upload image + question → Claude propose action structurée
- [ ] Toggle Sonnet → nouveau message envoyé avec Sonnet, coût plus élevé dans monitoring
- [ ] BDD : `parametre.monitoring_consommation_claude` a tokens et coût CHF cumulés
- [ ] Rafraîchir la page /chat?c=xxx → historique chargé
- [ ] Sidebar : conversations listées avec titres auto-générés
- [ ] Widget « Aujourd'hui » sur home affiche le count

- [ ] **Step 9.3 : Cleanup**

- Retirer les `console.log` de debug (streaming SSE, executeur outils)
- Ajouter `ANTHROPIC_API_KEY` à `.env.local.example` avec commentaire
- Vérifier que `chat-images` bucket est bien privé côté Supabase Studio
- Ajouter `SUPABASE_STORAGE_CHAT_IMAGES_BUCKET_POLICY_APPLIED=true` comme note ou docstring quelque part si les policies RLS demandent une intervention manuelle

- [ ] **Step 9.4 : Commit final + push**

```bash
git add -A
git commit -m "chore(v1f): polish + type-check vert + docs env + cleanup logs"
git push origin main
```

- [ ] **Step 9.5 : Vérification Vercel**

Attendre le déploiement, tester `/chat` et `/rappels` sur iPhone réel + Android réel. Vérifier :
- Streaming SSE fonctionne sur Vercel (Next.js Route Handlers avec `ReadableStream`)
- Timeout SSE non atteint (fonctions Vercel : par défaut 10 s en Hobby, 60 s en Pro — pour Cyril, le tier suffit largement puisqu'une réponse Claude tient dans les 10 s)

---

## Notes de conception

- **Streaming SSE vs Server Actions** — les Server Actions ne supportent pas nativement le streaming. On utilise un Route Handler `POST /api/chat/stream` qui retourne `Response(ReadableStream, { headers: 'text/event-stream' })` et consomme `client.messages.stream()` via l'event `text`. Pattern éprouvé sur Next.js 15+.

- **Confirmation obligatoire pour modifications** — les outils sont classés dans `OUTILS_LECTURE` et `OUTILS_MODIFICATION`. Les lectures s'exécutent en boucle server-side sans intervention. Les modifications sortent de la boucle, sont bufferisées comme `pending_action` events, envoyées au client sous forme de cartes de confirmation. Le client renvoie les décisions via `/api/chat/confirmer` qui exécute les tools acceptés et reprend le stream.

- **Modèle par conversation** — persisté dans `conversation.modele`. Le toggle « Réfléchir plus » du composer met à jour cette valeur ; chaque `POST /api/chat/stream` relit le modèle depuis la conversation. Permet à Cyril de mixer haiku et sonnet sans confondre l'historique.

- **Titre auto-généré** — après le premier `end_turn` réel (pas juste une confirmation en attente), un appel `haiku` séparé génère un titre de 4-8 mots à partir des 2 premiers messages. Fire-and-forget : n'interrompt jamais le flux principal.

- **Monitoring token + alerte 80 %** — les usages sont cumulés dans `parametre.monitoring_consommation_claude` (JSON `{ tokens_mois, cout_chf_mois, seuil_chf }`). Le seuil par défaut = 30 CHF/mois, éditable via `/admin/parametres`. La bannière apparaît dès que `cout_chf_mois >= 80% × seuil_chf`. Push Web Notification à 100 % → V2 (nécessite VAPID).

- **Contexte fiche** — chargé à la construction du prompt système ; injecté seulement au 1er tour de la boucle tool use (pas en cache pour l'instant, mais si coûts explosent → cache prompt via `cache_control` en V2).

- **Upload image** — bucket privé + signed URL 1 h. L'URL est incluse dans le message multimodal envoyé à Claude via `{ type: 'image', source: { type: 'url', url } }`. Pas de stockage BDD de l'URL : elle vit dans `conversation.messages` JSONB.

- **Push notifications et email digest** — hors scope V1f (V2). Le badge nav MVP + widget accueil suffisent pour V1 selon spec §4.5.

- **Auto-exécution outils lecture** — évite un aller-retour utilisateur pour des questions du type « Quand j'ai vu Le Dahu la dernière fois ? » : `lireVisites` s'exécute automatiquement, Claude formule la réponse dans le même stream.

- **Pas de cache prompt V1** — chaque requête recompose le system prompt (contexte fiche à jour). Le coût supplémentaire est acceptable en V1. V2 : activer `cache_control` sur la portion stable (règles, format), rafraîchir uniquement le contexte.

- **`OUTILS_MODIFICATION` en pratique** — Claude peut proposer plusieurs actions en une seule requête (ex : « Prends note de ma visite et crée un rappel pour la semaine prochaine »). Le buffer les collecte toutes, la UI les affiche empilées, Cyril peut confirmer/refuser chaque action indépendamment.
