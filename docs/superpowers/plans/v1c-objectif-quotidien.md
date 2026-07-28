# V1c — Objectif quotidien 6+2

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Afficher à Cyril son objectif quotidien 6+2 (6 visites clients + 2 prospects démarchés), avec compteur temps réel sur « Aujourd'hui », historique hebdomadaire sur `/funnel` et paramètres modifiables sur `/admin/parametres`.

**Architecture:** Logique de comptage isolée en fonctions pures (`src/lib/objectif/regles.ts`), 100% testée. Server Actions pour lire l'objectif du jour, l'historique 28 jours et les paramètres BDD. Widget compteur sur la home et bar chart Recharts sur `/funnel`. Aucune migration DB : la table `parametre` (V1a-1) contient déjà les clés `objectif_visites_clients_par_jour`, `objectif_visites_prospects_par_jour`, `seuil_inactivite_mois_global`.

**Tech Stack:** Next.js 16 Server Actions, React 19, Recharts (installé en V1b), Vitest, Zod, Server Components pour le rendu initial

**Décisions verrouillées** :
- « Visites du jour » = `date_visite` (UTC → converti en date locale Europe/Zurich), `est_manquee = false`, `deleted_at IS NULL`.
- « Client » = statut `client_actif` OU `client_inactif`. « Prospect » = statut `prospect` (les autres statuts humains ne comptent pas).
- Reset à minuit : simplement une conséquence de la comparaison de date (`toISODate(now) === toISODate(visite.date_visite)` en zone locale).
- Historique hebdo : 4 semaines glissantes = 28 jours. Un jour est « à objectif » si `visitesClientsJour ≥ objectifClients && visitesProspectsJour ≥ objectifProspects`.
- Paramètres : lecture directe de `parametre.valeur` (JSONB). Mise à jour par UPSERT, validation Zod, whitelist de 3 clés modifiables en V1c.

---

## Fichiers créés / modifiés

| Fichier | Rôle |
|---------|------|
| `src/lib/objectif/regles.ts` | Fonctions pures : `estClient`, `estProspect`, `dateJourLocal`, `compterVisitesDuJour`, `aObjectifAtteint`, `calculerHistorique28j` |
| `src/test/lib/objectif/regles.test.ts` | Tests exhaustifs (~15) |
| `src/actions/objectif.ts` | `lireObjectifDuJour()`, `lireHistoriqueHebdo()` |
| `src/actions/parametres.ts` | `lireParametres()`, `mettreAJourParametre(cle, valeur)` |
| `src/test/actions/objectif.test.ts` | Tests Server Actions objectif (Supabase mocké) |
| `src/test/actions/parametres.test.ts` | Tests Server Actions paramètres |
| `src/lib/validation/parametre.ts` | Zod : whitelist clés + type valeur |
| `src/components/home/widget-objectif.tsx` | Compteur 6+2 + progress bar + badge « Atteint » |
| `src/components/funnel/historique-hebdo.tsx` | Bar chart Recharts 28 derniers jours |
| `src/components/admin/formulaire-parametres.tsx` | Formulaire modification paramètres |
| `src/app/(app)/admin/parametres/page.tsx` | Route admin paramètres |
| `src/app/(app)/page.tsx` | Injecter `<WidgetObjectif />` en tête |
| `src/app/(app)/funnel/page.tsx` | Injecter `<HistoriqueHebdo />` |

---

## Tâche 1 — Règles pures objectif (TDD)

**Objectif :** Livrer 5 fonctions pures : `estClient`, `estProspect`, `dateJourLocal`, `compterVisitesDuJour`, `aObjectifAtteint`, `calculerHistorique28j`. Aucune I/O, timezone gérée explicitement.

**Fichiers :**
- Créer : `src/lib/objectif/regles.ts`, `src/test/lib/objectif/regles.test.ts`

**Étapes :**

- [ ] **Écrire les tests** `src/test/lib/objectif/regles.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import {
  estClient, estProspect, dateJourLocal,
  compterVisitesDuJour, aObjectifAtteint, calculerHistorique28j,
} from '@/lib/objectif/regles'
import type { Visite } from '@/types/database'

describe('estClient / estProspect', () => {
  it('client_actif et client_inactif sont clients', () => {
    expect(estClient('client_actif')).toBe(true)
    expect(estClient('client_inactif')).toBe(true)
  })
  it('prospect est prospect', () => {
    expect(estProspect('prospect')).toBe(true)
  })
  it("les autres statuts ne sont ni client ni prospect", () => {
    for (const s of ['pas_interesse', 'prospect_abandonne', 'ferme', 'contentieux'] as const) {
      expect(estClient(s)).toBe(false)
      expect(estProspect(s)).toBe(false)
    }
  })
})

describe('dateJourLocal — YYYY-MM-DD en Europe/Zurich', () => {
  it('convertit une ISO UTC en date locale Zurich', () => {
    // 28 juillet 2026 23h30 UTC = 29 juillet 01h30 Zurich (été)
    expect(dateJourLocal('2026-07-28T23:30:00Z')).toBe('2026-07-29')
  })
  it('cas midi UTC (même jour partout)', () => {
    expect(dateJourLocal('2026-07-28T12:00:00Z')).toBe('2026-07-28')
  })
})

function v(
  date_visite: string,
  est_manquee: boolean,
  statut: 'client_actif' | 'client_inactif' | 'prospect',
): Visite & { etablissement: { statut: typeof statut } } {
  return {
    id: 'v',
    etablissement_id: 'e',
    contact_id: null,
    date_visite,
    duree_minutes: 60,
    notes: null,
    est_manquee,
    motif_manquee: null,
    prochaine_action: null,
    synced_at: null,
    created_at: date_visite,
    updated_at: date_visite,
    deleted_at: null,
    etablissement: { statut },
  } as never
}

describe('compterVisitesDuJour', () => {
  const JOUR = '2026-07-28'
  const NOW = '2026-07-28T12:00:00Z'

  it("compte 2 visites clients + 1 prospect faites aujourd'hui", () => {
    const visites = [
      v('2026-07-28T09:00:00Z', false, 'client_actif'),
      v('2026-07-28T11:00:00Z', false, 'client_inactif'),
      v('2026-07-28T15:00:00Z', false, 'prospect'),
    ]
    const r = compterVisitesDuJour(visites, NOW)
    expect(r.clients).toBe(2)
    expect(r.prospects).toBe(1)
    expect(r.jour).toBe(JOUR)
  })

  it("ignore les visites manquées", () => {
    const visites = [
      v('2026-07-28T09:00:00Z', true,  'client_actif'),  // manquée
      v('2026-07-28T11:00:00Z', false, 'client_actif'),
    ]
    expect(compterVisitesDuJour(visites, NOW).clients).toBe(1)
  })

  it("ignore les visites d'un autre jour local Zurich", () => {
    const visites = [
      v('2026-07-27T22:00:00Z', false, 'client_actif'),  // 28.07 00h Zurich → hier
      // Wait: 27 juillet 22h UTC = 28 juillet 00h Zurich (été) → aujourd'hui
      // Utiliser un cas plus clair :
      v('2026-07-26T09:00:00Z', false, 'client_actif'),  // 26.07 Zurich → hier
    ]
    expect(compterVisitesDuJour(visites, NOW).clients).toBe(1)
  })
})

describe('aObjectifAtteint', () => {
  it("atteint quand 6 clients + 2 prospects avec seuils par défaut", () => {
    expect(aObjectifAtteint({ clients: 6, prospects: 2 }, { objectif_clients: 6, objectif_prospects: 2 })).toBe(true)
  })
  it('non atteint si un des deux compteurs est en dessous', () => {
    expect(aObjectifAtteint({ clients: 6, prospects: 1 }, { objectif_clients: 6, objectif_prospects: 2 })).toBe(false)
    expect(aObjectifAtteint({ clients: 5, prospects: 2 }, { objectif_clients: 6, objectif_prospects: 2 })).toBe(false)
  })
  it('respecte des seuils personnalisés (5 + 3)', () => {
    expect(aObjectifAtteint({ clients: 5, prospects: 3 }, { objectif_clients: 5, objectif_prospects: 3 })).toBe(true)
  })
})

describe('calculerHistorique28j', () => {
  it('renvoie 28 entrées, une par jour, ordre chronologique', () => {
    const now = '2026-07-28T12:00:00Z'
    const h = calculerHistorique28j([], now, { objectif_clients: 6, objectif_prospects: 2 })
    expect(h).toHaveLength(28)
    expect(h[0].jour).toBe('2026-07-01')
    expect(h[27].jour).toBe('2026-07-28')
  })
  it('marque à objectif seulement les jours ≥ seuils', () => {
    const now = '2026-07-28T12:00:00Z'
    const visites = [
      // 3 visites clients + 2 prospects le 2026-07-15 → objectif partiel non atteint
      v('2026-07-15T09:00:00Z', false, 'client_actif'),
      v('2026-07-15T10:00:00Z', false, 'client_actif'),
      v('2026-07-15T11:00:00Z', false, 'client_actif'),
      v('2026-07-15T14:00:00Z', false, 'prospect'),
      v('2026-07-15T15:00:00Z', false, 'prospect'),
    ]
    const h = calculerHistorique28j(visites, now, { objectif_clients: 3, objectif_prospects: 2 })
    const jour15 = h.find((d) => d.jour === '2026-07-15')!
    expect(jour15.clients).toBe(3)
    expect(jour15.prospects).toBe(2)
    expect(jour15.atteint).toBe(true)
    // Autres jours = 0 → non atteint
    expect(h[0].atteint).toBe(false)
  })
})
```

- [ ] **Lancer les tests** — doivent échouer :

```bash
npm test src/test/lib/objectif/regles.test.ts
```

- [ ] **Écrire** `src/lib/objectif/regles.ts` :

```ts
import type { StatutCommercial, Visite } from '@/types/database'

const ZONE = 'Europe/Zurich'

export function estClient(s: StatutCommercial): boolean {
  return s === 'client_actif' || s === 'client_inactif'
}

export function estProspect(s: StatutCommercial): boolean {
  return s === 'prospect'
}

// Renvoie YYYY-MM-DD selon la zone Europe/Zurich (gère l'heure d'été).
export function dateJourLocal(iso: string): string {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('fr-CH', {
    timeZone: ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
  })
  const parts = fmt.formatToParts(d)
  const y = parts.find((p) => p.type === 'year')!.value
  const m = parts.find((p) => p.type === 'month')!.value
  const j = parts.find((p) => p.type === 'day')!.value
  return `${y}-${m}-${j}`
}

export interface VisiteAvecStatut extends Visite {
  etablissement: { statut: StatutCommercial } | null
}

export interface CompteurJour {
  jour: string
  clients: number
  prospects: number
}

export interface SeuilsObjectif {
  objectif_clients: number
  objectif_prospects: number
}

export function compterVisitesDuJour(
  visites: VisiteAvecStatut[],
  maintenantIso: string = new Date().toISOString(),
): CompteurJour {
  const jour = dateJourLocal(maintenantIso)
  let clients = 0
  let prospects = 0
  for (const v of visites) {
    if (v.est_manquee) continue
    if (v.deleted_at) continue
    if (dateJourLocal(v.date_visite) !== jour) continue
    const s = v.etablissement?.statut
    if (!s) continue
    if (estClient(s)) clients++
    else if (estProspect(s)) prospects++
  }
  return { jour, clients, prospects }
}

export function aObjectifAtteint(
  compteur: { clients: number; prospects: number },
  seuils: SeuilsObjectif,
): boolean {
  return (
    compteur.clients >= seuils.objectif_clients &&
    compteur.prospects >= seuils.objectif_prospects
  )
}

export interface JourHistorique {
  jour: string
  clients: number
  prospects: number
  atteint: boolean
}

export function calculerHistorique28j(
  visites: VisiteAvecStatut[],
  maintenantIso: string,
  seuils: SeuilsObjectif,
): JourHistorique[] {
  const jourAujourdhui = dateJourLocal(maintenantIso)
  // Construit la liste des 28 derniers jours en ordre chronologique
  const [y, m, d] = jourAujourdhui.split('-').map(Number)
  const jours: string[] = []
  for (let i = 27; i >= 0; i--) {
    const dt = new Date(Date.UTC(y, m - 1, d - i, 12))  // midi pour éviter DST bord
    jours.push(dateJourLocal(dt.toISOString()))
  }

  const compteurParJour = new Map<string, { clients: number; prospects: number }>()
  for (const j of jours) compteurParJour.set(j, { clients: 0, prospects: 0 })

  for (const v of visites) {
    if (v.est_manquee || v.deleted_at) continue
    const j = dateJourLocal(v.date_visite)
    const c = compteurParJour.get(j)
    if (!c) continue
    const s = v.etablissement?.statut
    if (!s) continue
    if (estClient(s)) c.clients++
    else if (estProspect(s)) c.prospects++
  }

  return jours.map((j) => {
    const c = compteurParJour.get(j)!
    return {
      jour: j,
      clients: c.clients,
      prospects: c.prospects,
      atteint:
        c.clients >= seuils.objectif_clients &&
        c.prospects >= seuils.objectif_prospects,
    }
  })
}
```

- [ ] **Vérifier** les tests passent :

```bash
npm test src/test/lib/objectif/regles.test.ts
```

Résultat attendu : ~15 tests verts.

- [ ] **Committer** :

```bash
git add src/lib/objectif/regles.ts src/test/lib/objectif/regles.test.ts
git commit -m "feat(v1c): règles pures compteur objectif 6+2 + historique 28j + tests (tache 1)"
```

**Critère de fin :** ~15 tests verts, `npm run type-check` OK.

---

## Tâche 2 — Server Actions objectif + paramètres

**Objectif :** Fournir 4 endpoints : `lireObjectifDuJour()`, `lireHistoriqueHebdo()`, `lireParametres()`, `mettreAJourParametre(cle, valeur)`. Zod pour la validation des paramètres.

**Fichiers :**
- Créer : `src/actions/objectif.ts`, `src/actions/parametres.ts`
- Créer : `src/lib/validation/parametre.ts`
- Créer : `src/test/actions/objectif.test.ts`, `src/test/actions/parametres.test.ts`

**Étapes :**

- [ ] **Créer** `src/lib/validation/parametre.ts` :

```ts
import { z } from 'zod'

// Whitelist des paramètres modifiables en V1c avec leur type valeur
const SCHEMAS = {
  objectif_visites_clients_par_jour:   z.number().int().min(0).max(50),
  objectif_visites_prospects_par_jour: z.number().int().min(0).max(50),
  seuil_inactivite_mois_global:        z.number().int().min(1).max(60),
} as const

export type CleParametre = keyof typeof SCHEMAS

export const CLES_MODIFIABLES = Object.keys(SCHEMAS) as CleParametre[]

export function validerValeurParametre(
  cle: unknown,
  valeur: unknown,
): { data?: { cle: CleParametre; valeur: number }; erreur?: string } {
  if (typeof cle !== 'string' || !(cle in SCHEMAS)) {
    return { erreur: `Clé "${String(cle)}" non modifiable` }
  }
  const schema = SCHEMAS[cle as CleParametre]
  const parsed = schema.safeParse(valeur)
  if (!parsed.success) {
    return { erreur: parsed.error.issues[0]?.message ?? 'Valeur invalide' }
  }
  return { data: { cle: cle as CleParametre, valeur: parsed.data } }
}
```

- [ ] **Écrire les tests** `src/test/actions/parametres.test.ts` :

```ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

import { lireParametres, mettreAJourParametre } from '@/actions/parametres'
import { createClient } from '@/lib/supabase/server'

describe('lireParametres', () => {
  it("retourne les paramètres BDD sous forme d'objet", async () => {
    const chain = {
      select: vi.fn().mockResolvedValue({
        data: [
          { cle: 'objectif_visites_clients_par_jour', valeur: 6 },
          { cle: 'objectif_visites_prospects_par_jour', valeur: 2 },
          { cle: 'seuil_inactivite_mois_global', valeur: 12 },
        ],
        error: null,
      }),
    }
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(chain),
    } as never)
    const r = await lireParametres()
    expect(r.data!.objectif_visites_clients_par_jour).toBe(6)
    expect(r.data!.objectif_visites_prospects_par_jour).toBe(2)
    expect(r.data!.seuil_inactivite_mois_global).toBe(12)
  })
})

describe('mettreAJourParametre', () => {
  beforeEach(() => vi.clearAllMocks())

  it('rejette une clé non modifiable', async () => {
    const r = await mettreAJourParametre('claude_chat_active', true)
    expect(r.erreur).toBeDefined()
  })

  it('rejette une valeur hors bornes', async () => {
    const r = await mettreAJourParametre('objectif_visites_clients_par_jour', 999)
    expect(r.erreur).toBeDefined()
  })

  it('UPSERT dans Supabase quand valide', async () => {
    const upsertChain = {
      upsert: vi.fn().mockResolvedValue({ error: null }),
    }
    vi.mocked(createClient).mockResolvedValue({
      from: vi.fn().mockReturnValue(upsertChain),
    } as never)
    const r = await mettreAJourParametre('objectif_visites_clients_par_jour', 8)
    expect(r.erreur).toBeUndefined()
    expect(upsertChain.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        cle: 'objectif_visites_clients_par_jour', valeur: 8,
      }),
      expect.any(Object),
    )
  })
})
```

- [ ] **Écrire** `src/actions/parametres.ts` :

```ts
'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { validerValeurParametre, type CleParametre } from '@/lib/validation/parametre'

type ActionResult<T> = { data?: T; erreur?: string }

export type MapParametres = Partial<Record<CleParametre, unknown>> & Record<string, unknown>

export async function lireParametres(): Promise<ActionResult<MapParametres>> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('parametre').select('cle, valeur')
  if (error) return { erreur: error.message }
  const map: MapParametres = {}
  for (const row of data ?? []) {
    map[(row as { cle: string }).cle] = (row as { valeur: unknown }).valeur
  }
  return { data: map }
}

export async function mettreAJourParametre(
  cle: unknown,
  valeur: unknown,
): Promise<ActionResult<{ cle: CleParametre; valeur: number }>> {
  const val = validerValeurParametre(cle, valeur)
  if (val.erreur || !val.data) return { erreur: val.erreur ?? 'Erreur validation' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('parametre')
    .upsert({ cle: val.data.cle, valeur: val.data.valeur }, { onConflict: 'cle' })
  if (error) return { erreur: error.message }
  revalidatePath('/admin/parametres')
  revalidatePath('/')
  revalidatePath('/funnel')
  return { data: val.data }
}
```

- [ ] **Écrire les tests** `src/test/actions/objectif.test.ts` :

```ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')

import { lireObjectifDuJour, lireHistoriqueHebdo } from '@/actions/objectif'
import { createClient } from '@/lib/supabase/server'

function mockSelect(data: unknown[], parametres: unknown[] = []) {
  const visitesChain = {
    select: vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    gte:    vi.fn().mockReturnThis(),
    order:  vi.fn().mockResolvedValue({ data, error: null }),
  }
  const parametresChain = {
    select: vi.fn().mockResolvedValue({ data: parametres, error: null }),
  }
  return {
    from: vi.fn().mockImplementation((table: string) =>
      table === 'visite' ? visitesChain : parametresChain,
    ),
  }
}

describe('lireObjectifDuJour', () => {
  beforeEach(() => vi.clearAllMocks())

  it("agrège clients + prospects du jour avec seuils BDD", async () => {
    const now = new Date().toISOString()
    const visites = [
      {
        id: 'v1', date_visite: now, est_manquee: false, deleted_at: null,
        etablissement_id: 'e1', contact_id: null, duree_minutes: 60,
        notes: null, motif_manquee: null, prochaine_action: null,
        synced_at: null, created_at: now, updated_at: now,
        etablissement: { statut: 'client_actif' },
      },
    ]
    const mock = mockSelect(visites, [
      { cle: 'objectif_visites_clients_par_jour', valeur: 6 },
      { cle: 'objectif_visites_prospects_par_jour', valeur: 2 },
    ])
    vi.mocked(createClient).mockResolvedValue(mock as never)

    const r = await lireObjectifDuJour()
    expect(r.data!.compteur.clients).toBe(1)
    expect(r.data!.compteur.prospects).toBe(0)
    expect(r.data!.seuils.objectif_clients).toBe(6)
    expect(r.data!.atteint).toBe(false)
  })
})

describe('lireHistoriqueHebdo', () => {
  it('renvoie 28 jours', async () => {
    const mock = mockSelect([], [])
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireHistoriqueHebdo()
    expect(r.data!.jours).toHaveLength(28)
  })
})
```

- [ ] **Écrire** `src/actions/objectif.ts` :

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import {
  compterVisitesDuJour,
  calculerHistorique28j,
  aObjectifAtteint,
  type CompteurJour,
  type JourHistorique,
  type SeuilsObjectif,
  type VisiteAvecStatut,
} from '@/lib/objectif/regles'

type ActionResult<T> = { data?: T; erreur?: string }

async function lireSeuils(supabase: Awaited<ReturnType<typeof createClient>>): Promise<SeuilsObjectif> {
  const { data } = await supabase.from('parametre').select('cle, valeur')
  const map = new Map<string, unknown>()
  for (const row of data ?? []) {
    map.set((row as { cle: string }).cle, (row as { valeur: unknown }).valeur)
  }
  return {
    objectif_clients:   Number(map.get('objectif_visites_clients_par_jour') ?? 6),
    objectif_prospects: Number(map.get('objectif_visites_prospects_par_jour') ?? 2),
  }
}

export interface ObjectifDuJour {
  compteur: CompteurJour
  seuils: SeuilsObjectif
  atteint: boolean
}

export async function lireObjectifDuJour(): Promise<ActionResult<ObjectifDuJour>> {
  const supabase = await createClient()
  const seuils = await lireSeuils(supabase)

  // Fenêtre de 48h autour de now pour couvrir la journée locale Zurich
  const now = new Date()
  const debut = new Date(now.getTime() - 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('visite')
    .select('*, etablissement(statut)')
    .is('deleted_at', null)
    .gte('date_visite', debut)
    .order('date_visite', { ascending: false })
  if (error) return { erreur: error.message }

  const compteur = compterVisitesDuJour(
    (data ?? []) as VisiteAvecStatut[],
    now.toISOString(),
  )
  return {
    data: {
      compteur,
      seuils,
      atteint: aObjectifAtteint(compteur, seuils),
    },
  }
}

export interface HistoriqueHebdo {
  jours: JourHistorique[]
  seuils: SeuilsObjectif
  joursAtteintCetteSemaine: number
  joursAtteint28j: number
}

export async function lireHistoriqueHebdo(): Promise<ActionResult<HistoriqueHebdo>> {
  const supabase = await createClient()
  const seuils = await lireSeuils(supabase)

  const now = new Date()
  const debut = new Date(now.getTime() - 29 * 24 * 3600 * 1000).toISOString()
  const { data, error } = await supabase
    .from('visite')
    .select('*, etablissement(statut)')
    .is('deleted_at', null)
    .gte('date_visite', debut)
    .order('date_visite', { ascending: false })
  if (error) return { erreur: error.message }

  const jours = calculerHistorique28j(
    (data ?? []) as VisiteAvecStatut[],
    now.toISOString(),
    seuils,
  )
  const derniers7 = jours.slice(-7)
  return {
    data: {
      jours, seuils,
      joursAtteintCetteSemaine: derniers7.filter((j) => j.atteint).length,
      joursAtteint28j: jours.filter((j) => j.atteint).length,
    },
  }
}
```

- [ ] **Lancer** :

```bash
npm test src/test/actions/objectif.test.ts src/test/actions/parametres.test.ts
```

Résultat attendu : ~7 tests verts.

- [ ] **Committer** :

```bash
git add src/actions/objectif.ts src/actions/parametres.ts src/lib/validation/parametre.ts src/test/actions/objectif.test.ts src/test/actions/parametres.test.ts
git commit -m "feat(v1c): Server Actions objectif du jour + historique 28j + paramètres CRUD (tache 2)"
```

**Critère de fin :** tous les tests verts, `npm run type-check` OK.

---

## Tâche 3 — Widget objectif sur « Aujourd'hui »

**Objectif :** Livrer un widget Server Component en tête de `/` qui affiche `X/6 clients + Y/2 prospects` avec barre de progression et badge vert « Objectif atteint ! » quand les deux compteurs sont à seuil.

**Fichiers :**
- Créer : `src/components/home/widget-objectif.tsx`
- Modifier : `src/app/(app)/page.tsx`

**Étapes :**

- [ ] **Créer** `src/components/home/widget-objectif.tsx` (Server Component) :

```tsx
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { lireObjectifDuJour } from '@/actions/objectif'

interface BarreProps {
  actuel: number
  cible: number
  couleur: 'bleu' | 'vert'
}
function Barre({ actuel, cible, couleur }: BarreProps) {
  const pct = cible === 0 ? 100 : Math.min(100, (actuel / cible) * 100)
  const bg = couleur === 'vert' ? 'bg-emerald-500' : 'bg-blue-500'
  return (
    <div className="h-3 overflow-hidden rounded-full bg-muted">
      <div
        className={`h-full transition-all ${bg}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

export async function WidgetObjectif() {
  const r = await lireObjectifDuJour()
  if (r.erreur || !r.data) {
    return null
  }
  const { compteur, seuils, atteint } = r.data

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Objectif du jour
        </h2>
        {atteint && (
          <Badge className="bg-emerald-500 hover:bg-emerald-500">
            🎯 Atteint !
          </Badge>
        )}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span>Clients visités</span>
          <span>
            <b>{compteur.clients}</b> / {seuils.objectif_clients}
          </span>
        </div>
        <Barre
          actuel={compteur.clients}
          cible={seuils.objectif_clients}
          couleur={compteur.clients >= seuils.objectif_clients ? 'vert' : 'bleu'}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between text-sm">
          <span>Prospects démarchés</span>
          <span>
            <b>{compteur.prospects}</b> / {seuils.objectif_prospects}
          </span>
        </div>
        <Barre
          actuel={compteur.prospects}
          cible={seuils.objectif_prospects}
          couleur={compteur.prospects >= seuils.objectif_prospects ? 'vert' : 'bleu'}
        />
      </div>
    </Card>
  )
}
```

- [ ] **Modifier** `src/app/(app)/page.tsx` — ajouter `<WidgetObjectif />` en tête, avant `<SuggestionsAujourdhui />` :

```tsx
import { lireClientsEnRetard, lireSuggestionsProspection } from '@/actions/funnel'
import { SuggestionsAujourdhui } from '@/components/home/suggestions-aujourdhui'
import { WidgetObjectif } from '@/components/home/widget-objectif'
import { formatDateSuisse } from '@/lib/format'

export default async function AccueilPage() {
  const [clients, prospects] = await Promise.all([
    lireClientsEnRetard(),
    lireSuggestionsProspection(),
  ])

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-xl font-semibold">Aujourd&apos;hui</h1>
        <p className="text-sm text-muted-foreground">
          {formatDateSuisse(new Date().toISOString())} — tes priorités du jour.
        </p>
      </header>
      <WidgetObjectif />
      <SuggestionsAujourdhui
        clients={clients.data ?? []}
        prospects={prospects.data ?? []}
      />
    </div>
  )
}
```

- [ ] **Vérifier** : `npm run type-check`, DevTools mobile 390 px, ouvrir `/` — widget visible, barres à jour selon les visites du jour.

- [ ] **Committer** :

```bash
git add src/components/home/widget-objectif.tsx "src/app/(app)/page.tsx"
git commit -m "feat(v1c): widget compteur 6+2 en tête de 'Aujourd''hui' + badge objectif atteint (tache 3)"
```

**Critère de fin :** Widget visible, compteurs et badge fonctionnent. Marquer une visite via `ActionsRapidesVisite` → `router.refresh()` → compteur s'incrémente.

---

## Tâche 4 — Historique hebdo (bar chart Recharts) sur `/funnel`

**Objectif :** Bar chart des 28 derniers jours avec 2 séries (clients / prospects) et un indicateur vert pour les jours à objectif. Message d'encouragement au-dessus.

**Fichiers :**
- Créer : `src/components/funnel/historique-hebdo.tsx`
- Modifier : `src/app/(app)/funnel/page.tsx`

**Étapes :**

- [ ] **Créer** `src/components/funnel/historique-hebdo.tsx` (Client Component, Recharts est client-only) :

```tsx
'use client'

import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from 'recharts'
import { Card } from '@/components/ui/card'
import type { HistoriqueHebdo } from '@/actions/objectif'

export function HistoriqueHebdoChart({ h }: { h: HistoriqueHebdo }) {
  const data = h.jours.map((j) => ({
    jour: j.jour.slice(5),  // MM-DD
    total: j.clients + j.prospects,
    atteint: j.atteint,
  }))

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Historique 28 jours
        </h2>
        <span className="text-xs text-muted-foreground">
          {h.joursAtteintCetteSemaine}/7 cette semaine · {h.joursAtteint28j}/28 sur 28 j
        </span>
      </div>
      <div className="h-48 w-full">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
            <XAxis dataKey="jour" tick={{ fontSize: 10 }} interval={3} />
            <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
            <Tooltip
              formatter={(value: number) => [`${value} visites`, '']}
              labelFormatter={(label) => `Jour : ${label}`}
            />
            <Bar dataKey="total">
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.atteint ? '#10b981' : '#94a3b8'}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-xs text-muted-foreground">
        Vert = jour à objectif ({h.seuils.objectif_clients} clients + {h.seuils.objectif_prospects} prospects).
      </p>
    </Card>
  )
}
```

- [ ] **Modifier** `src/app/(app)/funnel/page.tsx` — injecter historique après le camembert :

```tsx
import { lireStatistiquesFunnel, lireClientsEnRetard } from '@/actions/funnel'
import { lireHistoriqueHebdo } from '@/actions/objectif'
import { CamembertStatuts } from '@/components/funnel/camembert-statuts'
import { ListeEnDanger } from '@/components/funnel/liste-en-danger'
import { BoutonActualiser } from '@/components/funnel/bouton-actualiser'
import { HistoriqueHebdoChart } from '@/components/funnel/historique-hebdo'
import { Card } from '@/components/ui/card'

export default async function FunnelPage() {
  const [stats, enRetard, histo] = await Promise.all([
    lireStatistiquesFunnel(),
    lireClientsEnRetard(),
    lireHistoriqueHebdo(),
  ])

  if (stats.erreur || !stats.data) {
    return (
      <p className="p-6 text-sm text-destructive">
        Erreur de chargement du funnel.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-xl font-semibold">Funnel commercial</h1>
        <p className="text-sm text-muted-foreground">
          {stats.data.total} établissements au total.
        </p>
      </header>

      <Card className="p-3">
        <CamembertStatuts stats={stats.data} />
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
          <div>Prospects : <b>{stats.data.prospect}</b></div>
          <div>Clients actifs : <b>{stats.data.client_actif}</b></div>
          <div>Clients inactifs : <b>{stats.data.client_inactif}</b></div>
          <div>Abandonnés : <b>{stats.data.prospect_abandonne}</b></div>
          <div>Pas intéressés : <b>{stats.data.pas_interesse}</b></div>
          <div>Fermés : <b>{stats.data.ferme}</b></div>
        </div>
      </Card>

      {histo.data && <HistoriqueHebdoChart h={histo.data} />}

      <BoutonActualiser />

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Clients en retard ({enRetard.data?.length ?? 0})
        </h2>
        <ListeEnDanger etabs={enRetard.data ?? []} />
      </section>
    </div>
  )
}
```

- [ ] **Committer** :

```bash
git add src/components/funnel/historique-hebdo.tsx "src/app/(app)/funnel/page.tsx"
git commit -m "feat(v1c): historique 28 jours bar chart Recharts sur /funnel (tache 4)"
```

**Critère de fin :** Bar chart visible sur `/funnel`, barres vertes pour les jours à objectif.

---

## Tâche 5 — Page `/admin/parametres` + push

**Objectif :** Formulaire mobile-first pour modifier les 3 paramètres modifiables (objectifs clients/prospects par jour, seuil inactivité). Route protégée par le middleware existant. Push final.

**Fichiers :**
- Créer : `src/components/admin/formulaire-parametres.tsx`
- Créer : `src/app/(app)/admin/parametres/page.tsx`

**Étapes :**

- [ ] **Créer** `src/components/admin/formulaire-parametres.tsx` :

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { mettreAJourParametre } from '@/actions/parametres'
import type { MapParametres } from '@/actions/parametres'

interface Props { initial: MapParametres }

const CHAMPS = [
  { cle: 'objectif_visites_clients_par_jour',   label: 'Objectif clients par jour', min: 0, max: 50 },
  { cle: 'objectif_visites_prospects_par_jour', label: 'Objectif prospects par jour', min: 0, max: 50 },
  { cle: 'seuil_inactivite_mois_global',        label: 'Seuil inactivité (mois)', min: 1, max: 60 },
] as const

export function FormulaireParametres({ initial }: Props) {
  const router = useRouter()
  const [valeurs, setValeurs] = useState<Record<string, number>>({
    objectif_visites_clients_par_jour: Number(initial.objectif_visites_clients_par_jour ?? 6),
    objectif_visites_prospects_par_jour: Number(initial.objectif_visites_prospects_par_jour ?? 2),
    seuil_inactivite_mois_global: Number(initial.seuil_inactivite_mois_global ?? 12),
  })
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [pending, startTransition] = useTransition()

  function onChange(cle: string, v: string) {
    const n = Number(v)
    if (!Number.isFinite(n)) return
    setValeurs((s) => ({ ...s, [cle]: n }))
  }

  function onSave(cle: string) {
    setMessages((m) => ({ ...m, [cle]: '' }))
    startTransition(async () => {
      const r = await mettreAJourParametre(cle, valeurs[cle])
      setMessages((m) => ({
        ...m,
        [cle]: r.erreur ?? '✓ Enregistré',
      }))
      if (!r.erreur) router.refresh()
    })
  }

  return (
    <Card className="space-y-4 p-4">
      {CHAMPS.map((c) => (
        <div key={c.cle} className="space-y-2">
          <Label htmlFor={c.cle}>{c.label}</Label>
          <div className="flex gap-2">
            <Input
              id={c.cle}
              type="number"
              inputMode="numeric"
              min={c.min}
              max={c.max}
              value={valeurs[c.cle]}
              onChange={(e) => onChange(c.cle, e.target.value)}
              className="h-12 flex-1 text-base"
            />
            <Button
              type="button"
              onClick={() => onSave(c.cle)}
              disabled={pending}
              className="h-12 px-4"
            >
              Enregistrer
            </Button>
          </div>
          {messages[c.cle] && (
            <p className={`text-xs ${messages[c.cle].startsWith('✓') ? 'text-emerald-600' : 'text-destructive'}`}>
              {messages[c.cle]}
            </p>
          )}
        </div>
      ))}
    </Card>
  )
}
```

- [ ] **Créer** `src/app/(app)/admin/parametres/page.tsx` :

```tsx
import { lireParametres } from '@/actions/parametres'
import { FormulaireParametres } from '@/components/admin/formulaire-parametres'

export default async function AdminParametresPage() {
  const r = await lireParametres()
  if (r.erreur || !r.data) {
    return <p className="p-6 text-sm text-destructive">Erreur de chargement.</p>
  }
  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-xl font-semibold">Paramètres</h1>
        <p className="text-sm text-muted-foreground">
          Objectifs quotidiens et seuils. Modifications appliquées immédiatement.
        </p>
      </header>
      <FormulaireParametres initial={r.data} />
    </div>
  )
}
```

- [ ] **Vérifier** : `npm run type-check`, `npm test`, `npm run build`. Ouvrir `/admin/parametres` sur DevTools mobile, modifier un objectif à 8 → recharger `/` → widget montre `/8` au lieu de `/6`.

- [ ] **Committer** :

```bash
git add src/components/admin/formulaire-parametres.tsx "src/app/(app)/admin/parametres/page.tsx"
git commit -m "feat(v1c): page /admin/parametres — objectifs 6+2 + seuil inactivité modifiables (tache 5)"
```

- [ ] **Push** :

```bash
git push origin main
```

**Critère de fin :** Vercel redéploie, `/`, `/funnel`, `/admin/parametres` fonctionnels. `npm test` toujours vert (~185 tests attendus).

---

## Résumé V1c

| # | Tâche | Durée estimée |
|---|-------|---------------|
| 1 | Règles pures compteur + historique 28j (TDD) | ~20 min |
| 2 | Server Actions objectif + paramètres + Zod | ~20 min |
| 3 | Widget objectif « Aujourd'hui » | ~15 min |
| 4 | Historique hebdo bar chart | ~15 min |
| 5 | Page /admin/parametres + push | ~15 min |
| **Total** | | **~1h25** |

**Critère de sortie V1c** :
- Cyril ouvre `/` : voit son compteur 6+2 en tête, marque une visite via boutons rapides → compteur monte immédiatement (via `router.refresh()`).
- Cyril atteint son objectif → badge vert « 🎯 Atteint ! » apparaît, barres deviennent vertes.
- Cyril ouvre `/funnel` : voit son historique 28 jours en bar chart, sait combien de jours à objectif sur la semaine.
- Cyril ouvre `/admin/parametres`, met l'objectif clients à 8 → dès rechargement de `/`, le widget affiche `X/8` et le badge s'ajuste.
- `npm test` : 173 → ~185 verts.

---

**Deux options d'exécution :**

**1. Subagent-Driven (recommandé)** — un sous-agent par tâche, revue entre chaque, itération rapide. Lancer avec `/subagent-driven-development`.

**2. Inline** — exécution dans cette session avec `executing-plans`, checkpoints à chaque tâche.
