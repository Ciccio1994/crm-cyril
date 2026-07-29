import type Anthropic from '@anthropic-ai/sdk'

export type ModeleClaude = 'haiku' | 'sonnet'

export const MODELES: Record<ModeleClaude, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-4-6',
}

export interface Conversation {
  id: string
  etablissement_id: string | null
  titre: string | null
  modele: ModeleClaude
  messages: Anthropic.MessageParam[]
  tokens_input: number
  tokens_output: number
  alerte_seuil_envoyee_at: string | null
  created_at: string
  updated_at: string
}

export interface ActionEnAttente {
  tool_use_id: string
  nom_outil: string
  parametres: Record<string, unknown>
  description_humaine: string
}
