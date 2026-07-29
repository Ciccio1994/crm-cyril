'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Card } from '@/components/ui/card'
import { compterRappelsDus } from '@/actions/rappels'
import { useRevalidation } from '@/lib/sync/revalidation'

export function WidgetRappelsAujourdhui() {
  const [count, setCount] = useState(0)
  const version = useRevalidation()

  useEffect(() => {
    void compterRappelsDus().then(setCount)
  }, [version])

  if (count === 0) return null
  return (
    <Link href="/rappels">
      <Card className="flex items-center gap-3 p-4">
        <div className="text-3xl">⏰</div>
        <div>
          <p className="font-medium">
            {count} rappel{count > 1 ? 's' : ''} aujourd&apos;hui
          </p>
          <p className="text-sm text-muted-foreground">Tape pour consulter</p>
        </div>
      </Card>
    </Link>
  )
}
