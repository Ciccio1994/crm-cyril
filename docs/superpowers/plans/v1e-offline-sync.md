# V1e — Offline sync

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre les mutations de Cyril (visite, contact, établissement, offre) tolérantes au hors-ligne : quand il crée une visite dans une cave sans réseau, l'action réussit visuellement, s'enregistre dans une queue IndexedDB, puis se synchronise avec Supabase dès qu'internet revient.

**Architecture:** Une nouvelle table Dexie `sync_queue` stocke les mutations offline. Un dispatcher (`src/lib/sync/dispatcher.ts`) mappe un nom d'action symbolique (`creerVisite`) vers la Server Action correspondante et pilote la boucle de sync avec retry exponentiel (max 3 tentatives). Le hook `useOnline` fournit l'état réseau et déclenche une sync automatique dès qu'internet revient. Les Server Actions existantes ne sont **pas modifiées** — le wrapper client `executerAvecSync` les enveloppe et décide « appel direct » ou « enqueue ». Le write-through cache lecture (hydratation Dexie en arrière-plan sur les pages critiques) permet aux fiches déjà consultées d'être re-consultables offline.

**Tech Stack:** Dexie 4 (déjà installé), Next.js 16 Server Actions, React 19 `useSyncExternalStore` + `useTransition`, Vitest, `fake-indexeddb` (nouveau, pour les tests Dexie en Node)

**Décisions verrouillées** :
- **Mutations seulement** dans la queue (creerVisite, mettreAJourVisite, creerVisiteManquee, creerContact, mettreAJourContact, supprimerContact, creerEtablissement, mettreAJourEtablissement, supprimerEtablissement, creerOffre, mettreAJourOffre, supprimerOffre). Aucune lecture n'est jamais mise en queue.
- **Last-write-wins simple** : le serveur gagne toujours en cas de conflit. Si un `updated_at` serveur est plus récent que la version qu'on essaie de patcher, on remonte une erreur dans la queue (statut `echec`), Cyril résout manuellement. Pas de dialog UI en V1e (V2).
- **Retry backoff** : 1 s → 5 s → 30 s (3 tentatives). Au-delà, l'entrée reste en `echec` jusqu'à action manuelle.
- **Write-through cache lecture** : hydratation en arrière-plan sur `/etablissements`, `/etablissements/[id]`, `/funnel`, `/`. Aucun refactor des Server Components. Un client component `<HydraterCache tables={{...}} />` reçoit les données en prop et les écrit dans Dexie.
- **Fallback lecture offline (V1e Tâche 8)** : les 3 pages critiques (`/`, `/etablissements`, `/etablissements/[id]`) sont converties en Client Components qui appellent les Server Actions en effet, avec fallback Dexie automatique si `navigator.onLine === false` OU si l'appel échoue. Le premier chargement online alimente Dexie ; les navigations offline lisent Dexie.
- **Aucune modification aux Server Actions existantes.**

---

## Fichiers créés / modifiés

| Fichier | Rôle |
|---------|------|
| `package.json` | Ajouter `fake-indexeddb` (dev) |
| `src/lib/db/dexie.ts` | Bump vers version 2 : ajout table `sync_queue` |
| `src/types/sync.ts` | Types `ActionQueue`, `EntreeQueue`, `RapportSync` |
| `src/lib/sync/queue.ts` | Pure : `enqueue`, `prochainesTaches`, `marquerReussi`, `marquerEchec`, `calculerBackoff` |
| `src/lib/sync/dispatcher.ts` | Map `nom_action` → Server Action + boucle `synchroniser()` |
| `src/lib/sync/wrapper.ts` | Client : `executerAvecSync(nomAction, payload, actionServeur)` |
| `src/lib/sync/hydrate.ts` | Utilitaires écriture en masse dans Dexie |
| `src/hooks/use-online.ts` | Hook `useOnline()` via `useSyncExternalStore` |
| `src/hooks/use-queue-count.ts` | Hook `useQueueCount()` (compte entrées `en_attente` + `en_cours`) |
| `src/components/sync/badge-reseau.tsx` | Badge « En ligne / Hors ligne » |
| `src/components/sync/modal-sync.tsx` | Modal progress + rapport final |
| `src/components/sync/bouton-sync-manuel.tsx` | Client, déclenche `synchroniser` + ouvre modal |
| `src/components/sync/hydrater-cache.tsx` | Client, écrit les tables en background |
| `src/components/layout/bottom-nav.tsx` | Ajouter badge « X en attente » sur l'item avec queue |
| `src/app/(app)/layout.tsx` | Injecter `<BadgeReseau />` en tête + auto-sync sur online |
| `src/test/setup.ts` | Ajout `import 'fake-indexeddb/auto'` |
| `src/test/lib/sync/queue.test.ts` | Tests queue manager |
| `src/test/lib/sync/dispatcher.test.ts` | Tests dispatcher + retry |
| `src/test/hooks/use-online.test.ts` | Tests hook online |

Client wrappers réutilisant des composants V1a-2/V1b/V1c/V1d :
| Composant existant | Modification |
|--------------------|--------------|
| `src/components/visites/formulaire-visite.tsx` | Remplacer `creerVisite(payload)` par `executerAvecSync('creerVisite', payload, creerVisite)` |
| `src/components/visites/bouton-visite-manquee.tsx` | Idem pour `creerVisiteManquee` |
| `src/components/contacts/formulaire-contact.tsx` | Idem pour `creerContact` / `mettreAJourContact` |
| `src/components/contacts/onglet-contacts.tsx` | Idem pour `supprimerContact` |
| `src/components/etablissements/formulaire-etablissement.tsx` | Idem pour `creerEtablissement` / `mettreAJourEtablissement` |
| `src/components/offres/formulaire-offre.tsx` | Idem pour `creerOffre` / `mettreAJourOffre` / `supprimerOffre` |

---

## Tâche 1 — Dexie v2 : ajout `sync_queue` + `fake-indexeddb`

**Objectif :** Bump Dexie v1 → v2 avec la table `sync_queue`. Installer `fake-indexeddb` pour tester Dexie en Node.

**Fichiers :**
- Modifier : `package.json`, `src/lib/db/dexie.ts`, `src/test/setup.ts`
- Créer : `src/types/sync.ts`

**Étapes :**

- [ ] **Installer** `fake-indexeddb` en dev :

```bash
npm install --save-dev fake-indexeddb
```

- [ ] **Modifier** `src/test/setup.ts` — ajouter en tête :

```ts
import 'fake-indexeddb/auto'
```

Note : cette ligne définit `globalThis.indexedDB` avant que Dexie soit importée.

- [ ] **Créer** `src/types/sync.ts` :

```ts
export type NomAction =
  | 'creerEtablissement' | 'mettreAJourEtablissement' | 'supprimerEtablissement'
  | 'creerContact' | 'mettreAJourContact' | 'supprimerContact'
  | 'creerVisite' | 'creerVisiteManquee' | 'mettreAJourVisite'
  | 'creerOffre' | 'mettreAJourOffre' | 'supprimerOffre'

export type StatutQueue = 'en_attente' | 'en_cours' | 'reussi' | 'echec'

export interface EntreeQueue {
  id?: number
  nom_action: NomAction
  payload_json: string
  cible_id: string | null      // id de l'entité si mettre à jour / supprimer
  created_at: string
  tentatives: number
  dernier_essai_at: string | null
  dernier_message: string | null
  statut: StatutQueue
}

export interface RapportSync {
  reussi: number
  echec: number
  restant: number
  erreurs: { id: number; nom_action: NomAction; message: string }[]
}
```

- [ ] **Modifier** `src/lib/db/dexie.ts` :

```ts
import Dexie, { type Table } from 'dexie'
import type {
  Etablissement, Contact, Visite, Rappel, Tournee, Zone, Offre,
} from '@/types/database'
import type { EntreeQueue } from '@/types/sync'

export class CrmDatabase extends Dexie {
  etablissements!: Table<Etablissement>
  contacts!:       Table<Contact>
  visites!:        Table<Visite>
  rappels!:        Table<Rappel>
  tournees!:       Table<Tournee>
  zones!:          Table<Zone>
  offres!:         Table<Offre>
  sync_queue!:     Table<EntreeQueue>

  constructor() {
    super('crm-cyril')
    this.version(1).stores({
      etablissements: 'id, tournee_id, statut, derniere_visite_at, deleted_at, updated_at',
      contacts:       'id, etablissement_id, deleted_at',
      visites:        'id, etablissement_id, date_visite, est_manquee, deleted_at',
      rappels:        'id, etablissement_id, echeance, statut, canal, deleted_at',
      tournees:       'id',
      zones:          'id, code',
      offres:         'id, date_fin, deleted_at',
    })
    this.version(2).stores({
      sync_queue: '++id, statut, created_at, nom_action',
    })
  }
}

export const db = new CrmDatabase()
```

- [ ] **Vérifier** :

```bash
npm run type-check
```

Résultat attendu : OK.

- [ ] **Committer** :

```bash
git add package.json package-lock.json src/lib/db/dexie.ts src/test/setup.ts src/types/sync.ts
git commit -m "chore(v1e): Dexie v2 + sync_queue + fake-indexeddb pour tests (tache 1)"
```

**Critère de fin :** Dexie migré v2, `fake-indexeddb` installé, aucun test cassé.

---

## Tâche 2 — Queue manager (TDD)

**Objectif :** Livrer 5 fonctions pures sur `sync_queue` : `enqueue`, `prochainesTaches`, `marquerReussi`, `marquerEchec`, `calculerBackoff`. Tests avec Dexie réelle (via fake-indexeddb).

**Fichiers :**
- Créer : `src/lib/sync/queue.ts`, `src/test/lib/sync/queue.test.ts`

**Étapes :**

- [ ] **Écrire les tests** `src/test/lib/sync/queue.test.ts` :

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db/dexie'
import {
  enqueue, prochainesTaches, marquerReussi, marquerEchec, calculerBackoff,
} from '@/lib/sync/queue'

beforeEach(async () => {
  await db.sync_queue.clear()
})

describe('enqueue', () => {
  it("crée une entrée avec statut 'en_attente' + tentatives=0", async () => {
    const id = await enqueue('creerVisite', { etablissement_id: 'e1' }, null)
    const row = await db.sync_queue.get(id)
    expect(row?.statut).toBe('en_attente')
    expect(row?.tentatives).toBe(0)
    expect(row?.nom_action).toBe('creerVisite')
    expect(row?.payload_json).toBe(JSON.stringify({ etablissement_id: 'e1' }))
  })

  it("stocke cible_id pour les updates/deletes", async () => {
    const id = await enqueue('mettreAJourVisite', { notes: 'X' }, 'v1')
    const row = await db.sync_queue.get(id)
    expect(row?.cible_id).toBe('v1')
  })
})

describe('prochainesTaches', () => {
  it("retourne les entrées 'en_attente' ordonnées par created_at", async () => {
    await enqueue('creerVisite', { etablissement_id: 'e2' }, null)
    await new Promise((r) => setTimeout(r, 5))
    await enqueue('creerVisite', { etablissement_id: 'e3' }, null)
    const taches = await prochainesTaches()
    expect(taches).toHaveLength(2)
    expect(taches[0].payload_json).toContain('e2')
    expect(taches[1].payload_json).toContain('e3')
  })

  it("ignore les 'reussi' et respecte le backoff pour les 'echec'", async () => {
    const idOK = await enqueue('creerVisite', { x: 1 }, null)
    await marquerReussi(idOK)
    const idKO = await enqueue('creerVisite', { x: 2 }, null)
    await marquerEchec(idKO, 'Boom')  // tentatives → 1, backoff 5 s
    const taches = await prochainesTaches()
    // Le OK est exclu, le KO est encore dans son backoff (5 s) → exclu aussi
    expect(taches).toHaveLength(0)
  })

  it("réinclut un 'echec' quand son backoff est écoulé", async () => {
    const id = await enqueue('creerVisite', { x: 1 }, null)
    await marquerEchec(id, 'transient')
    // Simuler que le backoff est passé : reculer dernier_essai_at de 10 s
    const passe = new Date(Date.now() - 10_000).toISOString()
    await db.sync_queue.update(id, { dernier_essai_at: passe })
    const taches = await prochainesTaches()
    expect(taches).toHaveLength(1)
  })
})

describe('marquerReussi', () => {
  it("passe l'entrée en 'reussi'", async () => {
    const id = await enqueue('creerVisite', {}, null)
    await marquerReussi(id)
    const row = await db.sync_queue.get(id)
    expect(row?.statut).toBe('reussi')
  })
})

describe('marquerEchec', () => {
  it("incrémente tentatives et statut='en_attente' si < 3 tentatives", async () => {
    const id = await enqueue('creerVisite', {}, null)
    await marquerEchec(id, 'net')
    const row = await db.sync_queue.get(id)
    expect(row?.tentatives).toBe(1)
    expect(row?.statut).toBe('en_attente')
    expect(row?.dernier_message).toBe('net')
  })

  it("passe en 'echec' définitif après 3 tentatives", async () => {
    const id = await enqueue('creerVisite', {}, null)
    await marquerEchec(id, 'x')
    await marquerEchec(id, 'x')
    await marquerEchec(id, 'x')
    const row = await db.sync_queue.get(id)
    expect(row?.tentatives).toBe(3)
    expect(row?.statut).toBe('echec')
  })
})

describe('calculerBackoff', () => {
  it("respecte 1 s / 5 s / 30 s en fonction de tentatives", () => {
    expect(calculerBackoff(0)).toBe(1000)
    expect(calculerBackoff(1)).toBe(5000)
    expect(calculerBackoff(2)).toBe(30_000)
  })
})
```

- [ ] **Écrire** `src/lib/sync/queue.ts` :

```ts
import { db } from '@/lib/db/dexie'
import type { EntreeQueue, NomAction } from '@/types/sync'

const MAX_TENTATIVES = 3
const BACKOFF_MS = [1_000, 5_000, 30_000]

export function calculerBackoff(tentatives: number): number {
  return BACKOFF_MS[Math.min(tentatives, BACKOFF_MS.length - 1)]
}

export async function enqueue(
  nom_action: NomAction,
  payload: unknown,
  cible_id: string | null,
): Promise<number> {
  const entree: EntreeQueue = {
    nom_action,
    payload_json: JSON.stringify(payload),
    cible_id,
    created_at: new Date().toISOString(),
    tentatives: 0,
    dernier_essai_at: null,
    dernier_message: null,
    statut: 'en_attente',
  }
  return await db.sync_queue.add(entree)
}

export async function prochainesTaches(): Promise<EntreeQueue[]> {
  const now = Date.now()
  const enAttente = await db.sync_queue
    .where('statut').equals('en_attente')
    .toArray()
  return enAttente
    .filter((e) => {
      if (!e.dernier_essai_at) return true
      const backoff = calculerBackoff(e.tentatives - 1)
      return new Date(e.dernier_essai_at).getTime() + backoff <= now
    })
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export async function marquerReussi(id: number): Promise<void> {
  await db.sync_queue.update(id, {
    statut: 'reussi',
    dernier_essai_at: new Date().toISOString(),
  })
}

export async function marquerEchec(id: number, message: string): Promise<void> {
  const entree = await db.sync_queue.get(id)
  if (!entree) return
  const nouvellesTentatives = entree.tentatives + 1
  const definitif = nouvellesTentatives >= MAX_TENTATIVES
  await db.sync_queue.update(id, {
    tentatives: nouvellesTentatives,
    dernier_essai_at: new Date().toISOString(),
    dernier_message: message,
    statut: definitif ? 'echec' : 'en_attente',
  })
}
```

- [ ] **Lancer** les tests :

```bash
npm test src/test/lib/sync/queue.test.ts
```

Résultat attendu : ~9 tests verts.

- [ ] **Committer** :

```bash
git add src/lib/sync/queue.ts src/test/lib/sync/queue.test.ts
git commit -m "feat(v1e): queue manager Dexie — enqueue/dequeue/retry backoff + tests (tache 2)"
```

**Critère de fin :** ~9 tests verts, backoff 1/5/30 s vérifié.

---

## Tâche 3 — Dispatcher + boucle `synchroniser` (TDD)

**Objectif :** Livrer `synchroniser()` qui itère `prochainesTaches`, appelle la Server Action correspondante via un mapping, et met à jour statut/tentatives.

**Fichiers :**
- Créer : `src/lib/sync/dispatcher.ts`, `src/test/lib/sync/dispatcher.test.ts`

**Étapes :**

- [ ] **Écrire les tests** `src/test/lib/sync/dispatcher.test.ts` :

```ts
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db/dexie'
import { enqueue } from '@/lib/sync/queue'

vi.mock('@/actions/visite', () => ({
  creerVisite: vi.fn(),
  creerVisiteManquee: vi.fn(),
  mettreAJourVisite: vi.fn(),
}))
vi.mock('@/actions/etablissement', () => ({
  creerEtablissement: vi.fn(),
  mettreAJourEtablissement: vi.fn(),
  supprimerEtablissement: vi.fn(),
}))
vi.mock('@/actions/contact', () => ({
  creerContact: vi.fn(),
  mettreAJourContact: vi.fn(),
  supprimerContact: vi.fn(),
}))
vi.mock('@/actions/offres', () => ({
  creerOffre: vi.fn(),
  mettreAJourOffre: vi.fn(),
  supprimerOffre: vi.fn(),
}))

import { synchroniser } from '@/lib/sync/dispatcher'
import * as visiteActions from '@/actions/visite'

beforeEach(async () => {
  await db.sync_queue.clear()
  vi.clearAllMocks()
})

describe('synchroniser', () => {
  it("appelle la Server Action correspondante pour une entrée 'creerVisite'", async () => {
    vi.mocked(visiteActions.creerVisite).mockResolvedValue({ data: { id: 'v1' } as never })
    const id = await enqueue('creerVisite', { etablissement_id: 'e1' }, null)
    const rapport = await synchroniser()
    expect(visiteActions.creerVisite).toHaveBeenCalledWith({ etablissement_id: 'e1' })
    expect(rapport.reussi).toBe(1)
    const row = await db.sync_queue.get(id)
    expect(row?.statut).toBe('reussi')
  })

  it("marque en échec si Server Action retourne { erreur }", async () => {
    vi.mocked(visiteActions.creerVisite).mockResolvedValue({ erreur: 'Boom' })
    const id = await enqueue('creerVisite', {}, null)
    const rapport = await synchroniser()
    expect(rapport.echec).toBe(1)
    const row = await db.sync_queue.get(id)
    expect(row?.tentatives).toBe(1)
    expect(row?.dernier_message).toBe('Boom')
  })

  it("passe cible_id en 1er argument pour les updates", async () => {
    vi.mocked(visiteActions.mettreAJourVisite).mockResolvedValue({ data: { id: 'v1' } as never })
    await enqueue('mettreAJourVisite', { notes: 'X' }, 'v1')
    await synchroniser()
    expect(visiteActions.mettreAJourVisite).toHaveBeenCalledWith('v1', { notes: 'X' })
  })

  it("traite plusieurs entrées en séquence", async () => {
    vi.mocked(visiteActions.creerVisite).mockResolvedValue({ data: { id: 'v1' } as never })
    await enqueue('creerVisite', { x: 1 }, null)
    await enqueue('creerVisite', { x: 2 }, null)
    const rapport = await synchroniser()
    expect(rapport.reussi).toBe(2)
    expect(visiteActions.creerVisite).toHaveBeenCalledTimes(2)
  })

  it("retourne rapport vide si queue vide", async () => {
    const rapport = await synchroniser()
    expect(rapport.reussi).toBe(0)
    expect(rapport.echec).toBe(0)
    expect(rapport.restant).toBe(0)
  })
})
```

- [ ] **Écrire** `src/lib/sync/dispatcher.ts` :

```ts
import { marquerReussi, marquerEchec, prochainesTaches } from './queue'
import type { NomAction, RapportSync } from '@/types/sync'

import {
  creerEtablissement, mettreAJourEtablissement, supprimerEtablissement,
} from '@/actions/etablissement'
import { creerContact, mettreAJourContact, supprimerContact } from '@/actions/contact'
import {
  creerVisite, creerVisiteManquee, mettreAJourVisite,
} from '@/actions/visite'
import { creerOffre, mettreAJourOffre, supprimerOffre } from '@/actions/offres'

type ActionResult = { data?: unknown; erreur?: string | unknown }

// Deux formes possibles :
// - action(payload): pour les CREATE
// - action(id, payload): pour les UPDATE/DELETE (delete = payload vide)
type ActionOneArg = (payload: unknown) => Promise<ActionResult>
type ActionTwoArgs = (id: string, payload: unknown) => Promise<ActionResult>

const ACTIONS_ONE_ARG: Record<string, ActionOneArg | undefined> = {
  creerEtablissement, creerContact, creerVisite, creerVisiteManquee, creerOffre,
}
const ACTIONS_TWO_ARGS: Record<string, ActionTwoArgs | undefined> = {
  mettreAJourEtablissement, supprimerEtablissement: (id) => supprimerEtablissement(id),
  mettreAJourContact, supprimerContact: (id) => supprimerContact(id),
  mettreAJourVisite,
  mettreAJourOffre, supprimerOffre: (id) => supprimerOffre(id),
}

function extraireMessageErreur(erreur: unknown): string {
  if (!erreur) return 'Erreur inconnue'
  if (typeof erreur === 'string') return erreur
  if (typeof erreur === 'object' && erreur !== null && 'message' in erreur) {
    return String((erreur as { message: unknown }).message)
  }
  return JSON.stringify(erreur)
}

async function executerAction(
  nom: NomAction,
  payload: unknown,
  cibleId: string | null,
): Promise<ActionResult> {
  const oneArg = ACTIONS_ONE_ARG[nom]
  if (oneArg) return await oneArg(payload)
  const twoArgs = ACTIONS_TWO_ARGS[nom]
  if (twoArgs) {
    if (!cibleId) return { erreur: `cible_id manquant pour ${nom}` }
    return await twoArgs(cibleId, payload)
  }
  return { erreur: `Action inconnue : ${nom}` }
}

export async function synchroniser(): Promise<RapportSync> {
  const rapport: RapportSync = { reussi: 0, echec: 0, restant: 0, erreurs: [] }
  const taches = await prochainesTaches()

  for (const t of taches) {
    const payload = JSON.parse(t.payload_json)
    const res = await executerAction(t.nom_action, payload, t.cible_id)
    if (res.erreur) {
      const msg = extraireMessageErreur(res.erreur)
      await marquerEchec(t.id!, msg)
      rapport.echec++
      rapport.erreurs.push({ id: t.id!, nom_action: t.nom_action, message: msg })
    } else {
      await marquerReussi(t.id!)
      rapport.reussi++
    }
  }

  const restantes = await prochainesTaches()
  rapport.restant = restantes.length
  return rapport
}
```

- [ ] **Lancer** les tests :

```bash
npm test src/test/lib/sync/dispatcher.test.ts
```

Résultat attendu : ~5 tests verts.

- [ ] **Committer** :

```bash
git add src/lib/sync/dispatcher.ts src/test/lib/sync/dispatcher.test.ts
git commit -m "feat(v1e): dispatcher sync — mapping action → Server Action + rapport (tache 3)"
```

**Critère de fin :** ~5 tests verts, dispatcher couvre les 12 actions.

---

## Tâche 4 — Hook `useOnline` + badge réseau

**Objectif :** Livrer `useOnline` (retourne `boolean`, s'abonne aux événements online/offline via `useSyncExternalStore`) et `<BadgeReseau />` (petit widget en tête du layout).

**Fichiers :**
- Créer : `src/hooks/use-online.ts`, `src/test/hooks/use-online.test.ts`
- Créer : `src/components/sync/badge-reseau.tsx`

**Étapes :**

- [ ] **Écrire les tests** `src/test/hooks/use-online.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useOnline } from '@/hooks/use-online'

describe('useOnline', () => {
  it("renvoie true par défaut (jsdom navigator.onLine=true)", () => {
    const { result } = renderHook(() => useOnline())
    expect(result.current).toBe(true)
  })

  it("passe à false quand event 'offline' est dispatché", () => {
    const { result } = renderHook(() => useOnline())
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      window.dispatchEvent(new Event('offline'))
    })
    expect(result.current).toBe(false)
  })

  it("repasse à true sur event 'online'", () => {
    const { result } = renderHook(() => useOnline())
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: false, configurable: true })
      window.dispatchEvent(new Event('offline'))
    })
    act(() => {
      Object.defineProperty(navigator, 'onLine', { value: true, configurable: true })
      window.dispatchEvent(new Event('online'))
    })
    expect(result.current).toBe(true)
  })
})
```

- [ ] **Écrire** `src/hooks/use-online.ts` :

```ts
'use client'

import { useSyncExternalStore } from 'react'

function subscribe(callback: () => void): () => void {
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

function getSnapshot(): boolean {
  return navigator.onLine
}

function getServerSnapshot(): boolean {
  return true
}

export function useOnline(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
```

- [ ] **Écrire** `src/components/sync/badge-reseau.tsx` :

```tsx
'use client'

import { useOnline } from '@/hooks/use-online'
import { Badge } from '@/components/ui/badge'

export function BadgeReseau() {
  const online = useOnline()
  return (
    <Badge
      className={
        online
          ? 'bg-emerald-500 hover:bg-emerald-500'
          : 'bg-red-500 hover:bg-red-500'
      }
    >
      {online ? '🟢 En ligne' : '🔴 Hors ligne'}
    </Badge>
  )
}
```

- [ ] **Lancer** les tests :

```bash
npm test src/test/hooks/use-online.test.ts
```

Résultat attendu : 3 verts.

- [ ] **Committer** :

```bash
git add src/hooks/use-online.ts src/test/hooks/use-online.test.ts src/components/sync/badge-reseau.tsx
git commit -m "feat(v1e): useOnline + BadgeReseau — détection navigator.onLine (tache 4)"
```

**Critère de fin :** hook + badge fonctionnels, 3 tests verts.

---

## Tâche 5 — Wrapper `executerAvecSync` (client)

**Objectif :** Une fonction client qui, selon l'état réseau, appelle la Server Action directement ou enqueue dans Dexie. Toast feedback.

**Fichiers :**
- Créer : `src/lib/sync/wrapper.ts`

**Étapes :**

- [ ] **Écrire** `src/lib/sync/wrapper.ts` :

```ts
'use client'

import { enqueue } from './queue'
import type { NomAction } from '@/types/sync'

interface ActionResult { data?: unknown; erreur?: unknown }

// Décide entre appel Server Action direct et enqueue.
// Signature : nomAction pour la queue, payload à sérialiser, actionServeur pour appel direct.
// Pour update/delete : cibleId est le 1er arg de actionServeur, payload = 2e arg (optionnel).
export async function executerAvecSync(
  nomAction: NomAction,
  payload: unknown,
  actionServeur: (payload: unknown) => Promise<ActionResult>,
): Promise<ActionResult & { differee?: boolean }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueue(nomAction, payload, null)
    return { data: { deferred: true }, differee: true }
  }
  try {
    const res = await actionServeur(payload)
    if (res.erreur) {
      // Erreur fonctionnelle : on ne retente PAS (validation, contrainte DB…)
      return res
    }
    return res
  } catch (e) {
    // Erreur réseau (fetch RSC échoue) : enqueue automatiquement
    await enqueue(nomAction, payload, null)
    return {
      data: { deferred: true },
      differee: true,
    }
  }
}

// Variante pour update/delete : cibleId séparé.
export async function executerAvecSyncCible(
  nomAction: NomAction,
  cibleId: string,
  payload: unknown,
  actionServeur: (id: string, payload: unknown) => Promise<ActionResult>,
): Promise<ActionResult & { differee?: boolean }> {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    await enqueue(nomAction, payload, cibleId)
    return { data: { deferred: true }, differee: true }
  }
  try {
    const res = await actionServeur(cibleId, payload)
    if (res.erreur) return res
    return res
  } catch {
    await enqueue(nomAction, payload, cibleId)
    return { data: { deferred: true }, differee: true }
  }
}
```

- [ ] **Modifier les composants clients pour utiliser le wrapper.**

Voici la liste exhaustive avec le remplacement à faire :

**`src/components/visites/formulaire-visite.tsx`** — remplacer :
```tsx
const result = await creerVisite(payload)
```
par :
```tsx
const result = await executerAvecSync('creerVisite', payload, creerVisite as never)
```
(et ajouter `import { executerAvecSync } from '@/lib/sync/wrapper'`).

**`src/components/visites/bouton-visite-manquee.tsx`** — même pattern avec `creerVisiteManquee`.

**`src/components/contacts/formulaire-contact.tsx`** — même pattern :
- création : `executerAvecSync('creerContact', payload, creerContact as never)`
- édition : `executerAvecSyncCible('mettreAJourContact', contact.id, payload, mettreAJourContact as never)`

**`src/components/contacts/onglet-contacts.tsx`** — pour la suppression :
```tsx
await executerAvecSyncCible('supprimerContact', contact.id, {}, (id) => supprimerContact(id))
```

**`src/components/etablissements/formulaire-etablissement.tsx`** — pattern identique :
- creation : `executerAvecSync('creerEtablissement', payload, creerEtablissement as never)`
- édition : `executerAvecSyncCible('mettreAJourEtablissement', initial!.id, payload, mettreAJourEtablissement as never)`

**`src/components/offres/formulaire-offre.tsx`** — pattern identique pour `creerOffre` / `mettreAJourOffre` / `supprimerOffre`.

- [ ] **Ajouter un toast simple dans chaque composant** — quand `result.differee` est true, afficher une bannière : « Enregistré localement. Synchronisation dès le retour du réseau. » (au lieu de rediriger).

Concrètement, dans chaque wrapper de submit :

```tsx
const result = await executerAvecSync('creerVisite', payload, creerVisite as never)
if ('differee' in result && result.differee) {
  setMessage('Enregistré localement. Sync en attente.')
  onSuccess()  // fermer le sheet
  return
}
if (result.erreur) {
  setErreur('Impossible d\'enregistrer.')
  return
}
onSuccess()
onOpenChange(false)
```

- [ ] **Vérifier** : `npm run type-check`, `npm test`, `npm run build`.

- [ ] **Committer** :

```bash
git add src/lib/sync/wrapper.ts src/components/visites/ src/components/contacts/ src/components/etablissements/formulaire-etablissement.tsx src/components/offres/formulaire-offre.tsx
git commit -m "feat(v1e): wrapper executerAvecSync + adoption dans les 6 formulaires mutations (tache 5)"
```

**Critère de fin :** création d'une visite avec `navigator.onLine=false` dans DevTools → item apparaît dans `db.sync_queue`. Retour online → prochaine sync la traitera.

---

## Tâche 6 — Hydratation cache lecture (write-through) + hook `useQueueCount`

**Objectif :** Composant client `<HydraterCache tables={{...}} />` qui écrit les tables reçues en background dans Dexie. Injecté dans les pages critiques (Home + fiche etab). Livrer aussi `useQueueCount` pour afficher un badge sur la nav.

**Fichiers :**
- Créer : `src/lib/sync/hydrate.ts`, `src/components/sync/hydrater-cache.tsx`
- Créer : `src/hooks/use-queue-count.ts`
- Modifier : `src/app/(app)/etablissements/page.tsx`, `src/app/(app)/etablissements/[id]/page.tsx`, `src/app/(app)/page.tsx`

**Étapes :**

- [ ] **Créer** `src/lib/sync/hydrate.ts` :

```ts
import { db } from '@/lib/db/dexie'
import type {
  Etablissement, Contact, Visite, Rappel, Tournee, Zone, Offre,
} from '@/types/database'

export interface TablesAHydrater {
  etablissements?: Etablissement[]
  contacts?:       Contact[]
  visites?:        Visite[]
  rappels?:        Rappel[]
  tournees?:       Tournee[]
  zones?:          Zone[]
  offres?:         Offre[]
}

// Écrit chaque liste dans Dexie via bulkPut (upsert). Ne supprime rien.
export async function hydraterTables(tables: TablesAHydrater): Promise<void> {
  const ops: Promise<unknown>[] = []
  if (tables.etablissements?.length) ops.push(db.etablissements.bulkPut(tables.etablissements))
  if (tables.contacts?.length)       ops.push(db.contacts.bulkPut(tables.contacts))
  if (tables.visites?.length)        ops.push(db.visites.bulkPut(tables.visites))
  if (tables.rappels?.length)        ops.push(db.rappels.bulkPut(tables.rappels))
  if (tables.tournees?.length)       ops.push(db.tournees.bulkPut(tables.tournees))
  if (tables.zones?.length)          ops.push(db.zones.bulkPut(tables.zones))
  if (tables.offres?.length)         ops.push(db.offres.bulkPut(tables.offres))
  await Promise.all(ops)
}
```

- [ ] **Créer** `src/components/sync/hydrater-cache.tsx` :

```tsx
'use client'

import { useEffect } from 'react'
import { hydraterTables, type TablesAHydrater } from '@/lib/sync/hydrate'

// Composant invisible : reçoit des tables en prop et les écrit en background dans Dexie.
export function HydraterCache({ tables }: { tables: TablesAHydrater }) {
  useEffect(() => {
    hydraterTables(tables).catch(() => {
      // Silence : pas critique si hydratation échoue.
    })
  }, [tables])
  return null
}
```

- [ ] **Créer** `src/hooks/use-queue-count.ts` :

```ts
'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/db/dexie'

export function useQueueCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function recompter() {
      const c = await db.sync_queue.where('statut').anyOf('en_attente', 'en_cours').count()
      if (!cancelled) setCount(c)
    }
    recompter()
    const interval = setInterval(recompter, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return count
}
```

- [ ] **Modifier** `src/app/(app)/etablissements/page.tsx` — injecter :

```tsx
import { HydraterCache } from '@/components/sync/hydrater-cache'
// ...
return (
  <>
    <HydraterCache tables={{ etablissements: data ?? [] }} />
    <ListeEtablissements etablissements={data ?? []} />
  </>
)
```

- [ ] **Modifier** `src/app/(app)/etablissements/[id]/page.tsx` — de même :

```tsx
<>
  <HydraterCache tables={{
    etablissements: [etabRes.data],
    contacts: contactsRes.data ?? [],
    visites: visitesRes.data ?? [],
    offres: offresRes.data ?? [],
  }} />
  <FicheEtablissement ... />
</>
```

- [ ] **Modifier** `src/app/(app)/page.tsx` — hydrater clients + prospects :

```tsx
<>
  <HydraterCache tables={{
    etablissements: [...(clients.data ?? []), ...(prospects.data ?? [])],
  }} />
  <div className="flex flex-col gap-4 px-4 py-4">
    ...
  </div>
</>
```

- [ ] **Vérifier** : `npm run type-check`, `npm run build`.

- [ ] **Committer** :

```bash
git add src/lib/sync/hydrate.ts src/components/sync/hydrater-cache.tsx src/hooks/use-queue-count.ts "src/app/(app)/etablissements/" "src/app/(app)/page.tsx"
git commit -m "feat(v1e): hydratation cache Dexie en background (home + liste + fiche) + hook useQueueCount (tache 6)"
```

**Critère de fin :** ouvrir `/etablissements` → à l'inspection DevTools > Application > IndexedDB > `crm-cyril` > `etablissements`, on voit les rows.

---

## Tâche 7 — UI globale : bouton sync manuel + modal + auto-sync + badge nav + push

**Objectif :** Boucler la sync : bouton manuel dans le layout, modal progress + rapport, auto-sync sur événement `online` + toutes les 5 min si online, badge « X en attente » sur la nav.

**Fichiers :**
- Créer : `src/components/sync/modal-sync.tsx`, `src/components/sync/bouton-sync-manuel.tsx`
- Modifier : `src/app/(app)/layout.tsx`, `src/components/layout/bottom-nav.tsx`

**Étapes :**

- [ ] **Créer** `src/components/sync/modal-sync.tsx` :

```tsx
'use client'

import { useState, useTransition, useEffect } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { synchroniser } from '@/lib/sync/dispatcher'
import type { RapportSync } from '@/types/sync'
import { useOnline } from '@/hooks/use-online'
import { useQueueCount } from '@/hooks/use-queue-count'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  autoStart?: boolean
}

export function ModalSync({ open, onOpenChange, autoStart = false }: Props) {
  const online = useOnline()
  const queueCount = useQueueCount()
  const [rapport, setRapport] = useState<RapportSync | null>(null)
  const [pending, startTransition] = useTransition()

  function lancer() {
    setRapport(null)
    startTransition(async () => {
      const r = await synchroniser()
      setRapport(r)
    })
  }

  useEffect(() => {
    if (open && autoStart && online && !pending) lancer()
    // Volontairement pas de dépendance sur pending (évite boucle)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, autoStart, online])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Synchronisation</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <p className="text-sm">
            {queueCount} opération(s) en attente ·{' '}
            {online ? '🟢 En ligne' : '🔴 Hors ligne'}
          </p>
          {pending && (
            <p className="text-center text-sm text-muted-foreground">
              Synchronisation en cours…
            </p>
          )}
          {rapport && (
            <div className="space-y-2 rounded-md border bg-muted/30 p-3 text-sm">
              <p>✓ {rapport.reussi} synchronisé(s)</p>
              <p>✗ {rapport.echec} en erreur</p>
              <p>… {rapport.restant} restant(s)</p>
              {rapport.erreurs.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs">Erreurs détaillées</summary>
                  <ul className="mt-1 space-y-1 text-xs text-destructive">
                    {rapport.erreurs.map((e) => (
                      <li key={e.id}>{e.nom_action} : {e.message}</li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button
              type="button" variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-12 flex-1"
            >
              Fermer
            </Button>
            <Button
              type="button" onClick={lancer}
              disabled={pending || !online || queueCount === 0}
              className="h-12 flex-1"
            >
              {pending ? 'Sync…' : 'Synchroniser'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
```

- [ ] **Créer** `src/components/sync/bouton-sync-manuel.tsx` :

```tsx
'use client'

import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { ModalSync } from './modal-sync'
import { useOnline } from '@/hooks/use-online'
import { useQueueCount } from '@/hooks/use-queue-count'
import { synchroniser } from '@/lib/sync/dispatcher'
import { BadgeReseau } from './badge-reseau'
import { Badge } from '@/components/ui/badge'

export function BarreSync() {
  const [open, setOpen] = useState(false)
  const [autoStart, setAutoStart] = useState(false)
  const online = useOnline()
  const queueCount = useQueueCount()
  const [dernierOnline, setDernierOnline] = useState(online)

  // Auto-sync au démarrage si online + queue non vide
  useEffect(() => {
    if (online && queueCount > 0) {
      synchroniser().catch(() => { /* silencieux */ })
    }
    // Uniquement au mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-sync quand on repasse online
  useEffect(() => {
    if (!dernierOnline && online && queueCount > 0) {
      synchroniser().catch(() => {})
    }
    setDernierOnline(online)
  }, [online, dernierOnline, queueCount])

  // Sync périodique toutes les 5 min
  useEffect(() => {
    if (!online) return
    const interval = setInterval(() => {
      synchroniser().catch(() => {})
    }, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [online])

  return (
    <div className="flex items-center gap-2 border-b bg-white/95 px-4 py-2 backdrop-blur">
      <BadgeReseau />
      {queueCount > 0 && (
        <button
          type="button"
          onClick={() => { setAutoStart(false); setOpen(true) }}
          className="tap-target flex items-center gap-1 text-xs underline"
        >
          <Badge variant="destructive">{queueCount}</Badge>
          <span>en attente — Synchroniser</span>
        </button>
      )}
      <ModalSync open={open} onOpenChange={setOpen} autoStart={autoStart} />
    </div>
  )
}
```

- [ ] **Modifier** `src/app/(app)/layout.tsx` — injecter `<BarreSync />` en tête :

```tsx
import { BottomNav } from '@/components/layout/bottom-nav'
import { BarreSync } from '@/components/sync/bouton-sync-manuel'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col safe-top">
      <BarreSync />
      <main className="flex-1 overflow-y-auto pb-24">{children}</main>
      <BottomNav />
    </div>
  )
}
```

- [ ] **Vérifier** :

```bash
npm run type-check
npm test
npm run build
```

Résultat attendu : tous verts. ~230 tests.

- [ ] **Committer** :

```bash
git add src/components/sync/modal-sync.tsx src/components/sync/bouton-sync-manuel.tsx src/app/\(app\)/layout.tsx
git commit -m "feat(v1e): barre sync (badge réseau + queue count + modal + auto-sync au mount/online/périodique) (tache 7)"
```

- [ ] **Push** :

```bash
git push origin main
```

**Critère de fin :** Vercel redéploie. Sur Android en mode Avion : créer une visite → « Enregistré localement ». Badge « 1 en attente ». Désactiver Avion → sync automatique, badge disparaît, visite visible côté Supabase.

---

## Tâche 8 — Fallback lecture offline (Client Components + Dexie)

**Objectif :** Convertir les 3 pages critiques (`/`, `/etablissements`, `/etablissements/[id]`) en Client Components qui lisent Dexie en fallback quand hors ligne ou quand la Server Action échoue. Cyril peut naviguer et consulter les fiches déjà chargées sans réseau.

**Fichiers :**
- Créer : `src/lib/sync/lecture-dexie.ts` (readers Dexie typés)
- Modifier : `src/app/(app)/page.tsx`, `src/app/(app)/etablissements/page.tsx`, `src/app/(app)/etablissements/[id]/page.tsx`

**Approche** :
- Chaque page devient un Client Component qui gère son propre chargement.
- Séquence : si `navigator.onLine` → appel Server Action + hydratation Dexie. Si offline OU si l'appel échoue → lecture Dexie.
- Bannière discrète « Données locales » quand le rendu vient de Dexie.

**Étapes :**

- [ ] **Créer** `src/lib/sync/lecture-dexie.ts` :

```ts
'use client'

import { db } from '@/lib/db/dexie'
import type { Contact, Etablissement, Offre, Visite } from '@/types/database'

export async function lireEtablissementsDexie(): Promise<Etablissement[]> {
  const all = await db.etablissements.toArray()
  return all.filter((e) => e.deleted_at === null)
}

export async function lireEtablissementDexie(id: string): Promise<Etablissement | null> {
  const e = await db.etablissements.get(id)
  return e && e.deleted_at === null ? e : null
}

export async function lireContactsDexie(etabId: string): Promise<Contact[]> {
  const all = await db.contacts.where('etablissement_id').equals(etabId).toArray()
  return all.filter((c) => c.deleted_at === null)
}

export async function lireVisitesDexie(etabId: string): Promise<Visite[]> {
  const all = await db.visites.where('etablissement_id').equals(etabId).toArray()
  return all
    .filter((v) => v.deleted_at === null)
    .sort((a, b) => b.date_visite.localeCompare(a.date_visite))
}

export async function lireOffresActivesDexie(): Promise<Offre[]> {
  const all = await db.offres.toArray()
  const jour = new Date().toISOString().slice(0, 10)
  return all.filter((o) => {
    if (o.deleted_at !== null) return false
    if (o.date_debut && jour < o.date_debut) return false
    if (o.date_fin && jour > o.date_fin) return false
    return true
  })
}
```

- [ ] **Remplacer** `src/app/(app)/etablissements/page.tsx` :

```tsx
'use client'

import { useEffect, useState } from 'react'
import { lireEtablissements } from '@/actions/etablissement'
import { ListeEtablissements } from '@/components/etablissements/liste-etablissements'
import { lireEtablissementsDexie } from '@/lib/sync/lecture-dexie'
import { hydraterTables } from '@/lib/sync/hydrate'
import { useOnline } from '@/hooks/use-online'
import type { Etablissement } from '@/types/database'

export default function EtablissementsPage() {
  const online = useOnline()
  const [data, setData] = useState<Etablissement[] | null>(null)
  const [origineLocale, setOrigineLocale] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function charger() {
      if (online) {
        try {
          const r = await lireEtablissements()
          if (cancelled) return
          if (r.data) {
            setData(r.data)
            setOrigineLocale(false)
            hydraterTables({ etablissements: r.data }).catch(() => {})
            return
          }
        } catch { /* fallback Dexie */ }
      }
      const local = await lireEtablissementsDexie()
      if (cancelled) return
      setData(local)
      setOrigineLocale(true)
    }
    charger()
    return () => { cancelled = true }
  }, [online])

  if (!data) {
    return <p className="p-6 text-sm text-muted-foreground">Chargement…</p>
  }
  return (
    <>
      {origineLocale && (
        <p className="mx-4 mt-2 rounded-md border bg-muted/30 p-2 text-center text-xs text-muted-foreground">
          📴 Données locales — dernière synchronisation
        </p>
      )}
      <ListeEtablissements etablissements={data} />
    </>
  )
}
```

- [ ] **Remplacer** `src/app/(app)/etablissements/[id]/page.tsx` :

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { lireEtablissement } from '@/actions/etablissement'
import { lireContacts } from '@/actions/contact'
import { lireVisites } from '@/actions/visite'
import { lireOffresActives } from '@/actions/offres'
import { FicheEtablissement } from '@/components/etablissements/fiche-etablissement'
import {
  lireEtablissementDexie, lireContactsDexie, lireVisitesDexie, lireOffresActivesDexie,
} from '@/lib/sync/lecture-dexie'
import { hydraterTables } from '@/lib/sync/hydrate'
import { useOnline } from '@/hooks/use-online'
import type { Contact, Etablissement, Offre, Visite } from '@/types/database'

export default function EtablissementPage() {
  const params = useParams<{ id: string }>()
  const id = params.id
  const online = useOnline()
  const [etab, setEtab] = useState<Etablissement | null | undefined>(undefined)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [visites, setVisites] = useState<Visite[]>([])
  const [offres, setOffres] = useState<Offre[]>([])
  const [origineLocale, setOrigineLocale] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function charger() {
      if (online) {
        try {
          const [e, c, v, o] = await Promise.all([
            lireEtablissement(id),
            lireContacts(id),
            lireVisites(id),
            lireOffresActives(),
          ])
          if (cancelled) return
          if (e.data) {
            setEtab(e.data)
            setContacts(c.data ?? [])
            setVisites(v.data ?? [])
            setOffres(o.data ?? [])
            setOrigineLocale(false)
            hydraterTables({
              etablissements: [e.data],
              contacts: c.data ?? [],
              visites: v.data ?? [],
              offres: o.data ?? [],
            }).catch(() => {})
            return
          }
        } catch { /* fallback Dexie */ }
      }
      const [e, c, v, o] = await Promise.all([
        lireEtablissementDexie(id),
        lireContactsDexie(id),
        lireVisitesDexie(id),
        lireOffresActivesDexie(),
      ])
      if (cancelled) return
      setEtab(e)
      setContacts(c)
      setVisites(v)
      setOffres(o)
      setOrigineLocale(true)
    }
    charger()
    return () => { cancelled = true }
  }, [id, online])

  if (etab === undefined) {
    return <p className="p-6 text-sm text-muted-foreground">Chargement…</p>
  }
  if (etab === null) {
    return (
      <p className="p-6 text-sm text-destructive">
        Établissement introuvable {origineLocale && '(cache local vide, connexion requise)'}.
      </p>
    )
  }
  return (
    <>
      {origineLocale && (
        <p className="mx-4 mt-2 rounded-md border bg-muted/30 p-2 text-center text-xs text-muted-foreground">
          📴 Données locales — dernière synchronisation
        </p>
      )}
      <FicheEtablissement
        etablissement={etab}
        contacts={contacts}
        visites={visites}
        offresActives={offres}
      />
    </>
  )
}
```

- [ ] **Remplacer** `src/app/(app)/page.tsx` (home) :

```tsx
'use client'

import { useEffect, useState } from 'react'
import { lireClientsEnRetard, lireSuggestionsProspection } from '@/actions/funnel'
import { SuggestionsAujourdhui } from '@/components/home/suggestions-aujourdhui'
import { WidgetObjectif } from '@/components/home/widget-objectif'
import { WidgetOffresAccueil } from '@/components/offres/widget-offres-accueil'
import { lireEtablissementsDexie } from '@/lib/sync/lecture-dexie'
import { hydraterTables } from '@/lib/sync/hydrate'
import { useOnline } from '@/hooks/use-online'
import { formatDateSuisse } from '@/lib/format'
import { estClient, estProspect } from '@/lib/objectif/regles'
import type { Etablissement } from '@/types/database'

export default function AccueilPage() {
  const online = useOnline()
  const [clients, setClients] = useState<Etablissement[]>([])
  const [prospects, setProspects] = useState<Etablissement[]>([])
  const [pret, setPret] = useState(false)
  const [origineLocale, setOrigineLocale] = useState(false)

  useEffect(() => {
    let cancelled = false
    async function charger() {
      if (online) {
        try {
          const [c, p] = await Promise.all([
            lireClientsEnRetard(),
            lireSuggestionsProspection(),
          ])
          if (cancelled) return
          setClients(c.data ?? [])
          setProspects(p.data ?? [])
          setOrigineLocale(false)
          setPret(true)
          hydraterTables({
            etablissements: [...(c.data ?? []), ...(p.data ?? [])],
          }).catch(() => {})
          return
        } catch { /* fallback */ }
      }
      const all = await lireEtablissementsDexie()
      if (cancelled) return
      setClients(all.filter((e) => estClient(e.statut)))
      setProspects(all.filter((e) => estProspect(e.statut)).slice(0, 10))
      setOrigineLocale(true)
      setPret(true)
    }
    charger()
    return () => { cancelled = true }
  }, [online])

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-xl font-semibold">Aujourd&apos;hui</h1>
        <p className="text-sm text-muted-foreground">
          {formatDateSuisse(new Date().toISOString())} — tes priorités du jour.
        </p>
      </header>
      {origineLocale && (
        <p className="rounded-md border bg-muted/30 p-2 text-center text-xs text-muted-foreground">
          📴 Données locales — dernière synchronisation
        </p>
      )}
      {online && <WidgetObjectif />}
      {online && <WidgetOffresAccueil />}
      {pret && (
        <SuggestionsAujourdhui clients={clients} prospects={prospects} />
      )}
    </div>
  )
}
```

Note : `WidgetObjectif` et `WidgetOffresAccueil` restent en Server Component asynchrone → ne fonctionnent pas offline. On les masque hors ligne (`{online && ...}`). Les compteurs objectif/offres reviennent au retour du réseau.

- [ ] **Vérifier** : `npm run type-check`, `npm run build`. Simuler offline : DevTools > Network > Offline → naviguer entre `/`, `/etablissements`, `/etablissements/[id]` → tout continue à s'afficher depuis Dexie.

- [ ] **Committer + push** :

```bash
git add src/lib/sync/lecture-dexie.ts "src/app/(app)/page.tsx" "src/app/(app)/etablissements/page.tsx" "src/app/(app)/etablissements/[id]/page.tsx"
git commit -m "feat(v1e): fallback lecture offline — Client Components 3 pages critiques + Dexie readers (tache 8)"
git push origin main
```

**Critère de fin :** en mode Avion, home + liste + fiche fonctionnent, bannière « 📴 Données locales » visible. Sync mutations toujours OK.

---

## Résumé V1e

| # | Tâche | Durée estimée |
|---|-------|---------------|
| 1 | Dexie v2 + `fake-indexeddb` + types sync | ~15 min |
| 2 | Queue manager (TDD) | ~20 min |
| 3 | Dispatcher + rapport (TDD) | ~25 min |
| 4 | useOnline + BadgeReseau | ~15 min |
| 5 | Wrapper client + adoption dans 6 formulaires | ~30 min |
| 6 | Hydratation cache + useQueueCount | ~20 min |
| 7 | UI barre sync + modal + auto-sync + push T7 | ~25 min |
| 8 | Fallback lecture offline (3 pages en Client) + push T8 | ~30 min |
| **Total** | | **~3h00** |

**Critère de sortie V1e** :
- **Test 1 (mutation offline)** : Chrome Android en mode Avion. Cyril crée une visite → sheet se ferme avec toast « Enregistré localement ». `db.sync_queue` a 1 entrée `en_attente`.
- **Test 2 (retour online)** : Désactiver mode Avion. Sync automatique se lance dans les 3 s. Modal peut être ouverte pour voir le rapport. Visite existe côté Supabase, `db.sync_queue` entrée passée à `reussi`.
- **Test 3 (retry)** : Simuler un échec serveur (500) → entrée passe à `en_attente` avec `tentatives=1`. Prochaine sync après 5 s. Après 3 échecs → statut `echec` définitif, visible dans le rapport détaillé.
- **Test 4 (badge nav)** : Créer 3 mutations offline → badge « 3 en attente ». Sync réussie → badge disparaît.
- **Test 5 (hydratation)** : Ouvrir `/etablissements` en ligne → 276 rows dans IndexedDB > `etablissements`. Recharger la fiche d'un client déjà consulté → contacts / visites / offres dans Dexie.
- `npm test` : 213 → ~235 verts.

---

**Deux options d'exécution :**

**1. Subagent-Driven (recommandé)** — un sous-agent par tâche, revue entre chaque, itération rapide. Lancer avec `/subagent-driven-development`.

**2. Inline** — exécution dans cette session avec `executing-plans`, checkpoints à chaque tâche.
