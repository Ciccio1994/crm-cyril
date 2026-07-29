'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { telHref } from '@/lib/format'
import { supprimerContact } from '@/actions/contact'
import { executerAvecSyncCible } from '@/lib/sync/wrapper'
import { notifierChangement } from '@/lib/sync/revalidation'
import { FormulaireContact } from './formulaire-contact'
import type { Contact } from '@/types/database'

interface OngletContactsProps {
  etablissementId: string
  contacts: Contact[]
}

export function OngletContacts({
  etablissementId,
  contacts,
}: OngletContactsProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Contact | null>(null)
  const [pending, startTransition] = useTransition()

  function ouvrirCreation() {
    setEditing(null)
    setOpen(true)
  }
  function ouvrirEdition(contact: Contact) {
    setEditing(contact)
    setOpen(true)
  }
  function onSuccess() {
    router.refresh()
    notifierChangement()
  }
  function onSupprimer(contact: Contact) {
    if (
      !window.confirm(
        `Supprimer ${contact.prenom ? contact.prenom + ' ' : ''}${contact.nom} ?`,
      )
    )
      return
    startTransition(async () => {
      await executerAvecSyncCible(
        'supprimerContact', contact.id, {},
        (id) => supprimerContact(id),
      )
      router.refresh()
      notifierChangement()
    })
  }

  return (
    <div className="space-y-3">
      {contacts.length === 0 && (
        <p className="rounded-lg border bg-muted/30 p-6 text-center text-sm text-muted-foreground">
          Aucun contact.
        </p>
      )}
      <ul className="space-y-2">
        {contacts.map((c) => {
          const tel = telHref(c.telephone)
          const nomComplet = [c.prenom, c.nom].filter(Boolean).join(' ')
          return (
            <li
              key={c.id}
              className="flex flex-col gap-2 rounded-lg border bg-card p-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate font-medium">{nomComplet}</span>
                    {c.est_principal && (
                      <Badge variant="secondary" className="shrink-0">
                        Principal
                      </Badge>
                    )}
                  </div>
                  {c.fonction && (
                    <p className="text-sm text-muted-foreground">{c.fonction}</p>
                  )}
                </div>
              </div>
              {(tel || c.email) && (
                <div className="flex gap-2">
                  {tel && (
                    <a
                      href={tel}
                      className="tap-target flex-1 rounded-md border px-3 py-2 text-center text-sm"
                    >
                      📞 {c.telephone}
                    </a>
                  )}
                  {c.email && (
                    <a
                      href={`mailto:${c.email}`}
                      className="tap-target flex-1 truncate rounded-md border px-3 py-2 text-center text-sm"
                    >
                      ✉️ {c.email}
                    </a>
                  )}
                </div>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => ouvrirEdition(c)}
                  className="h-10 flex-1 text-sm"
                >
                  Modifier
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  disabled={pending}
                  onClick={() => onSupprimer(c)}
                  className="h-10 text-sm"
                >
                  Supprimer
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      <Button
        type="button"
        onClick={ouvrirCreation}
        className="h-12 w-full text-base"
      >
        + Ajouter un contact
      </Button>

      <FormulaireContact
        open={open}
        onOpenChange={setOpen}
        etablissementId={etablissementId}
        contact={editing}
        onSuccess={onSuccess}
      />
    </div>
  )
}
