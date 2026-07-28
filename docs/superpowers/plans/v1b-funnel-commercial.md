# V1b — Funnel commercial

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter la logique métier de rétrogradation automatique des statuts (client_actif → client_inactif après N mois sans commande, prospect → prospect_abandonne après 3 visites sans signal), un dashboard `/funnel` avec camembert et clients « en danger », et une page d'accueil qui suggère les visites du jour à Cyril.

**Architecture:** Toute la logique métier de rétrogradation est isolée dans des fonctions pures (`src/lib/funnel/regles.ts`) testées à 100%. Les Server Actions lisent la BDD, appliquent les règles, retournent des données prêtes à afficher — jamais de logique métier dans les composants. Le dashboard utilise Recharts pour le camembert. Les suggestions du jour sont générées côté serveur (Server Component) et l'utilisateur agit via bottom sheets client déjà existantes (`FormulaireVisite`, `BoutonVisiteManquee` de V1a-2).

**Tech Stack:** Next.js 16 Server Actions, React 19, Recharts (nouveau), Vitest, Zod, Server Components pour le rendu initial

**Décisions verrouillées** :
- Aucune modification du schéma DB (les colonnes `derniere_commande_at`, `derniere_visite_at`, `seuil_inactivite_mois` existent déjà en V1a-1).
- Statuts jamais rétrogradés automatiquement : `pas_interesse`, `prospect_abandonne`, `ferme`, `contentieux`. Cyril les gère à la main via le formulaire de fiche.
- « Signal positif » = existence d'une valeur non nulle dans `derniere_commande_at`.
- Cron/scheduler → V2. En V1b, la rétrogradation batch est déclenchée par un bouton « Actualiser » sur `/funnel`.

---

## Fichiers créés / modifiés

| Fichier | Rôle |
|---------|------|
| `package.json` | Ajouter `recharts` |
| `src/lib/funnel/regles.ts` | Règles pures (moisEcoulesDepuis, evaluerStatutClient) |
| `src/test/lib/funnel/regles.test.ts` | Tests exhaustifs des règles |
| `src/actions/funnel.ts` | Server Actions : statistiques, en retard, suggestions, actualisation batch |
| `src/test/actions/funnel.test.ts` | Tests Server Actions (Supabase mocké) |
| `src/app/(app)/funnel/page.tsx` | Server Component page dashboard |
| `src/components/funnel/camembert-statuts.tsx` | Recharts pie chart client |
| `src/components/funnel/liste-en-danger.tsx` | Clients à risque de rétrogradation |
| `src/components/funnel/bouton-actualiser.tsx` | Déclenche actualiserFunnel + rapport |
| `src/app/(app)/page.tsx` | Modification : accueil devient « Aujourd'hui » |
| `src/components/home/suggestions-aujourdhui.tsx` | Suggestions Server Component + actions rapides |
| `src/components/home/actions-rapides-visite.tsx` | Boutons Marquer visité / Manqué / Reporter |
| `src/components/layout/bottom-nav.tsx` | Ajout item Funnel (remplace Rappels temporairement) |

---

## Tâche 1 — Règles funnel (pure, TDD)

**Objectif :** Fournir 2 fonctions pures testées à 100 % : `moisEcoulesDepuis(iso, now)` et `evaluerStatutClient(input, now)`. Aucune I/O.

**Fichiers :**
- Créer : `src/lib/funnel/regles.ts`, `src/test/lib/funnel/regles.test.ts`

**Étapes :**

- [ ] **Écrire les tests** `src/test/lib/funnel/regles.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { moisEcoulesDepuis, evaluerStatutClient } from '@/lib/funnel/regles'

const NOW = '2026-07-28T00:00:00Z'

describe('moisEcoulesDepuis', () => {
  it('renvoie 0 si moins d\'un mois', () => {
    expect(moisEcoulesDepuis('2026-07-15T00:00:00Z', NOW)).toBe(0)
  })
  it('renvoie 12 pour un an', () => {
    expect(moisEcoulesDepuis('2025-07-28T00:00:00Z', NOW)).toBe(12)
  })
  it('renvoie 13 pour 13 mois écoulés', () => {
    expect(moisEcoulesDepuis('2025-06-15T00:00:00Z', NOW)).toBe(13)
  })
  it('renvoie null si date null', () => {
    expect(moisEcoulesDepuis(null, NOW)).toBeNull()
  })
})

describe('evaluerStatutClient — client_actif → client_inactif', () => {
  it('reste client_actif si commande récente sous le seuil', () => {
    const r = evaluerStatutClient({
      statut: 'client_actif',
      derniere_commande_at: '2026-05-01T00:00:00Z',
      derniere_visite_at: null,
      seuil_inactivite_mois: 12,
      visites_count: 0,
    }, NOW)
    expect(r.nouveauStatut).toBe('client_actif')
    expect(r.motif).toBeNull()
  })

  it('passe en client_inactif si commande au-delà du seuil', () => {
    const r = evaluerStatutClient({
      statut: 'client_actif',
      derniere_commande_at: '2024-06-01T00:00:00Z',
      derniere_visite_at: null,
      seuil_inactivite_mois: 12,
      visites_count: 0,
    }, NOW)
    expect(r.nouveauStatut).toBe('client_inactif')
    expect(r.motif).toMatch(/aucune commande depuis/i)
  })

  it('passe en client_inactif si jamais commandé (derniere_commande_at null)', () => {
    const r = evaluerStatutClient({
      statut: 'client_actif',
      derniere_commande_at: null,
      derniere_visite_at: '2026-01-01T00:00:00Z',
      seuil_inactivite_mois: 12,
      visites_count: 0,
    }, NOW)
    expect(r.nouveauStatut).toBe('client_inactif')
  })

  it('respecte un seuil personnalisé (6 mois au lieu de 12)', () => {
    const r = evaluerStatutClient({
      statut: 'client_actif',
      derniere_commande_at: '2025-11-01T00:00:00Z',
      derniere_visite_at: null,
      seuil_inactivite_mois: 6,
      visites_count: 0,
    }, NOW)
    expect(r.nouveauStatut).toBe('client_inactif')
  })
})

describe('evaluerStatutClient — prospect → prospect_abandonne', () => {
  it('reste prospect si moins de 3 visites', () => {
    const r = evaluerStatutClient({
      statut: 'prospect',
      derniere_commande_at: null,
      derniere_visite_at: '2026-06-01T00:00:00Z',
      seuil_inactivite_mois: 12,
      visites_count: 2,
    }, NOW)
    expect(r.nouveauStatut).toBe('prospect')
  })

  it('passe en prospect_abandonne à 3 visites sans commande', () => {
    const r = evaluerStatutClient({
      statut: 'prospect',
      derniere_commande_at: null,
      derniere_visite_at: '2026-06-01T00:00:00Z',
      seuil_inactivite_mois: 12,
      visites_count: 3,
    }, NOW)
    expect(r.nouveauStatut).toBe('prospect_abandonne')
    expect(r.motif).toMatch(/3 visites sans commande/i)
  })

  it('reste prospect si 3 visites MAIS une commande (signal positif)', () => {
    const r = evaluerStatutClient({
      statut: 'prospect',
      derniere_commande_at: '2026-01-01T00:00:00Z',
      derniere_visite_at: '2026-06-01T00:00:00Z',
      seuil_inactivite_mois: 12,
      visites_count: 3,
    }, NOW)
    expect(r.nouveauStatut).toBe('prospect')
  })
})

describe('evaluerStatutClient — statuts jamais modifiés automatiquement', () => {
  const statutsHumains = [
    'pas_interesse', 'prospect_abandonne', 'ferme', 'contentieux',
  ] as const

  for (const s of statutsHumains) {
    it(`${s} n'est jamais rétrogradé auto`, () => {
      const r = evaluerStatutClient({
        statut: s,
        derniere_commande_at: null,
        derniere_visite_at: null,
        seuil_inactivite_mois: 12,
        visites_count: 10,
      }, NOW)
      expect(r.nouveauStatut).toBe(s)
    })
  }

  it('client_inactif reste client_inactif (pas de re-rétrogradation)', () => {
    const r = evaluerStatutClient({
      statut: 'client_inactif',
      derniere_commande_at: null,
      derniere_visite_at: null,
      seuil_inactivite_mois: 12,
      visites_count: 0,
    }, NOW)
    expect(r.nouveauStatut).toBe('client_inactif')
  })
})
```

- [ ] **Lancer les tests** — doivent échouer (module inexistant) :

```bash
npm test src/test/lib/funnel/regles.test.ts
```

- [ ] **Écrire** `src/lib/funnel/regles.ts` :

```ts
import type { StatutCommercial } from '@/types/database'

export function moisEcoulesDepuis(
  iso: string | null,
  maintenantIso: string = new Date().toISOString(),
): number | null {
  if (!iso) return null
  const debut = new Date(iso)
  const maintenant = new Date(maintenantIso)
  let mois =
    (maintenant.getUTCFullYear() - debut.getUTCFullYear()) * 12 +
    (maintenant.getUTCMonth() - debut.getUTCMonth())
  if (maintenant.getUTCDate() < debut.getUTCDate()) mois--
  return Math.max(0, mois)
}

export interface EntreeEvaluation {
  statut: StatutCommercial
  derniere_commande_at: string | null
  derniere_visite_at: string | null
  seuil_inactivite_mois: number
  visites_count: number
}

export interface ResultatEvaluation {
  nouveauStatut: StatutCommercial
  motif: string | null
}

const NB_VISITES_ABANDON = 3

export function evaluerStatutClient(
  input: EntreeEvaluation,
  maintenantIso: string = new Date().toISOString(),
): ResultatEvaluation {
  // Statuts humains : jamais modifiés auto
  const humains: StatutCommercial[] = [
    'pas_interesse', 'prospect_abandonne', 'ferme', 'contentieux', 'client_inactif',
  ]
  if (humains.includes(input.statut)) {
    return { nouveauStatut: input.statut, motif: null }
  }

  if (input.statut === 'client_actif') {
    const mois = moisEcoulesDepuis(input.derniere_commande_at, maintenantIso)
    if (mois === null || mois >= input.seuil_inactivite_mois) {
      return {
        nouveauStatut: 'client_inactif',
        motif: mois === null
          ? 'Aucune commande enregistrée'
          : `Aucune commande depuis ${mois} mois`,
      }
    }
    return { nouveauStatut: 'client_actif', motif: null }
  }

  if (input.statut === 'prospect') {
    const aSignalPositif = input.derniere_commande_at !== null
    if (input.visites_count >= NB_VISITES_ABANDON && !aSignalPositif) {
      return {
        nouveauStatut: 'prospect_abandonne',
        motif: `${input.visites_count} visites sans commande`,
      }
    }
    return { nouveauStatut: 'prospect', motif: null }
  }

  return { nouveauStatut: input.statut, motif: null }
}
```

- [ ] **Vérifier** les tests passent (~15 tests verts) :

```bash
npm test src/test/lib/funnel/regles.test.ts
```

- [ ] **Committer** :

```bash
git add src/lib/funnel/regles.ts src/test/lib/funnel/regles.test.ts
git commit -m "feat(v1b): règles pures funnel (retrogradation client_actif + prospect) + tests (tache 1)"
```

**Critère de fin :** 15 tests verts, `npm run type-check` OK.

---

## Tâche 2 — Server Actions lecture (statistiques + en retard + suggestions)

**Objectif :** Fournir 3 endpoints en lecture : `lireStatistiquesFunnel(filtres?)`, `lireClientsEnRetard(tourneeId?)`, `lireSuggestionsProspection()`. Aucune mutation.

**Fichiers :**
- Créer : `src/actions/funnel.ts`, `src/test/actions/funnel.test.ts`

**Étapes :**

- [ ] **Écrire les tests** `src/test/actions/funnel.test.ts` :

```ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'

vi.mock('@/lib/supabase/server')

import {
  lireStatistiquesFunnel,
  lireClientsEnRetard,
  lireSuggestionsProspection,
} from '@/actions/funnel'
import { createClient } from '@/lib/supabase/server'

function mockSelect(data: unknown[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    is:     vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    in:     vi.fn().mockReturnThis(),
    order:  vi.fn().mockResolvedValue({ data, error: null }),
  }
  return { from: vi.fn().mockReturnValue(chain), chain }
}

describe('lireStatistiquesFunnel', () => {
  beforeEach(() => vi.clearAllMocks())

  it('compte les etabs par statut', async () => {
    const mock = mockSelect([
      { statut: 'prospect' }, { statut: 'prospect' },
      { statut: 'client_actif' }, { statut: 'client_actif' }, { statut: 'client_actif' },
      { statut: 'client_inactif' },
    ])
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireStatistiquesFunnel()
    expect(r.data!.prospect).toBe(2)
    expect(r.data!.client_actif).toBe(3)
    expect(r.data!.client_inactif).toBe(1)
    expect(r.data!.total).toBe(6)
  })

  it('filtre par tournee_id', async () => {
    const mock = mockSelect([{ statut: 'prospect' }])
    vi.mocked(createClient).mockResolvedValue(mock as never)
    await lireStatistiquesFunnel({ tournee_id: 't1' })
    expect(mock.chain.eq).toHaveBeenCalledWith('tournee_id', 't1')
  })
})

describe('lireClientsEnRetard', () => {
  it("retourne clients (actifs + inactifs) triés par ancienneté de dernière visite", async () => {
    const list = [
      { id: 'e1', enseigne: 'A', statut: 'client_actif', derniere_visite_at: '2026-04-01T00:00:00Z', tournee: { frequence_semaines: 2 } },
    ]
    const mock = mockSelect(list)
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireClientsEnRetard()
    expect(r.data!.length).toBe(1)
    expect(mock.chain.in).toHaveBeenCalledWith('statut', ['client_actif', 'client_inactif'])
  })

  it('filtre par tournee_id si fourni', async () => {
    const mock = mockSelect([])
    vi.mocked(createClient).mockResolvedValue(mock as never)
    await lireClientsEnRetard('t1')
    expect(mock.chain.eq).toHaveBeenCalledWith('tournee_id', 't1')
  })
})

describe('lireSuggestionsProspection', () => {
  it('retourne les prospects triés par ancienneté de dernière visite (les jamais visités en tête)', async () => {
    const mock = mockSelect([
      { id: 'p1', enseigne: 'P1', statut: 'prospect', derniere_visite_at: null },
    ])
    vi.mocked(createClient).mockResolvedValue(mock as never)
    const r = await lireSuggestionsProspection()
    expect(r.data!.length).toBe(1)
    expect(mock.chain.eq).toHaveBeenCalledWith('statut', 'prospect')
  })
})
```

- [ ] **Lancer les tests** — doivent échouer.

- [ ] **Écrire** `src/actions/funnel.ts` :

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import type { Etablissement, StatutCommercial } from '@/types/database'

type ActionResult<T> = { data?: T; erreur?: string }

export interface FiltresFunnel {
  tournee_id?: string
}

export type StatistiquesFunnel = Record<StatutCommercial, number> & { total: number }

export async function lireStatistiquesFunnel(
  filtres: FiltresFunnel = {},
): Promise<ActionResult<StatistiquesFunnel>> {
  const supabase = await createClient()
  let query = supabase
    .from('etablissement')
    .select('statut')
    .is('deleted_at', null)
  if (filtres.tournee_id) query = query.eq('tournee_id', filtres.tournee_id)
  const { data, error } = await query.order('statut')
  if (error) return { erreur: error.message }

  const stats: StatistiquesFunnel = {
    prospect: 0, client_actif: 0, client_inactif: 0,
    pas_interesse: 0, prospect_abandonne: 0, ferme: 0, contentieux: 0,
    total: 0,
  }
  for (const row of data ?? []) {
    const s = (row as { statut: StatutCommercial }).statut
    stats[s] = (stats[s] ?? 0) + 1
    stats.total++
  }
  return { data: stats }
}

export async function lireClientsEnRetard(
  tournee_id?: string,
): Promise<ActionResult<Etablissement[]>> {
  const supabase = await createClient()
  let query = supabase
    .from('etablissement')
    .select('*, tournee(id, nom, frequence_semaines)')
    .is('deleted_at', null)
    .in('statut', ['client_actif', 'client_inactif'])
  if (tournee_id) query = query.eq('tournee_id', tournee_id)
  const { data, error } = await query.order('derniere_visite_at', {
    ascending: true, nullsFirst: true,
  })
  if (error) return { erreur: error.message }
  return { data: (data ?? []) as Etablissement[] }
}

export async function lireSuggestionsProspection(
  tournee_id?: string,
): Promise<ActionResult<Etablissement[]>> {
  const supabase = await createClient()
  let query = supabase
    .from('etablissement')
    .select('*, tournee(id, nom, frequence_semaines)')
    .is('deleted_at', null)
    .eq('statut', 'prospect')
  if (tournee_id) query = query.eq('tournee_id', tournee_id)
  const { data, error } = await query.order('derniere_visite_at', {
    ascending: true, nullsFirst: true,
  })
  if (error) return { erreur: error.message }
  return { data: (data ?? []).slice(0, 10) as Etablissement[] }
}
```

- [ ] **Lancer les tests** — doivent passer.

- [ ] **Committer** :

```bash
git add src/actions/funnel.ts src/test/actions/funnel.test.ts
git commit -m "feat(v1b): Server Actions funnel — statistiques + en retard + suggestions + tests (tache 2)"
```

**Critère de fin :** ~5 tests verts, `npm run type-check` OK.

---

## Tâche 3 — Server Action `actualiserFunnel` (batch retrogradation)

**Objectif :** Un endpoint qui applique en batch les règles de la Tâche 1 sur tous les etabs `client_actif` et `prospect`. Retourne un rapport `{ vers_inactif, vers_abandonne, examines }`. Non transactionnel : chaque UPDATE est isolé, une erreur locale n'arrête pas le reste.

**Fichiers :**
- Modifier : `src/actions/funnel.ts`, `src/test/actions/funnel.test.ts`

**Étapes :**

- [ ] **Ajouter les tests** en bas de `src/test/actions/funnel.test.ts` :

```ts
// En tête, ajouter à l'import : import { actualiserFunnel } from '@/actions/funnel'

describe('actualiserFunnel', () => {
  beforeEach(() => vi.clearAllMocks())

  function mockActualise(etabs: {
    id: string
    statut: string
    derniere_commande_at: string | null
    derniere_visite_at: string | null
    seuil_inactivite_mois: number
    tournee_id: string | null
  }[], visitesCount: Record<string, number>) {
    const updates: { id: string; payload: Record<string, unknown> }[] = []
    const supabase = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === 'etablissement') {
          return {
            select: vi.fn().mockReturnThis(),
            is:     vi.fn().mockReturnThis(),
            in:     vi.fn().mockResolvedValue({ data: etabs, error: null }),
            update: vi.fn().mockImplementation((p: Record<string, unknown>) => ({
              eq: vi.fn().mockImplementation((_c: string, id: string) => {
                updates.push({ id, payload: p })
                return Promise.resolve({ error: null })
              }),
            })),
          }
        }
        if (table === 'visite') {
          return {
            select: vi.fn().mockReturnThis(),
            is:     vi.fn().mockReturnThis(),
            in:     vi.fn().mockReturnThis(),
            eq:     vi.fn().mockImplementation((_c: string, val: string) => {
              return Promise.resolve({
                data: Array(visitesCount[val] ?? 0).fill({ id: 'v' }),
                error: null,
              })
            }),
          }
        }
        return {}
      }),
    }
    return { supabase, updates }
  }

  it('passe client_actif → client_inactif si commande > seuil', async () => {
    const mock = mockActualise(
      [{
        id: 'e1', statut: 'client_actif',
        derniere_commande_at: '2024-01-01T00:00:00Z',
        derniere_visite_at: null,
        seuil_inactivite_mois: 12,
        tournee_id: 't1',
      }],
      {},
    )
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const r = await actualiserFunnel()
    expect(r.data!.vers_inactif).toBe(1)
    expect(mock.updates[0].payload.statut).toBe('client_inactif')
  })

  it('passe prospect → prospect_abandonne si 3 visites sans commande', async () => {
    const mock = mockActualise(
      [{
        id: 'p1', statut: 'prospect',
        derniere_commande_at: null,
        derniere_visite_at: '2026-06-01T00:00:00Z',
        seuil_inactivite_mois: 12,
        tournee_id: 't1',
      }],
      { p1: 3 },
    )
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const r = await actualiserFunnel()
    expect(r.data!.vers_abandonne).toBe(1)
    expect(mock.updates[0].payload.statut).toBe('prospect_abandonne')
  })

  it("ne touche pas ceux dont l'evaluation retourne le même statut", async () => {
    const mock = mockActualise(
      [{
        id: 'e1', statut: 'client_actif',
        derniere_commande_at: '2026-05-01T00:00:00Z',  // récent, sous le seuil
        derniere_visite_at: null,
        seuil_inactivite_mois: 12,
        tournee_id: 't1',
      }],
      {},
    )
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const r = await actualiserFunnel()
    expect(r.data!.vers_inactif).toBe(0)
    expect(mock.updates.length).toBe(0)
    expect(r.data!.examines).toBe(1)
  })
})
```

- [ ] **Ajouter à** `src/actions/funnel.ts` :

```ts
import { evaluerStatutClient } from '@/lib/funnel/regles'

export interface RapportActualisation {
  examines: number
  vers_inactif: number
  vers_abandonne: number
  erreurs: { etablissement_id: string; message: string }[]
}

export async function actualiserFunnel(): Promise<ActionResult<RapportActualisation>> {
  const supabase = await createClient()
  const rapport: RapportActualisation = {
    examines: 0, vers_inactif: 0, vers_abandonne: 0, erreurs: [],
  }

  const { data: etabs, error } = await supabase
    .from('etablissement')
    .select('id, statut, derniere_commande_at, derniere_visite_at, seuil_inactivite_mois')
    .is('deleted_at', null)
    .in('statut', ['client_actif', 'prospect'])
  if (error) return { erreur: error.message }
  if (!etabs || etabs.length === 0) return { data: rapport }

  const now = new Date().toISOString()

  for (const e of etabs) {
    rapport.examines++
    // Nombre de visites (uniquement utile pour les prospects)
    let visitesCount = 0
    if (e.statut === 'prospect') {
      const { data: vs } = await supabase
        .from('visite')
        .select('id')
        .is('deleted_at', null)
        .eq('etablissement_id', e.id)
      visitesCount = vs?.length ?? 0
    }

    const evalRes = evaluerStatutClient({
      statut: e.statut,
      derniere_commande_at: e.derniere_commande_at,
      derniere_visite_at: e.derniere_visite_at,
      seuil_inactivite_mois: e.seuil_inactivite_mois ?? 12,
      visites_count: visitesCount,
    }, now)

    if (evalRes.nouveauStatut === e.statut) continue

    const { error: upErr } = await supabase
      .from('etablissement')
      .update({ statut: evalRes.nouveauStatut })
      .eq('id', e.id)
    if (upErr) {
      rapport.erreurs.push({ etablissement_id: e.id, message: upErr.message })
      continue
    }
    if (evalRes.nouveauStatut === 'client_inactif') rapport.vers_inactif++
    if (evalRes.nouveauStatut === 'prospect_abandonne') rapport.vers_abandonne++
  }

  return { data: rapport }
}
```

- [ ] **Lancer** `npm test src/test/actions/funnel.test.ts` — tous verts.

- [ ] **Committer** :

```bash
git add src/actions/funnel.ts src/test/actions/funnel.test.ts
git commit -m "feat(v1b): Server Action actualiserFunnel — batch retrogradation client_actif/prospect (tache 3)"
```

**Critère de fin :** ~8 tests verts total pour ce fichier, `npm run type-check` OK.

---

## Tâche 4 — Page `/funnel` : camembert + statistiques + clients en danger

**Objectif :** Installer Recharts. Livrer une page `/funnel` (Server Component) qui affiche : compteurs par statut, camembert cliquable, filtre tournée (client), liste des clients en retard, bouton « Actualiser le funnel » qui déclenche `actualiserFunnel`.

**Fichiers :**
- Modifier : `package.json`
- Créer : `src/app/(app)/funnel/page.tsx`
- Créer : `src/components/funnel/camembert-statuts.tsx`
- Créer : `src/components/funnel/liste-en-danger.tsx`
- Créer : `src/components/funnel/bouton-actualiser.tsx`

**Étapes :**

- [ ] **Installer Recharts** :

```bash
npm install recharts
```

- [ ] **Créer** `src/components/funnel/camembert-statuts.tsx` (client) :

```tsx
'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import type { StatistiquesFunnel } from '@/actions/funnel'
import type { StatutCommercial } from '@/types/database'

const LIBELLES: Record<StatutCommercial, string> = {
  prospect: 'Prospects', client_actif: 'Clients actifs',
  client_inactif: 'Clients inactifs', pas_interesse: 'Pas intéressés',
  prospect_abandonne: 'Abandonnés', ferme: 'Fermés', contentieux: 'Contentieux',
}
const COULEURS: Record<StatutCommercial, string> = {
  prospect: '#3b82f6', client_actif: '#10b981',
  client_inactif: '#f59e0b', pas_interesse: '#94a3b8',
  prospect_abandonne: '#6b7280', ferme: '#ef4444', contentieux: '#a855f7',
}

export function CamembertStatuts({ stats }: { stats: StatistiquesFunnel }) {
  const data = (Object.keys(LIBELLES) as StatutCommercial[])
    .map((k) => ({ name: LIBELLES[k], value: stats[k], couleur: COULEURS[k] }))
    .filter((d) => d.value > 0)

  if (data.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Aucune donnée.</p>
  }

  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" innerRadius={50} outerRadius={100}>
            {data.map((d) => <Cell key={d.name} fill={d.couleur} />)}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Créer** `src/components/funnel/liste-en-danger.tsx` (client) :

```tsx
'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { calculerRetard } from '@/lib/retard'
import { formatDateSuisse } from '@/lib/format'
import type { Etablissement } from '@/types/database'

export function ListeEnDanger({ etabs }: { etabs: Etablissement[] }) {
  const now = new Date().toISOString()
  const enRetard = etabs
    .map((e) => ({
      etab: e,
      retard: calculerRetard(e.derniere_visite_at, e.tournee?.frequence_semaines ?? 4, now),
    }))
    .filter((x) => x.retard.est_en_retard || x.retard.jours_depuis_visite === null)

  if (enRetard.length === 0) {
    return <p className="p-6 text-center text-sm text-muted-foreground">Aucun client en retard.</p>
  }

  return (
    <ul className="space-y-2">
      {enRetard.slice(0, 20).map(({ etab, retard }) => (
        <li key={etab.id}>
          <Link href={`/etablissements/${etab.id}`}>
            <Card className="p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{etab.enseigne}</p>
                  <p className="text-xs text-muted-foreground">
                    {etab.tournee?.nom ?? 'Sans tournée'}
                    {etab.derniere_visite_at && ` · dernière visite ${formatDateSuisse(etab.derniere_visite_at)}`}
                  </p>
                </div>
                {retard.jours_depuis_visite === null
                  ? <Badge variant="secondary">Jamais visité</Badge>
                  : <Badge variant="destructive">Retard · {retard.jours_depuis_visite} j</Badge>}
              </div>
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Créer** `src/components/funnel/bouton-actualiser.tsx` (client) :

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { actualiserFunnel, type RapportActualisation } from '@/actions/funnel'

export function BoutonActualiser() {
  const router = useRouter()
  const [rapport, setRapport] = useState<RapportActualisation | null>(null)
  const [pending, startTransition] = useTransition()

  function onClick() {
    setRapport(null)
    startTransition(async () => {
      const r = await actualiserFunnel()
      if (r.data) {
        setRapport(r.data)
        router.refresh()
      }
    })
  }

  return (
    <div className="space-y-2">
      <Button type="button" onClick={onClick} disabled={pending} className="h-12 w-full text-base">
        {pending ? 'Actualisation…' : 'Actualiser le funnel'}
      </Button>
      {rapport && (
        <p className="rounded-md border bg-muted/30 p-2 text-xs">
          {rapport.examines} examinés · {rapport.vers_inactif} → inactif · {rapport.vers_abandonne} → abandonné
        </p>
      )}
    </div>
  )
}
```

- [ ] **Créer** `src/app/(app)/funnel/page.tsx` :

```tsx
import { lireStatistiquesFunnel, lireClientsEnRetard } from '@/actions/funnel'
import { CamembertStatuts } from '@/components/funnel/camembert-statuts'
import { ListeEnDanger } from '@/components/funnel/liste-en-danger'
import { BoutonActualiser } from '@/components/funnel/bouton-actualiser'
import { Card } from '@/components/ui/card'

export default async function FunnelPage() {
  const [stats, enRetard] = await Promise.all([
    lireStatistiquesFunnel(),
    lireClientsEnRetard(),
  ])

  if (stats.erreur || !stats.data) {
    return <p className="p-6 text-sm text-destructive">Erreur de chargement.</p>
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
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>Prospects : <b>{stats.data.prospect}</b></div>
          <div>Clients actifs : <b>{stats.data.client_actif}</b></div>
          <div>Clients inactifs : <b>{stats.data.client_inactif}</b></div>
          <div>Abandonnés : <b>{stats.data.prospect_abandonne}</b></div>
        </div>
      </Card>

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

- [ ] **Vérifier** : `npm run type-check`, `npm run build` — ok. Ouvrir localhost sur `/funnel` en DevTools mobile 390 px : camembert lisible, compteurs OK.

- [ ] **Committer** :

```bash
git add package.json package-lock.json src/app/\(app\)/funnel/ src/components/funnel/
git commit -m "feat(v1b): page /funnel — camembert Recharts + statistiques + clients en retard + bouton actualiser (tache 4)"
```

**Critère de fin :** Page rendue avec camembert, compteurs, liste. Bouton « Actualiser » fonctionne (via `router.refresh()`).

---

## Tâche 5 — Home : suggestions du jour + actions rapides

**Objectif :** Transformer `/` (actuellement placeholder) en page « Aujourd'hui » qui liste les 10 clients + 5 prospects les plus urgents, avec 3 boutons rapides par item : Marquer visité (60 min), Manquée, Reporter.

**Fichiers :**
- Modifier : `src/app/(app)/page.tsx`
- Créer : `src/components/home/suggestions-aujourdhui.tsx`
- Créer : `src/components/home/actions-rapides-visite.tsx`

**Étapes :**

- [ ] **Créer** `src/components/home/actions-rapides-visite.tsx` (client) :

```tsx
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { FormulaireVisite } from '@/components/visites/formulaire-visite'
import { BoutonVisiteManquee } from '@/components/visites/bouton-visite-manquee'

interface Props { etablissementId: string }

export function ActionsRapidesVisite({ etablissementId }: Props) {
  const router = useRouter()
  const [openVisite, setOpenVisite] = useState(false)
  const [, startTransition] = useTransition()

  function onSuccess() {
    startTransition(() => router.refresh())
  }

  return (
    <div className="mt-2 flex gap-2">
      <Button
        type="button"
        onClick={() => setOpenVisite(true)}
        className="h-10 flex-1 text-sm"
      >
        Marquer visité (60 min)
      </Button>
      <BoutonVisiteManquee etablissementId={etablissementId} onSuccess={onSuccess} />
      <FormulaireVisite
        open={openVisite}
        onOpenChange={setOpenVisite}
        etablissementId={etablissementId}
        dureeInitiale={60}
        onSuccess={onSuccess}
      />
    </div>
  )
}
```

- [ ] **Créer** `src/components/home/suggestions-aujourdhui.tsx` (server) :

```tsx
import Link from 'next/link'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ActionsRapidesVisite } from './actions-rapides-visite'
import { calculerRetard } from '@/lib/retard'
import type { Etablissement } from '@/types/database'

interface Props {
  clients: Etablissement[]
  prospects: Etablissement[]
}

function Bloc({ titre, items }: { titre: string; items: Etablissement[] }) {
  if (items.length === 0) return null
  const now = new Date().toISOString()
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
        {titre} ({items.length})
      </h2>
      <ul className="space-y-2">
        {items.map((e) => {
          const r = calculerRetard(e.derniere_visite_at, e.tournee?.frequence_semaines ?? 4, now)
          return (
            <li key={e.id}>
              <Card className="p-3">
                <Link href={`/etablissements/${e.id}`} className="block">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{e.enseigne}</p>
                      <p className="text-xs text-muted-foreground">{e.tournee?.nom ?? 'Sans tournée'}</p>
                    </div>
                    {r.jours_depuis_visite === null
                      ? <Badge variant="secondary">Jamais visité</Badge>
                      : r.est_en_retard
                        ? <Badge variant="destructive">Retard · {r.jours_depuis_visite} j</Badge>
                        : null}
                  </div>
                </Link>
                <ActionsRapidesVisite etablissementId={e.id} />
              </Card>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

export function SuggestionsAujourdhui({ clients, prospects }: Props) {
  return (
    <div className="flex flex-col gap-6">
      <Bloc titre="Clients à revoir en priorité" items={clients.slice(0, 10)} />
      <Bloc titre="Prospects à démarcher" items={prospects.slice(0, 5)} />
      {clients.length === 0 && prospects.length === 0 && (
        <p className="rounded-md border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Aucune suggestion pour aujourd&apos;hui. Bon travail !
        </p>
      )}
    </div>
  )
}
```

- [ ] **Modifier** `src/app/(app)/page.tsx` :

```tsx
import { lireClientsEnRetard, lireSuggestionsProspection } from '@/actions/funnel'
import { SuggestionsAujourdhui } from '@/components/home/suggestions-aujourdhui'
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
      <SuggestionsAujourdhui
        clients={clients.data ?? []}
        prospects={prospects.data ?? []}
      />
    </div>
  )
}
```

- [ ] **Committer** :

```bash
git add "src/app/(app)/page.tsx" src/components/home/
git commit -m "feat(v1b): home 'Aujourd''hui' — suggestions clients en retard + prospects + actions rapides (tache 5)"
```

**Critère de fin :** `/` affiche 10 clients + 5 prospects, chaque item a 2 boutons (visité 60 min / manquée) qui ouvrent les bottom sheets V1a-2 et refresh la page.

---

## Tâche 6 — BottomNav : ajout Funnel + push

**Objectif :** Remplacer l'item « Rappels » (placeholder V1f) par « Funnel » dans la barre de navigation. Push final.

**Fichiers :**
- Modifier : `src/components/layout/bottom-nav.tsx`

**Étapes :**

- [ ] **Modifier** `src/components/layout/bottom-nav.tsx` — remplacer le tableau `ITEMS` :

```tsx
const ITEMS: NavItem[] = [
  { href: '/',              label: 'Aujourd\'hui',    emoji: '📅' },
  { href: '/etablissements', label: 'Établissements', emoji: '🍷' },
  { href: '/funnel',         label: 'Funnel',         emoji: '📊' },
  { href: '/chat',           label: 'Chat',           emoji: '💬' },
]
```

- [ ] **Vérifier** : `npm run type-check`, `npm test` (toutes suites vertes), `npm run build` OK.

- [ ] **Committer** :

```bash
git add src/components/layout/bottom-nav.tsx
git commit -m "feat(v1b): bottom nav — remplace 'Rappels' par 'Funnel' + label 'Aujourd''hui' (tache 6)"
```

- [ ] **Push** :

```bash
git push origin main
```

**Critère de fin :** Vercel redéploie, `/`, `/funnel` visibles, bottom nav à jour.

---

## Résumé V1b

| # | Tâche | Durée estimée |
|---|-------|---------------|
| 1 | Règles pures funnel (TDD) | ~15 min |
| 2 | Server Actions lecture | ~20 min |
| 3 | Server Action actualiserFunnel | ~20 min |
| 4 | Page /funnel + Recharts + composants | ~25 min |
| 5 | Home suggestions + actions rapides | ~20 min |
| 6 | BottomNav + push | ~5 min |
| **Total** | | **~1h45** |

**Critère de sortie V1b** :
- Cyril ouvre `/` sur son iPhone, voit ses 10 clients à revoir + 5 prospects, marque un visité en 2 taps sans quitter la home.
- Cyril ouvre `/funnel`, voit le camembert et les compteurs. Clique « Actualiser » → les clients qui n'ont pas commandé depuis > 12 mois passent en `client_inactif`, les prospects avec ≥ 3 visites sans commande passent en `prospect_abandonne`.
- `npm test` : 149 → ~165 verts.

---

**Deux options d'exécution :**

**1. Subagent-Driven (recommandé)** — un sous-agent par tâche, revue entre chaque, itération rapide. Lancer avec `/subagent-driven-development`.

**2. Inline** — exécution dans cette session avec `executing-plans`, checkpoints à chaque tâche.
