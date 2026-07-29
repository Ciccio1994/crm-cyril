// Helpers partagés (parser Excel + UI fiche) pour détecter les cas où une
// enseigne est en réalité un nom de personne physique ("M. Alberto Santos")
// plutôt qu'un nom commercial ("Cambuse d'Alberto Sàrl").

// Titres de politesse en tête de chaîne → considérés nom de personne.
const TITRES = ['m.', 'mme', 'mlle', 'monsieur', 'madame', 'dr', 'prof']

// Mots-clés commerciaux : si la chaîne commence par un de ceux-ci, on ne
// considère JAMAIS que c'est un nom de personne, même si le reste ressemble
// à "Prénom Nom" (ex "Cave Fellay", "Domaine Anna", "Restaurant Chez Pierre").
const MOTS_CLES_COMMERCIAUX = [
  'cave', 'domaine', 'restaurant', 'hotel', 'hôtel', 'cafe', 'café',
  'bar', 'bistro', 'auberge', 'chalet', 'buvette', 'boulangerie',
  'boucherie', 'epicerie', 'épicerie', 'traiteur', 'brasserie',
  'pizzeria', 'crêperie', 'creperie', 'cave à', 'cave a',
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

// Détecte si une chaîne ressemble à un nom de personne physique.
// Version conservatrice : détection UNIQUEMENT via titre de politesse explicite
// (M., Mme, Monsieur, Dr…). L'heuristique "Prénom Nom" génère trop de faux
// positifs sur des noms commerciaux courants (Le Dahu, Maison Cocotte, Chez Pierre).
// Si Cyril veut signaler un particulier sans titre, il peut préfixer "M." manuellement.
// - Titre de politesse en tête → OUI
// - Mot-clé commercial en tête → NON (Cave X, Restaurant Y, etc.)
// - Chaîne avec raison sociale (Sàrl/SA/SNC…) → NON
// - Tout le reste → NON (on préfère laisser passer un vrai nom personne plutôt que
//   rejeter un nom commercial légitime)
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

  // Titre de politesse en tête → nom de personne (seul signal fort)
  const premierMot = n.split(/\s+/)[0] ?? ''
  if (TITRES.includes(premierMot) || TITRES.includes(premierMot.replace(/\.$/, '') + '.')) {
    return true
  }

  return false
}
