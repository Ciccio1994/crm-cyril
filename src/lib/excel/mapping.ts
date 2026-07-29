import { normaliserHeader } from './normaliser'
import type { JourSemaine } from '@/types/horaires'
import { JOURS } from '@/types/horaires'

export interface Mapping {
  code_schenk?: number
  enseigne?: number
  notes_nom_1?: number
  notes_nom_2?: number
  adresse_ligne_1?: number
  code_postal?: number
  ville?: number
  telephone_principal?: number
  telephone_mobile?: number
  email?: number
  groupe_prix?: number
  statut?: number
  contact_nom?: number
  contact_fonction?: number
  contact_telephone?: number
  contact_email?: number
  jours?: Partial<Record<JourSemaine, number>>
  colonnesInconnues: string[]
}

// Colonnes explicitement ignorées : présentes dans l'Excel Schenk mais sans
// intérêt métier. On ne les met pas dans colonnesInconnues (bruit).
const IGNORE: string[] = [
  'ventes ds',
  'date creation',
  'goot',
  'janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin',
  'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre',
]

// Aliases simples champ → alias possibles (dans l'ordre de priorité).
// Attention : les alias contact_* passent AVANT les alias etab_* pour éviter
// que « Email contact » soit capturé par « Email » plat.
const ALIASES_SIMPLES: Record<
  Exclude<keyof Mapping, 'colonnesInconnues' | 'enseigne' | 'notes_nom_1' | 'notes_nom_2' | 'adresse_ligne_1' | 'jours'>,
  string[]
> = {
  code_schenk: ['n', 'no', 'numero', 'code schenk', 'code'],
  code_postal: ['code postal', 'cp', 'npa'],
  ville: ['ville', 'localite', 'commune'],
  contact_email: ['email contact', 'mail contact', 'courriel contact'],
  contact_telephone: ['telephone contact', 'tel contact'],
  telephone_principal: ['n telephone', 'telephone', 'tel', 'fixe', 'no tel'],
  telephone_mobile: ['n portable', 'portable', 'natel', 'mobile'],
  email: ['email', 'e mail', 'mail', 'courriel'],
  groupe_prix: ['groupe prix client', 'groupe prix', 'groupe de prix', 'groupe', 'prix'],
  statut: ['statut', 'etat', 'type client', 'type'],
  contact_nom: [
    'contact', 'nom contact', 'personne', 'personne de contact',
    'interlocuteur', 'representant', 'responsable',
  ],
  contact_fonction: ['fonction', 'poste', 'titre', 'role'],
}

const ALIASES_ENSEIGNE_SIMPLE = ['enseigne', 'client', 'etablissement', 'raison sociale']
const ALIAS_NOM = 'nom'
const ALIAS_NOM_2 = ['nom 2', 'nom2']
const ALIAS_ADRESSE = 'adresse'
const ALIAS_ADRESSE_2 = [
  'adresse 2eme ligne',
  'adresse 2 eme ligne',
  'adresse ligne 2',
  'adresse ligne 1',
  'adresse 2',
]

function findIdx(normalises: string[], utilises: Set<number>, alias: string): number | undefined {
  const i = normalises.findIndex((n, idx) => n === alias && !utilises.has(idx))
  return i === -1 ? undefined : i
}
function findAnyIdx(
  normalises: string[],
  utilises: Set<number>,
  aliases: string[],
): number | undefined {
  for (const a of aliases) {
    const i = findIdx(normalises, utilises, a)
    if (i !== undefined) return i
  }
  return undefined
}

export function detecterMapping(headers: (string | null | undefined)[]): Mapping {
  const normalises = headers.map((h) => normaliserHeader(h))
  const mapping: Mapping = { colonnesInconnues: [] }
  const utilises = new Set<number>()

  // Étape 1 : Nom / Nom 2 / Adresse / Adresse (2ème ligne)
  //
  // Règle : la présence de « Adresse (2ème ligne) » signe le format « full Schenk »
  //   où « Adresse » est en fait le nom commercial (l'enseigne) et « Nom »/« Nom 2 »
  //   sont la raison sociale (à mettre dans notes_internes).
  // Sinon on est en format simple : Nom = enseigne, Adresse = adresse_ligne_1.
  const nomIdx      = findIdx(normalises, utilises, ALIAS_NOM)
  const nom2Idx     = findAnyIdx(normalises, utilises, ALIAS_NOM_2)
  const adresseIdx  = findIdx(normalises, utilises, ALIAS_ADRESSE)
  const adresse2Idx = findAnyIdx(normalises, utilises, ALIAS_ADRESSE_2)

  if (adresse2Idx !== undefined) {
    // Format full Schenk
    mapping.adresse_ligne_1 = adresse2Idx
    utilises.add(adresse2Idx)
    if (adresseIdx !== undefined) {
      mapping.enseigne = adresseIdx
      utilises.add(adresseIdx)
    }
    if (nomIdx !== undefined) {
      mapping.notes_nom_1 = nomIdx
      utilises.add(nomIdx)
    }
    if (nom2Idx !== undefined) {
      mapping.notes_nom_2 = nom2Idx
      utilises.add(nom2Idx)
    }
  } else {
    // Format simple : Nom = enseigne, Adresse = adresse_ligne_1
    if (nomIdx !== undefined) {
      mapping.enseigne = nomIdx
      utilises.add(nomIdx)
    }
    if (adresseIdx !== undefined) {
      mapping.adresse_ligne_1 = adresseIdx
      utilises.add(adresseIdx)
    }
  }

  // Étape 2 : fallback enseigne via aliases simples
  if (mapping.enseigne === undefined) {
    const idx = findAnyIdx(normalises, utilises, ALIASES_ENSEIGNE_SIMPLE)
    if (idx !== undefined) {
      mapping.enseigne = idx
      utilises.add(idx)
    }
  }

  // Étape 3 : autres champs
  for (const [champ, aliases] of Object.entries(ALIASES_SIMPLES) as [
    keyof typeof ALIASES_SIMPLES,
    string[],
  ][]) {
    const idx = findAnyIdx(normalises, utilises, aliases)
    if (idx !== undefined) {
      mapping[champ] = idx
      utilises.add(idx)
    }
  }

  // Étape 3bis : colonnes jours (Lundi..Dimanche) pour horaires
  const jours: Partial<Record<JourSemaine, number>> = {}
  for (const j of JOURS) {
    const idx = findIdx(normalises, utilises, j)
    if (idx !== undefined) {
      jours[j] = idx
      utilises.add(idx)
    }
  }
  if (Object.keys(jours).length > 0) mapping.jours = jours

  // Étape 4 : colonnes inconnues (hors ignore list)
  headers.forEach((h, i) => {
    if (h && !utilises.has(i)) {
      const n = normalises[i]
      if (n !== '' && !IGNORE.includes(n)) {
        mapping.colonnesInconnues.push(String(h))
      }
    }
  })

  return mapping
}
