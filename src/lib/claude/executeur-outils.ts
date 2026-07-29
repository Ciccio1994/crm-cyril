import { SCHEMAS_OUTILS, type NomOutil } from './outils'
import { creerRappel } from '@/actions/rappels'
import { creerVisite } from '@/actions/visite'
import { mettreAJourEtablissement, lireEtablissements } from '@/actions/etablissement'
import { createClient } from '@/lib/supabase/server'
import { correspondRecherche, normaliserRecherche } from '@/lib/etablissements/recherche'
import { normaliserPourGoogle } from '@/lib/etablissements/telephone'
import { parseGooglePeriods } from '@/lib/horaires/google-parser'

export type ResultatOutil =
  | { ok: true;  contenu: string }
  | { ok: false; erreur: string }

// Injecte l'etablissement_id du contexte quand Claude ne l'a pas passé (défensif).
// N'écrase JAMAIS un id déjà présent — respecte le choix explicite de Claude.
function forcerEtabId<T extends { etablissement_id?: string | null }>(
  input: T,
  contexteId?: string | null,
): T {
  if (!contexteId) return input
  if (input.etablissement_id) return input
  return { ...input, etablissement_id: contexteId }
}

export async function executerOutil(
  nom: NomOutil,
  input: unknown,
  conversationId: string | null,
  contexteEtablissementId?: string | null,
): Promise<ResultatOutil> {
  switch (nom) {
    case 'creerRappel': {
      const p = SCHEMAS_OUTILS.creerRappel.safeParse(input)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      const payload = forcerEtabId(p.data, contexteEtablissementId)
      const r = await creerRappel({ ...payload, push_active: true }, 'claude', conversationId)
      return r.erreur
        ? { ok: false, erreur: r.erreur }
        : { ok: true, contenu: `Rappel créé (id ${r.data!.id})` }
    }

    case 'creerVisite': {
      // Zod exige etablissement_id, mais Claude peut oublier en contexte fiche.
      // On ré-injecte AVANT parse dans ce cas.
      const inputAvecContext =
        contexteEtablissementId && input && typeof input === 'object' && !('etablissement_id' in input)
          ? { ...(input as object), etablissement_id: contexteEtablissementId }
          : input
      const p = SCHEMAS_OUTILS.creerVisite.safeParse(inputAvecContext)
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
      const inputAvecContext =
        contexteEtablissementId && input && typeof input === 'object' && !('etablissement_id' in input)
          ? { ...(input as object), etablissement_id: contexteEtablissementId }
          : input
      const p = SCHEMAS_OUTILS.mettreAJourHoraires.safeParse(inputAvecContext)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      const r = await mettreAJourEtablissement(p.data.etablissement_id, {
        horaires_ouverture: p.data.horaires,
      })
      return r.erreur
        ? { ok: false, erreur: String(r.erreur) }
        : { ok: true, contenu: 'Horaires mis à jour' }
    }

    case 'mettreAJourEtablissement': {
      const inputAvecContext =
        contexteEtablissementId && input && typeof input === 'object' && !('id' in input)
          ? { ...(input as object), id: contexteEtablissementId }
          : input
      const p = SCHEMAS_OUTILS.mettreAJourEtablissement.safeParse(inputAvecContext)
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

    case 'rechercherViaGooglePlaces': {
      const p = SCHEMAS_OUTILS.rechercherViaGooglePlaces.safeParse(input)
      if (!p.success) return { ok: false, erreur: p.error.issues.map(i => i.message).join(' — ') }
      const key = process.env.GOOGLE_MAPS_API_KEY
      if (!key) return { ok: false, erreur: 'GOOGLE_MAPS_API_KEY manquante côté serveur' }
      const textQuery = normaliserPourGoogle(
        [p.data.query, p.data.ville].filter((x): x is string => typeof x === 'string' && x.length > 0).join(' '),
      )
      try {
        const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': key,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.formattedAddress,places.regularOpeningHours,places.nationalPhoneNumber,places.websiteUri',
          },
          body: JSON.stringify({
            textQuery, regionCode: 'ch', languageCode: 'fr', pageSize: p.data.limite,
          }),
          cache: 'no-store',
        })
        if (!res.ok) {
          const txt = await res.text()
          return { ok: false, erreur: `Google Places ${res.status}: ${txt.slice(0, 200)}` }
        }
        const json = (await res.json()) as {
          places?: Array<{
            id?: string
            displayName?: { text?: string }
            formattedAddress?: string
            regularOpeningHours?: { periods?: unknown[] }
            nationalPhoneNumber?: string
            websiteUri?: string
          }>
        }
        const resultats = (json.places ?? []).map((pl) => ({
          nom: pl.displayName?.text ?? '(sans nom)',
          adresse: pl.formattedAddress ?? null,
          telephone: pl.nationalPhoneNumber ?? null,
          site_web: pl.websiteUri ?? null,
          horaires: parseGooglePeriods(pl.regularOpeningHours?.periods as never) ?? null,
        }))
        return { ok: true, contenu: JSON.stringify(resultats) }
      } catch (e) {
        return { ok: false, erreur: e instanceof Error ? e.message : 'Erreur Google Places' }
      }
    }
  }
}
