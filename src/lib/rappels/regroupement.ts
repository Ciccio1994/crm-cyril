import type { Rappel, RappelsRegroupes } from '@/types/rappel'

function jourZurich(iso: string): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit',
  })
  return fmt.format(new Date(iso))
}

function decalerJours(iso: string, delta: number): string {
  const d = new Date(iso)
  d.setUTCDate(d.getUTCDate() + delta)
  return jourZurich(d.toISOString())
}

function jourSemaine(iso: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Zurich', weekday: 'long' })
  const map: Record<string, number> = {
    Monday: 1, Tuesday: 2, Wednesday: 3, Thursday: 4,
    Friday: 5, Saturday: 6, Sunday: 7,
  }
  return map[fmt.format(new Date(iso))] ?? 1
}

export function regrouperRappels(rappels: Rappel[], nowIso: string): RappelsRegroupes {
  const jourAuj = jourZurich(nowIso)
  const jSem = jourSemaine(nowIso)
  const finSemaine = decalerJours(nowIso, 7 - jSem)
  const trierParEcheance = (a: Rappel, b: Rappel) => a.echeance.localeCompare(b.echeance)

  const res: RappelsRegroupes = {
    enRetard: [], aujourdhui: [], cetteSemaine: [], plusTard: [], termines: [],
  }

  for (const r of rappels) {
    if (r.statut === 'annule') continue
    if (r.statut === 'fait') { res.termines.push(r); continue }
    const j = jourZurich(r.echeance)
    if (j < jourAuj) res.enRetard.push(r)
    else if (j === jourAuj) res.aujourdhui.push(r)
    else if (j <= finSemaine) res.cetteSemaine.push(r)
    else res.plusTard.push(r)
  }

  for (const k of Object.keys(res) as (keyof RappelsRegroupes)[]) {
    res[k].sort(trierParEcheance)
  }
  return res
}
