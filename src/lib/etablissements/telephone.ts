// Normalisation téléphone pour comparaison stricte entre BDD et Google Places.
// Retire tous les caractères non-chiffres, retire un éventuel préfixe "00" ou "+".
// Ex : "+41 27 234 12 34" → "41272341234"
//      "027 234 12 34"    → "0272341234"
//      "0041 27 234"      → "41234" (préfixe international normalisé)
export function normaliserTelephone(v: string | null | undefined): string {
  if (!v) return ''
  const chiffres = v.replace(/[^\d+]/g, '')
  // "00" en tête → équivalent "+" en international
  if (chiffres.startsWith('00')) return chiffres.slice(2)
  if (chiffres.startsWith('+')) return chiffres.slice(1)
  return chiffres
}

// Compare deux téléphones : true si strictement identiques après normalisation
// OU si l'un est le suffixe de l'autre (préfixe international manquant).
// Ex : "+41 27 234 12 34" ≡ "027 234 12 34" → true (chiffres suffixe "27234...")
export function telephonesEquivalents(a: string | null | undefined, b: string | null | undefined): boolean {
  const na = normaliserTelephone(a)
  const nb = normaliserTelephone(b)
  if (!na || !nb) return false
  // Sécurité anti-faux-positif : rejette les numéros trop courts pour être
  // discriminants (min 7 chiffres = ~un numéro CH sans code pays).
  if (na.length < 7 || nb.length < 7) return false
  if (na === nb) return true
  // Cas fréquent CH : Google renvoie "+41 27 ..." alors que la BDD a "027 ..."
  // → suffixe "27234..." commun aux deux
  const naSansZero = na.startsWith('0') ? na.slice(1) : na
  const nbSansZero = nb.startsWith('0') ? nb.slice(1) : nb
  const naSansCode = naSansZero.replace(/^41/, '')
  const nbSansCode = nbSansZero.replace(/^41/, '')
  return naSansCode === nbSansCode && naSansCode.length >= 7
}
