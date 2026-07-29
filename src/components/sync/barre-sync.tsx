'use client'

import { useState, useEffect, useRef } from 'react'
import { ModalSync } from './modal-sync'
import { useOnline } from '@/hooks/use-online'
import { useQueueCount } from '@/hooks/use-queue-count'
import { synchroniser } from '@/lib/sync/dispatcher'
import { BadgeReseau } from './badge-reseau'
import { Badge } from '@/components/ui/badge'

const SYNC_INTERVAL_MS = 5 * 60 * 1000

export function BarreSync() {
  const [open, setOpen] = useState(false)
  const online = useOnline()
  const queueCount = useQueueCount()
  const dernierOnlineRef = useRef(online)
  const dejaMonteRef = useRef(false)

  // Auto-sync au démarrage si online + queue non vide (une fois)
  useEffect(() => {
    if (!dejaMonteRef.current && online && queueCount > 0) {
      dejaMonteRef.current = true
      synchroniser().catch(() => {})
    }
  }, [online, queueCount])

  // Auto-sync quand on repasse online
  useEffect(() => {
    if (!dernierOnlineRef.current && online && queueCount > 0) {
      synchroniser().catch(() => {})
    }
    dernierOnlineRef.current = online
  }, [online, queueCount])

  // Sync périodique toutes les 5 min si online
  useEffect(() => {
    if (!online) return
    const interval = setInterval(() => {
      synchroniser().catch(() => {})
    }, SYNC_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [online])

  return (
    <div className="flex items-center gap-2 border-b bg-white/95 px-4 py-2 backdrop-blur">
      <BadgeReseau />
      {queueCount > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="tap-target flex items-center gap-1 text-xs underline"
        >
          <Badge variant="destructive">{queueCount}</Badge>
          <span>en attente — Synchroniser</span>
        </button>
      )}
      <ModalSync open={open} onOpenChange={setOpen} autoStart={false} />
    </div>
  )
}
