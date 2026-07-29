import type { Contact, Etablissement } from '@/types/database'

// Normalise pour recherche : lowercase, sans accents, sans tirets ni caractères de ponctuation,
// espaces multiples réduits à un seul. Rend le matching robuste sur "M. Dupont" ↔ "m dupont".
export function normaliserRecherche(v: string | null | undefined): string {
  if (!v) return ''
  return v
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[-_./]/g, ' ')
    .replace(/[^\w\s@+]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

// Renvoie true si le texte de l'établissement (tous champs concaténés) contient TOUS les termes
// de la requête normalisée. Cherche dans : enseigne, code_schenk (avec/sans préfixe C),
// adresse_ligne_1, ville, code_postal, telephone_principal, telephone_mobile, noms de contacts.
// Multi-terme : "cafe alpes" matche "Café des Alpes" car chaque terme est trouvé indépendamment.
export function correspondRecherche(
  etab: Etablissement & { contacts?: Contact[] },
  requeteNormalisee: string,
): boolean {
  const termes = requeteNormalisee.split(/\s+/).filter(Boolean)
  if (termes.length === 0) return true

  const parts: string[] = [
    etab.enseigne,
    etab.code_schenk,
    // code_schenk sans préfixe C (ex "C0034046" → "0034046" pour trouver "34046")
    etab.code_schenk?.replace(/^c0*/i, ''),
    etab.adresse_ligne_1,
    etab.code_postal,
    etab.ville,
    etab.telephone_principal,
    etab.telephone_mobile,
    ...(etab.contacts ?? []).flatMap((c) => [c.prenom, c.nom]),
  ].filter((p): p is string => typeof p === 'string' && p.length > 0)

  const combo = normaliserRecherche(parts.join(' '))
  return termes.every((t) => combo.includes(t))
}
