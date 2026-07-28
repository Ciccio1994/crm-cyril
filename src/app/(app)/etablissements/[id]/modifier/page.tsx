import { notFound } from 'next/navigation'
import { lireEtablissement } from '@/actions/etablissement'
import { FormulaireEtablissement } from '@/components/etablissements/formulaire-etablissement'

export default async function ModifierEtablissementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data, erreur } = await lireEtablissement(id)
  if (erreur || !data) notFound()
  return <FormulaireEtablissement mode="edition" initial={data} />
}
