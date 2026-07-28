// Matcher tolérant nom d'onglet Excel ↔ nom de tournée BDD.
//
// Étapes :
// 1. Retire l'éventuel préfixe numérique "1. " / "10." (avec ou sans espace)
// 2. Lowercase + retire accents
// 3. Tokenise sur tout caractère non alphanumérique (tirets, apostrophes, dots, etc.)
// 4. Compte les tokens qui matchent :
//    - exact (dbToken === excelToken)
//    - prefix : dbToken commence par excelToken (si excelToken ≥ 3 chars)
//    - prefix inverse : excelToken commence par dbToken (si dbToken ≥ 3 chars)
// 5. Meilleure tournée = plus haut score. Seuil : ≥ moitié des tokens Excel matchent.
//    Rejet si égalité au sommet (ambiguïté).

export interface CandidatTournee {
  id: string
  nom: string
}

export function tokeniserNomTournee(nom: string): string[] {
  return nom
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/^\d+\.\s*/, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 0)
}

function scoreMatch(excelTokens: string[], dbTokens: string[]): number {
  const dbSet = new Set(dbTokens)
  let matched = 0
  for (const et of excelTokens) {
    if (dbSet.has(et)) {
      matched++
      continue
    }
    if (et.length >= 3 && dbTokens.some((dt) => dt.startsWith(et))) {
      matched++
      continue
    }
    if (dbTokens.some((dt) => dt.length >= 3 && et.startsWith(dt))) {
      matched++
    }
  }
  return matched
}

export function mapperTournee(
  nomExcel: string,
  candidats: CandidatTournee[],
): CandidatTournee | null {
  const excelTokens = tokeniserNomTournee(nomExcel)
  if (excelTokens.length === 0 || candidats.length === 0) return null

  const scores = candidats
    .map((c) => ({
      tournee: c,
      score: scoreMatch(excelTokens, tokeniserNomTournee(c.nom)),
    }))
    .sort(
      (a, b) =>
        b.score - a.score || a.tournee.nom.localeCompare(b.tournee.nom),
    )

  const best = scores[0]
  if (!best || best.score === 0) return null

  // Seuil : au moins la moitié des tokens Excel doivent matcher
  const minScore = Math.ceil(excelTokens.length / 2)
  if (best.score < minScore) return null

  // Ambiguïté : rejet si le second meilleur est à égalité
  const secondBest = scores[1]
  if (secondBest && secondBest.score === best.score) return null

  return best.tournee
}
