# V1a-2 — UI fiche établissement mobile

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Livrer la fiche établissement mobile — liste, vue, édition, onglets contacts/visites, actions rapides — au niveau où Cyril préfère l'utiliser à Google Contacts sur iPhone en tournée.

**Architecture:** Server Components pour lecture (liste, fiche), Client Components pour interactions (formulaires, filtres, bottom sheets, visite manquée). Server Actions V1a-1 pour toutes les mutations. shadcn/ui pour la base composants, Tailwind v4 pour le style, safe-area iOS partout.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind CSS v4, shadcn/ui, Server Actions (V1a-1), Vitest + React Testing Library

---

## Fichiers créés / modifiés

| Fichier | Rôle |
|---------|------|
| `components.json` | Config shadcn/ui |
| `src/lib/utils.ts` | Helper `cn()` (clsx + tailwind-merge) |
| `src/components/ui/*.tsx` | Composants shadcn (button, input, card, sheet, tabs, badge, dialog, textarea, select, label) |
| `src/lib/format.ts` | Format CHF suisse, dates fr-CH, tel |
| `src/lib/retard.ts` | Calcul `jours_depuis_visite` + `est_en_retard` |
| `src/test/lib/format.test.ts` | Tests format |
| `src/test/lib/retard.test.ts` | Tests retard |
| `src/app/layout.tsx` | Viewport safe-area + theme-color + manifest |
| `src/app/globals.css` | Safe-area vars + `.tap-target` (44px min) |
| `src/app/(app)/layout.tsx` | Shell app : padding safe-area + bottom nav |
| `src/components/layout/bottom-nav.tsx` | Nav bas 4 items (Home, Établissements, Rappels, Chat) |
| `src/app/(app)/etablissements/page.tsx` | Server Component liste |
| `src/components/etablissements/liste-etablissements.tsx` | Client (recherche + filtres) |
| `src/components/etablissements/carte-etablissement.tsx` | Item de liste |
| `src/components/etablissements/badge-retard.tsx` | Badge visuel retard |
| `src/app/(app)/etablissements/[id]/page.tsx` | Server Component fiche |
| `src/components/etablissements/fiche-etablissement.tsx` | Client (tabs Info/Contacts/Visites) |
| `src/components/etablissements/actions-rapides.tsx` | Boutons tel/mail/geo |
| `src/app/(app)/etablissements/nouveau/page.tsx` | Formulaire création |
| `src/app/(app)/etablissements/[id]/modifier/page.tsx` | Formulaire édition |
| `src/components/etablissements/formulaire-etablissement.tsx` | Formulaire mobile |
| `src/components/contacts/onglet-contacts.tsx` | Liste + bouton ajout |
| `src/components/contacts/formulaire-contact.tsx` | Bottom sheet ajout/édition contact |
| `src/components/visites/onglet-visites.tsx` | Liste + boutons visite |
| `src/components/visites/formulaire-visite.tsx` | Bottom sheet visite normale |
| `src/components/visites/bouton-visite-manquee.tsx` | Bouton 1-clic + bottom sheet motif |
| `public/manifest.webmanifest` | Manifest PWA basique |

---

## Tâche 1 — shadcn/ui + helpers format/retard (TDD)

**Objectif :** Installer shadcn/ui avec ses 10 composants de base, ajouter `format.ts` (CHF, dates fr-CH) et `retard.ts` (jours depuis visite, est en retard) avec tests unitaires.

**Fichiers :**
- Créer : `components.json`, `src/lib/utils.ts`, `src/components/ui/*.tsx` (button, input, card, sheet, tabs, badge, dialog, textarea, select, label)
- Créer : `src/lib/format.ts`, `src/lib/retard.ts`
- Créer : `src/test/lib/format.test.ts`, `src/test/lib/retard.test.ts`

**Étapes :**

- [ ] `npx shadcn@latest init` — accepter defaults (Neutral, CSS variables). Vérifier compat Tailwind v4.
- [ ] `npx shadcn@latest add button input card sheet tabs badge dialog textarea select label`
- [ ] Écrire tests `src/test/lib/format.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { formatCHF, formatDateSuisse, telHref } from '@/lib/format'

describe('formatCHF', () => {
  it("formate 1234.5 en 1'234.50 CHF", () => {
    expect(formatCHF(1234.5)).toBe("1'234.50 CHF")
  })
  it('formate 0 en 0.00 CHF', () => {
    expect(formatCHF(0)).toBe("0.00 CHF")
  })
})

describe('formatDateSuisse', () => {
  it('formate ISO en JJ.MM.AAAA', () => {
    expect(formatDateSuisse('2026-07-28T10:00:00Z')).toBe('28.07.2026')
  })
})

describe('telHref', () => {
  it('nettoie les espaces et retourne tel:', () => {
    expect(telHref('027 322 12 34')).toBe('tel:+41273221234')
  })
  it('retourne null si vide', () => {
    expect(telHref(null)).toBeNull()
  })
})
```

- [ ] Écrire tests `src/test/lib/retard.test.ts` :

```ts
import { describe, it, expect } from 'vitest'
import { calculerRetard } from '@/lib/retard'

describe('calculerRetard', () => {
  it('renvoie non en retard si visité récemment (freq 4 sem)', () => {
    const r = calculerRetard('2026-07-20T00:00:00Z', 4, '2026-07-28T00:00:00Z')
    expect(r.est_en_retard).toBe(false)
    expect(r.jours_depuis_visite).toBe(8)
  })
  it('renvoie en retard si > freq_semaines * 7', () => {
    const r = calculerRetard('2026-05-01T00:00:00Z', 4, '2026-07-28T00:00:00Z')
    expect(r.est_en_retard).toBe(true)
  })
  it('renvoie null si jamais visité', () => {
    const r = calculerRetard(null, 4, '2026-07-28T00:00:00Z')
    expect(r.jours_depuis_visite).toBeNull()
    expect(r.est_en_retard).toBe(false)
  })
})
```

- [ ] Lancer les tests — doivent échouer (`FAIL` : module inexistant).
- [ ] Écrire `src/lib/format.ts` :

```ts
export function formatCHF(montant: number): string {
  const [entier, decimal] = montant.toFixed(2).split('.')
  const avecApostrophes = entier.replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  return `${avecApostrophes}.${decimal} CHF`
}

export function formatDateSuisse(iso: string): string {
  const d = new Date(iso)
  const jj = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${jj}.${mm}.${d.getUTCFullYear()}`
}

export function telHref(tel: string | null | undefined): string | null {
  if (!tel) return null
  const nettoye = tel.replace(/[^\d+]/g, '')
  if (!nettoye) return null
  const avecPrefixe = nettoye.startsWith('+')
    ? nettoye
    : nettoye.startsWith('0') ? `+41${nettoye.slice(1)}` : `+${nettoye}`
  return `tel:${avecPrefixe}`
}
```

- [ ] Écrire `src/lib/retard.ts` :

```ts
export interface RetardInfo {
  jours_depuis_visite: number | null
  est_en_retard: boolean
}

export function calculerRetard(
  derniereVisiteIso: string | null,
  frequenceSemaines: number,
  maintenantIso: string = new Date().toISOString(),
): RetardInfo {
  if (!derniereVisiteIso) return { jours_depuis_visite: null, est_en_retard: false }
  const derniere = new Date(derniereVisiteIso).getTime()
  const maintenant = new Date(maintenantIso).getTime()
  const jours = Math.floor((maintenant - derniere) / (1000 * 60 * 60 * 24))
  return {
    jours_depuis_visite: jours,
    est_en_retard: jours > frequenceSemaines * 7,
  }
}
```

**Critère de fin :** `npm test` — 5 nouveaux tests verts (34 → 39). `npm run type-check` OK. `src/components/ui/` contient les 10 composants shadcn. Commit `feat(v1a): shadcn/ui + helpers format & retard + tests (tache 1)`.

---

## Tâche 2 — Layout mobile-first + bottom nav

**Objectif :** Root layout avec safe-area iOS, nav bas fixe (4 items) et zone de contenu scrollable. Manifest PWA basique.

**Fichiers :**
- Modifier : `src/app/layout.tsx`, `src/app/globals.css`
- Créer : `src/app/(app)/layout.tsx`, `src/components/layout/bottom-nav.tsx`, `public/manifest.webmanifest`

**Étapes :**

- [ ] Ajouter dans `src/app/layout.tsx` :

```tsx
export const viewport = {
  themeColor: '#111827',
  viewportFit: 'cover' as const,
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export const metadata: Metadata = {
  title: 'CRM Cyril',
  description: 'CRM commercial vins Schenk/Obrist — Valais',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'CRM Cyril', statusBarStyle: 'black-translucent' },
}
```

- [ ] Ajouter dans `src/app/globals.css` (après `@theme inline`) :

```css
@layer utilities {
  .safe-top    { padding-top: env(safe-area-inset-top); }
  .safe-bottom { padding-bottom: env(safe-area-inset-bottom); }
  .tap-target  { min-height: 44px; min-width: 44px; }
}
html, body { overscroll-behavior-y: none; }
```

- [ ] Créer `public/manifest.webmanifest` :

```json
{
  "name": "CRM Cyril",
  "short_name": "CRM",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#111827",
  "orientation": "portrait"
}
```

- [ ] Créer `src/components/layout/bottom-nav.tsx` (Client Component) — 4 items : `/` (Accueil), `/etablissements` (Établissements), `/rappels` (Rappels), `/chat` (Chat). Chaque item : icône emoji + label, `tap-target`, actif si `pathname.startsWith(href)`. Container : `fixed bottom-0 inset-x-0 border-t bg-white safe-bottom grid grid-cols-4`.
- [ ] Créer `src/app/(app)/layout.tsx` :

```tsx
import { BottomNav } from '@/components/layout/bottom-nav'

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col safe-top">
      <main className="flex-1 overflow-y-auto pb-24">{children}</main>
      <BottomNav />
    </div>
  )
}
```

**Critère de fin :** `npm run dev` → sur iPhone / DevTools mobile, la nav bas reste visible, contenu scroll sous elle, safe-area respecté. `npm run type-check` OK. Commit `feat(v1a): layout mobile-first + bottom nav + safe-area (tache 2)`.

---

## Tâche 3 — Liste établissements + recherche + filtres

**Objectif :** Page `/etablissements` : Server Component charge via `lireEtablissements()`, Client Component gère recherche live (debounce 200 ms) et filtres statut/tournée. Badge retard visible sur chaque carte.

**Fichiers :**
- Créer : `src/app/(app)/etablissements/page.tsx`, `src/components/etablissements/liste-etablissements.tsx`, `src/components/etablissements/carte-etablissement.tsx`, `src/components/etablissements/badge-retard.tsx`
- Créer : `src/test/components/badge-retard.test.tsx`

**Étapes :**

- [ ] Test `src/test/components/badge-retard.test.tsx` :

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BadgeRetard } from '@/components/etablissements/badge-retard'

describe('BadgeRetard', () => {
  it('affiche "En retard" si est_en_retard', () => {
    render(<BadgeRetard jours={40} enRetard={true} />)
    expect(screen.getByText(/en retard/i)).toBeInTheDocument()
  })
  it('affiche "Jamais visité" si jours null', () => {
    render(<BadgeRetard jours={null} enRetard={false} />)
    expect(screen.getByText(/jamais/i)).toBeInTheDocument()
  })
  it('n\'affiche rien si à jour', () => {
    const { container } = render(<BadgeRetard jours={5} enRetard={false} />)
    expect(container.textContent).toBe('')
  })
})
```

- [ ] Créer `badge-retard.tsx` : composant `{ jours, enRetard }`, renvoie `null` si à jour, sinon `<Badge variant="destructive">En retard · Xj</Badge>` ou `<Badge variant="secondary">Jamais visité</Badge>`.
- [ ] Créer `carte-etablissement.tsx` : Card avec enseigne (bold), ville, statut, badge retard. `<Link>` vers `/etablissements/{id}`. Padding généreux (tap-target).
- [ ] Créer `liste-etablissements.tsx` (`'use client'`) : `useState` recherche + filtre statut + filtre tournée. Filtre côté client par enseigne/ville/code_postal (recherche), `statut`, `tournee_id`. Input recherche en tête (sticky), boutons filtres en dessous (Sheet pour tournée si > 5).
- [ ] Créer `src/app/(app)/etablissements/page.tsx` :

```tsx
import { lireEtablissements } from '@/actions/etablissement'
import { ListeEtablissements } from '@/components/etablissements/liste-etablissements'

export default async function Page() {
  const { data, erreur } = await lireEtablissements()
  if (erreur) return <p className="p-4 text-red-600">Erreur de chargement.</p>
  return <ListeEtablissements etablissements={data ?? []} />
}
```

- [ ] Ajouter dans `liste-etablissements.tsx` : calcul retard via `calculerRetard(e.derniere_visite_at, e.tournee?.frequence_semaines ?? 4)` avant passage à `carte-etablissement`.
- [ ] Bouton flottant `+ Nouveau` en bas droite (au-dessus bottom nav) → `/etablissements/nouveau`.

**Critère de fin :** page `/etablissements` affiche les items en DB, recherche live filtre, filtre statut/tournée filtre, badges retard visibles. Tests badge verts. Commit `feat(v1a): liste établissements + recherche/filtres + badge retard (tache 3)`.

---

## Tâche 4 — Fiche établissement (vue lecture + tabs)

**Objectif :** Page `/etablissements/[id]` : Server Component charge via `lireEtablissement(id)`. Client Component affiche header (enseigne, statut, badge retard, actions rapides) + tabs Info / Contacts / Visites (contenus des tabs branchés en T6/T7, skeleton ici).

**Fichiers :**
- Créer : `src/app/(app)/etablissements/[id]/page.tsx`, `src/components/etablissements/fiche-etablissement.tsx`

**Étapes :**

- [ ] Créer `src/app/(app)/etablissements/[id]/page.tsx` :

```tsx
import { lireEtablissement } from '@/actions/etablissement'
import { FicheEtablissement } from '@/components/etablissements/fiche-etablissement'
import { notFound } from 'next/navigation'

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { data, erreur } = await lireEtablissement(id)
  if (erreur || !data) notFound()
  return <FicheEtablissement etablissement={data} />
}
```

- [ ] Créer `fiche-etablissement.tsx` (`'use client'`) — structure :
  - Header sticky : bouton retour, enseigne (h1), statut (Badge), badge retard.
  - Ligne infos principales : ville, code postal, type_etablissement, tournée.
  - Bouton "Modifier" (link vers `/etablissements/{id}/modifier`).
  - `<Tabs defaultValue="info">` avec 3 `<TabsTrigger>` — Info / Contacts / Visites.
  - `TabsContent value="info"` : affichage complet (adresse ligne 1/2, tel principal/mobile, email, site web, horaires, notes internes). Champs `null` masqués. Chaque champ avec label petit gris + valeur.
  - `TabsContent value="contacts"` : `<PlaceholderContacts />` — sera remplacé T6.
  - `TabsContent value="visites"` : `<PlaceholderVisites />` — sera remplacé T7.
- [ ] Vérifier navigation : depuis liste → fiche → retour fonctionne, safe-area OK sur iPhone.

**Critère de fin :** fiche affichée correctement, tabs cliquables, contenus placeholder visibles pour Contacts/Visites. `npm run type-check` OK. Commit `feat(v1a): fiche établissement lecture + tabs (tache 4)`.

---

## Tâche 5 — Formulaire établissement (création + édition)

**Objectif :** Formulaire mobile — champs 44 px min, sections repliables via `<details>`, submit via Server Action, redirect après succès.

**Fichiers :**
- Créer : `src/app/(app)/etablissements/nouveau/page.tsx`, `src/app/(app)/etablissements/[id]/modifier/page.tsx`, `src/components/etablissements/formulaire-etablissement.tsx`

**Étapes :**

- [ ] Créer `formulaire-etablissement.tsx` (`'use client'`) — props `{ initial?: Etablissement, mode: 'creation' | 'edition' }` :
  - `useState` pour chaque champ (ou `useReducer` si trop verbeux).
  - Sections `<details>` : Identité (enseigne obligatoire, type, statut, groupe_prix), Adresse (ligne 1/2, code postal, ville), Contact (tel principal/mobile, email, site web), Interne (horaires libre, notes internes, seuil inactivité).
  - Chaque `<input>` / `<select>` / `<textarea>` en h-12 min, texte 16px min (évite zoom iOS).
  - `inputMode="tel"` sur téléphones, `inputMode="email"` sur email, `inputMode="url"` sur site.
  - Submit : appelle `creerEtablissement(payload)` ou `mettreAJourEtablissement(id, payload)`. Sur erreur Zod → affiche messages par champ. Sur succès → `router.push('/etablissements/{id}')`.
  - Bouton "Enregistrer" fixed en bas (au-dessus bottom nav), sticky, gros, hit target confortable.
- [ ] Créer `src/app/(app)/etablissements/nouveau/page.tsx` : rend `<FormulaireEtablissement mode="creation" />`.
- [ ] Créer `src/app/(app)/etablissements/[id]/modifier/page.tsx` : charge via `lireEtablissement(id)`, passe en `initial`.
- [ ] Depuis la fiche T4, le bouton "Modifier" pointe vers `/etablissements/{id}/modifier`.

**Critère de fin :** créer un établissement depuis `/etablissements/nouveau` fonctionne, l'éditer aussi. Validation Zod remonte les erreurs UI. `npm run type-check` OK. Commit `feat(v1a): formulaire établissement création + édition mobile (tache 5)`.

---

## Tâche 6 — Onglet Contacts

**Objectif :** Onglet Contacts sur la fiche : liste avec bouton "Principal" mis en avant, bouton "+" ouvre bottom sheet formulaire. Tap sur contact → bottom sheet en mode édition. Suppression via swipe → confirm dialog.

**Fichiers :**
- Créer : `src/components/contacts/onglet-contacts.tsx`, `src/components/contacts/formulaire-contact.tsx`
- Modifier : `src/components/etablissements/fiche-etablissement.tsx` (brancher onglet)

**Étapes :**

- [ ] Créer `formulaire-contact.tsx` (`'use client'`) :
  - Utilise `<Sheet side="bottom">` de shadcn.
  - Props `{ open, onOpenChange, etablissementId, contact?, onSuccess }`.
  - Champs : prenom, nom (obligatoire), fonction, telephone, email, est_principal (Switch/Checkbox), notes.
  - Submit → `creerContact(...)` ou `mettreAJourContact(id, ...)`. Ferme sheet + `onSuccess()`.
- [ ] Créer `onglet-contacts.tsx` (`'use client'`) :
  - Props `{ etablissementId, contacts: Contact[] }`.
  - `useState` liste locale (mise à jour après create/update/delete).
  - Rend `<CarteContact>` par contact : nom prenom + fonction + badge "Principal" si `est_principal`, actions tel/mail rapides, bouton "Modifier" (ouvre sheet), bouton "Supprimer" (Dialog confirm → `supprimerContact`).
  - Bouton "+ Ajouter un contact" en bas de la liste (ouvre sheet mode création).
  - Après chaque mutation, refresh via `router.refresh()`.
- [ ] Dans `fiche-etablissement.tsx`, passer `contacts` en prop (depuis parent Server Component qui appelle `lireContacts(id)`), remplacer placeholder par `<OngletContacts etablissementId={id} contacts={contacts} />`.
- [ ] Modifier `src/app/(app)/etablissements/[id]/page.tsx` pour charger contacts en parallèle : `Promise.all([lireEtablissement(id), lireContacts(id)])`.

**Critère de fin :** ajout d'un contact via bottom sheet fonctionne, édition idem, suppression avec confirm dialog. Contact principal apparaît en tête. `npm run type-check` OK. Commit `feat(v1a): onglet Contacts + bottom sheet CRUD (tache 6)`.

---

## Tâche 7 — Onglet Visites (normale + manquée)

**Objectif :** Boutons XL au sommet de l'onglet : "Visite 60 min", "Visite 120 min", "Visite manquée". Les deux premiers ouvrent le formulaire préréempli avec la durée. Le dernier ouvre un bottom sheet motif (ferme / absent / urgence_personnelle / autre) puis crée directement.

**Fichiers :**
- Créer : `src/components/visites/onglet-visites.tsx`, `src/components/visites/formulaire-visite.tsx`, `src/components/visites/bouton-visite-manquee.tsx`
- Modifier : `src/components/etablissements/fiche-etablissement.tsx`, `src/app/(app)/etablissements/[id]/page.tsx`

**Étapes :**

- [ ] Créer `formulaire-visite.tsx` (`'use client'`) : Sheet bas. Props `{ open, onOpenChange, etablissementId, dureeInitiale, onSuccess }`. Champs : date (défaut = maintenant), durée en minutes (préremplie), notes (textarea), prochaine action. Submit → `creerVisite({ ..., date_visite: iso, duree_minutes, notes, prochaine_action })`.
- [ ] Créer `bouton-visite-manquee.tsx` (`'use client'`) : bouton principal → ouvre Sheet listant 4 motifs (grille 2×2 boutons XL) + option "Sans motif". Sélection → `creerVisiteManquee({ etablissement_id, date_visite: iso, motif_manquee })` puis ferme sheet + `onSuccess()`.
- [ ] Créer `onglet-visites.tsx` (`'use client'`) :
  - Props `{ etablissementId, visites: Visite[] }`.
  - Header : 3 boutons XL grid (60 min / 120 min / Manquée). Les deux premiers ouvrent `<FormulaireVisite dureeInitiale={60|120} />`.
  - Liste des visites triée date desc : chaque item = date + durée + notes + badge "Manquée" si `est_manquee` (avec motif si présent).
  - `router.refresh()` après création.
- [ ] Modifier fiche pour charger visites en parallèle : `Promise.all([lireEtablissement(id), lireContacts(id), lireVisites(id)])`.
- [ ] Dans `fiche-etablissement.tsx`, remplacer placeholder Visites par `<OngletVisites etablissementId={id} visites={visites} />`.

**Critère de fin :** créer une visite 60 min prend 3 taps max, une visite manquée 2 taps. La liste se rafraîchit. `derniere_visite_at` (mis à jour par trigger SQL) apparaît via re-fetch. `npm run type-check` OK. Commit `feat(v1a): onglet Visites — normale + manquée en 1 clic (tache 7)`.

---

## Tâche 8 — Actions rapides (tel / mail / geo)

**Objectif :** Grid de 3 boutons XL visible en haut de la fiche (sous le header) : Appeler, Écrire, Itinéraire. Chaque bouton grisé si donnée absente. `geo:` avec fallback Google Maps si iOS n'ouvre pas Apple Plans.

**Fichiers :**
- Créer : `src/components/etablissements/actions-rapides.tsx`
- Modifier : `src/components/etablissements/fiche-etablissement.tsx`

**Étapes :**

- [ ] Créer `actions-rapides.tsx` :

```tsx
'use client'
import { Button } from '@/components/ui/button'
import { telHref } from '@/lib/format'
import type { Etablissement } from '@/types/database'

export function ActionsRapides({ etab }: { etab: Etablissement }) {
  const tel = telHref(etab.telephone_principal ?? etab.telephone_mobile)
  const mail = etab.email ? `mailto:${etab.email}` : null
  const adresse = [etab.adresse_ligne_1, etab.code_postal, etab.ville].filter(Boolean).join(' ')
  const geo = adresse
    ? (etab.latitude && etab.longitude
        ? `geo:${etab.latitude},${etab.longitude}?q=${encodeURIComponent(adresse)}`
        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`)
    : null

  return (
    <div className="grid grid-cols-3 gap-2 p-4">
      <Button asChild disabled={!tel} className="tap-target h-16 flex-col gap-1">
        <a href={tel ?? '#'}><span aria-hidden>📞</span><span className="text-xs">Appeler</span></a>
      </Button>
      <Button asChild disabled={!mail} className="tap-target h-16 flex-col gap-1">
        <a href={mail ?? '#'}><span aria-hidden>✉️</span><span className="text-xs">Écrire</span></a>
      </Button>
      <Button asChild disabled={!geo} className="tap-target h-16 flex-col gap-1">
        <a href={geo ?? '#'} target="_blank" rel="noreferrer"><span aria-hidden>📍</span><span className="text-xs">Itinéraire</span></a>
      </Button>
    </div>
  )
}
```

- [ ] Dans `fiche-etablissement.tsx`, ajouter `<ActionsRapides etab={etablissement} />` directement sous le header, avant les tabs.

**Critère de fin :** sur iPhone réel, tap sur "Appeler" ouvre l'app Téléphone, "Écrire" ouvre Mail, "Itinéraire" ouvre Plans ou Google Maps. Boutons grisés si données absentes. Commit `feat(v1a): actions rapides tel/mail/geo depuis fiche (tache 8)`.

---

## Tâche 9 — Test iPhone réel + polish PWA

**Objectif :** Vérifier sur iPhone réel (via Vercel preview ou tunnel local) que tout fonctionne main dans une main, ajouter apple-touch-icon minimum, corriger tout ce qui ne va pas.

**Fichiers :**
- Créer/modifier : `public/apple-touch-icon.png` (180×180), `public/icon-192.png`, `public/icon-512.png`
- Modifier : `public/manifest.webmanifest` (ajouter `icons`)
- Modifier : tout ce qui casse sur iPhone

**Étapes :**

- [ ] Déployer sur Vercel preview OU exposer localhost via `ngrok http 3000` (ou tunnel Vercel).
- [ ] Ouvrir sur iPhone Safari, ajouter à l'écran d'accueil, vérifier icône + status bar.
- [ ] Parcours 1 (obligatoire) : Ouvrir app → Établissements → Chercher "test" → Ouvrir fiche → Appeler (tap tel) → retour → Ajouter contact → retour → Créer visite 60 min.
- [ ] Parcours 2 (obligatoire) : Ajouter établissement (formulaire complet) → Fiche s'ouvre → Créer visite manquée motif "ferme" → Vérifier badge retard reste "Jamais visité" (visite manquée ne compte pas).
- [ ] Corriger tout bug observé (safe-area, hit target, layout, keyboard iOS qui masque bouton submit → ajouter `padding-bottom` dynamique si nécessaire).
- [ ] Créer icônes 180 / 192 / 512 (peut être un placeholder simple — logo texte "C" sur fond neutre) et ajouter à `manifest.webmanifest` :

```json
"icons": [
  { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
  { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
]
```

- [ ] Ajouter dans `layout.tsx` : `<link rel="apple-touch-icon" href="/apple-touch-icon.png" />` via `metadata.icons.apple`.

**Critère de fin :** parcours 1 et 2 fonctionnent sur iPhone sans friction. Icône home screen visible. `npm test` toujours vert. `npm run type-check` OK. `npm run build` OK. Commit final `chore(v1a): polish iPhone + icônes PWA (tache 9)`.

---

## Résumé V1a-2

| # | Tâche | Durée estimée |
|---|-------|---------------|
| 1 | shadcn/ui + format/retard + tests | ~20 min |
| 2 | Layout mobile-first + bottom nav | ~15 min |
| 3 | Liste établissements + recherche/filtres | ~30 min |
| 4 | Fiche lecture + tabs | ~20 min |
| 5 | Formulaire création/édition | ~30 min |
| 6 | Onglet Contacts | ~25 min |
| 7 | Onglet Visites (normale + manquée) | ~25 min |
| 8 | Actions rapides tel/mail/geo | ~10 min |
| 9 | Test iPhone + polish PWA | ~30 min |
| **Total** | | **~3h30** |

**Critère de sortie V1a-2 (le seul qui compte) :** Cyril ouvre le CRM sur son iPhone en tournée, trouve un établissement en moins de 5 secondes, ouvre sa fiche, appelle depuis la fiche, note une visite manquée en 2 taps. Aucun retour vers Google Contacts pendant le test.

---

**Deux options d'exécution :**

**1. Subagent-Driven (recommandé)** — un sous-agent par tâche, revue entre chaque, itération rapide. Lancer avec `/subagent-driven-development`.

**2. Inline** — exécution dans cette session avec `executing-plans`, checkpoints à chaque tâche.
