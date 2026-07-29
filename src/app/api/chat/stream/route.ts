import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { MODELES, type ModeleClaude } from '@/types/conversation'
import { construireSystemePrompt } from '@/lib/claude/systeme'
import {
  OUTILS_CLAUDE,
  OUTILS_MODIFICATION,
  descriptionHumaine,
  type NomOutil,
} from '@/lib/claude/outils'
import { executerOutil } from '@/lib/claude/executeur-outils'
import { ajouterConsommation } from '@/lib/claude/monitoring'
import { genererTitreConversation } from '@/actions/chat'
import { chargerContexteFiche } from '@/lib/claude/contexte-fiche'

const streamBodySchema = z.object({
  conversationId: z.string().uuid(),
  message: z.string().min(1),
  imageUrl: z.string().url().optional(),
  etablissementId: z.string().uuid().optional(),
})

const client = new Anthropic()
const MAX_ITERATIONS = 6

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = streamBodySchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(JSON.stringify({ erreur: parsed.error.issues.map(i => i.message).join(' — ') }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }
  const { conversationId, message, imageUrl, etablissementId } = parsed.data
  console.error('[Stream] POST reçu', { conversationId, message: message?.slice(0, 100), hasImage: !!imageUrl, etablissementId })

  const supabase = await createClient()
  const { data: conv } = await supabase
    .from('conversation')
    .select('*')
    .eq('id', conversationId)
    .single()
  if (!conv) return new Response('Conversation introuvable', { status: 404 })

  const modele = conv.modele as ModeleClaude
  const contexte = etablissementId
    ? await chargerContexteFiche(etablissementId)
    : null

  // Contenu utilisateur — multimodal si imageUrl fournie
  const userContent: Anthropic.ContentBlockParam[] = imageUrl
    ? [
        { type: 'image', source: { type: 'url', url: imageUrl } },
        { type: 'text', text: message },
      ]
    : [{ type: 'text', text: message }]

  const messages: Anthropic.MessageParam[] = [
    ...(conv.messages as Anthropic.MessageParam[]),
    { role: 'user', content: userContent },
  ]

  let tokensIn = 0
  let tokensOut = 0
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        )
      }

      // Abort signal : annule l'appel Anthropic quand le client coupe la connexion
      const abortCtrl = new AbortController()
      req.signal.addEventListener('abort', () => abortCtrl.abort())

      try {
        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          const anthStream = client.messages.stream({
            model: MODELES[modele],
            max_tokens: 4096,
            system: construireSystemePrompt(contexte ?? undefined),
            tools: OUTILS_CLAUDE,
            messages,
          }, { signal: abortCtrl.signal })

          // Streame les deltas texte au client en temps réel
          anthStream.on('text', (delta) => send('text_delta', { delta }))

          const finalMsg = await anthStream.finalMessage()
          // NB : input_tokens inclut à chaque itération le prompt système + définitions
          // d'outils + historique cumulé. Le compteur peut sembler 3-4× plus élevé que
          // le volume "perçu" utilisateur — c'est normal (coût réel API).
          tokensIn += finalMsg.usage.input_tokens
          tokensOut += finalMsg.usage.output_tokens
          console.error('[Stream] itération', iter, 'stop_reason:', finalMsg.stop_reason, 'tokens in/out:', finalMsg.usage.input_tokens, finalMsg.usage.output_tokens)
          messages.push({ role: 'assistant', content: finalMsg.content })

          if (finalMsg.stop_reason === 'end_turn') break

          if (finalMsg.stop_reason !== 'tool_use') {
            send('erreur', {
              message: `Stop reason inattendue : ${finalMsg.stop_reason}`,
            })
            break
          }

          // Sépare les tool_use : lecture (auto) vs modification (confirmation)
          const toolUses = finalMsg.content.filter(
            (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use',
          )
          const modifications = toolUses.filter((t) =>
            OUTILS_MODIFICATION.includes(t.name as NomOutil),
          )

          if (modifications.length > 0) {
            // Envoie chaque action de modification au client pour confirmation
            for (const t of modifications) {
              send('pending_action', {
                tool_use_id: t.id,
                nom_outil: t.name,
                parametres: t.input,
                description_humaine: descriptionHumaine(
                  t.name as NomOutil,
                  t.input as Record<string, unknown>,
                ),
              })
            }
            // Persiste la conversation en l'état (tool_use présent, en attente de tool_result)
            await supabase
              .from('conversation')
              .update({
                messages,
                tokens_input: conv.tokens_input + tokensIn,
                tokens_output: conv.tokens_output + tokensOut,
              })
              .eq('id', conversationId)
            const monitoring = await ajouterConsommation(modele, tokensIn, tokensOut)
            send('monitoring', monitoring)
            send('done', { conversation_id: conversationId, en_attente: true })
            controller.close()
            return
          }

          // Tous les outils sont des lectures : exécute et continue la boucle
          const results: Anthropic.ToolResultBlockParam[] = []
          for (const t of toolUses) {
            console.error('[Stream] executerOutil', t.name, 'input type:', typeof t.input, 'input:', JSON.stringify(t.input)?.slice(0, 200))
            const r = await executerOutil(
              t.name as NomOutil,
              t.input,
              conversationId,
            )
            console.error('[Stream] résultat outil', t.name, 'ok:', r.ok, 'contenu type:', typeof (r.ok ? r.contenu : r.erreur), 'preview:', String(r.ok ? r.contenu : r.erreur).slice(0, 200))
            results.push({
              type: 'tool_result',
              tool_use_id: t.id,
              content: r.ok ? r.contenu : `Erreur : ${r.erreur}`,
              is_error: !r.ok,
            })
          }
          messages.push({ role: 'user', content: results })
        }

        // Fin naturelle : persiste + titre auto fire-and-forget
        console.error('[Stream] persist conversation, messages count:', messages.length, 'tokens cumul:', tokensIn, tokensOut)
        await supabase
          .from('conversation')
          .update({
            messages,
            tokens_input: conv.tokens_input + tokensIn,
            tokens_output: conv.tokens_output + tokensOut,
          })
          .eq('id', conversationId)

        console.error('[Stream] avant ajouterConsommation modele:', modele, 'in:', tokensIn, 'out:', tokensOut)
        const monitoring = await ajouterConsommation(modele, tokensIn, tokensOut)
        send('monitoring', monitoring)
        void genererTitreConversation(conversationId).catch(() => {})
        send('done', { conversation_id: conversationId, en_attente: false })
      } catch (e) {
        if ((e as Error).name === 'AbortError' || req.signal.aborted) {
          // Client a coupé : sortir silencieusement
          controller.close()
          return
        }
        console.error('[Stream] CATCH ERREUR', {
          name: (e as Error)?.name,
          message: (e as Error)?.message,
          stack: (e as Error)?.stack,
          typeof: typeof e,
          string: String(e),
          keys: e && typeof e === 'object' ? Object.keys(e as object) : null,
        })
        send('erreur', { message: e instanceof Error ? e.message : 'Erreur inconnue' })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  })
}
