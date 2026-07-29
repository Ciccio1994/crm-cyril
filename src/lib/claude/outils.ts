import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

export type NomOutil =
  | 'creerRappel' | 'creerVisite' | 'mettreAJourHoraires'
  | 'mettreAJourEtablissement' | 'lireVisites' | 'chercherEtablissements'

// Outils "lecture" — exécutés automatiquement sans confirmation.
export const OUTILS_LECTURE: NomOutil[] = ['lireVisites', 'chercherEtablissements']

// Outils "modification" — bufferisés, confirmation utilisateur obligatoire.
export const OUTILS_MODIFICATION: NomOutil[] = [
  'creerRappel', 'creerVisite', 'mettreAJourHoraires', 'mettreAJourEtablissement',
]

// Schémas Zod par outil (validation server-side avant exécution).
export const SCHEMAS_OUTILS = {
  creerRappel: z.object({
    titre: z.string().min(1).max(200),
    echeance: z.string().datetime({ offset: true }),
    canal: z.enum(['whatsapp', 'mail', 'telephone', 'sms', 'autre']).nullable().optional(),
    etablissement_id: z.string().uuid().nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
  }),
  creerVisite: z.object({
    etablissement_id: z.string().uuid(),
    duree_minutes: z.number().int().min(1).max(600),
    notes: z.string().max(4000).nullable().optional(),
  }),
  mettreAJourHoraires: z.object({
    etablissement_id: z.string().uuid(),
    horaires: z.record(
      z.enum(['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche']),
      z.union([
        z.array(z.object({ debut: z.string(), fin: z.string() })),
        z.null(),
      ]),
    ),
  }),
  mettreAJourEtablissement: z.object({
    id: z.string().uuid(),
    champs: z.object({
      enseigne:            z.string().optional(),
      adresse_ligne_1:     z.string().nullable().optional(),
      code_postal:         z.string().nullable().optional(),
      ville:               z.string().nullable().optional(),
      telephone_principal: z.string().nullable().optional(),
      telephone_mobile:    z.string().nullable().optional(),
      email:               z.string().email().nullable().optional(),
      site_web:            z.string().url().nullable().optional(),
      notes_internes:      z.string().nullable().optional(),
    }).refine((c) => Object.keys(c).length > 0, 'Au moins un champ requis'),
  }),
  lireVisites: z.object({
    etablissement_id: z.string().uuid(),
    limite: z.number().int().min(1).max(50).default(10),
  }),
  chercherEtablissements: z.object({
    requete: z.string().min(1).max(200),
    limite: z.number().int().min(1).max(50).default(20),
  }),
} as const

// Description "humaine" affichée dans l'UI pour la confirmation.
// `enseigne` est fourni par l'appelant quand la chat est contextuelle (fiche fixée)
// OU quand on peut résoudre le nom depuis l'etablissement_id passé par Claude.
// Quand non résolu, la description reste générique (chat général sans client).
export function descriptionHumaine(
  nom: NomOutil,
  params: Record<string, unknown>,
  enseigne?: string,
): string {
  const suffixeClient = enseigne ? ` — chez ${enseigne}` : ''
  switch (nom) {
    case 'creerRappel': {
      const dt = new Date(params.echeance as string)
      const fmt = new Intl.DateTimeFormat('fr-CH', {
        timeZone: 'Europe/Zurich',
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      })
      return `Créer un rappel${suffixeClient} : « ${params.titre} » pour le ${fmt.format(dt)}`
    }
    case 'creerVisite':
      return `Enregistrer une visite${suffixeClient} (${params.duree_minutes} min)`
    case 'mettreAJourHoraires':
      return `Mettre à jour les horaires d'ouverture${suffixeClient}`
    case 'mettreAJourEtablissement': {
      const champs = Object.keys(params.champs as object)
      return `Modifier la fiche${suffixeClient} : ${champs.join(', ')}`
    }
    default:
      return nom
  }
}

// Définitions envoyées à Claude (Anthropic.Tool[]).
export const OUTILS_CLAUDE: Anthropic.Tool[] = [
  {
    name: 'creerRappel',
    description: "Crée un rappel/tâche à échéance donnée. À utiliser dès que Cyril exprime une intention d'action future.",
    input_schema: {
      type: 'object',
      properties: {
        titre:             { type: 'string', description: "Titre concis à l'impératif (< 200 caractères)." },
        echeance:          { type: 'string', description: 'ISO 8601 avec offset Europe/Zurich.' },
        canal:             { type: 'string', enum: ['whatsapp', 'mail', 'telephone', 'sms', 'autre'], description: 'Canal indicatif (non exécuté).' },
        etablissement_id:  { type: 'string', description: 'UUID du client si contexte présent.' },
        description:       { type: 'string', description: 'Détails optionnels.' },
      },
      required: ['titre', 'echeance'],
    },
  },
  {
    name: 'creerVisite',
    description: 'Enregistre une visite (passage chez un client) avec durée et notes libres.',
    input_schema: {
      type: 'object',
      properties: {
        etablissement_id: { type: 'string', description: 'UUID du client.' },
        duree_minutes:    { type: 'number', description: 'Durée en minutes (typiquement 60 ou 120).' },
        notes:            { type: 'string', description: 'Compte rendu libre (dégustations, remarques…).' },
      },
      required: ['etablissement_id', 'duree_minutes'],
    },
  },
  {
    name: 'mettreAJourHoraires',
    description: "Met à jour les horaires d'ouverture hebdomadaires d'un établissement.",
    input_schema: {
      type: 'object',
      properties: {
        etablissement_id: { type: 'string', description: 'UUID du client.' },
        horaires: {
          type: 'object',
          description: 'Objet { lundi: [{debut, fin}, ...] | null, mardi: ..., ... }. Format HH:mm.',
        },
      },
      required: ['etablissement_id', 'horaires'],
    },
  },
  {
    name: 'mettreAJourEtablissement',
    description: "Modifie un ou plusieurs champs d'une fiche établissement (enseigne, adresse, téléphone, email…).",
    input_schema: {
      type: 'object',
      properties: {
        id:     { type: 'string', description: 'UUID du client.' },
        champs: { type: 'object', description: 'Champs à modifier. Ne pas inclure les champs inchangés.' },
      },
      required: ['id', 'champs'],
    },
  },
  {
    name: 'lireVisites',
    description: 'Lit les dernières visites d\'un client (pour répondre "quand j\'ai vu X la dernière fois ?").',
    input_schema: {
      type: 'object',
      properties: {
        etablissement_id: { type: 'string', description: 'UUID du client.' },
        limite:           { type: 'number', description: 'Nombre max de visites à retourner (défaut 10).' },
      },
      required: ['etablissement_id'],
    },
  },
  {
    name: 'chercherEtablissements',
    description: 'Recherche des établissements par nom, ville, code, adresse, téléphone ou contact (recherche multi-champs).',
    input_schema: {
      type: 'object',
      properties: {
        requete: { type: 'string', description: 'Termes de recherche (ex "HORECA Verbier").' },
        limite:  { type: 'number', description: 'Nombre max de résultats (défaut 20).' },
      },
      required: ['requete'],
    },
  },
]
