import type { Etablissement, Contact, Visite, Offre } from '@/types/database'
import type { Horaires } from '@/types/horaires'

export interface ContexteFiche {
  etablissement: Etablissement
  contacts: Contact[]
  dernieres_visites: Visite[]   // max 3
  offres_actives: Offre[]
  horaires: Horaires | null
}

function formaterDate(iso: string): string {
  return new Intl.DateTimeFormat('fr-CH', {
    timeZone: 'Europe/Zurich', dateStyle: 'full', timeStyle: 'short',
  }).format(new Date(iso))
}

export function construireSystemePrompt(contexte?: ContexteFiche): string {
  const parts: string[] = [
    "Tu es l'assistant CRM de Cyril Cicero, commercial en vins pour Schenk/Obrist en Valais.",
    "",
    "Ta mission : l'aider à gérer ses clients, rappels, visites et offres, en langage naturel.",
    "",
    "Règles importantes :",
    "- Tu peux LIRE (lireVisites, chercherEtablissements) sans confirmation.",
    "- Toute action de MODIFICATION (creerRappel, creerVisite, mettreAJourHoraires, mettreAJourEtablissement) sera soumise à Cyril pour confirmation avant d'être exécutée. Tu n'as pas besoin de demander sa permission dans la conversation : le CRM gère la validation.",
    "- N'appelle jamais dans la même réponse un outil de LECTURE et un outil de MODIFICATION. Si tu as besoin de lire d'abord, fais uniquement la lecture — je te renverrai le résultat et tu proposeras la modification à la réponse suivante.",
    "- Tu n'envoies AUCUN message externe (WhatsApp, mail, SMS). Cyril agit lui-même après notification.",
    "- Format date pour les outils : ISO 8601 avec offset (ex 2026-08-05T14:00:00+02:00). Fuseau Europe/Zurich.",
    "- Réponses concises, orales, en français suisse. Pas de préambule (« D'accord, je vais… »).",
    "- Si tu as besoin d'un champ manquant (date/heure floue, établissement ambigu), pose UNE seule question courte.",
    "",
    `Date/heure actuelle : ${formaterDate(new Date().toISOString())}.`,
  ]

  if (contexte) {
    const { etablissement: e, contacts, dernieres_visites: visites, offres_actives, horaires } = contexte
    parts.push('', `### Contexte fiche : ${e.enseigne}`)
    if (e.code_schenk) parts.push(`Code Schenk : ${e.code_schenk}`)
    parts.push(`Statut : ${e.statut}`)
    if (e.ville) parts.push(`Ville : ${[e.code_postal, e.ville].filter(Boolean).join(' ')}`)
    if (e.adresse_ligne_1) parts.push(`Adresse : ${e.adresse_ligne_1}`)
    if (e.telephone_principal) parts.push(`Tél : ${e.telephone_principal}`)
    if (contacts.length > 0) {
      parts.push('', 'Contacts :')
      for (const c of contacts) {
        parts.push(`- ${[c.prenom, c.nom].filter(Boolean).join(' ')}${c.fonction ? ` (${c.fonction})` : ''}${c.telephone ? ` — ${c.telephone}` : ''}`)
      }
    }
    if (visites.length > 0) {
      parts.push('', 'Dernières visites :')
      for (const v of visites) {
        parts.push(`- ${v.date_visite}${v.est_manquee ? ' [manquée]' : ''}${v.notes ? ` — ${v.notes.slice(0, 100)}` : ''}`)
      }
    }
    if (offres_actives.length > 0) {
      parts.push('', 'Offres actives :')
      for (const o of offres_actives) parts.push(`- ${o.cuvee_text}${o.prix_promo_chf ? ` — ${o.prix_promo_chf} CHF` : ''}`)
    }
    if (horaires) parts.push('', `Horaires : ${JSON.stringify(horaires)}`)
    parts.push('', `ID de cet établissement (à passer aux outils) : ${e.id}`)
  }

  return parts.join('\n')
}
