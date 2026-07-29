'use client'

import { useCallback, useRef, useState } from 'react'
import type { ActionEnAttente } from '@/types/conversation'
import type { EtatMonitoring } from '@/lib/claude/monitoring'

export interface EchangeChat {
  role: 'user' | 'assistant'
  texte: string
  actions_faites?: Array<{ nom: string; description: string }>
}

interface EtatChat {
  echanges: EchangeChat[]
  enCours: boolean
  actionsEnAttente: ActionEnAttente[]
  monitoring: EtatMonitoring | null
  erreur: string | null
}

interface DecisionOutil {
  tool_use_id: string
  nom_outil: string
  parametres: unknown
  accepte: boolean
}

/**
 * Hook client pour le chat Claude avec streaming SSE.
 * Consomme les endpoints /api/chat/stream et /api/chat/confirmer via fetch + ReadableStream.
 * (EventSource non utilisé car les deux endpoints sont POST.)
 */
export function useChat(conversationId: string, etablissementId?: string) {
  const [etat, setEtat] = useState<EtatChat>({
    echanges: [],
    enCours: false,
    actionsEnAttente: [],
    monitoring: null,
    erreur: null,
  })
  const abortRef = useRef<AbortController | null>(null)

  /**
   * Consomme un flux SSE depuis un endpoint POST.
   * Parse le buffer par blocs séparés de "\n\n", extrait event + data.
   */
  const consommerSSE = useCallback(async (url: string, body: unknown) => {
    setEtat((s) => ({ ...s, enCours: true, erreur: null, actionsEnAttente: [] }))

    // Annule un éventuel appel concurrent
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl

    let assistantBuf = ''

    try {
      const resp = await fetch(url, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
      })

      if (!resp.ok) {
        const texte = await resp.text()
        setEtat((s) => ({
          ...s,
          enCours: false,
          erreur: texte || `Erreur HTTP ${resp.status}`,
        }))
        return
      }

      if (!resp.body) throw new Error('Pas de body SSE dans la réponse')

      const reader = resp.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      // Réinitialise le buffer de l'assistant pour ce nouvel appel
      assistantBuf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })

        // Chaque événement SSE est séparé par "\n\n"
        const blocs = buffer.split('\n\n')
        // Le dernier élément peut être un bloc incomplet — on le remet en buffer
        buffer = blocs.pop() ?? ''

        for (const raw of blocs) {
          if (!raw.trim()) continue
          const lignes = raw.split('\n')
          const event = lignes
            .find((l) => l.startsWith('event: '))
            ?.slice(7)
            .trim()
          const dataLine = lignes.find((l) => l.startsWith('data: '))?.slice(6)
          if (!event || !dataLine) continue

          let data: unknown
          try {
            data = JSON.parse(dataLine)
          } catch {
            continue
          }

          switch (event) {
            case 'text_delta': {
              const d = data as { delta: string }
              assistantBuf += d.delta
              const snapshot = assistantBuf
              setEtat((s) => {
                const echanges = [...s.echanges]
                if (echanges.at(-1)?.role !== 'assistant') {
                  echanges.push({ role: 'assistant', texte: '' })
                }
                echanges[echanges.length - 1] = {
                  role: 'assistant',
                  texte: snapshot,
                }
                return { ...s, echanges }
              })
              break
            }
            case 'pending_action': {
              const action = data as ActionEnAttente
              setEtat((s) => ({
                ...s,
                actionsEnAttente: [...s.actionsEnAttente, action],
              }))
              break
            }
            case 'monitoring': {
              setEtat((s) => ({ ...s, monitoring: data as EtatMonitoring }))
              break
            }
            case 'erreur': {
              const e = data as { message: string }
              setEtat((s) => ({ ...s, erreur: e.message, enCours: false }))
              break
            }
            case 'done': {
              setEtat((s) => ({ ...s, enCours: false }))
              break
            }
          }
        }
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setEtat((s) => ({
        ...s,
        enCours: false,
        erreur: (e as Error).message ?? 'Erreur inconnue',
      }))
    }
  }, [])

  /**
   * Envoie un message utilisateur et démarre le streaming.
   * Ajoute immédiatement la bulle user dans les échanges (optimistic update).
   */
  const envoyerMessage = useCallback(
    (message: string, imageUrl?: string) => {
      setEtat((s) => ({
        ...s,
        echanges: [...s.echanges, { role: 'user', texte: message }],
      }))
      return consommerSSE('/api/chat/stream', {
        conversationId,
        message,
        imageUrl,
        etablissementId,
      })
    },
    [conversationId, etablissementId, consommerSSE],
  )

  /**
   * Soumet les décisions utilisateur (accepte / refuse) pour les actions en attente.
   */
  const confirmerActions = useCallback(
    (decisions: DecisionOutil[]) => {
      return consommerSSE('/api/chat/confirmer', {
        conversationId,
        etablissementId,
        decisions,
      })
    },
    [conversationId, etablissementId, consommerSSE],
  )

  /**
   * Hydrate le hook avec l'historique existant (depuis la BDD).
   */
  const chargerHistorique = useCallback((echanges: EchangeChat[]) => {
    setEtat((s) => ({ ...s, echanges }))
  }, [])

  return { etat, envoyerMessage, confirmerActions, chargerHistorique }
}
