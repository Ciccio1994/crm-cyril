import { listerCandidatsEnrichissement } from '@/actions/enrichir-google'
import { EnrichirBatch } from '@/components/admin/enrichir-batch'

export const dynamic = 'force-dynamic'

export default async function PageEnrichir() {
  const r = await listerCandidatsEnrichissement()

  return (
    <div className="flex flex-col gap-4 px-4 pb-24 pt-4">
      <header>
        <h1 className="text-2xl font-semibold">Enrichir depuis Google Maps</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Établissements dont l&apos;enseigne ressemble à un nom de personne physique.
          Google Places peut fournir le vrai nom commercial et les horaires.
        </p>
      </header>

      {r.erreur && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          ❌ {r.erreur}
        </div>
      )}

      {r.data && <EnrichirBatch candidatsInitiaux={r.data} />}
    </div>
  )
}
