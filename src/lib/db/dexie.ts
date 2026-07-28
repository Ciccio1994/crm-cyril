import Dexie, { type Table } from 'dexie'
import type {
  Etablissement,
  Contact,
  Visite,
  Rappel,
  Tournee,
  Zone,
  Offre,
} from '@/types/database'

export class CrmDatabase extends Dexie {
  etablissements!: Table<Etablissement>
  contacts!: Table<Contact>
  visites!: Table<Visite>
  rappels!: Table<Rappel>
  tournees!: Table<Tournee>
  zones!: Table<Zone>
  offres!: Table<Offre>

  constructor() {
    super('crm-cyril')
    this.version(1).stores({
      etablissements: 'id, tournee_id, statut, derniere_visite_at, deleted_at, updated_at',
      contacts:       'id, etablissement_id, deleted_at',
      visites:        'id, etablissement_id, date_visite, est_manquee, deleted_at',
      rappels:        'id, etablissement_id, echeance, statut, canal, deleted_at',
      tournees:       'id',
      zones:          'id, code',
      offres:         'id, date_fin, deleted_at',
    })
  }
}

export const db = new CrmDatabase()
