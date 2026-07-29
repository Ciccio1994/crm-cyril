'use client'

import Link from 'next/link'
import { Card } from '@/components/ui/card'
import type { Conversation } from '@/types/conversation'

function formaterDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))
}

export function SidebarConversations({
  conversations,
  actifId,
}: {
  conversations: Conversation[]
  actifId?: string
}) {
  return (
    <aside className="hidden w-72 shrink-0 border-r bg-muted/20 p-3 sm:block">
      <Link
        href="/chat?new=1"
        className="mb-3 block rounded-md border bg-white p-3 text-center text-sm font-medium hover:bg-accent"
      >
        + Nouveau chat
      </Link>
      <ul className="space-y-1">
        {conversations.map((c) => (
          <li key={c.id}>
            <Link href={`/chat?c=${c.id}`}>
              <Card className={`p-2 text-xs ${c.id === actifId ? 'bg-accent' : ''}`}>
                <div className="truncate font-medium">{c.titre ?? '(sans titre)'}</div>
                <div className="text-muted-foreground">{formaterDate(c.updated_at)}</div>
              </Card>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  )
}
