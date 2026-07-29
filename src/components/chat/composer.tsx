'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

import { uploaderImageChat } from '@/lib/chat/upload-image'

interface Props {
  onEnvoyer: (texte: string, imageUrl?: string) => void
  desactive: boolean
  modele: 'haiku' | 'sonnet'
  onChangerModele: (m: 'haiku' | 'sonnet') => void
}

export function Composer({ onEnvoyer, desactive, modele, onChangerModele }: Props) {
  const [texte, setTexte] = useState('')
  const [image, setImage] = useState<{ file: File; preview: string } | null>(null)
  const [uploading, setUploading] = useState(false)
  const [erreurImg, setErreurImg] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!texte.trim() && !image) return

    let imageUrl: string | undefined

    if (image) {
      setUploading(true)
      const r = await uploaderImageChat(image.file)
      setUploading(false)
      if ('erreur' in r) { setErreurImg(r.erreur); return }
      imageUrl = r.url
    }

    const capture = texte
    setTexte('')
    setImage(null)
    setErreurImg(null)
    onEnvoyer(capture, imageUrl)
  }

  return (
    <form
      onSubmit={onSubmit}
      className="sticky bottom-0 flex flex-col gap-2 border-t bg-white p-3 pb-safe"
    >
      {image && (
        <div className="relative inline-block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image.preview} alt="" className="h-20 rounded" />
          <button
            type="button"
            onClick={() => setImage(null)}
            className="absolute -right-1 -top-1 rounded-full bg-destructive px-1.5 text-xs text-white"
          >
            ×
          </button>
        </div>
      )}
      {erreurImg && <p className="text-xs text-destructive">{erreurImg}</p>}
      <div className="flex items-end gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) setImage({ file: f, preview: URL.createObjectURL(f) })
          }}
          className="hidden"
        />
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => inputRef.current?.click()}
          disabled={desactive}
        >
          📎
        </Button>
        <Textarea
          value={texte}
          onChange={(e) => setTexte(e.target.value)}
          placeholder="Ex : Rappelle-moi de rappeler M. Dupont demain à 14h"
          rows={2}
          className="flex-1"
          disabled={desactive || uploading}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              ;(e.currentTarget.form as HTMLFormElement).requestSubmit()
            }
          }}
        />
        <Button
          type="submit"
          disabled={desactive || uploading || (!texte.trim() && !image)}
        >
          Envoyer
        </Button>
      </div>
      <label className="flex items-center gap-2 text-xs text-muted-foreground">
        <input
          type="checkbox"
          checked={modele === 'sonnet'}
          onChange={(e) => onChangerModele(e.target.checked ? 'sonnet' : 'haiku')}
        />
        🧠 Réfléchir plus (Sonnet, plus lent et plus cher)
      </label>
    </form>
  )
}
