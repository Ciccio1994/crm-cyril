'use client'

import { useEffect, useRef, useState } from 'react'
import type Anthropic from '@anthropic-ai/sdk'
import { useChat } from '@/hooks/use-chat'
import { lireConversation } from '@/actions/chat'
import { notifierChangement } from '@/lib/sync/revalidation'
import type { ModeleClaude, ActionEnAttente } from '@/types/conversation'
import { BulleMessage } from './bulle-message'
import { Composer } from './composer'
import { CarteActionEnAttente } from './carte-action-en-attente'
import { BanniereMonitoring } from './banniere-monitoring'

interface Props {
  conversationId: string
  etablissementId?: string
  modeleInitial: ModeleClaude
}

function extraireTexte(content: Anthropic.MessageParam['content']): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((b: any) => b.type === 'text')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((b: any) => b.text as string)
    .join('\n')
}

export function InterfaceChat({ conversationId, etablissementId, modeleInitial }: Props) {
  const [modele, setModele] = useState<ModeleClaude>(modeleInitial)
  const { etat, envoyerMessage, confirmerActions, chargerHistorique } = useChat(
    conversationId,
    etablissementId,
  )
  const finRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    finRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [etat.echanges, etat.actionsEnAttente.length])

  useEffect(() => {
    void lireConversation(conversationId).then((r) => {
      if (r.data?.messages) {
        chargerHistorique(
          r.data.messages
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              texte: extraireTexte(m.content),
            }))
            .filter((e) => e.texte),
        )
      }
    })
  }, [conversationId, chargerHistorique])

  function onDeciderAction(action: ActionEnAttente, accepte: boolean) {
    void confirmerActions([
      {
        tool_use_id: action.tool_use_id,
        nom_outil: action.nom_outil,
        parametres: action.parametres,
        accepte,
      },
    ])
    if (accepte) notifierChangement()
  }

  return (
    <div className="flex h-[calc(100vh-64px)] flex-col">
      <BanniereMonitoring monitoring={etat.monitoring} />
      <div className="flex-1 space-y-3 overflow-y-auto px-3 pt-3">
        {etat.echanges.length === 0 && !etat.enCours && (
          <div className="rounded-lg border border-dashed p-6 text-center text-muted-foreground">
            Écris ton intention en langage naturel — je peux créer rappels, visites, horaires,
            chercher des clients…
          </div>
        )}
        {etat.echanges.map((e, i) => (
          <BulleMessage key={i} echange={e} />
        ))}
        {etat.actionsEnAttente.map((a) => (
          <CarteActionEnAttente
            key={a.tool_use_id}
            action={a}
            onDecider={(ok) => onDeciderAction(a, ok)}
          />
        ))}
        {etat.enCours && (
          <div className="text-sm italic text-muted-foreground">Claude réfléchit…</div>
        )}
        {etat.erreur && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            ❌ {etat.erreur}
          </div>
        )}
        <div ref={finRef} />
      </div>
      <Composer
        onEnvoyer={envoyerMessage}
        desactive={etat.enCours || etat.actionsEnAttente.length > 0}
        modele={modele}
        onChangerModele={setModele}
      />
    </div>
  )
}
