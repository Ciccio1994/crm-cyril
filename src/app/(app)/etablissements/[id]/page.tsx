import { notFound } from 'next/navigation'
import { lireEtablissement } from '@/actions/etablissement'
import { lireContacts } from '@/actions/contact'
import { lireVisites } from '@/actions/visite'
import { FicheEtablissement } from '@/components/etablissements/fiche-etablissement'

export default async function EtablissementPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const [etabRes, contactsRes, visitesRes] = await Promise.all([
    lireEtablissement(id),
    lireContacts(id),
    lireVisites(id),
  ])
  if (etabRes.erreur || !etabRes.data) notFound()
  return (
    <FicheEtablissement
      etablissement={etabRes.data}
      contacts={contactsRes.data ?? []}
      visites={visitesRes.data ?? []}
    />
  )
}
