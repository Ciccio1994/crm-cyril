import { BottomNav } from '@/components/layout/bottom-nav'
import { BarreSync } from '@/components/sync/barre-sync'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-dvh flex-col safe-top">
      <BarreSync />
      <main className="flex-1 overflow-y-auto pb-24">{children}</main>
      <BottomNav />
    </div>
  )
}
