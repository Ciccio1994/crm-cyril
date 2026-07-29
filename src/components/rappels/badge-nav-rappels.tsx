'use client'

import { useEffect, useState } from 'react'
import { compterRappelsDus } from '@/actions/rappels'
import { useRevalidation } from '@/lib/sync/revalidation'

export function BadgeNavRappels() {
  const [count, setCount] = useState(0)
  const version = useRevalidation()

  useEffect(() => {
    void compterRappelsDus().then(setCount)
    const id = setInterval(() => void compterRappelsDus().then(setCount), 60_000)
    return () => clearInterval(id)
  }, [version])

  if (count === 0) return null
  return (
    <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
      {count > 99 ? '99+' : count}
    </span>
  )
}
