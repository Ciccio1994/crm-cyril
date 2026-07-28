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
