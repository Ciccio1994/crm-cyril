'use client'

import Link from 'next/link'
import { cn } from '@/lib/utils'
import { buttonVariants } from '@/components/ui/button'

export function BoutonChatFiche({ etablissementId }: { etablissementId: string }) {
  return (
    <Link
      href={`/chat?new=1&etab=${etablissementId}`}
      className={cn(buttonVariants({ variant: 'outline' }), 'h-12 w-full gap-1 text-base')}
    >
      💬 Demander à Claude
    </Link>
  )
}
