'use client'

import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { JOURS } from '@/types/horaires'
import type { Horaires, JourSemaine } from '@/types/horaires'

const LIBELLES: Record<JourSemaine, string> = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi',
  vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
}

interface Props {
  value: Horaires | null
  onChange: (v: Horaires | null) => void
}

function creneauVide(): { debut: string; fin: string } {
  return { debut: '', fin: '' }
}

export function FormulaireHoraires({ value, onChange }: Props) {
  const h = value ?? {}

  function setJour(jour: JourSemaine, nouveau: Horaires[JourSemaine]) {
    const clone: Horaires = { ...h, [jour]: nouveau }
    onChange(clone)
  }

  function setCreneau(
    jour: JourSemaine, idx: number, champ: 'debut' | 'fin', v: string,
  ) {
    const creneaux = [...(h[jour] ?? [])]
    creneaux[idx] = { ...(creneaux[idx] ?? creneauVide()), [champ]: v }
    setJour(jour, creneaux)
  }

  function toggleFerme(jour: JourSemaine, ferme: boolean) {
    setJour(jour, ferme ? null : [creneauVide()])
  }

  function ajouterCreneau(jour: JourSemaine) {
    const creneaux = [...(h[jour] ?? []), creneauVide()]
    setJour(jour, creneaux)
  }

  function retirerCreneau(jour: JourSemaine, idx: number) {
    const creneaux = [...(h[jour] ?? [])]
    creneaux.splice(idx, 1)
    setJour(jour, creneaux.length > 0 ? creneaux : null)
  }

  function copierLundiPartout() {
    const source = h.lundi
    if (!source) return
    const clone: Horaires = {}
    for (const j of JOURS) clone[j] = source.map((c) => ({ ...c }))
    onChange(clone)
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        onClick={copierLundiPartout}
        disabled={!h.lundi || h.lundi.length === 0}
        className="h-10 w-full text-sm"
      >
        Copier lundi vers tous les jours
      </Button>

      <div className="space-y-3">
        {JOURS.map((jour) => {
          const creneaux = h[jour]
          const ferme = creneaux === null
          return (
            <div key={jour} className="rounded-md border p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{LIBELLES[jour]}</span>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={ferme}
                    onChange={(e) => toggleFerme(jour, e.target.checked)}
                    className="size-4"
                  />
                  Fermé
                </label>
              </div>
              {!ferme && (
                <div className="mt-2 space-y-2">
                  {(creneaux ?? [creneauVide()]).map((c, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <Input
                        type="time"
                        value={c.debut}
                        onChange={(e) => setCreneau(jour, idx, 'debut', e.target.value)}
                        className="h-10 flex-1 text-base"
                      />
                      <span aria-hidden>–</span>
                      <Input
                        type="time"
                        value={c.fin}
                        onChange={(e) => setCreneau(jour, idx, 'fin', e.target.value)}
                        className="h-10 flex-1 text-base"
                      />
                      {(creneaux?.length ?? 0) > 1 && (
                        <button
                          type="button"
                          onClick={() => retirerCreneau(jour, idx)}
                          className="text-xs text-muted-foreground"
                          aria-label="Retirer créneau"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))}
                  {(creneaux?.length ?? 0) < 2 && (
                    <button
                      type="button"
                      onClick={() => ajouterCreneau(jour)}
                      className="text-xs underline"
                    >
                      + Ajouter un 2e créneau (pause déjeuner)
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
