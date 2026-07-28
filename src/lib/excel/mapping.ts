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

// Alias reconnus par champ BDD (dans l'ordre de priorité).
// Les alias "contact_email" et "contact_telephone" passent AVANT ceux de l'établissement
// pour qu'une colonne "Email contact" ne soit pas capturée comme "Email" tout court.
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
  contact_nom: [
    'contact', 'nom contact', 'personne', 'personne de contact',
    'interlocuteur', 'representant', 'responsable',
  ],
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
      const idx = normalises.findIndex(
        (h, i) => h === alias && !utilises.has(i),
      )
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
