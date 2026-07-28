import { lireClientsEnRetard, lireSuggestionsProspection } from '@/actions/funnel'
import { SuggestionsAujourdhui } from '@/components/home/suggestions-aujourdhui'
import { formatDateSuisse } from '@/lib/format'

export default async function AccueilPage() {
  const [clients, prospects] = await Promise.all([
    lireClientsEnRetard(),
    lireSuggestionsProspection(),
  ])

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <header>
        <h1 className="text-xl font-semibold">Aujourd&apos;hui</h1>
        <p className="text-sm text-muted-foreground">
          {formatDateSuisse(new Date().toISOString())} — tes priorités du jour.
        </p>
      </header>
      <SuggestionsAujourdhui
        clients={clients.data ?? []}
        prospects={prospects.data ?? []}
      />
    </div>
  )
}
