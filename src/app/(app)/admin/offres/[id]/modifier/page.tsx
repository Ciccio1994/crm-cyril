import { notFound } from 'next/navigation'
import { lireOffreParId } from '@/actions/offres'
import { FormulaireOffre } from '@/components/offres/formulaire-offre'

export default async function ModifierOffrePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const r = await lireOffreParId(id)
  if (r.erreur || !r.data) notFound()
  return <FormulaireOffre mode="edition" initial={r.data} />
}
