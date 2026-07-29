'use server'

import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@/lib/supabase/server'
import { MODELES, type Conversation, type ModeleClaude } from '@/types/conversation'

const client = new Anthropic()

type ActionResult<T> = { data?: T; erreur?: string }

export async function creerConversation(
  modele: ModeleClaude,
  etablissementId: string | null,
): Promise<ActionResult<Conversation>> {
  const supabase = await createClient()
  const payload = { modele, etablissement_id: etablissementId, messages: [] as Anthropic.MessageParam[] }
  const { data, error } = await supabase
    .from('conversation')
    .insert(payload)
    .select()
    .single()
  if (error) {
    console.error('[creerConversation] Erreur Supabase :', JSON.stringify(error))
    return { erreur: `${error.code ?? 'ERR'} — ${error.message} (details: ${error.details ?? 'aucun'})` }
  }
  if (!data) return { erreur: 'Aucune donnée retournée' }
  return { data: data as Conversation }
}

export async function lireConversation(id: string): Promise<ActionResult<Conversation>> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('conversation')
    .select('*')
    .eq('id', id)
    .single()
  if (error || !data) return { erreur: 'Introuvable' }
  return { data: data as Conversation }
}

export async function lireConversations(): Promise<Conversation[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('conversation')
    .select('*')
    .order('updated_at', { ascending: false })
    .limit(100)
  return (data ?? []) as Conversation[]
}

/**
 * Génère un titre court (4-8 mots) à partir du premier échange.
 * Utilise Haiku pour minimiser les coûts.
 * Fire-and-forget : ne lève pas d'erreur si titre déjà défini ou messages < 2.
 */
export async function genererTitreConversation(id: string): Promise<void> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('conversation')
    .select('titre, messages')
    .eq('id', id)
    .single()

  if (!data || data.titre) return
  const messages = data.messages as Anthropic.MessageParam[]
  if (messages.length < 2) return

  const r = await client.messages.create({
    model: MODELES.haiku,
    max_tokens: 60,
    system:
      'Résume le sujet de cet échange en 4-8 mots, sans ponctuation finale, en français. Réponds UNIQUEMENT par le titre.',
    messages: messages.slice(0, 2),
  })
  const bloc = r.content.find((b): b is Anthropic.TextBlock => b.type === 'text')
  const titre = bloc?.text.trim().slice(0, 80) ?? null
  if (titre) await supabase.from('conversation').update({ titre }).eq('id', id)
}
