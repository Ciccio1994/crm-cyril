// Extrait un candidat "nom commercial" depuis notes_internes.
// Le parseur Excel V1a-3 stocke la raison sociale du fichier Schenk sous la forme
// "Nom raison sociale: {NOM1} / {NOM2}" — souvent {NOM2} est le vrai nom commercial
// (ex "Nom raison sociale: M. Alberto Santos / Cambuse d'Alberto Sàrl").
//
// Retourne le meilleur candidat trouvé, ou null si aucun.

const MOTS_CLES_COMMERCIAUX_ENTETE = [
  'café', 'cafe', 'restaurant', 'hôtel', 'hotel', 'bar', 'bistro',
  'auberge', 'chalet', 'buvette', 'cave', 'domaine', 'clos', 'maison',
  'moulin', 'ferme', 'brasserie', 'pizzeria', 'boulangerie', 'boucherie',
  'traiteur', 'crêperie', 'creperie', 'épicerie', 'epicerie',
]

const RE_RAISON_SOCIALE = /\b(?:sarl|sàrl|sa|snc|ag|gmbh)\b|s\.a\.|s\.à\.r\.l\./i

// Découpe les notes en segments candidats (séparés par /, virgule, retour ligne).
function segmenter(notes: string): string[] {
  return notes
    .replace(/Nom raison sociale\s*:\s*/gi, '')
    .split(/[/,\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

// Retourne true si le segment ressemble à un nom commercial :
// - Commence par un mot-clé commercial (Café, Restaurant...)
// - OU contient une raison sociale (Sàrl, SA, SNC)
function estNomCommercial(segment: string): boolean {
  const n = segment.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  if (RE_RAISON_SOCIALE.test(segment)) return true
  return MOTS_CLES_COMMERCIAUX_ENTETE.some((m) => n.startsWith(m + ' '))
}

// Extrait un nom commercial depuis notes_internes.
// Priorité :
// 1. Segment avec mot-clé commercial en tête (« Café Le Central »)
// 2. Segment avec raison sociale (« Cambuse d'Alberto Sàrl »)
// 3. null si aucun
export function extraireNomCommercial(notes: string | null | undefined): string | null {
  if (!notes) return null
  const segments = segmenter(notes)
  if (segments.length === 0) return null

  // Priorité 1 : mot-clé commercial en tête
  for (const s of segments) {
    const n = s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    if (MOTS_CLES_COMMERCIAUX_ENTETE.some((m) => n.startsWith(m + ' '))) return s
  }
  // Priorité 2 : raison sociale
  for (const s of segments) {
    if (RE_RAISON_SOCIALE.test(s)) return s
  }
  return null
}

// Compte les mots communs (au moins 3 caractères, insensible casse/accents)
// entre deux chaînes. Utilisé pour scorer la similarité entre le nom Google
// et le nom extrait des notes.
export function motsCommuns(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  const motsA = new Set(norm(a).split(/\s+/).filter((m) => m.length >= 3))
  const motsB = norm(b).split(/\s+/).filter((m) => m.length >= 3)
  return motsB.filter((m) => motsA.has(m)).length
}

// Ré-exporte pour tests / cohérence
export { estNomCommercial }
