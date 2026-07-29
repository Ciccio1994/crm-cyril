'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import {
  recupererNomEtHorairesDepuisGoogle,
  appliquerChoixGoogle,
  type ResultatEnrichissement,
  type CandidatGoogle,
} from '@/actions/horaires-google'
import { notifierChangement } from '@/lib/sync/revalidation'
import { estNomPersonne } from '@/lib/etablissements/nom-personne'
import { ModaleChoixGoogle } from './modale-choix-google'

interface Props {
  etablissementId: string
  enseigneActuelle: string
}

export function BoutonEnrichirGoogle({ etablissementId, enseigneActuelle }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [resultat, setResultat] = useState<ResultatEnrichissement | null>(null)
  const [candidats, setCandidats] = useState<CandidatGoogle[] | null>(null)
  const [messageAucun, setMessageAucun] = useState<string | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  function reset() {
    setResultat(null); setCandidats(null); setMessageAucun(null); setErreur(null)
  }

  function onClick() {
    if (!estNomPersonne(enseigneActuelle)) {
      const ok = confirm(
        `L'enseigne actuelle « ${enseigneActuelle} » ne semble pas être un nom de personne. ` +
        `Google Places pourrait proposer un autre nom. Continuer ?`,
      )
      if (!ok) return
    }
    reset()
    startTransition(async () => {
      const r = await recupererNomEtHorairesDepuisGoogle(etablissementId)
      if (r.erreur) { setErreur(r.erreur); return }
      if (!r.data) return
      switch (r.data.type) {
        case 'auto':
          setResultat(r.data.resultat)
          if (r.data.resultat.enseigne_ecrasee || r.data.resultat.horaires_ecrites) {
            notifierChangement(); router.refresh()
          }
          break
        case 'choix':
          setCandidats(r.data.candidats)
          break
        case 'aucun':
          setMessageAucun(r.data.message)
          break
      }
    })
  }

  function onChoisir(placeId: string) {
    reset()
    startTransition(async () => {
      const r = await appliquerChoixGoogle(etablissementId, placeId)
      if (r.erreur) { setErreur(r.erreur); return }
      if (r.data) {
        setResultat(r.data)
        if (r.data.enseigne_ecrasee || r.data.horaires_ecrites) {
          notifierChangement(); router.refresh()
        }
      }
    })
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        disabled={pending}
        className="h-12 w-full text-base"
      >
        {pending ? 'Recherche Google…' : '🔍 Récupérer nom + horaires depuis Google Maps'}
      </Button>
      {erreur && <p className="text-sm text-destructive">❌ {erreur}</p>}
      {messageAucun && (
        <p className="text-sm text-muted-foreground">⚠️ {messageAucun}</p>
      )}
      {resultat && !erreur && (
        <div className="space-y-1 rounded-md border bg-emerald-50 p-3 text-sm">
          <p className="font-medium">✅ Résultat Google ({resultat.strategie_utilisee})</p>
          {resultat.enseigne_ecrasee && resultat.nouveau_nom && (
            <p>
              Enseigne : <span className="text-muted-foreground line-through">{resultat.ancien_nom}</span>
              {' → '}
              <span className="font-medium">{resultat.nouveau_nom}</span>
            </p>
          )}
          {!resultat.enseigne_ecrasee && resultat.nouveau_nom && resultat.nouveau_nom !== resultat.ancien_nom && (
            <p className="text-xs text-muted-foreground">
              Google propose « {resultat.nouveau_nom} » mais l&apos;enseigne actuelle a été gardée.
            </p>
          )}
          {resultat.horaires_ecrites && <p>Horaires : mis à jour ✓</p>}
          {!resultat.horaires_ecrites && !resultat.enseigne_ecrasee && (
            <p className="text-xs text-muted-foreground">Rien à mettre à jour.</p>
          )}
          {resultat.formatted_address && (
            <p className="text-xs text-muted-foreground">Adresse Google : {resultat.formatted_address}</p>
          )}
        </div>
      )}
      <ModaleChoixGoogle
        candidats={candidats}
        onChoisir={onChoisir}
        onAnnuler={() => setCandidats(null)}
      />
    </div>
  )
}
