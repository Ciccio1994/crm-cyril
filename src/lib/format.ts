export function formatCHF(montant: number): string {
  const [entier, decimal] = montant.toFixed(2).split('.')
  const avecApostrophes = entier.replace(/\B(?=(\d{3})+(?!\d))/g, "'")
  return `${avecApostrophes}.${decimal} CHF`
}

export function formatDateSuisse(iso: string): string {
  const d = new Date(iso)
  const jj = String(d.getUTCDate()).padStart(2, '0')
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  return `${jj}.${mm}.${d.getUTCFullYear()}`
}

export function telHref(tel: string | null | undefined): string | null {
  if (!tel) return null
  const nettoye = tel.replace(/[^\d+]/g, '')
  if (!nettoye) return null
  const avecPrefixe = nettoye.startsWith('+')
    ? nettoye
    : nettoye.startsWith('0') ? `+41${nettoye.slice(1)}` : `+${nettoye}`
  return `tel:${avecPrefixe}`
}
