import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { MODELES, type ModeleClaude } from '@/types/conversation'
import { construireSystemePrompt } from '@/lib/claude/systeme'
import { OUTILS_CLAUDE, type NomOutil } from '@/lib/claude/outils'
import { executerOutil } from '@/lib/claude/executeur-outils'
import { ajouterConsommation } from '@/lib/claude/monitoring'
import { chargerContexteFiche } from '@/lib/claude/contexte-fiche'

const confirmerBodySchema = z.object({
  conversationId: z.string().uuid(),
  etablissementId: z.string().uuid().optional(),
  decisions: z.array(z.object({
    tool_use_id: z.string(),
    nom_outil: z.enum(['creerRappel', 'creerVisite', 'mettreAJourHoraires', 'mettreAJourEtablissement', 'lireVisites', 'chercherEtablissements']),
    parametres: z.unknown(),
    accepte: z.boolean(),
  })).min(1),
})

const client = new Anthropic()

export async function POST(req: NextRequest) {
  const raw = await req.json()
  const parsed = confirmerBodySchema.safeParse(raw)
  if (!parsed.success) {
    return new Response(JSON.stringify({ erreur: parsed.error.issues.map(i => i.message).join(' — ') }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    })
  }
  const body = parsed.data as { conversationId: string; etablissementId?: string; decisions: Array<{ tool_use_id: string; nom_outil: NomOutil; parametres: unknown; accepte: boolean }> }

  console.error('[Confirmer] POST reçu', { conversationId: body.conversationId, etablissementId: body.etablissementId, decisionsCount: body.decisions.length, decisions: body.decisions.map(d => ({ tool_use_id: d.tool_use_id, nom_outil: d.nom_outil, accepte: d.accepte, parametres_type: typeof d.parametres })) })

  const supabase = await createClient()
  const { data: conv } = await supabase
    .from('conversation')
    .select('*')
    .eq('id', body.conversationId)
    .single()
  if (!conv) return new Response('Conversation introuvable', { status: 404 })

  const modele = conv.modele as ModeleClaude
  const contexte = body.etablissementId
    ? await chargerContexteFiche(body.etablissementId)
    : null
  const messages = conv.messages as Anthropic.MessageParam[]

  // Construit les tool_result pour chaque décision (acceptée ou refusée)
  const results: Anthropic.ToolResultBlockParam[] = []
  for (const d of body.decisions) {
    if (!d.accepte) {
      results.push({
        type: 'tool_result',
        tool_use_id: d.tool_use_id,
        content: "Utilisateur a refusé cette action.",
        is_error: false,
      })
      continue
    }
    console.error('[Confirmer] executerOutil', d.nom_outil, 'parametres type:', typeof d.parametres, 'parametres:', JSON.stringify(d.parametres)?.slice(0, 200))
    const r = await executerOutil(d.nom_outil, d.parametres, body.conversationId)
    console.error('[Confirmer] résultat outil', d.nom_outil, 'ok:', r.ok, 'contenu type:', typeof (r.ok ? r.contenu : r.erreur), 'preview:', String(r.ok ? r.contenu : r.erreur).slice(0, 200))
    results.push({
      type: 'tool_result',
      tool_use_id: d.tool_use_id,
      content: r.ok ? r.contenu : `Erreur : ${r.erreur}`,
      is_error: !r.ok,
    })
  }
  messages.push({ role: 'user', content: results })

  const encoder = new TextEncoder()
  let tokensIn = 0
  let tokensOut = 0

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
        // Un seul appel : Claude ack les tool_results et répond en end_turn
        const anthStream = client.messages.stream({
          model: MODELES[modele],
          max_tokens: 4096,
          system: construireSystemePrompt(contexte ?? undefined),
          tools: OUTILS_CLAUDE,
          messages,
        }, { signal: abortCtrl.signal })

        anthStream.on('text', (delta) => send('text_delta', { delta }))

        const finalMsg = await anthStream.finalMessage()
        tokensIn += finalMsg.usage.input_tokens
        tokensOut += finalMsg.usage.output_tokens
        messages.push({ role: 'assistant', content: finalMsg.content })

        await supabase
          .from('conversation')
          .update({
            messages,
            tokens_input: conv.tokens_input + tokensIn,
            tokens_output: conv.tokens_output + tokensOut,
          })
          .eq('id', body.conversationId)

        const monitoring = await ajouterConsommation(modele, tokensIn, tokensOut)
        send('monitoring', monitoring)
        send('done', { conversation_id: body.conversationId, en_attente: false })
      } catch (e) {
        if ((e as Error).name === 'AbortError' || req.signal.aborted) {
          // Client a coupé : sortir silencieusement
          controller.close()
          return
        }
        console.error('[Confirmer] CATCH ERREUR', {
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
