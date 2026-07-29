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

// Codes régionaux fixes CH (indicatifs à 2 chiffres après le 0 initial ou +41)
// Source : OFCOM — plan de numérotation E.164 CH.
const CODES_FIXES_CH = new Set([
  '21', '22', '24', '26', '27',     // Vaud/Genève/Jura/Neuchâtel/Valais
  '31', '32', '33', '34',           // Bern/région
  '41', '43', '44',                 // Zug/Zürich
  '51', '52', '55', '56', '58',     // St. Gallen/Winterthur/etc.
  '61', '62',                       // Basel/Aargau
  '71', '81', '91',                 // Ostschweiz/Graubünden/Ticino
])

// Codes mobiles CH (préfixes portables + Chargeur/data)
const CODES_MOBILES_CH = new Set(['74', '75', '76', '77', '78', '79'])

// Extrait le code régional (2 chiffres) d'un numéro suisse normalisé.
// Gère "+41 27 ...", "027 ...", "27 ...", etc.
function extraireCodeRegional(v: string | null | undefined): string {
  const n = normaliserTelephone(v)
  if (!n) return ''
  // Retire l'indicatif international "41" en tête
  const sansIntl = n.startsWith('41') ? n.slice(2) : n
  // Retire le "0" national initial
  const sansZero = sansIntl.startsWith('0') ? sansIntl.slice(1) : sansIntl
  return sansZero.slice(0, 2)
}

// True si le numéro ressemble à un fixe suisse (021-091 selon les régions).
export function estFixeSuisse(v: string | null | undefined): boolean {
  const code = extraireCodeRegional(v)
  return CODES_FIXES_CH.has(code)
}

// True si le numéro ressemble à un mobile suisse (074-079).
export function estMobileSuisse(v: string | null | undefined): boolean {
  const code = extraireCodeRegional(v)
  return CODES_MOBILES_CH.has(code)
}

// Normalise une chaîne pour envoi à Google Places Text Search :
// - Retire les accents (NFD + strip diacritics) pour éviter les mismatches
//   fréquents entre BDD ("Rue de l'Église") et Google ("Rue de l'Eglise")
// - Conserve la casse (Google est case-insensitive)
export function normaliserPourGoogle(v: string | null | undefined): string {
  if (!v) return ''
  return v.normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}
