'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
  emoji: string
}

const ITEMS: NavItem[] = [
  { href: '/',               label: "Aujourd'hui",    emoji: '📅' },
  { href: '/etablissements', label: 'Établissements', emoji: '🍷' },
  { href: '/funnel',         label: 'Funnel',         emoji: '📊' },
  { href: '/chat',           label: 'Chat',           emoji: '💬' },
]

export function BottomNav() {
  const pathname = usePathname()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t bg-white safe-bottom">
      <ul className="grid grid-cols-4">
        {ITEMS.map((item) => {
          const actif =
            item.href === '/'
              ? pathname === '/'
              : pathname.startsWith(item.href)
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  'tap-target flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium',
                  actif ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                <span aria-hidden className="text-xl leading-none">
                  {item.emoji}
                </span>
                <span>{item.label}</span>
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
