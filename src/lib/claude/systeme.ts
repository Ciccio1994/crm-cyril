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

  if (!contexte) {
    parts.push(
      '',
      '### Mode chat général',
      "Tu es en mode général (pas de contexte fiche pré-injecté). Cyril peut :",
      "- Te demander de chercher un ou plusieurs clients (par enseigne, ville, code, contact, tel) via `chercherEtablissements`",
      "- Te demander des infos sur un client (dernières visites, offres, contacts) — utilise d'abord `chercherEtablissements` pour trouver l'ID, puis `lireVisites`",
      "- Te demander de créer un rappel général (sans lien à un client) via `creerRappel` avec `etablissement_id` null",
      "- Répondre à des questions analytiques simples (« combien de clients HORECA à Verbier ? ») en utilisant `chercherEtablissements` puis en comptant",
      '- Discuter librement (aide à formuler un message, conseil commercial, brainstorm).',
      "N'hésite jamais à utiliser tes outils de lecture — ils sont sans risque et n'affectent rien.",
    )
  }

  if (contexte) {
    const { etablissement: e, contacts, dernieres_visites: visites, offres_actives, horaires } = contexte
    parts.push('', `### 🔒 Chat contextuel — établissement : ${e.enseigne}`)
    parts.push('',
      `**Règle absolue** : cette conversation est verrouillée sur l'établissement **${e.enseigne}** (id \`${e.id}\`).`,
      `TOUTES les questions et demandes de Cyril concernent CET établissement, sauf mention explicite du contraire`,
      `(ex : "sur un autre client", "chez X", nom d'un autre client cité clairement).`,
      '',
      `Conséquences pratiques :`,
      `- Les pronoms flous ("il", "elle", "l'", "chez lui", "là-bas") désignent **${e.enseigne}**.`,
      `- Les intentions vagues ("mets un rappel", "note une visite", "envoie un email de relance") s'appliquent à **${e.enseigne}**.`,
      `- **Passe TOUJOURS \`etablissement_id: "${e.id}"\` aux outils** \`creerRappel\`, \`creerVisite\`, \`mettreAJourHoraires\`, \`mettreAJourEtablissement\`. Ne redemande jamais quel client est concerné.`,
      `- Si Cyril demande une info sur un AUTRE client, dis-lui d'ouvrir /chat général ou d'ouvrir la fiche de cet autre client.`,
    )
    parts.push('', `### Données de contexte`)
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
  }

  return parts.join('\n')
}
