# V1e-horaires — Horaires d'ouverture des établissements

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à Cyril de savoir en un coup d'œil si un client est ouvert **maintenant**, quand il ouvrira **prochainement**, filtrer sa liste sur « ouverts maintenant » et importer les horaires depuis les colonnes Lundi..Dimanche de l'Excel Schenk déjà en place.

**Architecture:** Nouvelle colonne `etablissement.horaires_ouverture` en JSONB (structure `Record<JourSemaine, Creneau[] | null>`). Toute la logique métier est en fonctions pures dans `src/lib/horaires/regles.ts` (parse Excel + `estOuvertMaintenant` + `prochaineOuverture`), 100% testée sans I/O. Le parseur Excel V1a-3 est étendu pour reconnaître les colonnes jour. La fiche établissement affiche une grille 7 jours + statut temps réel via un composant client. Le formulaire d'édition offre 7 lignes × 2 créneaux avec un raccourci « Copier lundi partout ».

**Tech Stack:** Next.js 16 Server Actions, React 19, Vitest, Zod, PostgreSQL JSONB

**Décisions verrouillées** :
- **Migration 008** (007 déjà pris pour `contact.telephone_mobile`) : `horaires_ouverture JSONB`, `jours_fermeture_annuelle TEXT[]`.
- Structure JSONB : `{ lundi: [{ debut: "08:00", fin: "12:00" }, ...] | null, mardi: null (fermé), ... }`. Clé absente = pas renseigné (même effet UI que `null` = fermé, mais différenciable pour l'import).
- **Timezone Europe/Zurich** partout — réutilise `dateJourLocal` (V1c) et introduit `heureJourLocal`.
- **Formats Excel reconnus** : `8h-12h`, `8:00-12:00`, `8-12`, `8h30-12h30`, `08:00-18:00`, `Fermé`, `-`, vide. Double créneau via ` / ` : `8h-12h / 14h-18h`. Insensible casse/espaces.
- **`jours_fermeture_annuelle`** (vacances) : livré dans la structure DB mais **UI en V2**. En V1e-horaires : rempli côté import si trouvé, non éditable, ignoré par `estOuvertMaintenant` (V2 traitera).
- **Aucune modif Zod actions**. La colonne `horaires_ouverture` est optionnelle ; Zod l'ignore côté validation stricte pour ne pas casser les creations existantes.

---

## Fichiers créés / modifiés

| Fichier | Rôle |
|---------|------|
| `supabase/migrations/008_v1e_horaires.sql` | ALTER etablissement ADD horaires_ouverture JSONB + jours_fermeture_annuelle TEXT[] |
| `src/types/horaires.ts` | Types `JourSemaine`, `Creneau`, `HorairesJour`, `Horaires` |
| `src/lib/horaires/regles.ts` | Purs : `parseCreneauExcel`, `parseJourExcel`, `estOuvertMaintenant`, `prochaineOuverture`, `heureJourLocal`, `jourDeLaSemaine`, `formaterCreneau` |
| `src/test/lib/horaires/regles.test.ts` | ~20 tests |
| `src/lib/excel/mapping.ts` | Étendu : détection colonnes Lundi..Dimanche |
| `src/lib/excel/parser.ts` | Étendu : `PayloadImport.horaires_ouverture` |
| `src/actions/import.ts` | `dbPayloadEtab` inclut `horaires_ouverture` |
| `src/actions/etablissement.ts` | `mettreAJourEtablissement` accepte `horaires_ouverture` |
| `src/lib/validation/etablissement.ts` | `horaires_ouverture` optional (`z.record` custom) |
| `src/types/database.ts` | `Etablissement.horaires_ouverture` |
| `src/components/etablissements/section-horaires.tsx` | Grille 7 jours + badge temps réel (client) |
| `src/components/etablissements/fiche-etablissement.tsx` | Injection sur onglet Info |
| `src/components/etablissements/formulaire-horaires.tsx` | Édition 7 × 2 créneaux + bouton copier |
| `src/components/etablissements/formulaire-etablissement.tsx` | Section repliable "Horaires" |
| `src/components/etablissements/liste-etablissements.tsx` | Filtre "Ouvert maintenant" |
| `src/components/home/suggestions-aujourdhui.tsx` | Tri ouvert > ouvre bientôt > fermé + skip fermés (sauf si vide) |

---

## Tâche 1 — Migration 008 + Types + règles pures (TDD)

**Objectif :** Livrer la migration DB, les types partagés, et les 6 fonctions pures qui portent toute la logique horaires.

**Fichiers :**
- Créer : `supabase/migrations/008_v1e_horaires.sql`, `src/types/horaires.ts`, `src/lib/horaires/regles.ts`, `src/test/lib/horaires/regles.test.ts`
- Modifier : `src/types/database.ts`

**Étapes :**

- [ ] **Créer** `supabase/migrations/008_v1e_horaires.sql` :

```sql
-- ============================================================================
-- CRM Cyril — Migration 008 : horaires d'ouverture
-- ⚠️  À exécuter dans Supabase Dashboard > SQL Editor
-- ============================================================================

ALTER TABLE etablissement
  ADD COLUMN IF NOT EXISTS horaires_ouverture JSONB,
  ADD COLUMN IF NOT EXISTS jours_fermeture_annuelle TEXT[];
```

- [ ] **Créer** `src/types/horaires.ts` :

```ts
export type JourSemaine =
  | 'lundi' | 'mardi' | 'mercredi' | 'jeudi'
  | 'vendredi' | 'samedi' | 'dimanche'

export const JOURS: JourSemaine[] = [
  'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche',
]

export interface Creneau {
  debut: string  // format HH:MM (24h)
  fin: string
}

// null = fermé toute la journée (info explicite)
// Absent du record parent = pas renseigné
export type HorairesJour = Creneau[] | null

export type Horaires = Partial<Record<JourSemaine, HorairesJour>>
```

- [ ] **Modifier** `src/types/database.ts` — ajouter dans `Etablissement` :

```ts
horaires_ouverture: import('./horaires').Horaires | null
jours_fermeture_annuelle: string[] | null
```

Note pratique : plutôt utiliser un import direct en tête du fichier. Ajouter en tête :
```ts
import type { Horaires } from './horaires'
```
Et dans l'interface :
```ts
horaires_ouverture: Horaires | null
jours_fermeture_annuelle: string[] | null
```

- [ ] **Écrire les tests** `src/test/lib/horaires/regles.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import {
  parseCreneauExcel, parseJourExcel,
  estOuvertMaintenant, prochaineOuverture,
  heureJourLocal, jourDeLaSemaine, formaterCreneau,
} from '@/lib/horaires/regles'

describe('parseCreneauExcel', () => {
  it('parse "8h-12h"', () => {
    expect(parseCreneauExcel('8h-12h')).toEqual({ debut: '08:00', fin: '12:00' })
  })
  it('parse "8:00-12:00"', () => {
    expect(parseCreneauExcel('8:00-12:00')).toEqual({ debut: '08:00', fin: '12:00' })
  })
  it('parse "8-12" (heures pures)', () => {
    expect(parseCreneauExcel('8-12')).toEqual({ debut: '08:00', fin: '12:00' })
  })
  it('parse "8h30-12h45"', () => {
    expect(parseCreneauExcel('8h30-12h45')).toEqual({ debut: '08:30', fin: '12:45' })
  })
  it('parse "14h00-18h30" (avec 00)', () => {
    expect(parseCreneauExcel('14h00-18h30')).toEqual({ debut: '14:00', fin: '18:30' })
  })
  it('tolère espaces autour du tiret', () => {
    expect(parseCreneauExcel('8h - 12h')).toEqual({ debut: '08:00', fin: '12:00' })
  })
  it('renvoie null si non parsable', () => {
    expect(parseCreneauExcel('n\'importe quoi')).toBeNull()
    expect(parseCreneauExcel('')).toBeNull()
    expect(parseCreneauExcel('8h')).toBeNull()  // manque la fin
  })
})

describe('parseJourExcel', () => {
  it('vide ou undefined → undefined (pas renseigné)', () => {
    expect(parseJourExcel('')).toBeUndefined()
    expect(parseJourExcel(null)).toBeUndefined()
    expect(parseJourExcel(undefined)).toBeUndefined()
  })

  it('"Fermé" / "fermé" / "-" → null (fermé explicite)', () => {
    expect(parseJourExcel('Fermé')).toBeNull()
    expect(parseJourExcel('fermé')).toBeNull()
    expect(parseJourExcel('-')).toBeNull()
    expect(parseJourExcel('FERME')).toBeNull()
  })

  it('un seul créneau', () => {
    expect(parseJourExcel('8h-18h')).toEqual([{ debut: '08:00', fin: '18:00' }])
  })

  it('double créneau séparé par " / "', () => {
    expect(parseJourExcel('8h-12h / 14h-18h')).toEqual([
      { debut: '08:00', fin: '12:00' },
      { debut: '14:00', fin: '18:00' },
    ])
  })

  it('double créneau séparé par ","', () => {
    expect(parseJourExcel('8h-12h, 14h-18h')).toEqual([
      { debut: '08:00', fin: '12:00' },
      { debut: '14:00', fin: '18:00' },
    ])
  })

  it('ignore un créneau non parsable dans un double', () => {
    expect(parseJourExcel('8h-12h / n\'importe quoi')).toEqual([
      { debut: '08:00', fin: '12:00' },
    ])
  })
})

describe('heureJourLocal', () => {
  it('renvoie HH:MM Zurich pour une ISO UTC', () => {
    // 2026-07-28 12:00 UTC = 14:00 Zurich (été)
    expect(heureJourLocal('2026-07-28T12:00:00Z')).toBe('14:00')
  })
})

describe('jourDeLaSemaine', () => {
  it("renvoie 'lundi' pour un lundi", () => {
    expect(jourDeLaSemaine('2026-07-27T10:00:00Z')).toBe('lundi')
  })
  it("renvoie 'dimanche' pour un dimanche", () => {
    expect(jourDeLaSemaine('2026-07-26T10:00:00Z')).toBe('dimanche')
  })
})

describe('estOuvertMaintenant', () => {
  const NOW_LUNDI_10H = '2026-07-27T08:00:00Z'  // 10:00 Zurich, lundi

  it('renvoie false si horaires null/undefined', () => {
    expect(estOuvertMaintenant(null, NOW_LUNDI_10H)).toBe(false)
    expect(estOuvertMaintenant({}, NOW_LUNDI_10H)).toBe(false)
  })

  it('renvoie true dans le créneau du jour', () => {
    const h = { lundi: [{ debut: '08:00', fin: '18:00' }] }
    expect(estOuvertMaintenant(h, NOW_LUNDI_10H)).toBe(true)
  })

  it('renvoie false avant l\'ouverture', () => {
    const h = { lundi: [{ debut: '14:00', fin: '18:00' }] }
    expect(estOuvertMaintenant(h, NOW_LUNDI_10H)).toBe(false)
  })

  it('renvoie false pendant la pause déjeuner', () => {
    const h = {
      lundi: [
        { debut: '08:00', fin: '12:00' },
        { debut: '14:00', fin: '18:00' },
      ],
    }
    // 12:30 Zurich = 10:30 UTC été
    expect(estOuvertMaintenant(h, '2026-07-27T10:30:00Z')).toBe(false)
  })

  it('renvoie false si jour marqué fermé (null)', () => {
    const h = { lundi: null }
    expect(estOuvertMaintenant(h, NOW_LUNDI_10H)).toBe(false)
  })
})

describe('prochaineOuverture', () => {
  it("renvoie null si actuellement ouvert", () => {
    const h = { lundi: [{ debut: '08:00', fin: '18:00' }] }
    expect(prochaineOuverture(h, '2026-07-27T08:00:00Z')).toBeNull()
  })

  it("renvoie 'Ouvre à 14:00' si pause déjeuner en cours", () => {
    const h = {
      lundi: [
        { debut: '08:00', fin: '12:00' },
        { debut: '14:00', fin: '18:00' },
      ],
    }
    expect(prochaineOuverture(h, '2026-07-27T10:30:00Z'))
      .toBe('Ouvre à 14:00')
  })

  it("renvoie 'Ouvre demain à 8:00' si fermé après horaires", () => {
    const h = {
      lundi: [{ debut: '08:00', fin: '18:00' }],
      mardi:  [{ debut: '08:00', fin: '18:00' }],
    }
    // Lundi 20h Zurich = 18h UTC été
    expect(prochaineOuverture(h, '2026-07-27T18:00:00Z'))
      .toBe('Ouvre demain à 08:00')
  })

  it("renvoie 'Ouvre lundi à 8:00' si dimanche + tout fermé jusqu'à lundi", () => {
    const h = {
      lundi: [{ debut: '08:00', fin: '18:00' }],
      dimanche: null,
    }
    // Dimanche 12h Zurich = 10h UTC été
    expect(prochaineOuverture(h, '2026-07-26T10:00:00Z'))
      .toBe('Ouvre lundi à 08:00')
  })

  it("renvoie null si aucun jour de la semaine n'est renseigné", () => {
    expect(prochaineOuverture({}, '2026-07-27T08:00:00Z')).toBeNull()
    expect(prochaineOuverture(null, '2026-07-27T08:00:00Z')).toBeNull()
  })
})

describe('formaterCreneau', () => {
  it('renvoie "8h – 18h" pour créneau entier', () => {
    expect(formaterCreneau({ debut: '08:00', fin: '18:00' })).toBe('8h – 18h')
  })
  it('renvoie "8h30 – 12h45" pour minutes ≠ 00', () => {
    expect(formaterCreneau({ debut: '08:30', fin: '12:45' })).toBe('8h30 – 12h45')
  })
})
```

- [ ] **Écrire** `src/lib/horaires/regles.ts` :

```ts
import { dateJourLocal } from '@/lib/objectif/regles'
import type { Creneau, HorairesJour, Horaires, JourSemaine } from '@/types/horaires'
import { JOURS } from '@/types/horaires'

const ZONE = 'Europe/Zurich'

// ---------------------------------------------------------------------------
// Parse Excel
// ---------------------------------------------------------------------------

function normaliseHeure(brut: string): string | null {
  // Accepte "8", "8h", "8:00", "8h30", "08:30" → "HH:MM"
  const m = brut.trim().match(/^(\d{1,2})(?:h|:)?(\d{2})?$/i)
  if (!m) return null
  const h = Number(m[1])
  const mm = m[2] ? Number(m[2]) : 0
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null
  return `${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

export function parseCreneauExcel(v: string | null | undefined): Creneau | null {
  if (!v) return null
  const parts = v.trim().split(/\s*-\s*/)
  if (parts.length !== 2) return null
  const debut = normaliseHeure(parts[0])
  const fin = normaliseHeure(parts[1])
  if (!debut || !fin) return null
  return { debut, fin }
}

export function parseJourExcel(
  v: string | null | undefined,
): HorairesJour | undefined {
  if (v === null || v === undefined || String(v).trim() === '') return undefined
  const s = String(v).trim()
  const bas = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (bas === 'ferme' || bas === 'fermee' || bas === '-') return null
  // Split sur " / " ou "," pour double créneau
  const parts = s.split(/\s*[/,]\s*/)
  const creneaux: Creneau[] = []
  for (const p of parts) {
    const c = parseCreneauExcel(p)
    if (c) creneaux.push(c)
  }
  return creneaux.length > 0 ? creneaux : undefined
}

// ---------------------------------------------------------------------------
// Ouvert maintenant
// ---------------------------------------------------------------------------

export function heureJourLocal(iso: string): string {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('fr-CH', {
    timeZone: ZONE,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  return fmt.format(d).replace('.', ':')  // sécurité si fr-CH renvoie "10.30"
}

export function jourDeLaSemaine(iso: string): JourSemaine {
  const d = new Date(iso)
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    weekday: 'long',
  })
  const jourEn = fmt.format(d).toLowerCase()
  const map: Record<string, JourSemaine> = {
    monday: 'lundi', tuesday: 'mardi', wednesday: 'mercredi',
    thursday: 'jeudi', friday: 'vendredi', saturday: 'samedi', sunday: 'dimanche',
  }
  return map[jourEn]
}

function heureEnMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

export function estOuvertMaintenant(
  horaires: Horaires | null | undefined,
  iso: string = new Date().toISOString(),
): boolean {
  if (!horaires) return false
  const jour = jourDeLaSemaine(iso)
  const creneaux = horaires[jour]
  if (!creneaux || creneaux.length === 0) return false
  const now = heureEnMinutes(heureJourLocal(iso))
  return creneaux.some((c) =>
    now >= heureEnMinutes(c.debut) && now < heureEnMinutes(c.fin),
  )
}

// ---------------------------------------------------------------------------
// Prochaine ouverture
// ---------------------------------------------------------------------------

function prochainCreneauMemeJour(
  creneaux: HorairesJour,
  heureCourante: string,
): Creneau | null {
  if (!creneaux) return null
  const now = heureEnMinutes(heureCourante)
  const suivant = creneaux.find((c) => heureEnMinutes(c.debut) > now)
  return suivant ?? null
}

function libelleJour(index: number, jourActuel: JourSemaine): string {
  const jour = JOURS[index]
  if (jour === jourActuel) return "aujourd'hui"
  const jourActuelIdx = JOURS.indexOf(jourActuel)
  const delta = (index - jourActuelIdx + 7) % 7
  if (delta === 1) return 'demain'
  return jour
}

export function prochaineOuverture(
  horaires: Horaires | null | undefined,
  iso: string = new Date().toISOString(),
): string | null {
  if (!horaires) return null
  if (estOuvertMaintenant(horaires, iso)) return null

  const jourActuel = jourDeLaSemaine(iso)
  const heureCourante = heureJourLocal(iso)

  // 1. Prochain créneau aujourd'hui
  const creneauMemeJour = prochainCreneauMemeJour(horaires[jourActuel] ?? null, heureCourante)
  if (creneauMemeJour) return `Ouvre à ${creneauMemeJour.debut}`

  // 2. Chercher le prochain jour ouvert (max 7 jours)
  const idxActuel = JOURS.indexOf(jourActuel)
  for (let i = 1; i <= 7; i++) {
    const idx = (idxActuel + i) % 7
    const creneaux = horaires[JOURS[idx]]
    if (creneaux && creneaux.length > 0) {
      const label = libelleJour(idx, jourActuel)
      return `Ouvre ${label} à ${creneaux[0].debut}`
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// Formatage affichage
// ---------------------------------------------------------------------------

function formaterHeure(hhmm: string): string {
  const [h, m] = hhmm.split(':')
  const heureInt = Number(h)
  return m === '00' ? `${heureInt}h` : `${heureInt}h${m}`
}

export function formaterCreneau(c: Creneau): string {
  return `${formaterHeure(c.debut)} – ${formaterHeure(c.fin)}`
}
```

- [ ] **Lancer** les tests :

```bash
npm test src/test/lib/horaires/regles.test.ts
```

Résultat attendu : ~20 verts.

- [ ] **Committer** :

```bash
git add supabase/migrations/008_v1e_horaires.sql src/types/horaires.ts src/types/database.ts src/lib/horaires/regles.ts src/test/lib/horaires/regles.test.ts
git commit -m "feat(v1e-horaires): migration 008 + règles pures (parse Excel, ouvert maintenant, prochaine ouverture) + tests (tache 1)"
```

**Critère de fin :** ~20 tests verts, `npm run type-check` OK. Migration 008 à exécuter Supabase avant Tâche 3.

---

## Tâche 2 — Import Excel : mapping + parser étendus

**Objectif :** Étendre `detecterMapping` pour reconnaître les 7 colonnes Lundi..Dimanche, et `parseLigne` pour construire l'objet `Horaires`. `importerBatch` transmet `horaires_ouverture` à Supabase.

**Fichiers :**
- Modifier : `src/lib/excel/mapping.ts`, `src/lib/excel/parser.ts`, `src/actions/import.ts`
- Modifier : `src/test/lib/excel/mapping.test.ts`, `src/test/lib/excel/parser.test.ts`

**Étapes :**

- [ ] **Ajouter** dans `src/test/lib/excel/mapping.test.ts` (fin du fichier, avant la dernière `})`) :

```ts
describe('detecterMapping — colonnes jours (horaires)', () => {
  it('reconnaît Lundi..Dimanche', () => {
    const m = detecterMapping([
      'Nom', 'Lundi', 'Mardi', 'Mercredi',
      'Jeudi', 'Vendredi', 'Samedi', 'Dimanche',
    ])
    expect(m.jours).toEqual({
      lundi: 1, mardi: 2, mercredi: 3, jeudi: 4,
      vendredi: 5, samedi: 6, dimanche: 7,
    })
  })

  it('insensible à la casse et aux accents', () => {
    const m = detecterMapping(['LUNDI', 'mercredi'])
    expect(m.jours?.lundi).toBe(0)
    expect(m.jours?.mercredi).toBe(1)
  })

  it("aucun jour → mapping.jours = undefined", () => {
    const m = detecterMapping(['Nom', 'Ville'])
    expect(m.jours).toBeUndefined()
  })
})
```

- [ ] **Modifier** `src/lib/excel/mapping.ts` — ajouter le champ + la détection :

```ts
// En tête du fichier, après les autres imports :
import type { JourSemaine } from '@/types/horaires'
import { JOURS } from '@/types/horaires'

// Étendre Mapping :
export interface Mapping {
  // ... champs existants ...
  jours?: Partial<Record<JourSemaine, number>>
  colonnesInconnues: string[]
}

// Dans detecterMapping, AVANT le return final (juste avant l'étape 4 "colonnes inconnues") :
const jours: Partial<Record<JourSemaine, number>> = {}
for (const j of JOURS) {
  const idx = findIdx(normalises, utilises, j)
  if (idx !== undefined) {
    jours[j] = idx
    utilises.add(idx)
  }
}
if (Object.keys(jours).length > 0) mapping.jours = jours
```

- [ ] **Ajouter** dans `src/test/lib/excel/parser.test.ts` (à la fin du fichier) :

```ts
describe('parseLigne — horaires', () => {
  it("parse les colonnes jours en horaires_ouverture", () => {
    const headers = ['Nom', 'Lundi', 'Mardi', 'Mercredi']
    const m = detecterMapping(headers)
    const p = parseLigne(['Café X', '8h-18h', 'Fermé', ''], m)!
    expect(p.horaires_ouverture).toEqual({
      lundi: [{ debut: '08:00', fin: '18:00' }],
      mardi: null,
      // mercredi absent car "" → undefined → non ajouté
    })
  })

  it("horaires_ouverture = null si aucun jour reconnu", () => {
    const m = detecterMapping(['Enseigne', 'Ville'])
    const p = parseLigne(['Café Y', 'Sion'], m)!
    expect(p.horaires_ouverture).toBeNull()
  })
})
```

- [ ] **Modifier** `src/lib/excel/parser.ts` :

Ajouter en tête :
```ts
import type { Horaires, JourSemaine } from '@/types/horaires'
import { parseJourExcel } from '@/lib/horaires/regles'
```

Étendre `PayloadImport` avec :
```ts
horaires_ouverture: Horaires | null
```

Dans `parseLigne`, AVANT le `return` final, ajouter :
```ts
let horaires_ouverture: Horaires | null = null
if (mapping.jours) {
  const h: Horaires = {}
  for (const [jour, idx] of Object.entries(mapping.jours) as [JourSemaine, number][]) {
    const val = cell(row, idx)
    const parsed = parseJourExcel(val)
    if (parsed !== undefined) h[jour] = parsed
  }
  if (Object.keys(h).length > 0) horaires_ouverture = h
}
```

Et dans l'objet renvoyé, ajouter `horaires_ouverture,`.

- [ ] **Modifier** `src/actions/import.ts` — appliquer la règle **first-write-wins** :

**Règle** : si l'établissement existe déjà en BDD ET a des `horaires_ouverture` non-null → l'import NE TOUCHE PAS aux horaires (l'app est source de vérité après première saisie). Si `horaires_ouverture` est null en BDD OU si c'est un nouvel etab → l'import remplit.

Étape 1 : ajouter `horaires_ouverture` aux 2 SELECT existants dans `importerBatch` :

```ts
// SELECT dédup schenk :
.select('id, code_schenk, horaires_ouverture')

// SELECT dédup enseigne :
.select('id, enseigne, code_postal, tournee_id, horaires_ouverture')
```

Étape 2 : après les 2 SELECT, construire un index unique des horaires existants :

```ts
const horairesExistants = new Map<string, Horaires | null>()
for (const e of existantsBySchenk ?? []) {
  horairesExistants.set(e.id, (e as { horaires_ouverture: Horaires | null }).horaires_ouverture)
}
for (const e of existants ?? []) {
  horairesExistants.set(e.id, (e as { horaires_ouverture: Horaires | null }).horaires_ouverture)
}
```

Étape 3 : dans la boucle de traitement, construire `dbPayloadEtab` en respectant first-write-wins :

```ts
const dbPayloadEtab: Record<string, unknown> = {
  enseigne:            l.payload.enseigne,
  code_schenk:         l.payload.code_schenk,
  statut:              l.payload.statut,
  adresse_ligne_1:     l.payload.adresse_ligne_1,
  code_postal:         l.payload.code_postal,
  ville:               l.payload.ville,
  telephone_principal: l.payload.telephone_principal,
  telephone_mobile:    l.payload.telephone_mobile,
  email:               l.payload.email,
  groupe_prix:         l.payload.groupe_prix,
  notes_internes:      l.payload.notes_internes,
  tournee_id:          l.tourneeId,
}

// Horaires : first-write-wins.
// - Si etab existant a déjà des horaires (non-null) → ne pas les toucher
// - Sinon (nouveau OU horaires null en BDD) → écrire ceux de l'Excel
const horairesEnBDD = etabId ? horairesExistants.get(etabId) : undefined
if (!etabId || horairesEnBDD == null) {
  dbPayloadEtab.horaires_ouverture = l.payload.horaires_ouverture
}
```

Import en tête :
```ts
import type { Horaires } from '@/types/horaires'
```

Ajouter les tests dédiés dans `src/test/actions/import.test.ts` (bas de la section `describe('importerBatch — dédup par code_schenk')`) :

```ts
describe('importerBatch — first-write-wins horaires', () => {
  beforeEach(() => vi.clearAllMocks())

  it("n'écrase PAS horaires_ouverture si etab existant en a déjà", async () => {
    const horairesExistants = {
      lundi: [{ debut: '08:00', fin: '18:00' }],
    }
    const mock = mockSupabase({
      etabsBySchenk: [
        {
          id: 'e_existant', code_schenk: 'C001',
          horaires_ouverture: horairesExistants,
        },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([
      ligne('X', '1936', 't1', {
        code_schenk: 'C001',
        horaires_ouverture: {
          lundi: [{ debut: '09:00', fin: '17:00' }],  // Excel différent
        },
      }),
    ])
    expect(res.data!.etablissements.misAJour).toBe(1)
    const upd = mock.updates.find((u) => u.table === 'etablissement')!
    // La clé horaires_ouverture NE DOIT PAS être dans le payload d'update
    expect(upd.payload.horaires_ouverture).toBeUndefined()
  })

  it("écrit horaires_ouverture si etab existant a horaires null", async () => {
    const mock = mockSupabase({
      etabsBySchenk: [
        { id: 'e_existant', code_schenk: 'C001', horaires_ouverture: null },
      ],
    })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const horairesExcel = { lundi: [{ debut: '09:00', fin: '17:00' }] }
    await importerBatch([
      ligne('X', '1936', 't1', {
        code_schenk: 'C001',
        horaires_ouverture: horairesExcel,
      }),
    ])
    const upd = mock.updates.find((u) => u.table === 'etablissement')!
    expect(upd.payload.horaires_ouverture).toEqual(horairesExcel)
  })

  it("écrit horaires_ouverture pour un nouvel etab (INSERT)", async () => {
    const mock = mockSupabase({ insertedEtabId: 'e_new' })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const horairesExcel = { mardi: [{ debut: '08:00', fin: '18:00' }] }
    await importerBatch([
      ligne('Nouveau', '1936', 't1', {
        code_schenk: 'C_NEW',
        horaires_ouverture: horairesExcel,
      }),
    ])
    const ins = mock.inserts.find((i) => i.table === 'etablissement')!
    expect(ins.payload.horaires_ouverture).toEqual(horairesExcel)
  })
})
```

Étendre également `makePayload` dans le fichier de test pour accepter `horaires_ouverture: opts.horaires_ouverture ?? null`.

Étendre `MockOpts` avec `etabsBySchenk?: { ...; horaires_ouverture?: unknown }[]`. Adapter le mock pour retourner `horaires_ouverture` dans le SELECT.

- [ ] **Lancer** :

```bash
npm test src/test/lib/excel/
```

Résultat attendu : tous verts (+3 mapping, +2 parser).

- [ ] **Committer** :

```bash
git add src/lib/excel/mapping.ts src/lib/excel/parser.ts src/actions/import.ts src/test/lib/excel/
git commit -m "feat(v1e-horaires): import Excel colonnes Lundi..Dimanche → horaires_ouverture JSONB (tache 2)"
```

**Critère de fin :** import terrain sur `samples/blablabla.xlsx` remplit correctement `horaires_ouverture` pour les etabs qui ont ces colonnes.

---

## Tâche 3 — Fiche établissement : section horaires avec statut temps réel

**Objectif :** Livrer `<SectionHoraires />` (client component) qui affiche les 7 jours + un badge « 🟢 Ouvert · Ferme à 18:00 » / « 🔴 Fermé · Ouvre demain à 8:00 » calculé toutes les 60 s.

**Fichiers :**
- Créer : `src/components/etablissements/section-horaires.tsx`
- Modifier : `src/components/etablissements/fiche-etablissement.tsx`

**Étapes :**

- [ ] **Créer** `src/components/etablissements/section-horaires.tsx` :

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  estOuvertMaintenant, prochaineOuverture, formaterCreneau,
  jourDeLaSemaine,
} from '@/lib/horaires/regles'
import { JOURS } from '@/types/horaires'
import type { Horaires, JourSemaine } from '@/types/horaires'

const LIBELLES: Record<JourSemaine, string> = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi',
  vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
}

interface Props { horaires: Horaires | null }

export function SectionHoraires({ horaires }: Props) {
  const [now, setNow] = useState(() => new Date().toISOString())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date().toISOString()), 60_000)
    return () => clearInterval(id)
  }, [])

  if (!horaires || Object.keys(horaires).length === 0) return null

  const ouvert = estOuvertMaintenant(horaires, now)
  const prochaine = prochaineOuverture(horaires, now)
  const jourActuel = jourDeLaSemaine(now)

  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Horaires
        </h3>
        <Badge
          className={
            ouvert
              ? 'bg-emerald-500 hover:bg-emerald-500'
              : 'bg-slate-400 hover:bg-slate-400'
          }
        >
          {ouvert ? '🟢 Ouvert' : '🔴 Fermé'}
        </Badge>
      </div>
      {!ouvert && prochaine && (
        <p className="text-sm text-muted-foreground">{prochaine}</p>
      )}
      <ul className="divide-y text-sm">
        {JOURS.map((j) => {
          const creneaux = horaires[j]
          const estAujourdhui = j === jourActuel
          return (
            <li
              key={j}
              className={`flex items-center justify-between py-1.5 ${
                estAujourdhui ? 'font-medium' : 'text-muted-foreground'
              }`}
            >
              <span>{LIBELLES[j]}</span>
              <span>
                {creneaux === undefined
                  ? '—'
                  : creneaux === null
                    ? 'Fermé'
                    : creneaux.map(formaterCreneau).join(' · ')}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
```

- [ ] **Modifier** `src/components/etablissements/fiche-etablissement.tsx` :

En tête, ajouter :
```tsx
import { SectionHoraires } from './section-horaires'
```

Dans `TabsContent value="info"`, ajouter juste après le bloc *Notes internes* :
```tsx
<SectionHoraires horaires={etablissement.horaires_ouverture} />
```

- [ ] **Vérifier** : `npm run type-check`, ouvrir une fiche d'un établissement importé avec horaires → grille affichée, badge à jour.

- [ ] **Committer** :

```bash
git add src/components/etablissements/section-horaires.tsx src/components/etablissements/fiche-etablissement.tsx
git commit -m "feat(v1e-horaires): section horaires sur fiche + badge temps réel (refresh 60s) (tache 3)"
```

**Critère de fin :** grille 7 jours visible sur la fiche, jour actuel en gras, badge vert/gris selon ouverture.

---

## Tâche 4 — Formulaire d'édition : section horaires repliable

**Objectif :** Ajouter un `<FormulaireHoraires />` (client) réutilisable dans `formulaire-etablissement.tsx` : 7 lignes × 2 créneaux (debut, fin en `type="time"`), bouton « Copier lundi partout », checkbox « Fermé toute la journée » par ligne.

**Fichiers :**
- Créer : `src/components/etablissements/formulaire-horaires.tsx`
- Modifier : `src/components/etablissements/formulaire-etablissement.tsx`, `src/lib/validation/etablissement.ts`

**Étapes :**

- [ ] **Modifier** `src/lib/validation/etablissement.ts` — ajouter dans le schéma (avant `seuil_inactivite_mois`) :

```ts
horaires_ouverture: z.record(z.string(), z.union([
  z.array(z.object({ debut: z.string(), fin: z.string() })),
  z.null(),
])).nullable().optional(),
```

- [ ] **Créer** `src/components/etablissements/formulaire-horaires.tsx` :

```tsx
'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { JOURS } from '@/types/horaires'
import type { Horaires, JourSemaine } from '@/types/horaires'

const LIBELLES: Record<JourSemaine, string> = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi',
  vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
}

interface Props {
  value: Horaires | null
  onChange: (v: Horaires | null) => void
}

function creneauVide(): { debut: string; fin: string } {
  return { debut: '', fin: '' }
}

export function FormulaireHoraires({ value, onChange }: Props) {
  const h = value ?? {}

  function setJour(jour: JourSemaine, nouveau: Horaires[JourSemaine]) {
    const clone: Horaires = { ...h, [jour]: nouveau }
    onChange(clone)
  }

  function setCreneau(
    jour: JourSemaine, idx: number, champ: 'debut' | 'fin', v: string,
  ) {
    const creneaux = [...(h[jour] ?? [])]
    creneaux[idx] = { ...(creneaux[idx] ?? creneauVide()), [champ]: v }
    setJour(jour, creneaux)
  }

  function toggleFerme(jour: JourSemaine, ferme: boolean) {
    setJour(jour, ferme ? null : [creneauVide()])
  }

  function ajouterCreneau(jour: JourSemaine) {
    const creneaux = [...(h[jour] ?? []), creneauVide()]
    setJour(jour, creneaux)
  }

  function retirerCreneau(jour: JourSemaine, idx: number) {
    const creneaux = [...(h[jour] ?? [])]
    creneaux.splice(idx, 1)
    setJour(jour, creneaux.length > 0 ? creneaux : null)
  }

  function copierLundiPartout() {
    const source = h.lundi
    if (!source) return
    const clone: Horaires = {}
    for (const j of JOURS) clone[j] = source.map((c) => ({ ...c }))
    onChange(clone)
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        onClick={copierLundiPartout}
        disabled={!h.lundi || h.lundi.length === 0}
        className="h-10 w-full text-sm"
      >
        Copier lundi vers tous les jours
      </Button>

      <div className="space-y-3">
        {JOURS.map((jour) => {
          const creneaux = h[jour]
          const ferme = creneaux === null
          return (
            <div key={jour} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{LIBELLES[jour]}</span>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={ferme}
                    onChange={(e) => toggleFerme(jour, e.target.checked)}
                    className="size-4"
                  />
                  Fermé
                </label>
              </div>
              {!ferme && (
                <div className="mt-2 space-y-2">
                  {(creneaux ?? [creneauVide()]).map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={c.debut}
                        onChange={(e) => setCreneau(jour, idx, 'debut', e.target.value)}
                        className="h-10 flex-1 text-base"
                      />
                      <span aria-hidden>–</span>
                      <Input
                        type="time"
                        value={c.fin}
                        onChange={(e) => setCreneau(jour, idx, 'fin', e.target.value)}
                        className="h-10 flex-1 text-base"
                      />
                      {(creneaux?.length ?? 0) > 1 && (
                        <button
                          type="button"
                          onClick={() => retirerCreneau(jour, idx)}
                          className="text-xs text-muted-foreground"
                          aria-label="Retirer créneau"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {(creneaux?.length ?? 0) < 2 && (
                    <button
                      type="button"
                      onClick={() => ajouterCreneau(jour)}
                      className="text-xs underline"
                    >
                      + Ajouter un 2e créneau (pause déjeuner)
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Modifier** `src/components/etablissements/formulaire-etablissement.tsx` :

En tête :
```tsx
import { FormulaireHoraires } from './formulaire-horaires'
import type { Horaires } from '@/types/horaires'
```

Étendre `FormState` avec :
```ts
horaires_ouverture: Horaires | null
```

Dans `initFromEtab`, ajouter :
```ts
horaires_ouverture: e?.horaires_ouverture ?? null,
```

Dans `payloadFromState`, ajouter :
```ts
horaires_ouverture: s.horaires_ouverture,
```

Dans le JSX, après la section « Interne » (Horaires libre + Notes), ajouter une nouvelle `<details>` :
```tsx
<details className="rounded-md border">
  <summary className="cursor-pointer px-3 py-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
    Horaires d&apos;ouverture
  </summary>
  <div className="p-3">
    <FormulaireHoraires
      value={state.horaires_ouverture}
      onChange={(v) => set('horaires_ouverture', v)}
    />
  </div>
</details>
```

- [ ] **Vérifier** : `npm run type-check`, `npm run build`. Ouvrir `/etablissements/nouveau`, déplier la section Horaires, cocher/décocher Fermé, changer heure, cliquer *Copier lundi partout*, enregistrer → recharger la fiche → grille reflète les horaires.

- [ ] **Committer** :

```bash
git add src/components/etablissements/formulaire-horaires.tsx src/components/etablissements/formulaire-etablissement.tsx src/lib/validation/etablissement.ts
git commit -m "feat(v1e-horaires): formulaire section horaires repliable + copier lundi partout (tache 4)"
```

**Critère de fin :** Cyril peut saisir manuellement les horaires d'un client via le formulaire, ils apparaissent dans la fiche.

---

## Tâche 5 — Filtre "Ouvert maintenant" + tri Aujourd'hui + push

**Objectif :** Ajouter le filtre dans la liste, adapter le tri de la home, push.

**Fichiers :**
- Modifier : `src/components/etablissements/liste-etablissements.tsx`
- Modifier : `src/components/home/suggestions-aujourdhui.tsx`

**Étapes :**

- [ ] **Modifier** `src/components/etablissements/liste-etablissements.tsx` :

En tête ajouter :
```tsx
import { estOuvertMaintenant } from '@/lib/horaires/regles'
```

Ajouter un state :
```tsx
const [ouvertMaintenant, setOuvertMaintenant] = useState(false)
```

Dans le calcul de `filtres` (le `useMemo`), ajouter après le check `tourneeId` :
```tsx
if (ouvertMaintenant && !estOuvertMaintenant(e.horaires_ouverture ?? null)) {
  return false
}
```

Ajouter dans le JSX au-dessus de `<ul>`, sous la ligne des Select :
```tsx
<label className="flex items-center gap-2 text-xs">
  <input
    type="checkbox"
    checked={ouvertMaintenant}
    onChange={(e) => setOuvertMaintenant(e.target.checked)}
    className="size-4"
  />
  🟢 Ouvert maintenant
</label>
```

- [ ] **Modifier** `src/components/home/suggestions-aujourdhui.tsx` — enrichir le tri de la fonction `Bloc` :

En tête :
```tsx
import { estOuvertMaintenant } from '@/lib/horaires/regles'
```

Remplacer la simple map `items.slice(0, 10)` par un tri intelligent. Localiser où `items` est utilisé, remplacer le rendu de la liste par :

```tsx
function trierParOuverture(items: Etablissement[]): Etablissement[] {
  const now = new Date().toISOString()
  const score = (e: Etablissement): number => {
    if (estOuvertMaintenant(e.horaires_ouverture ?? null, now)) return 0
    // Si horaires renseignés mais fermé maintenant → 1 (ouvre bientôt)
    if (e.horaires_ouverture) return 1
    // Pas d'horaires → 2 (neutre)
    return 2
  }
  return [...items].sort((a, b) => score(a) - score(b))
}
```

Et remplacer chaque `items.slice(0, 10)` et `items.slice(0, 5)` par `trierParOuverture(items).slice(0, 10)` / `.slice(0, 5)`.

Cyril continue à voir les clients fermés (car sinon peut-être aucune suggestion), mais les ouverts remontent en tête.

- [ ] **Vérifier** :
```bash
npm run type-check
npm test
npm run build
```

- [ ] **Committer + push** :

```bash
git add src/components/etablissements/liste-etablissements.tsx src/components/home/suggestions-aujourdhui.tsx
git commit -m "feat(v1e-horaires): filtre 'Ouvert maintenant' liste + tri Aujourd'hui par ouverture (tache 5)"
git push origin main
```

- [ ] **Action externe requise** : exécuter `supabase/migrations/008_v1e_horaires.sql` dans Supabase Dashboard **avant** de tester en prod (les inserts avec `horaires_ouverture` échouent sinon).

**Critère de fin :** Vercel redéploie. Cyril active « Ouvert maintenant » dans `/etablissements` → seuls les clients ouverts en temps réel s'affichent. `/` remonte les clients ouverts en tête.

---

## Résumé V1e-horaires

| # | Tâche | Durée estimée |
|---|-------|---------------|
| 1 | Migration 008 + types + règles pures (TDD) | ~30 min |
| 2 | Import Excel (mapping + parser + importerBatch) | ~20 min |
| 3 | Fiche : section horaires + badge temps réel | ~20 min |
| 4 | Formulaire horaires 7×2 créneaux + copier lundi | ~30 min |
| 5 | Filtre liste + tri Aujourd'hui + push | ~15 min |
| **Total** | | **~1h55** |

**Critère de sortie V1e-horaires** :
- Cyril relance l'import Excel → 276 établissements récupèrent leurs horaires depuis les colonnes Lundi..Dimanche.
- Fiche d'un client : badge « 🟢 Ouvert · Ferme à 18h » ou « 🔴 Fermé · Ouvre à 14h ». Grille 7 jours, aujourd'hui en gras.
- Liste : filtre « Ouvert maintenant » réduit à ceux dont le créneau couvre l'heure actuelle Zurich.
- Home : les suggestions ouvertes remontent en tête ; les fermés restent visibles mais en bas.
- Formulaire : Cyril peut modifier horaires manuellement, cocher « Fermé », ajouter un 2e créneau (pause déjeuner), copier lundi partout.
- `npm test` : 235 → ~257 verts (+22 tests règles + ~5 tests mapping/parser).

---

**Deux options d'exécution :**

**1. Subagent-Driven (recommandé)** — un sous-agent par tâche, revue entre chaque, itération rapide. Lancer avec `/subagent-driven-development`.

**2. Inline** — exécution dans cette session avec `executing-plans`, checkpoints à chaque tâche.
