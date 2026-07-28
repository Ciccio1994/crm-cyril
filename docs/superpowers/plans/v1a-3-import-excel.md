# V1a-3 — Import Excel des clients Schenk

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à Cyril d'importer son fichier Excel Schenk (~263 clients répartis sur 18 onglets = 18 tournées) en une seule opération idempotente, avec preview, mapping automatique des colonnes, résolution des tournées, **création automatique du contact principal** et rapport final.

**Architecture:** Server-side parsing avec SheetJS. `/admin/import` = client component qui envoie le fichier à une Server Action de **preview** (parse + mapping onglet ↔ tournée BDD + comptage), puis dispatch les lignes en **batches de 30** vers une Server Action d'**import** qui insère/met à jour l'établissement (dédup par `(enseigne, code_postal, tournee_id)`), puis fait la même chose pour le contact principal (dédup par `(etablissement_id, nom_normalisé)`). La barre de progression avance batch après batch côté client. Pas de sync Google Contacts (V1 = fiche > Google Contacts). `splitContactName` (V1a-2) est réutilisé pour le prénom/nom.

**Tech Stack:** Next.js 15 Server Actions, SheetJS (`xlsx`), Supabase, Vitest, React 19 `useTransition`, Zod (schéma V1a-1)

**Sécurité :** `/admin/import` est protégée par le middleware `src/proxy.ts` existant (Supabase Auth redirige `/login` si non authentifié). Aucun ajout nécessaire.

---

## Fichiers créés / modifiés

| Fichier | Rôle |
|---------|------|
| `package.json` | Ajout `xlsx` |
| `src/lib/excel/normaliser.ts` | Helpers purs : `normaliserHeader`, `normaliserTournee`, `mapperStatut`, `mapperGroupePrix` |
| `src/lib/excel/mapping.ts` | `detecterMapping(headers)` : header index → nom du champ Etablissement |
| `src/lib/excel/parser.ts` | `parseLigne`, `parseFichier` (buffer → LigneImport[]) |
| `src/test/lib/excel/normaliser.test.ts` | Tests normalisation |
| `src/test/lib/excel/mapping.test.ts` | Tests mapping colonnes |
| `src/test/lib/excel/parser.test.ts` | Tests parsing (fixture XLSX générée in-memory) |
| `src/actions/import.ts` | `previewImport(formData)` + `importerBatch(lignes)` |
| `src/test/actions/import.test.ts` | Tests Server Actions (Supabase mocké) |
| `src/app/(app)/admin/import/page.tsx` | Server Component route |
| `src/components/import/importer-excel.tsx` | Client UI (upload → preview → progress → rapport) |
| `.gitignore` | Vérifier que `samples/` est bien listé (déjà présent ligne 47) |

---

## Tâche 1 — SheetJS + helpers de normalisation (TDD)

**Objectif :** Installer `xlsx` et livrer 4 helpers purs pour normaliser les entrées Excel (headers, noms d'onglets, statuts, groupes prix).

**Fichiers :**
- Modifier : `package.json`
- Créer : `src/lib/excel/normaliser.ts`
- Créer : `src/test/lib/excel/normaliser.test.ts`

- [ ] **Installer xlsx** :

```bash
npm install xlsx
```

- [ ] **Écrire les tests** `src/test/lib/excel/normaliser.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import {
  normaliserHeader,
  normaliserTournee,
  mapperStatut,
  mapperGroupePrix,
} from '@/lib/excel/normaliser'

describe('normaliserHeader', () => {
  it('lowercase + retire accents + trim', () => {
    expect(normaliserHeader('Enseigne')).toBe('enseigne')
    expect(normaliserHeader('  Téléphone  ')).toBe('telephone')
    expect(normaliserHeader('Code Postal')).toBe('code postal')
  })
  it('renvoie chaîne vide sur null/undefined/espaces', () => {
    expect(normaliserHeader(null)).toBe('')
    expect(normaliserHeader(undefined)).toBe('')
    expect(normaliserHeader('   ')).toBe('')
  })
})

describe('normaliserTournee', () => {
  it("Sion - Savièse et sion saviese matchent (accents + ponctuation ignorés)", () => {
    expect(normaliserTournee('Sion - Savièse')).toBe('sion saviese')
    expect(normaliserTournee('sion  saviese')).toBe('sion saviese')
  })
  it('Val d\'Anniviers gère les apostrophes', () => {
    expect(normaliserTournee("Val d'Anniviers - Chandolin - Zinal"))
      .toBe('val d anniviers chandolin zinal')
  })
})

describe('mapperStatut', () => {
  it('reconnait client actif', () => {
    expect(mapperStatut('client actif')).toBe('client_actif')
    expect(mapperStatut('actif')).toBe('client_actif')
    expect(mapperStatut('Client Actif')).toBe('client_actif')
  })
  it('reconnait prospect', () => {
    expect(mapperStatut('prospect')).toBe('prospect')
  })
  it('reconnait inactif', () => {
    expect(mapperStatut('inactif')).toBe('client_inactif')
    expect(mapperStatut('client inactif')).toBe('client_inactif')
  })
  it('défaut prospect si vide ou inconnu', () => {
    expect(mapperStatut(null)).toBe('prospect')
    expect(mapperStatut('')).toBe('prospect')
    expect(mapperStatut('bizarre')).toBe('prospect')
  })
})

describe('mapperGroupePrix', () => {
  it('uppercase les codes valides', () => {
    expect(mapperGroupePrix('horeca')).toBe('HORECA')
    expect(mapperGroupePrix('EPI')).toBe('EPI')
    expect(mapperGroupePrix('Part')).toBe('PART')
  })
  it('renvoie null si inconnu ou vide', () => {
    expect(mapperGroupePrix('inconnu')).toBeNull()
    expect(mapperGroupePrix(null)).toBeNull()
    expect(mapperGroupePrix('')).toBeNull()
  })
})
```

- [ ] **Lancer les tests** — doivent échouer (module inexistant) :

```bash
npm test src/test/lib/excel/normaliser.test.ts
```

- [ ] **Écrire** `src/lib/excel/normaliser.ts` :

```ts
import type { GroupePrix, StatutCommercial } from '@/types/database'

const GROUPES_VALIDES: GroupePrix[] = [
  'HORECA', 'PART', 'EPI', 'REVENDEURS', 'NEG', 'HORECASRB', 'HELICO',
]

export function normaliserHeader(v: string | null | undefined): string {
  if (!v) return ''
  return v
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

export function normaliserTournee(v: string): string {
  return v
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function mapperStatut(v: string | null | undefined): StatutCommercial {
  const n = normaliserHeader(v)
  if (n.includes('actif') && !n.includes('inactif')) return 'client_actif'
  if (n.includes('inactif')) return 'client_inactif'
  if (n === 'prospect') return 'prospect'
  return 'prospect'
}

export function mapperGroupePrix(v: string | null | undefined): GroupePrix | null {
  if (!v) return null
  const upper = v.toString().trim().toUpperCase()
  return (GROUPES_VALIDES as string[]).includes(upper)
    ? (upper as GroupePrix)
    : null
}
```

- [ ] **Lancer les tests** — doivent passer :

```bash
npm test src/test/lib/excel/normaliser.test.ts
```

Résultat attendu : `PASS` — 4 suites, ~12 tests verts.

- [ ] **Committer** :

```bash
git add package.json package-lock.json src/lib/excel/normaliser.ts src/test/lib/excel/normaliser.test.ts
git commit -m "feat(v1a): xlsx + helpers Excel normalisation (headers/tournées/statut/groupe prix) (tache 1)"
```

---

## Tâche 2 — Détection du mapping colonnes (TDD)

**Objectif :** À partir d'une ligne de headers Excel, retourner un objet indiquant à quelle colonne (index) trouver chaque champ BDD.

**Fichiers :**
- Créer : `src/lib/excel/mapping.ts`
- Créer : `src/test/lib/excel/mapping.test.ts`

**Point clé :** un même champ BDD peut avoir plusieurs alias en Excel (`enseigne` ↔ "Enseigne" / "Nom" / "Client" / "Raison sociale" / "Établissement"). La fonction essaie chaque alias dans l'ordre et prend le premier index trouvé.

- [ ] **Écrire les tests** `src/test/lib/excel/mapping.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { detecterMapping } from '@/lib/excel/mapping'

describe('detecterMapping', () => {
  it('reconnait Enseigne / Nom / Client comme enseigne', () => {
    expect(detecterMapping(['Enseigne', 'Ville']).enseigne).toBe(0)
    expect(detecterMapping(['Ville', 'Nom']).enseigne).toBe(1)
    expect(detecterMapping(['Client', 'Ville']).enseigne).toBe(0)
    expect(detecterMapping(['Raison sociale']).enseigne).toBe(0)
  })

  it('reconnait CP / NPA / Code postal', () => {
    expect(detecterMapping(['CP']).code_postal).toBe(0)
    expect(detecterMapping(['NPA']).code_postal).toBe(0)
    expect(detecterMapping(['Code Postal']).code_postal).toBe(0)
  })

  it('reconnait Tél / Téléphone / Fixe', () => {
    expect(detecterMapping(['Tél']).telephone_principal).toBe(0)
    expect(detecterMapping(['Fixe']).telephone_principal).toBe(0)
  })

  it('renvoie undefined pour un champ absent', () => {
    expect(detecterMapping(['Enseigne']).ville).toBeUndefined()
    expect(detecterMapping(['Enseigne']).email).toBeUndefined()
  })

  it('insensible à la casse et aux accents', () => {
    expect(detecterMapping(['ENSEIGNE', 'VILLE']).enseigne).toBe(0)
    expect(detecterMapping(['Localité']).ville).toBe(0)
  })

  it('renvoie la liste des colonnes non reconnues', () => {
    const m = detecterMapping(['Enseigne', 'ColonneBizarre', 'Ville'])
    expect(m.colonnesInconnues).toEqual(['ColonneBizarre'])
  })

  it('reconnait Contact / Représentant / Personne comme contact_nom', () => {
    expect(detecterMapping(['Contact']).contact_nom).toBe(0)
    expect(detecterMapping(['Représentant']).contact_nom).toBe(0)
    expect(detecterMapping(['Personne']).contact_nom).toBe(0)
    expect(detecterMapping(['Interlocuteur']).contact_nom).toBe(0)
  })

  it('reconnait Fonction / Poste comme contact_fonction', () => {
    expect(detecterMapping(['Fonction']).contact_fonction).toBe(0)
    expect(detecterMapping(['Poste']).contact_fonction).toBe(0)
  })

  it('reconnait Portable / Natel comme contact_telephone', () => {
    expect(detecterMapping(['Portable']).contact_telephone).toBe(0)
    expect(detecterMapping(['Natel']).contact_telephone).toBe(0)
  })

  it('reconnait Email contact comme contact_email', () => {
    expect(detecterMapping(['Email contact']).contact_email).toBe(0)
  })
})
```

- [ ] **Lancer les tests** — doivent échouer.

- [ ] **Écrire** `src/lib/excel/mapping.ts` :

```ts
import { normaliserHeader } from './normaliser'

export interface Mapping {
  enseigne?: number
  adresse_ligne_1?: number
  code_postal?: number
  ville?: number
  telephone_principal?: number
  email?: number
  groupe_prix?: number
  statut?: number
  contact_nom?: number
  contact_fonction?: number
  contact_telephone?: number
  contact_email?: number
  colonnesInconnues: string[]
}

// Alias reconnus par champ BDD (dans l'ordre de priorité)
// Note : les alias contact_* passent AVANT les alias etab_* pour que "Email contact"
// gagne sur "Email", "Portable" sur "Téléphone", etc.
const ALIASES: Record<Exclude<keyof Mapping, 'colonnesInconnues'>, string[]> = {
  enseigne: ['enseigne', 'nom', 'client', 'raison sociale', 'etablissement'],
  adresse_ligne_1: ['adresse', 'rue', 'adresse ligne 1'],
  code_postal: ['cp', 'npa', 'code postal'],
  ville: ['ville', 'localite', 'commune'],
  contact_email: ['email contact', 'mail contact', 'courriel contact'],
  contact_telephone: ['telephone contact', 'tel contact', 'portable', 'natel', 'mobile'],
  telephone_principal: ['tel', 'telephone', 'fixe', 'no tel'],
  email: ['email', 'e mail', 'mail', 'courriel'],
  groupe_prix: ['groupe prix', 'groupe de prix', 'groupe', 'prix'],
  statut: ['statut', 'etat', 'type client', 'type'],
  contact_nom: ['contact', 'nom contact', 'personne', 'personne de contact', 'interlocuteur', 'representant', 'responsable'],
  contact_fonction: ['fonction', 'poste', 'titre', 'role'],
}

export function detecterMapping(headers: (string | null | undefined)[]): Mapping {
  const normalises = headers.map((h) => normaliserHeader(h))
  const mapping: Mapping = { colonnesInconnues: [] }
  const utilises = new Set<number>()

  for (const [champ, aliases] of Object.entries(ALIASES) as [
    Exclude<keyof Mapping, 'colonnesInconnues'>,
    string[],
  ][]) {
    for (const alias of aliases) {
      const idx = normalises.findIndex((h) => h === alias)
      if (idx !== -1) {
        mapping[champ] = idx
        utilises.add(idx)
        break
      }
    }
  }

  headers.forEach((h, i) => {
    if (h && !utilises.has(i) && normalises[i] !== '') {
      mapping.colonnesInconnues.push(String(h))
    }
  })

  return mapping
}
```

- [ ] **Lancer les tests** — doivent passer.

- [ ] **Committer** :

```bash
git add src/lib/excel/mapping.ts src/test/lib/excel/mapping.test.ts
git commit -m "feat(v1a): détection du mapping colonnes Excel → champs BDD (tache 2)"
```

---

## Tâche 3 — Parser complet (parseLigne + parseFichier) (TDD)

**Objectif :** À partir d'un buffer XLSX, produire un tableau `LigneImport[]` prêt pour la Server Action d'import. Chaque `LigneImport` contient le nom d'onglet source, le n° de ligne Excel, le payload Etablissement et les colonnes inconnues.

**Fichiers :**
- Créer : `src/lib/excel/parser.ts`
- Créer : `src/test/lib/excel/parser.test.ts`

- [ ] **Écrire les tests** `src/test/lib/excel/parser.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseLigne, parseFichier } from '@/lib/excel/parser'
import { detecterMapping } from '@/lib/excel/mapping'

function buildXlsx(sheets: { nom: string; data: unknown[][] }[]): ArrayBuffer {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(s.data)
    XLSX.utils.book_append_sheet(wb, ws, s.nom)
  }
  return XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

describe('parseLigne', () => {
  const headers = ['Enseigne', 'Adresse', 'CP', 'Ville', 'Tél', 'Email', 'Statut']
  const mapping = detecterMapping(headers)

  it('convertit une ligne complète en payload', () => {
    const row = [
      'Restaurant Alpha', 'Rue X 5', '1936', 'Verbier',
      '027 771 12 34', 'info@alpha.ch', 'client actif',
    ]
    const p = parseLigne(row, mapping)!
    expect(p.enseigne).toBe('Restaurant Alpha')
    expect(p.adresse_ligne_1).toBe('Rue X 5')
    expect(p.code_postal).toBe('1936')
    expect(p.ville).toBe('Verbier')
    expect(p.telephone_principal).toBe('027 771 12 34')
    expect(p.email).toBe('info@alpha.ch')
    expect(p.statut).toBe('client_actif')
  })

  it('renvoie null si enseigne vide', () => {
    const row = ['', 'Rue X', '1936', 'Verbier', '', '', '']
    expect(parseLigne(row, mapping)).toBeNull()
  })

  it('renvoie null si ligne entièrement vide', () => {
    expect(parseLigne(['', '', '', '', '', '', ''], mapping)).toBeNull()
    expect(parseLigne([], mapping)).toBeNull()
  })

  it('champs absents → null dans le payload', () => {
    const mapMinimal = detecterMapping(['Enseigne'])
    const p = parseLigne(['Bar Beta'], mapMinimal)!
    expect(p.enseigne).toBe('Bar Beta')
    expect(p.ville).toBeNull()
    expect(p.email).toBeNull()
    expect(p.statut).toBe('prospect')
  })

  it('conserve le code postal comme string (pas de conversion en number)', () => {
    const row = ['X', 'X', 1936, 'X', '', '', '']
    expect(parseLigne(row, mapping)!.code_postal).toBe('1936')
  })
})

describe('parseFichier', () => {
  it('renvoie un objet par onglet avec ses lignes', async () => {
    const buffer = buildXlsx([
      {
        nom: 'Sion - Savièse',
        data: [
          ['Enseigne', 'Ville'],
          ['Café A', 'Sion'],
          ['Café B', 'Savièse'],
        ],
      },
      {
        nom: 'Anzère - Ayent',
        data: [
          ['Nom', 'CP', 'Ville'],
          ['Hôtel C', '1971', 'Anzère'],
        ],
      },
    ])
    const result = await parseFichier(buffer)
    expect(result).toHaveLength(2)
    expect(result[0].nomOnglet).toBe('Sion - Savièse')
    expect(result[0].lignes).toHaveLength(2)
    expect(result[0].lignes[0].payload.enseigne).toBe('Café A')
    expect(result[1].nomOnglet).toBe('Anzère - Ayent')
    expect(result[1].lignes[0].payload.code_postal).toBe('1971')
  })

  it("ignore les lignes vides mais garde le n° de ligne Excel d'origine", async () => {
    const buffer = buildXlsx([
      {
        nom: 'Sion - Savièse',
        data: [
          ['Enseigne'],
          ['Café A'],
          [''],
          ['Café B'],
        ],
      },
    ])
    const result = await parseFichier(buffer)
    expect(result[0].lignes).toHaveLength(2)
    expect(result[0].lignes[0].numeroLigneExcel).toBe(2)
    expect(result[0].lignes[1].numeroLigneExcel).toBe(4)
  })
})
```

- [ ] **Lancer les tests** — doivent échouer.

- [ ] **Écrire** `src/lib/excel/parser.ts` :

```ts
import * as XLSX from 'xlsx'
import { detecterMapping, type Mapping } from './mapping'
import { mapperGroupePrix, mapperStatut } from './normaliser'
import type { StatutCommercial } from '@/types/database'

export interface PayloadImport {
  enseigne: string
  statut: StatutCommercial
  adresse_ligne_1: string | null
  code_postal: string | null
  ville: string | null
  telephone_principal: string | null
  email: string | null
  groupe_prix: ReturnType<typeof mapperGroupePrix>
  contact_nom: string | null
  contact_fonction: string | null
  contact_telephone: string | null
  contact_email: string | null
}

export interface LigneImport {
  numeroLigneExcel: number
  payload: PayloadImport
}

export interface OngletParse {
  nomOnglet: string
  headers: string[]
  colonnesInconnues: string[]
  lignes: LigneImport[]
}

function cell(row: unknown[], idx: number | undefined): string | null {
  if (idx === undefined) return null
  const v = row[idx]
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s === '' ? null : s
}

export function parseLigne(
  row: unknown[],
  mapping: Mapping,
): PayloadImport | null {
  const enseigne = cell(row, mapping.enseigne)
  if (!enseigne) return null

  return {
    enseigne,
    statut: mapperStatut(cell(row, mapping.statut)),
    adresse_ligne_1:      cell(row, mapping.adresse_ligne_1),
    code_postal:          cell(row, mapping.code_postal),
    ville:                cell(row, mapping.ville),
    telephone_principal:  cell(row, mapping.telephone_principal),
    email:                cell(row, mapping.email),
    groupe_prix:          mapperGroupePrix(cell(row, mapping.groupe_prix)),
    contact_nom:          cell(row, mapping.contact_nom),
    contact_fonction:     cell(row, mapping.contact_fonction),
    contact_telephone:    cell(row, mapping.contact_telephone),
    contact_email:        cell(row, mapping.contact_email),
  }
}

export async function parseFichier(
  buffer: ArrayBuffer,
): Promise<OngletParse[]> {
  const wb = XLSX.read(buffer, { type: 'array' })
  const result: OngletParse[] = []

  for (const nomOnglet of wb.SheetNames) {
    const ws = wb.Sheets[nomOnglet]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
      header: 1,
      defval: null,
    })
    if (rows.length === 0) {
      result.push({ nomOnglet, headers: [], colonnesInconnues: [], lignes: [] })
      continue
    }
    const headers = (rows[0] ?? []).map((h) => String(h ?? ''))
    const mapping = detecterMapping(headers)

    const lignes: LigneImport[] = []
    for (let i = 1; i < rows.length; i++) {
      const payload = parseLigne(rows[i] ?? [], mapping)
      if (payload) {
        lignes.push({ numeroLigneExcel: i + 1, payload })
      }
    }

    result.push({
      nomOnglet,
      headers,
      colonnesInconnues: mapping.colonnesInconnues,
      lignes,
    })
  }

  return result
}
```

- [ ] **Lancer les tests** — doivent passer.

- [ ] **Committer** :

```bash
git add src/lib/excel/parser.ts src/test/lib/excel/parser.test.ts
git commit -m "feat(v1a): parseur Excel (parseLigne + parseFichier) + tests fixtures in-memory (tache 3)"
```

---

## Tâche 4 — Server Action previewImport

**Objectif :** Un endpoint (Server Action) qui reçoit le fichier, le parse, résout les tournées BDD par nom, et renvoie une preview complète prête à afficher.

**Fichiers :**
- Créer : `src/actions/import.ts`
- Créer : `src/test/actions/import.test.ts`

- [ ] **Écrire les tests** `src/test/actions/import.test.ts` (Supabase mocké) :

```ts
// @vitest-environment node
import { vi, describe, it, expect, beforeEach } from 'vitest'
import * as XLSX from 'xlsx'

vi.mock('@/lib/supabase/server')

import { previewImport } from '@/actions/import'
import { createClient } from '@/lib/supabase/server'

function buildFormData(sheets: { nom: string; data: unknown[][] }[]): FormData {
  const wb = XLSX.utils.book_new()
  for (const s of sheets) {
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(s.data), s.nom)
  }
  const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const fd = new FormData()
  fd.append('fichier', blob, 'test.xlsx')
  return fd
}

function mockTournees(tournees: { id: string; nom: string }[]) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    is:     vi.fn().mockResolvedValue({ data: tournees, error: null }),
  }
  return { from: vi.fn().mockReturnValue(chain) }
}

describe('previewImport', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renvoie un onglet par sheet avec tournée résolue par nom normalisé', async () => {
    const supabase = mockTournees([
      { id: 't1', nom: 'Sion - Savièse' },
      { id: 't2', nom: 'Anzère - Ayent' },
    ])
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const fd = buildFormData([
      { nom: 'Sion - Savièse', data: [['Enseigne'], ['Alpha']] },
      { nom: 'ANZERE - AYENT', data: [['Enseigne'], ['Beta'], ['Gamma']] },
    ])
    const res = await previewImport(fd)
    expect(res.erreur).toBeUndefined()
    expect(res.data!.onglets).toHaveLength(2)
    expect(res.data!.onglets[0].tourneeId).toBe('t1')
    expect(res.data!.onglets[1].tourneeId).toBe('t2')
    expect(res.data!.onglets[1].nbLignes).toBe(2)
    expect(res.data!.totalLignes).toBe(3)
  })

  it('marque tourneeId=null si aucun match', async () => {
    const supabase = mockTournees([{ id: 't1', nom: 'Sion - Savièse' }])
    vi.mocked(createClient).mockResolvedValue(supabase as never)

    const fd = buildFormData([
      { nom: 'Onglet Fantôme', data: [['Enseigne'], ['X']] },
    ])
    const res = await previewImport(fd)
    expect(res.data!.onglets[0].tourneeId).toBeNull()
    expect(res.data!.onglets[0].motifNonAssociee).toContain('Fantôme')
  })

  it('renvoie erreur si pas de fichier', async () => {
    const supabase = mockTournees([])
    vi.mocked(createClient).mockResolvedValue(supabase as never)
    const fd = new FormData()
    const res = await previewImport(fd)
    expect(res.erreur).toBeDefined()
  })
})
```

- [ ] **Lancer les tests** — doivent échouer.

- [ ] **Écrire** `src/actions/import.ts` (partie preview uniquement, l'import batch arrive en T5) :

```ts
'use server'

import { createClient } from '@/lib/supabase/server'
import { parseFichier, type LigneImport } from '@/lib/excel/parser'
import { normaliserTournee } from '@/lib/excel/normaliser'

export interface OngletPreview {
  nomOnglet: string
  tourneeId: string | null
  tourneeDb: string | null
  motifNonAssociee?: string
  nbLignes: number
  colonnesInconnues: string[]
  lignes: LigneImport[]
}

export interface PreviewImport {
  onglets: OngletPreview[]
  totalLignes: number
}

type ActionResult<T> = { data?: T; erreur?: string }

export async function previewImport(
  formData: FormData,
): Promise<ActionResult<PreviewImport>> {
  const fichier = formData.get('fichier')
  if (!(fichier instanceof Blob) || fichier.size === 0) {
    return { erreur: 'Aucun fichier reçu' }
  }

  const buffer = await fichier.arrayBuffer()
  const onglets = await parseFichier(buffer)

  const supabase = await createClient()
  const { data: tourneesDb, error } = await supabase
    .from('tournee')
    .select('id, nom')
    .is('deleted_at', null)
  if (error) return { erreur: `Erreur BDD tournées : ${error.message}` }

  const index = new Map<string, { id: string; nom: string }>()
  for (const t of tourneesDb ?? []) {
    index.set(normaliserTournee(t.nom), { id: t.id, nom: t.nom })
  }

  let totalLignes = 0
  const previews: OngletPreview[] = onglets.map((o) => {
    const cle = normaliserTournee(o.nomOnglet)
    const match = index.get(cle) ?? null
    totalLignes += o.lignes.length
    return {
      nomOnglet: o.nomOnglet,
      tourneeId: match?.id ?? null,
      tourneeDb: match?.nom ?? null,
      motifNonAssociee: match
        ? undefined
        : `Onglet "${o.nomOnglet}" — aucune tournée BDD correspondante`,
      nbLignes: o.lignes.length,
      colonnesInconnues: o.colonnesInconnues,
      lignes: o.lignes,
    }
  })

  return { data: { onglets: previews, totalLignes } }
}
```

- [ ] **Lancer les tests** — doivent passer.

- [ ] **Committer** :

```bash
git add src/actions/import.ts src/test/actions/import.test.ts
git commit -m "feat(v1a): Server Action previewImport — parse XLSX + résolution tournées BDD (tache 4)"
```

---

## Tâche 5 — Server Action importerBatch (établissements + contacts avec dédup)

**Objectif :** Un endpoint qui reçoit un batch de lignes, fait le dédup contre la DB par `(enseigne, cp, tournée)` pour les établissements et par `(etablissement_id, nom_normalisé)` pour les contacts, insère/met à jour les deux, et retourne un rapport séparant les compteurs.

**Fichiers :**
- Modifier : `src/actions/import.ts`
- Modifier : `src/test/actions/import.test.ts`

**Règles contact principal :**
- Si `contact_nom` présent → split via `splitContactName` (V1a-2), on garde nom + prenom.
- `telephone` du contact = `contact_telephone` OU `telephone_principal` de l'établissement (fallback).
- `email` du contact = `contact_email` OU `email` de l'établissement (fallback).
- `est_principal` = true systématiquement.
- Dédup : deux contacts sont "les mêmes" si `etablissement_id` identique et `normaliserHeader(nom)` identique.

- [ ] **Ajouter les tests** en bas de `src/test/actions/import.test.ts` :

```ts
// Ajouter en haut :
// import { importerBatch } from '@/actions/import'

describe('importerBatch', () => {
  beforeEach(() => vi.clearAllMocks())

  function ligne(
    enseigne: string,
    cp: string | null,
    tourneeId: string,
    opts: Partial<{ contact_nom: string; contact_telephone: string; contact_email: string; contact_fonction: string; telephone_principal: string; email: string }> = {},
  ) {
    return {
      tourneeId,
      numeroLigneExcel: 2,
      nomOnglet: 'T',
      payload: {
        enseigne,
        statut: 'prospect' as const,
        adresse_ligne_1: null,
        code_postal: cp,
        ville: null,
        telephone_principal: opts.telephone_principal ?? null,
        email: opts.email ?? null,
        groupe_prix: null,
        contact_nom: opts.contact_nom ?? null,
        contact_fonction: opts.contact_fonction ?? null,
        contact_telephone: opts.contact_telephone ?? null,
        contact_email: opts.contact_email ?? null,
      },
    }
  }

  interface MockOpts {
    etabs?: { id: string; enseigne: string; code_postal: string | null; tournee_id: string }[]
    contacts?: { id: string; etablissement_id: string; nom: string }[]
    insertedEtabId?: string
  }

  function mockSupabase(opts: MockOpts = {}) {
    const etabs = opts.etabs ?? []
    const contacts = opts.contacts ?? []
    const insertedEtabId = opts.insertedEtabId ?? 'new_etab'

    const inserts: unknown[] = []
    const updates: { table: string; payload: unknown; id: string }[] = []

    function selectEtabsChain() {
      return {
        select: vi.fn().mockReturnThis(),
        is:     vi.fn().mockReturnThis(),
        in:     vi.fn().mockResolvedValue({ data: etabs, error: null }),
      }
    }
    function selectContactsChain() {
      return {
        select: vi.fn().mockReturnThis(),
        is:     vi.fn().mockReturnThis(),
        in:     vi.fn().mockResolvedValue({ data: contacts, error: null }),
      }
    }
    function insertEtabChain() {
      return {
        insert: vi.fn().mockImplementation((p: unknown) => {
          inserts.push({ table: 'etablissement', payload: p })
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: { id: insertedEtabId }, error: null,
            }),
          }
        }),
      }
    }
    function insertContactChain() {
      return {
        insert: vi.fn().mockImplementation((p: unknown) => {
          inserts.push({ table: 'contact', payload: p })
          return {
            select: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({ data: { id: 'new_c' }, error: null }),
          }
        }),
      }
    }
    function updateChain(table: string) {
      return {
        update: vi.fn().mockImplementation((p: unknown) => ({
          eq: vi.fn().mockImplementation((_col: string, id: string) => {
            updates.push({ table, payload: p, id })
            return Promise.resolve({ data: null, error: null })
          }),
        })),
      }
    }

    let call = 0
    return {
      supabase: {
        from: vi.fn().mockImplementation((table: string) => {
          call++
          if (table === 'etablissement') {
            // 1er appel = SELECT existants ; ensuite = INSERT ou UPDATE
            if (call === 1) return selectEtabsChain()
            return {
              ...insertEtabChain(),
              ...updateChain('etablissement'),
            }
          }
          if (table === 'contact') {
            // 1er appel table contact = SELECT existants ; ensuite = INSERT ou UPDATE
            const contactCallsBefore = updates.filter(u => u.table === 'contact').length
              + inserts.filter(i => (i as { table: string }).table === 'contact').length
            if (contactCallsBefore === 0) {
              return selectContactsChain()
            }
            return {
              ...insertContactChain(),
              ...updateChain('contact'),
            }
          }
          return {}
        }),
      },
      inserts,
      updates,
    }
  }

  it('crée établissement + contact si les deux sont neufs', async () => {
    const mock = mockSupabase({ insertedEtabId: 'e_new' })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([
      ligne('Alpha', '1936', 't1', {
        contact_nom: 'Jean Dupont',
        contact_fonction: 'Sommelier',
        telephone_principal: '+41 27 000',
      }),
    ])
    expect(res.data!.etablissements.crees).toBe(1)
    expect(res.data!.contacts.crees).toBe(1)
    const insertContact = mock.inserts.find((i) => (i as { table: string }).table === 'contact')
    expect(insertContact).toBeDefined()
    const p = (insertContact as { payload: Record<string, unknown> }).payload
    expect(p.etablissement_id).toBe('e_new')
    expect(p.nom).toBe('Dupont')
    expect(p.prenom).toBe('Jean')
    expect(p.fonction).toBe('Sommelier')
    expect(p.est_principal).toBe(true)
    // Fallback tel : contact_telephone absent → utilise telephone_principal
    expect(p.telephone).toBe('+41 27 000')
  })

  it('met à jour établissement + contact si les deux existent (idempotence)', async () => {
    const mock = mockSupabase({
      etabs: [{ id: 'e1', enseigne: 'Alpha', code_postal: '1936', tournee_id: 't1' }],
      contacts: [{ id: 'c1', etablissement_id: 'e1', nom: 'Dupont' }],
    })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([
      ligne('Alpha', '1936', 't1', { contact_nom: 'Jean Dupont' }),
    ])
    expect(res.data!.etablissements.misAJour).toBe(1)
    expect(res.data!.contacts.misAJour).toBe(1)
    expect(mock.updates.some((u) => u.table === 'contact' && u.id === 'c1')).toBe(true)
  })

  it("ne crée pas de contact si contact_nom absent", async () => {
    const mock = mockSupabase({ insertedEtabId: 'e_new' })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([ligne('Alpha', '1936', 't1')])
    expect(res.data!.etablissements.crees).toBe(1)
    expect(res.data!.contacts.crees).toBe(0)
  })

  it('cas insensible casse/accents sur enseigne (dédup établissement)', async () => {
    const mock = mockSupabase({
      etabs: [{ id: 'e1', enseigne: 'Café Alpha', code_postal: '1936', tournee_id: 't1' }],
    })
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const res = await importerBatch([ligne('CAFE ALPHA', '1936', 't1')])
    expect(res.data!.etablissements.misAJour).toBe(1)
  })

  it('ignore une ligne sans tournée', async () => {
    const mock = mockSupabase({})
    vi.mocked(createClient).mockResolvedValue(mock.supabase as never)
    const l = ligne('Alpha', '1936', '')
    l.tourneeId = ''
    const res = await importerBatch([l])
    expect(res.data!.etablissements.ignores).toBe(1)
    expect(res.data!.etablissements.crees).toBe(0)
    expect(res.data!.contacts.crees).toBe(0)
  })
})
```

- [ ] **Lancer les tests** — doivent échouer.

- [ ] **Ajouter à** `src/actions/import.ts` :

```ts
import { normaliserHeader } from '@/lib/excel/normaliser'
import { splitContactName } from '@/lib/contact-picker'
import type { PayloadImport } from '@/lib/excel/parser'

export interface LigneAImporter {
  tourneeId: string
  numeroLigneExcel: number
  nomOnglet: string
  payload: PayloadImport
}

export interface RapportImport {
  etablissements: { crees: number; misAJour: number; ignores: number }
  contacts:       { crees: number; misAJour: number }
  erreurs: { onglet: string; ligne: number; message: string }[]
}

function cleDedup(enseigne: string, cp: string | null): string {
  return `${normaliserHeader(enseigne)}|${cp ?? ''}`
}

function construireContactPayload(
  etablissementId: string,
  p: PayloadImport,
): { nom: string; prenom: string | null; fonction: string | null; telephone: string | null; email: string | null; etablissement_id: string; est_principal: boolean } | null {
  if (!p.contact_nom) return null
  const { prenom, nom } = splitContactName(p.contact_nom)
  return {
    etablissement_id: etablissementId,
    nom: nom ?? p.contact_nom,
    prenom: prenom ?? null,
    fonction: p.contact_fonction,
    telephone: p.contact_telephone ?? p.telephone_principal,
    email:     p.contact_email     ?? p.email,
    est_principal: true,
  }
}

export async function importerBatch(
  lignes: LigneAImporter[],
): Promise<ActionResult<RapportImport>> {
  const rapport: RapportImport = {
    etablissements: { crees: 0, misAJour: 0, ignores: 0 },
    contacts:       { crees: 0, misAJour: 0 },
    erreurs: [],
  }
  if (lignes.length === 0) return { data: rapport }

  const supabase = await createClient()

  const tourneeIds = Array.from(
    new Set(lignes.map((l) => l.tourneeId).filter(Boolean)),
  )
  if (tourneeIds.length === 0) {
    rapport.etablissements.ignores = lignes.length
    return { data: rapport }
  }

  // Étape 1 : dédup index établissements
  const { data: existantsEtabs, error: errE } = await supabase
    .from('etablissement')
    .select('id, enseigne, code_postal, tournee_id')
    .is('deleted_at', null)
    .in('tournee_id', tourneeIds)
  if (errE) return { erreur: `Erreur lecture etabs : ${errE.message}` }

  const indexEtab = new Map<string, string>()
  for (const e of existantsEtabs ?? []) {
    indexEtab.set(
      `${e.tournee_id}::${cleDedup(e.enseigne, e.code_postal)}`,
      e.id,
    )
  }

  // Étape 2 : dédup index contacts (pour les etabs existants)
  const etabIdsConnus = Array.from(new Set((existantsEtabs ?? []).map((e) => e.id)))
  const { data: existantsContacts, error: errC } = etabIdsConnus.length
    ? await supabase
        .from('contact')
        .select('id, etablissement_id, nom')
        .is('deleted_at', null)
        .in('etablissement_id', etabIdsConnus)
    : { data: [], error: null }
  if (errC) return { erreur: `Erreur lecture contacts : ${errC.message}` }

  const indexContact = new Map<string, string>()
  for (const c of existantsContacts ?? []) {
    indexContact.set(
      `${c.etablissement_id}::${normaliserHeader(c.nom)}`,
      c.id,
    )
  }

  // Étape 3 : traitement ligne par ligne
  for (const l of lignes) {
    if (!l.tourneeId) {
      rapport.etablissements.ignores++
      continue
    }
    const cleEtab = `${l.tourneeId}::${cleDedup(l.payload.enseigne, l.payload.code_postal)}`
    let etabId: string | null = indexEtab.get(cleEtab) ?? null

    const dbPayloadEtab = {
      enseigne:            l.payload.enseigne,
      statut:              l.payload.statut,
      adresse_ligne_1:     l.payload.adresse_ligne_1,
      code_postal:         l.payload.code_postal,
      ville:               l.payload.ville,
      telephone_principal: l.payload.telephone_principal,
      email:               l.payload.email,
      groupe_prix:         l.payload.groupe_prix,
      tournee_id:          l.tourneeId,
    }

    try {
      if (etabId) {
        const { error: upErr } = await supabase
          .from('etablissement')
          .update(dbPayloadEtab)
          .eq('id', etabId)
        if (upErr) throw new Error(`etab update: ${upErr.message}`)
        rapport.etablissements.misAJour++
      } else {
        const { data: newE, error: insErr } = await supabase
          .from('etablissement')
          .insert(dbPayloadEtab)
          .select()
          .single()
        if (insErr || !newE) throw new Error(`etab insert: ${insErr?.message ?? 'no data'}`)
        etabId = newE.id
        indexEtab.set(cleEtab, etabId)
        rapport.etablissements.crees++
      }
    } catch (e) {
      rapport.erreurs.push({
        onglet: l.nomOnglet,
        ligne: l.numeroLigneExcel,
        message: e instanceof Error ? e.message : 'Erreur inconnue',
      })
      continue
    }

    // Contact principal (optionnel)
    const contactPayload = construireContactPayload(etabId, l.payload)
    if (!contactPayload) continue

    const cleContact = `${etabId}::${normaliserHeader(contactPayload.nom)}`
    const contactExistantId = indexContact.get(cleContact)

    try {
      if (contactExistantId) {
        const { error: upErr } = await supabase
          .from('contact')
          .update(contactPayload)
          .eq('id', contactExistantId)
        if (upErr) throw new Error(`contact update: ${upErr.message}`)
        rapport.contacts.misAJour++
      } else {
        const { data: newC, error: insErr } = await supabase
          .from('contact')
          .insert(contactPayload)
          .select()
          .single()
        if (insErr || !newC) throw new Error(`contact insert: ${insErr?.message ?? 'no data'}`)
        indexContact.set(cleContact, newC.id)
        rapport.contacts.crees++
      }
    } catch (e) {
      rapport.erreurs.push({
        onglet: l.nomOnglet,
        ligne: l.numeroLigneExcel,
        message: e instanceof Error ? e.message : 'Erreur contact inconnue',
      })
    }
  }

  return { data: rapport }
}
```

- [ ] **Lancer les tests** — doivent passer.

- [ ] **Committer** :

```bash
git add src/actions/import.ts src/test/actions/import.test.ts
git commit -m "feat(v1a): Server Action importerBatch — établissements + contacts avec dédup (tache 5)"
```

---

## Tâche 6 — Route /admin/import + composant client (upload → preview)

**Objectif :** UI d'accueil de l'import : file input, upload → previewImport, affichage tableau preview.

**Fichiers :**
- Créer : `src/app/(app)/admin/import/page.tsx`
- Créer : `src/components/import/importer-excel.tsx`

- [ ] **Créer** `src/app/(app)/admin/import/page.tsx` :

```tsx
import { ImporterExcel } from '@/components/import/importer-excel'

export default function AdminImportPage() {
  return <ImporterExcel />
}
```

- [ ] **Créer** `src/components/import/importer-excel.tsx` (partie 1/2 : upload + preview — l'import batch et le rapport arrivent en T7) :

```tsx
'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { previewImport, type PreviewImport } from '@/actions/import'

type Etape = 'idle' | 'uploading' | 'preview' | 'importing' | 'done'

export function ImporterExcel() {
  const [etape, setEtape] = useState<Etape>('idle')
  const [preview, setPreview] = useState<PreviewImport | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setErreur(null)
    setEtape('uploading')
    const fd = new FormData()
    fd.append('fichier', file)
    startTransition(async () => {
      const r = await previewImport(fd)
      if (r.erreur || !r.data) {
        setErreur(r.erreur ?? 'Erreur inconnue')
        setEtape('idle')
        return
      }
      setPreview(r.data)
      setEtape('preview')
    })
  }

  function reset() {
    setEtape('idle')
    setPreview(null)
    setErreur(null)
  }

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-xl font-semibold">Import Excel Schenk</h1>
        <p className="text-sm text-muted-foreground">
          Chaque onglet = une tournée. Les doublons sont fusionnés
          par enseigne + code postal + tournée.
        </p>
      </header>

      {(etape === 'idle' || etape === 'uploading') && (
        <label className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-4 text-center">
          <span aria-hidden className="text-3xl">📄</span>
          <span className="text-sm font-medium">
            {pending ? 'Analyse en cours…' : 'Sélectionner un fichier .xlsx'}
          </span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onFileChange}
            disabled={pending}
            className="sr-only"
          />
        </label>
      )}

      {erreur && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {erreur}
        </p>
      )}

      {etape === 'preview' && preview && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">
              Aperçu ({preview.totalLignes} lignes / {preview.onglets.length} onglets)
            </h2>
            <Button type="button" variant="outline" onClick={reset}>
              Choisir un autre fichier
            </Button>
          </div>
          <ul className="divide-y">
            {preview.onglets.map((o) => (
              <li key={o.nomOnglet} className="py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{o.nomOnglet}</p>
                    <p className="text-xs text-muted-foreground">
                      → {o.tourneeDb ?? 'aucune tournée associée'}
                    </p>
                    {o.colonnesInconnues.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Colonnes ignorées : {o.colonnesInconnues.join(', ')}
                      </p>
                    )}
                  </div>
                  {o.tourneeId ? (
                    <Badge variant="secondary">{o.nbLignes} lignes</Badge>
                  ) : (
                    <Badge variant="destructive">Ignoré</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Button type="button" disabled className="mt-4 h-12 w-full text-base">
            Lancer l&apos;import (branché en T7)
          </Button>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Lancer** `npm run dev` puis naviguer vers `/admin/import`, uploader `samples/blablabla.xlsx`, vérifier :
  - preview s'affiche
  - 18 onglets listés
  - chaque onglet a bien une tournée BDD associée (aucun "Ignoré" si les noms Excel correspondent aux 18 tournées seed)

- [ ] **Committer** :

```bash
git add "src/app/(app)/admin/import/page.tsx" src/components/import/importer-excel.tsx
git commit -m "feat(v1a): route /admin/import + composant upload/preview (tache 6)"
```

---

## Tâche 7 — Import batches + barre de progression + rapport final

**Objectif :** Depuis la preview, brancher un bouton "Lancer l'import" qui découpe les lignes en batches de 30, les envoie séquentiellement à `importerBatch`, met à jour une barre de progression, et affiche le rapport final.

**Fichiers :**
- Modifier : `src/components/import/importer-excel.tsx`

- [ ] **Remplacer le bloc preview** (le bouton final actuellement disabled) par la version complète :

```tsx
'use client'

import { useCallback, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  previewImport,
  importerBatch,
  type PreviewImport,
  type LigneAImporter,
  type RapportImport,
} from '@/actions/import'

type Etape = 'idle' | 'uploading' | 'preview' | 'importing' | 'done'
const TAILLE_BATCH = 30

export function ImporterExcel() {
  const [etape, setEtape] = useState<Etape>('idle')
  const [preview, setPreview] = useState<PreviewImport | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [progressionActuelle, setProgressionActuelle] = useState(0)
  const [progressionTotal, setProgressionTotal] = useState(0)
  const [rapport, setRapport] = useState<RapportImport | null>(null)

  const onFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setErreur(null)
    setRapport(null)
    setEtape('uploading')
    const fd = new FormData()
    fd.append('fichier', file)
    startTransition(async () => {
      const r = await previewImport(fd)
      if (r.erreur || !r.data) {
        setErreur(r.erreur ?? 'Erreur inconnue')
        setEtape('idle')
        return
      }
      setPreview(r.data)
      setEtape('preview')
    })
  }, [])

  function reset() {
    setEtape('idle')
    setPreview(null)
    setErreur(null)
    setRapport(null)
    setProgressionActuelle(0)
    setProgressionTotal(0)
  }

  async function lancerImport() {
    if (!preview) return
    const aImporter: LigneAImporter[] = preview.onglets.flatMap((o) =>
      o.tourneeId
        ? o.lignes.map((l) => ({
            tourneeId: o.tourneeId!,
            numeroLigneExcel: l.numeroLigneExcel,
            nomOnglet: o.nomOnglet,
            payload: l.payload,
          }))
        : [],
    )
    setEtape('importing')
    setProgressionTotal(aImporter.length)
    setProgressionActuelle(0)
    const cumule: RapportImport = {
      etablissements: { crees: 0, misAJour: 0, ignores: 0 },
      contacts:       { crees: 0, misAJour: 0 },
      erreurs: [],
    }

    for (let i = 0; i < aImporter.length; i += TAILLE_BATCH) {
      const batch = aImporter.slice(i, i + TAILLE_BATCH)
      const r = await importerBatch(batch)
      if (r.data) {
        cumule.etablissements.crees    += r.data.etablissements.crees
        cumule.etablissements.misAJour += r.data.etablissements.misAJour
        cumule.etablissements.ignores  += r.data.etablissements.ignores
        cumule.contacts.crees          += r.data.contacts.crees
        cumule.contacts.misAJour       += r.data.contacts.misAJour
        cumule.erreurs.push(...r.data.erreurs)
      } else if (r.erreur) {
        cumule.erreurs.push({
          onglet: '(batch)',
          ligne: i,
          message: r.erreur,
        })
      }
      setProgressionActuelle(Math.min(i + batch.length, aImporter.length))
    }

    setRapport(cumule)
    setEtape('done')
  }

  const pct =
    progressionTotal > 0
      ? Math.round((progressionActuelle / progressionTotal) * 100)
      : 0

  return (
    <div className="flex flex-col gap-4 px-4 py-6">
      <header>
        <h1 className="text-xl font-semibold">Import Excel Schenk</h1>
        <p className="text-sm text-muted-foreground">
          Chaque onglet = une tournée. Les doublons sont fusionnés par
          enseigne + code postal + tournée.
        </p>
      </header>

      {(etape === 'idle' || etape === 'uploading') && (
        <label className="flex h-40 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/30 p-4 text-center">
          <span aria-hidden className="text-3xl">📄</span>
          <span className="text-sm font-medium">
            {pending ? 'Analyse en cours…' : 'Sélectionner un fichier .xlsx'}
          </span>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={onFileChange}
            disabled={pending}
            className="sr-only"
          />
        </label>
      )}

      {erreur && (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {erreur}
        </p>
      )}

      {etape === 'preview' && preview && (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-semibold">
              Aperçu ({preview.totalLignes} lignes / {preview.onglets.length} onglets)
            </h2>
            <Button type="button" variant="outline" onClick={reset}>
              Autre fichier
            </Button>
          </div>
          <ul className="divide-y">
            {preview.onglets.map((o) => (
              <li key={o.nomOnglet} className="py-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{o.nomOnglet}</p>
                    <p className="text-xs text-muted-foreground">
                      → {o.tourneeDb ?? 'aucune tournée associée'}
                    </p>
                    {o.colonnesInconnues.length > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Colonnes ignorées : {o.colonnesInconnues.join(', ')}
                      </p>
                    )}
                  </div>
                  {o.tourneeId ? (
                    <Badge variant="secondary">{o.nbLignes} lignes</Badge>
                  ) : (
                    <Badge variant="destructive">Ignoré</Badge>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Button
            type="button"
            onClick={lancerImport}
            className="mt-4 h-12 w-full text-base"
          >
            Lancer l&apos;import de {preview.totalLignes} lignes
          </Button>
        </Card>
      )}

      {etape === 'importing' && (
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between text-sm">
            <span>Import en cours…</span>
            <span>{progressionActuelle} / {progressionTotal}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </Card>
      )}

      {etape === 'done' && rapport && (
        <Card className="space-y-4 p-4">
          <h2 className="font-semibold">Import terminé</h2>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Établissements
            </p>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold">{rapport.etablissements.crees}</p>
                <p className="text-xs text-muted-foreground">Créés</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold">{rapport.etablissements.misAJour}</p>
                <p className="text-xs text-muted-foreground">Mis à jour</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold">{rapport.etablissements.ignores}</p>
                <p className="text-xs text-muted-foreground">Ignorés</p>
              </div>
            </div>
          </div>
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Contacts principaux
            </p>
            <div className="grid grid-cols-2 gap-2 text-center">
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold">{rapport.contacts.crees}</p>
                <p className="text-xs text-muted-foreground">Créés</p>
              </div>
              <div className="rounded-md border p-3">
                <p className="text-2xl font-bold">{rapport.contacts.misAJour}</p>
                <p className="text-xs text-muted-foreground">Mis à jour</p>
              </div>
            </div>
          </div>
          {rapport.erreurs.length > 0 && (
            <details className="rounded-md border p-3">
              <summary className="cursor-pointer text-sm font-medium">
                {rapport.erreurs.length} erreur(s)
              </summary>
              <ul className="mt-2 space-y-1 text-xs">
                {rapport.erreurs.map((e, i) => (
                  <li key={i} className="text-destructive">
                    {e.onglet} L{e.ligne} : {e.message}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <Button type="button" onClick={reset} className="h-12 w-full">
            Nouvel import
          </Button>
        </Card>
      )}
    </div>
  )
}
```

- [ ] **Test manuel** — sur `/admin/import` :
  1. Uploader `samples/blablabla.xlsx`
  2. Preview affiché
  3. Clic "Lancer l'import de X lignes" → barre progresse
  4. Rapport final : créés + mis à jour + ignorés + erreurs
  5. Aller sur `/etablissements` → les clients importés apparaissent avec leur tournée
  6. Relancer le même import → tous les créés deviennent "mis à jour" (idempotence)

- [ ] **Committer** :

```bash
git add src/components/import/importer-excel.tsx
git commit -m "feat(v1a): import batches (30 lignes) + barre progression + rapport final (tache 7)"
```

---

## Tâche 8 — Nettoyer les logs de debug + type-check + push

**Objectif :** Nettoyer les logs debug Google Places laissés par le commit `84048c3`, vérifier que tout passe, push.

**Fichiers :**
- Modifier : `src/actions/geocode.ts`
- Modifier : `src/components/etablissements/champ-adresse-autocomplete.tsx`

- [ ] Retirer tous les `console.log('[chercherLieux] ...')` de `src/actions/geocode.ts` — restaurer la version d'origine (celle du commit `1a1c6f6`) en gardant `res.text()` et `JSON.parse(rawText)` uniquement si on veut un message d'erreur plus riche ; sinon revenir à `res.json()` direct.

- [ ] Retirer tous les `console.log('[Autocomplete] ...')` de `src/components/etablissements/champ-adresse-autocomplete.tsx`.

- [ ] **Vérifier** :

```bash
npm run type-check
npm test
npm run build
```

Résultat attendu : tous verts.

- [ ] **Committer** :

```bash
git add src/actions/geocode.ts src/components/etablissements/champ-adresse-autocomplete.tsx
git commit -m "chore(v1a): retire les logs debug Google Places (autocomplete confirmé OK) (tache 8)"
```

- [ ] **Push** (déclenche Vercel) :

```bash
git push origin main
```

- [ ] **Vérifier en prod** sur `https://crm-cyril.vercel.app/admin/import` : le workflow complet fonctionne.

---

## Résumé V1a-3

| # | Tâche | Durée estimée |
|---|-------|---------------|
| 1 | xlsx + helpers normalisation + tests | ~15 min |
| 2 | Détection mapping colonnes + tests | ~15 min |
| 3 | Parser XLSX (parseLigne + parseFichier) + tests fixtures | ~25 min |
| 4 | Server Action previewImport + tests | ~20 min |
| 5 | Server Action importerBatch + tests | ~25 min |
| 6 | Route /admin/import + composant upload/preview | ~20 min |
| 7 | Import batches + barre progression + rapport final | ~25 min |
| 8 | Cleanup logs debug + push | ~10 min |
| **Total** | | **~2h30** |

**Critère de sortie :** Import du fichier réel Cyril `samples/blablabla.xlsx` réussi → ~263 établissements + N contacts principaux répartis dans leurs 18 tournées, visibles sur `/etablissements` avec filtre tournée. La fiche d'un client montre son contact importé (badge Principal). Relancement du même import = 0 nouveau établissement + 0 nouveau contact créés (tout en "mis à jour"). Aucune erreur en console. `npm test` toujours vert (au moins 100 tests).

---

**Deux options d'exécution :**

**1. Subagent-Driven (recommandé)** — un sous-agent par tâche, revue entre chaque, itération rapide. Lancer avec `/subagent-driven-development`.

**2. Inline** — exécution dans cette session avec `executing-plans`, checkpoints à chaque tâche.
