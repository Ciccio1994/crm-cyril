import { notFound } from 'next/navigation'
import { lireEtablissement } from '@/actions/etablissement'
import { FicheEtablissement } from '@/components/etablissements/fiche-etablissement'

export default async function EtablissementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const { data, erreur } = await lireEtablissement(id)
  if (erreur || !data) notFound()
  return <FicheEtablissement etablissement={data} />
}
