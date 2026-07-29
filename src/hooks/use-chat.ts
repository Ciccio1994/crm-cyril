'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
 * Parseur SSE spec-compliant (WHATWG HTML EventSource).
 *
 * Prend un buffer et retourne les événements complets + le reste incomplet.
 * Gère :
 * - Normalisation des fins de ligne : CRLF, CR, LF (crucial pour Android Chrome
 *   où Vercel/HTTP2 peut renvoyer CRLF alors que desktop reçoit LF)
 * - Multi-lignes `data:` (concaténées avec \n dans la valeur)
 * - `data:X` (sans espace) et `data: X` (avec espace, skippé)
 * - Lignes commentaires (commencent par `:`)
 * - Champ `event:` optionnel (défaut `message`)
 */
export function parseSSEBuffer(bufferBrut: string): {
  events: Array<{ event: string; data: string }>
  rest: string
} {
  // Normalise CRLF et CR isolés vers LF (spec SSE §9.2.5)
  const buffer = bufferBrut.replace(/\r\n|\r/g, '\n')
  const parts = buffer.split('\n\n')
  const rest = parts.pop() ?? ''
  const events: Array<{ event: string; data: string }> = []

  for (const part of parts) {
    if (!part.trim()) continue
    let event = 'message'
    let data = ''
    for (const rawLigne of part.split('\n')) {
      if (rawLigne === '' || rawLigne.startsWith(':')) continue
      const idx = rawLigne.indexOf(':')
      const champ = idx === -1 ? rawLigne : rawLigne.slice(0, idx)
      let valeur = idx === -1 ? '' : rawLigne.slice(idx + 1)
      if (valeur.startsWith(' ')) valeur = valeur.slice(1)
      if (champ === 'event') event = valeur
      else if (champ === 'data') data = data === '' ? valeur : `${data}\n${valeur}`
    }
    events.push({ event, data })
  }
  return { events, rest }
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

  // Cleanup : abort la requête SSE quand le composant unmount
  useEffect(() => {
    return () => abortRef.current?.abort()
  }, [])

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

        // Parseur SSE spec-compliant (voir parseSSEBuffer en haut du fichier)
        const { events: evenements, rest } = parseSSEBuffer(buffer)
        buffer = rest

        for (const { event, data: dataLine } of evenements) {
          if (event === 'message' && !dataLine) continue
          if (!dataLine) continue

          let data: unknown
          try {
            data = JSON.parse(dataLine)
          } catch (err) {
            console.error('[Chat] JSON.parse échec', {
              event,
              dataLine_type: typeof dataLine,
              dataLine_length: dataLine.length,
              dataLine_preview: String(dataLine).slice(0, 300),
              erreur_message: (err as Error)?.message,
              erreur_stack: (err as Error)?.stack,
            })
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
              console.error('[Chat] event erreur reçu du serveur', {
                message_type: typeof e.message,
                message: e.message,
                message_stringified: String(e.message),
                data_complete: data,
              })
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
      console.error('[Chat] CATCH consommerSSE', {
        name: (e as Error)?.name,
        message: (e as Error)?.message,
        stack: (e as Error)?.stack,
        typeof: typeof e,
        string: String(e),
      })
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
    setEtat((s) => {
      // Ne remplace pas si l'utilisateur a déjà commencé à interagir
      if (s.echanges.length > 0) return s
      return { ...s, echanges }
    })
  }, [])

  return { etat, envoyerMessage, confirmerActions, chargerHistorique }
}
