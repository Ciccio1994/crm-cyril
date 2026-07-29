import { lireRappels } from '@/actions/rappels'
import { ListeRappels } from '@/components/rappels/liste-rappels'
// import { BoutonNouveauRappel } from '@/components/rappels/bouton-nouveau-rappel' // TODO T3

export const dynamic = 'force-dynamic'

export default async function PageRappels() {
  const rappels = await lireRappels()
  return (
    <div className="flex flex-col gap-4 px-4 pb-24 pt-4">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Rappels</h1>
        {/* <BoutonNouveauRappel /> viendra en T3 */}
      </header>
      <ListeRappels rappelsInitiaux={rappels} />
    </div>
  )
}
