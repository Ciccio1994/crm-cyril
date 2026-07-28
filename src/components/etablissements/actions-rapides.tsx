'use client'

import { telHref } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Etablissement } from '@/types/database'

function buildGeoHref(etab: Etablissement): string | null {
  const adresse = [etab.adresse_ligne_1, etab.code_postal, etab.ville]
    .filter(Boolean)
    .join(' ')
  if (!adresse && !(etab.latitude && etab.longitude)) return null
  if (etab.latitude != null && etab.longitude != null) {
    const q = adresse
      ? `?q=${encodeURIComponent(adresse)}`
      : ''
    return `geo:${etab.latitude},${etab.longitude}${q}`
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adresse)}`
}

interface BoutonProps {
  href: string | null
  emoji: string
  label: string
  external?: boolean
}

function Bouton({ href, emoji, label, external }: BoutonProps) {
  const dispo = href !== null
  return (
    <a
      href={href ?? '#'}
      aria-disabled={!dispo}
      target={external ? '_blank' : undefined}
      rel={external ? 'noreferrer' : undefined}
      onClick={(e) => {
        if (!dispo) e.preventDefault()
      }}
      className={cn(
        'tap-target flex h-16 flex-col items-center justify-center gap-1 rounded-lg border text-sm',
        dispo
          ? 'bg-card hover:bg-muted/50'
          : 'pointer-events-none opacity-40',
      )}
    >
      <span aria-hidden className="text-xl leading-none">
        {emoji}
      </span>
      <span>{label}</span>
    </a>
  )
}

export function ActionsRapides({ etab }: { etab: Etablissement }) {
  const tel = telHref(etab.telephone_principal ?? etab.telephone_mobile)
  const mail = etab.email ? `mailto:${etab.email}` : null
  const geo = buildGeoHref(etab)
  const geoExterne = geo?.startsWith('https://') ?? false

  return (
    <div className="grid grid-cols-3 gap-2 px-4 pt-4">
      <Bouton href={tel} emoji="📞" label="Appeler" />
      <Bouton href={mail} emoji="✉️" label="Écrire" />
      <Bouton href={geo} emoji="📍" label="Itinéraire" external={geoExterne} />
    </div>
  )
}
