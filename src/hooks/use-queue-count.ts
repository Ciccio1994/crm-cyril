'use client'

import { useEffect, useState } from 'react'
import { db } from '@/lib/db/dexie'

export function useQueueCount(): number {
  const [count, setCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function recompter() {
      try {
        const c = await db.sync_queue
          .where('statut').anyOf('en_attente', 'en_cours')
          .count()
        if (!cancelled) setCount(c)
      } catch {
        // Silencieux
      }
    }
    recompter()
    const interval = setInterval(recompter, 3000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [])

  return count
}
