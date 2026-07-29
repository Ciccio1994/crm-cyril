'use client'

import { useOnline } from '@/hooks/use-online'
import { Badge } from '@/components/ui/badge'

export function BadgeReseau() {
  const online = useOnline()
  return (
    <Badge
      className={
        online
          ? 'bg-emerald-500 hover:bg-emerald-500'
          : 'bg-red-500 hover:bg-red-500'
      }
    >
      {online ? '🟢 En ligne' : '🔴 Hors ligne'}
    </Badge>
  )
}
