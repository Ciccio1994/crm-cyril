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
