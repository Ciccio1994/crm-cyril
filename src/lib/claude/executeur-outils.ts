import { SCHEMAS_OUTILS, type NomOutil } from './outils'
import { creerRappel } from '@/actions/rappels'
import { creerVisite } from '@/actions/visite'
import { mettreAJourEtablissement, lireEtablissements } from '@/actions/etablissement'
import { createClient } from '@/lib/supabase/server'
import { correspondRecherche, normaliserRecherche } from '@/lib/etablissements/recherche'

export type ResultatOutil =
  | { ok: true;  contenu: string }
  | { ok: false; erreur: string }

export async function executerOutil(
  nom: NomOutil,
  input: unknown,
  conversationId: string | null,
): Promise<ResultatOutil> {
  switch (nom) {
    case 'creerRappel': {
      const p = SCHEMAS_OUTILS.creerRappel.safeParse(input)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      const r = await creerRappel({ ...p.data, push_active: true }, 'claude', conversationId)
      return r.erreur
        ? { ok: false, erreur: r.erreur }
        : { ok: true, contenu: `Rappel créé (id ${r.data!.id})` }
    }

    case 'creerVisite': {
      const p = SCHEMAS_OUTILS.creerVisite.safeParse(input)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      // VisiteCreateSchema attend date_visite en datetime ISO (sans offset obligatoire)
      const dateVisite = new Date().toISOString()
      const r = await creerVisite({
        etablissement_id: p.data.etablissement_id,
        duree_minutes:    p.data.duree_minutes,
        notes:            p.data.notes ?? null,
        date_visite:      dateVisite,
      })
      return r.erreur
        ? { ok: false, erreur: String(r.erreur) }
        : { ok: true, contenu: `Visite créée (id ${r.data!.id})` }
    }

    case 'mettreAJourHoraires': {
      const p = SCHEMAS_OUTILS.mettreAJourHoraires.safeParse(input)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      const r = await mettreAJourEtablissement(p.data.etablissement_id, {
        horaires_ouverture: p.data.horaires,
      })
      return r.erreur
        ? { ok: false, erreur: String(r.erreur) }
        : { ok: true, contenu: 'Horaires mis à jour' }
    }

    case 'mettreAJourEtablissement': {
      const p = SCHEMAS_OUTILS.mettreAJourEtablissement.safeParse(input)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      const r = await mettreAJourEtablissement(p.data.id, p.data.champs)
      return r.erreur
        ? { ok: false, erreur: String(r.erreur) }
        : { ok: true, contenu: 'Fiche mise à jour' }
    }

    case 'lireVisites': {
      const p = SCHEMAS_OUTILS.lireVisites.safeParse(input)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      const supabase = await createClient()
      const { data, error } = await supabase
        .from('visite')
        .select('date_visite, duree_minutes, notes, est_manquee')
        .eq('etablissement_id', p.data.etablissement_id)
        .is('deleted_at', null)
        .order('date_visite', { ascending: false })
        .limit(p.data.limite)
      if (error) return { ok: false, erreur: `Erreur lecture visites : ${error.message}` }
      return { ok: true, contenu: JSON.stringify(data ?? []) }
    }

    case 'chercherEtablissements': {
      const p = SCHEMAS_OUTILS.chercherEtablissements.safeParse(input)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      const r = await lireEtablissements()
      if (!r.data) return { ok: false, erreur: 'Erreur lecture établissements' }
      const norm = normaliserRecherche(p.data.requete)
      const matches = r.data
        .filter((e) => correspondRecherche(e, norm))
        .slice(0, p.data.limite)
        .map((e) => ({
          id:          e.id,
          enseigne:    e.enseigne,
          ville:       e.ville,
          statut:      e.statut,
          code_schenk: e.code_schenk,
        }))
      return { ok: true, contenu: JSON.stringify(matches) }
    }
  }
}
