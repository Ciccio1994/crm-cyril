'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { recupererNomEtHorairesDepuisGoogle, type ResultatEnrichissement } from '@/actions/horaires-google'
import { notifierChangement } from '@/lib/sync/revalidation'
import { estNomPersonne } from '@/lib/etablissements/nom-personne'

interface Props {
  etablissementId: string
  enseigneActuelle: string
}

export function BoutonEnrichirGoogle({ etablissementId, enseigneActuelle }: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [resultat, setResultat] = useState<ResultatEnrichissement | null>(null)
  const [erreur, setErreur] = useState<string | null>(null)

  function onClick() {
    // Sécurité : si l'enseigne actuelle n'est PAS un nom personne, demander confirmation
    // (protection contre écrasement involontaire d'une enseigne déjà correcte).
    if (!estNomPersonne(enseigneActuelle)) {
      const ok = confirm(
        `L'enseigne actuelle « ${enseigneActuelle} » ne semble pas être un nom de personne. ` +
        `Google Places pourrait proposer un autre nom. Continuer ?`,
      )
      if (!ok) return
    }
    setErreur(null)
    setResultat(null)
    startTransition(async () => {
      const r = await recupererNomEtHorairesDepuisGoogle(etablissementId)
      if (r.erreur) {
        setErreur(r.erreur)
        return
      }
      if (r.data) {
        setResultat(r.data)
        if (r.data.enseigne_ecrasee || r.data.horaires_ecrites) {
          notifierChangement()
          router.refresh()
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
      {erreur && (
        <p className="text-sm text-destructive">❌ {erreur}</p>
      )}
      {resultat && !erreur && (
        <div className="space-y-1 rounded-md border bg-emerald-50 p-3 text-sm">
          <p className="font-medium">✅ Résultat Google</p>
          {resultat.enseigne_ecrasee && resultat.nouveau_nom && (
            <p>
              Enseigne : <span className="text-muted-foreground line-through">{resultat.ancien_nom}</span>
              {' → '}
              <span className="font-medium">{resultat.nouveau_nom}</span>
            </p>
          )}
          {!resultat.enseigne_ecrasee && resultat.nouveau_nom && resultat.nouveau_nom !== resultat.ancien_nom && (
            <p className="text-xs text-muted-foreground">
              Google propose « {resultat.nouveau_nom} » mais l&apos;enseigne actuelle a été gardée (pas un nom personne).
            </p>
          )}
          {resultat.horaires_ecrites && <p>Horaires : mis à jour ✓</p>}
          {!resultat.horaires_ecrites && !resultat.enseigne_ecrasee && (
            <p className="text-xs text-muted-foreground">Rien à mettre à jour (déjà à jour ou pas d&apos;horaires Google).</p>
          )}
          {resultat.formatted_address && (
            <p className="text-xs text-muted-foreground">
              Adresse Google : {resultat.formatted_address}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
