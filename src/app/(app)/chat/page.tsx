import { redirect } from 'next/navigation'
import { creerConversation, lireConversations } from '@/actions/chat'
import { SidebarConversations } from '@/components/chat/sidebar-conversations'
import { InterfaceChat } from '@/components/chat/interface-chat'

export const dynamic = 'force-dynamic'

export default async function PageChat({
  searchParams,
}: {
  searchParams: Promise<{ c?: string; new?: string; etab?: string }>
}) {
  const params = await searchParams
  let conversationId = params.c

  if (params.new === '1' || !conversationId) {
    const r = await creerConversation('haiku', params.etab ?? null)
    if (r.data) {
      redirect(`/chat?c=${r.data.id}${params.etab ? `&etab=${params.etab}` : ''}`)
    }
    // Si on arrive ici, creerConversation a échoué
    return (
      <div className="p-6">
        <h1 className="text-lg font-semibold">Impossible de créer une conversation</h1>
        <p className="mt-2 text-sm text-muted-foreground">{r.erreur ?? 'Erreur inconnue'}</p>
      </div>
    )
  }

  const conversations = await lireConversations()
  return (
    <div className="flex">
      <SidebarConversations conversations={conversations} actifId={conversationId} />
      <div className="flex-1">
        <InterfaceChat
          conversationId={conversationId!}
          etablissementId={params.etab}
          modeleInitial="haiku"
        />
      </div>
    </div>
  )
}
