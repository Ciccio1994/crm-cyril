'use client'

import { useSyncExternalStore } from 'react'

// Petit pub/sub client-side pour déclencher une re-fetch dans les pages
// converties en Client Components (V1e T8). Router.refresh() ne re-déclenche
// pas useEffect de ces pages ; ce compteur, ajouté aux dépendances de leurs
// useEffect, force le re-fetch après une mutation réussie.

let compteur = 0
const abonnes = new Set<() => void>()

export function notifierChangement(): void {
  compteur++
  for (const cb of abonnes) cb()
}

function subscribe(cb: () => void): () => void {
  abonnes.add(cb)
  return () => {
    abonnes.delete(cb)
  }
}

function getSnapshot(): number {
  return compteur
}

function getServerSnapshot(): number {
  return 0
}

export function useRevalidation(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
