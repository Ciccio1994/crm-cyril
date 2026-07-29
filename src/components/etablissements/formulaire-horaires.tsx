'use client'

import { useRef, useState, useTransition } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { JOURS } from '@/types/horaires'
import type { Horaires, JourSemaine } from '@/types/horaires'
import { chercherHorairesGoogle } from '@/actions/horaires-google'

const LIBELLES: Record<JourSemaine, string> = {
  lundi: 'Lundi', mardi: 'Mardi', mercredi: 'Mercredi', jeudi: 'Jeudi',
  vendredi: 'Vendredi', samedi: 'Samedi', dimanche: 'Dimanche',
}

interface Props {
  value: Horaires | null
  onChange: (v: Horaires | null) => void
  // Query pour recherche Google (enseigne + adresse concaténées).
  // Si absent, le bouton "Auto-remplir depuis Google" est masqué.
  requeteGoogle?: string
}

const DEBOUNCE_MS = 500

function creneauVide(): { debut: string; fin: string } {
  return { debut: '', fin: '' }
}

export function FormulaireHoraires({ value, onChange, requeteGoogle }: Props) {
  const h = value ?? {}
  const [pending, startTransition] = useTransition()
  const [messageGoogle, setMessageGoogle] = useState<string | null>(null)
  const dernierClickGoogleRef = useRef(0)

  function autoRemplirDepuisGoogle() {
    if (!requeteGoogle) return
    const now = Date.now()
    if (now - dernierClickGoogleRef.current < DEBOUNCE_MS) return
    dernierClickGoogleRef.current = now

    // Confirmation si des horaires existent déjà
    if (value && Object.keys(value).length > 0) {
      if (!window.confirm('Remplacer les horaires actuels par ceux trouvés sur Google Maps ?')) {
        return
      }
    }

    setMessageGoogle(null)
    startTransition(async () => {
      const r = await chercherHorairesGoogle(requeteGoogle)
      if (r.erreur) {
        setMessageGoogle(`❌ ${r.erreur}`)
        return
      }
      if (r.data) {
        onChange(r.data)
        setMessageGoogle('Horaires trouvés ✅')
      }
    })
  }

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
      {requeteGoogle && (
        <div className="space-y-1">
          <Button
            type="button"
            variant="outline"
            onClick={autoRemplirDepuisGoogle}
            disabled={pending}
            className="h-10 w-full text-sm"
          >
            {pending ? 'Recherche…' : '📍 Auto-remplir depuis Google Maps'}
          </Button>
          {messageGoogle && (
            <p
              className={`text-xs ${
                messageGoogle.startsWith('❌') ? 'text-destructive' : 'text-emerald-600'
              }`}
            >
              {messageGoogle}
            </p>
          )}
        </div>
      )}
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
