import type { GroupePrix, StatutCommercial } from '@/types/database'

const GROUPES_VALIDES: GroupePrix[] = [
  'HORECA', 'PART', 'EPI', 'REVENDEURS', 'NEG', 'HORECASRB', 'HELICO',
]

export function normaliserHeader(v: string | null | undefined): string {
  if (!v) return ''
  return v
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
}

export function mapperStatut(v: string | null | undefined): StatutCommercial {
  const n = normaliserHeader(v)
  if (n.includes('actif') && !n.includes('inactif')) return 'client_actif'
  if (n.includes('inactif')) return 'client_inactif'
  if (n === 'prospect') return 'prospect'
  return 'prospect'
}

export function mapperGroupePrix(
  v: string | null | undefined,
): GroupePrix | null {
  if (!v) return null
  const upper = v.toString().trim().toUpperCase()
  return (GROUPES_VALIDES as string[]).includes(upper)
    ? (upper as GroupePrix)
    : null
}
