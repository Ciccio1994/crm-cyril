'use client'

import { Card } from '@/components/ui/card'
import type { EchangeChat } from '@/hooks/use-chat'

export function BulleMessage({ echange }: { echange: EchangeChat }) {
  const estUser = echange.role === 'user'
  return (
    <div className={`flex ${estUser ? 'justify-end' : 'justify-start'}`}>
      <Card
        className={`max-w-[85%] whitespace-pre-wrap p-3 text-sm ${
          estUser ? 'bg-primary text-primary-foreground' : ''
        }`}
      >
        {echange.texte}
      </Card>
    </div>
  )
}
