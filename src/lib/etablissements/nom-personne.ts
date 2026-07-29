// Helpers partagés (parser Excel + UI fiche) pour détecter les cas où une
// enseigne est en réalité un nom de personne physique ("M. Alberto Santos")
// plutôt qu'un nom commercial ("Cambuse d'Alberto Sàrl").

// Titres de politesse en tête de chaîne → considérés nom de personne.
const TITRES = ['m.', 'mme', 'mlle', 'monsieur', 'madame', 'dr', 'prof']

// Mots-clés commerciaux : si la chaîne commence par un de ceux-ci, on ne
// considère JAMAIS que c'est un nom de personne, même si le reste ressemble
// à "Prénom Nom" (ex "Cave Fellay", "Le Dahu", "Chez Pierre", "Maison Cocotte").
const MOTS_CLES_COMMERCIAUX = [
  // Types d'établissements
  'cave', 'domaine', 'restaurant', 'hotel', 'hôtel', 'cafe', 'café',
  'bar', 'bistro', 'auberge', 'chalet', 'buvette', 'boulangerie',
  'boucherie', 'epicerie', 'épicerie', 'traiteur', 'brasserie',
  'pizzeria', 'crêperie', 'creperie', 'cave à', 'cave a',
  // Articles et locutions courantes en tête d'enseigne
  'le', 'la', 'les', "l'", 'au', 'aux', 'du', 'des', 'chez',
  'maison', 'clos', 'moulin', 'ferme', 'grange', 'ecole', 'école',
]

// Marqueurs de forme juridique → typique d'un nom commercial (raison sociale).
// Regex avec word boundaries pour éviter les faux positifs (ex "santos" contient "sa"
// mais n'est pas une raison sociale).
const RE_RAISON_SOCIALE =
  /\b(?:sarl|sàrl|sa|snc|ag|gmbh)\b|s\.a\.|s\.à\.r\.l\./i

function normaliser(v: string): string {
  return v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
}

// Vérifie si la chaîne contient un marqueur de raison sociale (Sàrl, SA, SNC…).
// Utilisé pour choisir cette chaîne en priorité comme enseigne.
export function contientRaisonSociale(v: string | null | undefined): boolean {
  if (!v) return false
  return RE_RAISON_SOCIALE.test(v)
}

// Regex "Prénom Nom" : mot capitalisé propre.
// - Commence par une majuscule
// - Longueur minimum 2 (évite matcher "A", "B" seuls)
// - Dernier caractère minuscule (rejette ALL CAPS "MCB", "COOP")
// - Contenu intermédiaire : lettres cap/lower + apostrophe + tiret
// Accepte : Marco, Anne-Marie, D'Angelo, L'Écuyer, O'Connor
// Rejette : A, MCB, D', 12X, D3
const RE_MOT_PROPRE = /^[A-ZÀ-ÖØ-Þ][a-zA-ZÀ-ÖØ-Þà-öø-þ'-]*[a-zà-öø-þ]$/

// Détecte si une chaîne ressemble à un nom de personne physique.
//
// - Titre de politesse en tête (M., Mme, Monsieur, Dr…) → OUI
// - Pattern "Prénom Nom" (2 mots capitalisés propres) → OUI, uniquement si :
//   * aucun mot-clé commercial en tête (Cave, Restaurant, Le, La, Maison, Chez…)
//   * pas de raison sociale présente (Sàrl, SA, SNC…)
// - Sinon → NON (les 3+ mots type "Restaurant Le Dahu SA" sont rejetés d'office
//   par l'un des filtres ci-dessus)
export function estNomPersonne(v: string | null | undefined): boolean {
  if (!v) return false
  const brut = v.trim()
  if (brut.length === 0) return false

  // Une chaîne avec forme juridique n'est jamais un nom de personne
  if (contientRaisonSociale(brut)) return false

  const n = normaliser(brut)

  // Mot-clé commercial en tête → nom commercial
  if (MOTS_CLES_COMMERCIAUX.some((m) => n.startsWith(m + ' ') || n === m)) {
    return false
  }

  // Titre de politesse en tête → nom de personne
  const premierMot = n.split(/\s+/)[0] ?? ''
  if (TITRES.includes(premierMot) || TITRES.includes(premierMot.replace(/\.$/, '') + '.')) {
    return true
  }

  // Heuristique "Prénom Nom" : exactement 2 mots capitalisés propres.
  // Volontairement strict (2 mots) pour limiter les faux positifs.
  const mots = brut.split(/\s+/).filter(Boolean)
  if (mots.length === 2 && mots.every((mot) => RE_MOT_PROPRE.test(mot))) {
    return true
  }

  return false
}
