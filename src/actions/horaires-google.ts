'use server'

import { createClient } from '@/lib/supabase/server'
import { parseGooglePeriods, type GooglePeriod } from '@/lib/horaires/google-parser'
import { estNomPersonne } from '@/lib/etablissements/nom-personne'
import { extraireNomCommercial, motsCommuns } from '@/lib/etablissements/nom-commercial'
import { telephonesEquivalents } from '@/lib/etablissements/telephone'
import type { Horaires } from '@/types/horaires'

const SEARCH_TEXT_URL = 'https://places.googleapis.com/v1/places:searchText'
const FIELD_MASK = 'places.id,places.displayName,places.formattedAddress,places.regularOpeningHours'
const FIELD_MASK_ENRICHI = 'places.id,places.displayName,places.formattedAddress,places.regularOpeningHours,places.nationalPhoneNumber'

type ActionResult<T> = { data?: T; erreur?: string }

interface GooglePlace {
  id?: string
  displayName?: { text?: string }
  formattedAddress?: string
  regularOpeningHours?: {
    periods?: GooglePeriod[]
  }
  nationalPhoneNumber?: string
}

// Appel Google Places Text Search (partagé par toutes les actions publiques).
// NB : la New API places:searchText attend `regionCode` (string CLDR),
// PAS `includedRegionCodes` (qui est un paramètre autocomplete uniquement).
async function appelerGooglePlaces(
  query: string,
  fieldMask: string = FIELD_MASK,
  maxResultCount: number = 1,
): Promise<{ places?: GooglePlace[]; erreur?: string }> {
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return { erreur: 'GOOGLE_MAPS_API_KEY manquante' }

  const body = {
    textQuery: query,
    regionCode: 'ch',
    languageCode: 'fr',
    ...(maxResultCount > 1 ? { pageSize: maxResultCount } : {}),
  }

  try {
    const res = await fetch(SEARCH_TEXT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': fieldMask,
      },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const rawText = await res.text()
    if (!res.ok) {
      return { erreur: `Google Places ${res.status}: ${rawText.slice(0, 200)}` }
    }
    const json = JSON.parse(rawText) as { places?: GooglePlace[] }
    if (!json.places || json.places.length === 0) {
      return { erreur: 'Établissement non trouvé sur Google Maps' }
    }
    return { places: json.places }
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}

// Version fiche : lit l'etab, appelle Google, écrit horaires_ouverture en BDD.
export async function recupererHorairesDepuisGoogle(
  etablissementId: string,
): Promise<ActionResult<Horaires>> {
  const supabase = await createClient()
  const { data: etab, error: errE } = await supabase
    .from('etablissement')
    .select('enseigne, adresse_ligne_1, code_postal, ville, telephone_principal')
    .eq('id', etablissementId)
    .is('deleted_at', null)
    .single()
  if (errE || !etab) return { erreur: 'Établissement introuvable' }

  // Concatène TOUTES les infos disponibles pour maximiser le taux de match.
  // Le téléphone fixe est particulièrement discriminant : Google Places
  // matche très bien par numéro.
  const parts = [
    etab.enseigne,
    etab.adresse_ligne_1,
    etab.code_postal,
    etab.ville,
    etab.telephone_principal,
  ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0)

  if (parts.length === 0) {
    return { erreur: 'Données insuffisantes pour rechercher' }
  }
  const query = parts.join(' ')

  const r = await appelerGooglePlaces(query)
  if (r.erreur || !r.places?.[0]) return { erreur: r.erreur ?? 'Erreur inconnue' }

  const horaires = parseGooglePeriods(r.places[0].regularOpeningHours?.periods)
  if (!horaires) return { erreur: 'Aucun horaire disponible sur Google Maps pour ce lieu' }

  const { error: errU } = await supabase
    .from('etablissement')
    .update({ horaires_ouverture: horaires })
    .eq('id', etablissementId)
  if (errU) return { erreur: `Erreur BDD : ${errU.message}` }

  return { data: horaires }
}

// Version formulaire édition : takes free-form query, no DB write.
export async function chercherHorairesGoogle(
  query: string,
): Promise<ActionResult<Horaires>> {
  if (!query || query.trim().length === 0) {
    return { erreur: 'Données insuffisantes pour rechercher' }
  }
  const r = await appelerGooglePlaces(query.trim())
  if (r.erreur || !r.places?.[0]) return { erreur: r.erreur ?? 'Erreur inconnue' }
  const horaires = parseGooglePeriods(r.places[0].regularOpeningHours?.periods)
  if (!horaires) return { erreur: 'Aucun horaire disponible sur Google Maps pour ce lieu' }
  return { data: horaires }
}

// ===========================================================================
// Enrichissement : récupérer nom commercial + horaires depuis Google Places
// ===========================================================================
//
// Stratégies multiples avec scoring de confiance. Vise 3 objectifs :
// - Éviter les faux positifs (homonymes voisins : "Michel Taramarcaz" au lieu
//   de "Café Le Central") en croisant plusieurs signaux (téléphone, nom,
//   adresse, code postal)
// - Utiliser le nom commercial extrait des notes_internes (raison sociale
//   Excel) comme requête prioritaire
// - Si confiance faible, laisser Cyril choisir parmi les candidats

export interface ResultatEnrichissement {
  ancien_nom: string
  nouveau_nom: string | null
  enseigne_ecrasee: boolean
  horaires_ecrites: boolean
  formatted_address: string | null
  google_phone: string | null
  strategie_utilisee: string
}

export interface CandidatGoogle {
  place_id: string
  display_name: string
  formatted_address: string | null
  national_phone_number: string | null
  a_horaires: boolean
  confiance: 'haute' | 'moyenne' | 'faible'
  strategie: string
}

export type ReponseEnrichissement =
  | { type: 'auto'; resultat: ResultatEnrichissement }
  | { type: 'choix'; candidats: CandidatGoogle[] }
  | { type: 'aucun'; message: string }

interface EtatFiche {
  enseigne: string
  adresse_ligne_1: string | null
  code_postal: string | null
  ville: string | null
  telephone_principal: string | null
  horaires_ouverture: Horaires | null
  notes_internes: string | null
}

interface EvaluationCandidat {
  place: GooglePlace
  confiance: 'haute' | 'moyenne' | 'faible'
  score: number
  strategie: string
}

// Évalue la confiance d'un résultat Google par rapport à l'état BDD.
// - Haute : téléphone Google == téléphone BDD (normalisation CH/international)
// - Moyenne : nom Google partage ≥1 mot commun (≥3 chars) avec nom extrait notes
//   OU adresse Google contient le code_postal BDD
// - Faible : aucun des critères ci-dessus
function evaluerCandidat(place: GooglePlace, etat: EtatFiche, nomCommercialNotes: string | null, strategie: string): EvaluationCandidat {
  const telMatch = telephonesEquivalents(place.nationalPhoneNumber, etat.telephone_principal)
  const nomGoogle = place.displayName?.text ?? ''
  const nomsCommuns = nomCommercialNotes ? motsCommuns(nomCommercialNotes, nomGoogle) : 0
  const cpMatch = etat.code_postal ? (place.formattedAddress ?? '').includes(etat.code_postal) : false

  let confiance: 'haute' | 'moyenne' | 'faible' = 'faible'
  let score = 0
  if (telMatch) { confiance = 'haute'; score = 100 }
  else if (nomsCommuns > 0) { confiance = 'moyenne'; score = 50 + nomsCommuns * 5 }
  else if (cpMatch) { confiance = 'moyenne'; score = 30 }
  return { place, confiance, score, strategie }
}

function toCandidatGoogle(ev: EvaluationCandidat): CandidatGoogle {
  return {
    place_id: ev.place.id ?? '',
    display_name: ev.place.displayName?.text ?? '(sans nom)',
    formatted_address: ev.place.formattedAddress ?? null,
    national_phone_number: ev.place.nationalPhoneNumber ?? null,
    a_horaires: (ev.place.regularOpeningHours?.periods?.length ?? 0) > 0,
    confiance: ev.confiance,
    strategie: ev.strategie,
  }
}

interface Strategie {
  nom: string
  requete: string
}

// Construit la liste ordonnée des stratégies de recherche selon les données dispo.
function construireStrategies(etat: EtatFiche, nomCommercialNotes: string | null): Strategie[] {
  const s: Strategie[] = []
  if (nomCommercialNotes && etat.ville) {
    s.push({
      nom: 'notes+adresse+ville',
      requete: [nomCommercialNotes, etat.adresse_ligne_1, etat.ville].filter(Boolean).join(' '),
    })
  }
  if (etat.telephone_principal && etat.ville) {
    s.push({
      nom: 'tel+ville',
      requete: [etat.telephone_principal, etat.ville].filter(Boolean).join(' '),
    })
  }
  if (etat.adresse_ligne_1 && etat.ville) {
    s.push({
      nom: 'adresse+cp+ville',
      requete: [etat.adresse_ligne_1, etat.code_postal, etat.ville].filter(Boolean).join(' '),
    })
  }
  // Fallback : l'enseigne actuelle + tout ce qu'on a
  const fallbackParts = [etat.enseigne, etat.adresse_ligne_1, etat.code_postal, etat.ville, etat.telephone_principal]
    .filter((p): p is string => typeof p === 'string' && p.trim().length > 0)
  if (fallbackParts.length > 0) {
    s.push({ nom: 'enseigne+tout', requete: fallbackParts.join(' ') })
  }
  // Dédup par requête pour éviter d'appeler Google deux fois avec la même chose
  const vues = new Set<string>()
  return s.filter((strat) => {
    if (vues.has(strat.requete)) return false
    vues.add(strat.requete)
    return true
  })
}

// Écrit dans la BDD un résultat auto-accepté (haute confiance) ou choisi manuellement.
// - En mode auto (haute confiance uniquement) : n'écrase l'enseigne QUE si nom personne
// - En mode forcé (choix manuel utilisateur OU confirm bypass) : écrase toujours si Google a un nom
async function appliquerResultat(
  supabase: Awaited<ReturnType<typeof createClient>>,
  etablissementId: string,
  etat: EtatFiche,
  place: GooglePlace,
  strategieNom: string,
  forceEcrasement: boolean = false,
): Promise<ResultatEnrichissement> {
  const nouveauNom = place.displayName?.text?.trim() ?? null
  const nouveauxHoraires = parseGooglePeriods(place.regularOpeningHours?.periods)

  const doitEcraserEnseigne =
    nouveauNom != null &&
    nouveauNom !== etat.enseigne &&
    (forceEcrasement || estNomPersonne(etat.enseigne))
  // Horaires : first-write-wins par défaut ; en mode forcé, on écrase aussi
  const doitEcrireHoraires =
    nouveauxHoraires !== null &&
    (forceEcrasement || etat.horaires_ouverture == null)

  const patch: Record<string, unknown> = {}
  if (doitEcraserEnseigne) patch.enseigne = nouveauNom
  if (doitEcrireHoraires) patch.horaires_ouverture = nouveauxHoraires

  if (Object.keys(patch).length > 0) {
    await supabase.from('etablissement').update(patch).eq('id', etablissementId)
  }

  return {
    ancien_nom: etat.enseigne,
    nouveau_nom: nouveauNom,
    enseigne_ecrasee: doitEcraserEnseigne,
    horaires_ecrites: doitEcrireHoraires,
    formatted_address: place.formattedAddress ?? null,
    google_phone: place.nationalPhoneNumber ?? null,
    strategie_utilisee: strategieNom,
  }
}

export async function recupererNomEtHorairesDepuisGoogle(
  etablissementId: string,
  forceEcrasement: boolean = false,
): Promise<ActionResult<ReponseEnrichissement>> {
  const supabase = await createClient()
  const { data: etab, error: errE } = await supabase
    .from('etablissement')
    .select('enseigne, adresse_ligne_1, code_postal, ville, telephone_principal, horaires_ouverture, notes_internes')
    .eq('id', etablissementId)
    .is('deleted_at', null)
    .single()
  if (errE || !etab) return { erreur: 'Établissement introuvable' }

  const etat: EtatFiche = etab as EtatFiche
  const nomCommercialNotes = extraireNomCommercial(etat.notes_internes)
  console.log('[EnrichirGoogle] nom extrait notes:', nomCommercialNotes)

  const strategies = construireStrategies(etat, nomCommercialNotes)
  if (strategies.length === 0) return { erreur: 'Données insuffisantes pour rechercher' }

  // Boucle stratégies avec early-exit sur haute confiance
  const toutesEvaluations: EvaluationCandidat[] = []
  for (const strat of strategies) {
    console.log(`[EnrichirGoogle] stratégie "${strat.nom}" query:`, strat.requete)
    const r = await appelerGooglePlaces(strat.requete, FIELD_MASK_ENRICHI, 5)
    if (r.erreur || !r.places) {
      console.log(`[EnrichirGoogle] stratégie "${strat.nom}" échec:`, r.erreur)
      continue
    }
    const evals = r.places.map((p) => evaluerCandidat(p, etat, nomCommercialNotes, strat.nom))
    console.log(`[EnrichirGoogle] stratégie "${strat.nom}" — ${evals.length} résultats, meilleur score:`, evals[0]?.score)

    // Haute confiance trouvée → auto-accept immédiat
    const hauteConfiance = evals.find((e) => e.confiance === 'haute')
    if (hauteConfiance) {
      const resultat = await appliquerResultat(supabase, etablissementId, etat, hauteConfiance.place, strat.nom, forceEcrasement)
      return { data: { type: 'auto', resultat } }
    }
    toutesEvaluations.push(...evals)
  }

  // Aucune haute confiance : dédup par place_id, tri par score, garde top 5
  const uniques = new Map<string, EvaluationCandidat>()
  for (const ev of toutesEvaluations) {
    const id = ev.place.id ?? ''
    if (!id) continue
    const existant = uniques.get(id)
    if (!existant || ev.score > existant.score) uniques.set(id, ev)
  }
  const tries = Array.from(uniques.values()).sort((a, b) => b.score - a.score).slice(0, 5)

  if (tries.length === 0) {
    return { data: { type: 'aucun', message: 'Aucun établissement trouvé sur Google Maps' } }
  }
  return { data: { type: 'choix', candidats: tries.map(toCandidatGoogle) } }
}

// Applique un choix manuel utilisateur (place_id sélectionné dans la modale).
export async function appliquerChoixGoogle(
  etablissementId: string,
  placeId: string,
): Promise<ActionResult<ResultatEnrichissement>> {
  const supabase = await createClient()
  const { data: etab, error: errE } = await supabase
    .from('etablissement')
    .select('enseigne, adresse_ligne_1, code_postal, ville, telephone_principal, horaires_ouverture, notes_internes')
    .eq('id', etablissementId)
    .is('deleted_at', null)
    .single()
  if (errE || !etab) return { erreur: 'Établissement introuvable' }

  // Nouveau lookup Google du place_id précis via Places Details
  // (via searchText avec l'ID textuel pour rester sur un seul endpoint)
  const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`
  const key = process.env.GOOGLE_MAPS_API_KEY
  if (!key) return { erreur: 'GOOGLE_MAPS_API_KEY manquante' }

  try {
    const res = await fetch(url, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK_ENRICHI.replace(/places\./g, ''),
      },
      cache: 'no-store',
    })
    if (!res.ok) {
      const rawText = await res.text()
      return { erreur: `Google Places Details ${res.status}: ${rawText.slice(0, 200)}` }
    }
    const place = (await res.json()) as GooglePlace
    // Choix manuel utilisateur → force l'écrasement (l'user a explicitement choisi ce candidat)
    const resultat = await appliquerResultat(supabase, etablissementId, etab as EtatFiche, place, 'choix_manuel', true)
    return { data: resultat }
  } catch (e) {
    return { erreur: e instanceof Error ? e.message : 'Erreur inconnue' }
  }
}
