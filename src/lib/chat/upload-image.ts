'use client'

import { createClient } from '@/lib/supabase/client'

const MAX_MO = 5
const TYPES_ACCEPTES = ['image/jpeg', 'image/png', 'image/webp']

export async function uploaderImageChat(fichier: File): Promise<{ url: string } | { erreur: string }> {
  if (!TYPES_ACCEPTES.includes(fichier.type)) return { erreur: 'Format non supporté (JPEG/PNG/WebP)' }
  if (fichier.size > MAX_MO * 1024 * 1024) return { erreur: `Fichier > ${MAX_MO} Mo` }

  const supabase = createClient()
  const nomFichier = `${crypto.randomUUID()}-${fichier.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`
  const { error } = await supabase.storage.from('chat-images').upload(nomFichier, fichier, { upsert: false })
  if (error) return { erreur: error.message }

  const { data } = await supabase.storage.from('chat-images').createSignedUrl(nomFichier, 3600)
  if (!data?.signedUrl) return { erreur: 'URL signée impossible' }
  return { url: data.signedUrl }
}
