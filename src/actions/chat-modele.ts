'use server'

import { createClient } from '@/lib/supabase/server'
import type { ModeleClaude } from '@/types/conversation'

export async function definirModeleConversation(
  id: string,
  modele: ModeleClaude,
): Promise<{ erreur?: string }> {
  const supabase = await createClient()
  const { error } = await supabase.from('conversation').update({ modele }).eq('id', id)
  if (error) return { erreur: error.message }
  return {}
}
