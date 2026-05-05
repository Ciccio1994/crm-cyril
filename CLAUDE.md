# CRM Cyril — Contexte projet

> **Spec canonique** : `docs/superpowers/specs/2026-05-05-crm-cyril-v1-design.md`
> Tout choix d'architecture, scope ou UX critique doit s'y référer en priorité. Le présent CLAUDE.md est le résumé opérationnel.

## Qui suis-je et ce que je fais

Je m'appelle Cyril Cicero. Je suis commercial en vins (représentant) pour Schenk/Obrist, sur le corridor Martigny-Sierre dans le Valais (Suisse). Je vends des vins valaisans et étrangers à des clients B2B : restaurateurs, cavistes, hôtels, épiceries fines.

Je travaille seul sur le terrain, principalement en voiture entre les caves et les restaurants. J'ai besoin d'un outil utilisable :
- Sur mon ordinateur (Surface Pro 11) au bureau et chez moi
- Sur mon téléphone (iPhone) sur le terrain
- Y compris dans des caves ou des zones sans réseau (offline)

## Objectif du projet

Construire un CRM personnel solo, propre, moderne et durable. Pas une démo, un outil que je vais utiliser tous les jours pendant des années.

L'objectif principal : me faire gagner du temps sur la gestion administrative et m'aider à être plus efficace commercialement (ne rien oublier, mieux prioriser, voir le CA en temps réel).

## Critère de succès (le seul qui compte)

> **La fiche établissement sur mobile doit être PLUS PRATIQUE que Google Contacts.**

Si après 2 semaines d'utilisation Cyril revient écrire ses notes dans Google Contacts au lieu du CRM, le projet a échoué — peu importe la qualité technique du reste. Voir spec §2.

## Philosophie de développement

> **Qualité > rapidité.** V1 défini par son contenu, pas par sa durée. Mieux vaut V1 livré en 8 semaines et utilisable 5 ans qu'un V1 bâclé en 4 semaines.

Les « 4 semaines » et « 2 semaines » qui apparaissent dans le projet sont la **cadence commerciale de tournée**, jamais une contrainte de planning de dev.

## Stack technique

- Frontend : Next.js 15 (App Router) + React 19 + TypeScript strict
- Styling : Tailwind CSS + shadcn/ui
- PWA : installable iPhone/Android, fonctionnelle offline
- Offline-first : IndexedDB (Dexie.js) + Service Worker (next-pwa) + queue de mutations FIFO
- Backend : Supabase (Postgres + Auth + Storage). Realtime → V2+, pas V1.
- Auth : Supabase Auth + OAuth Google (single user)
- AI : Claude API (Anthropic SDK) intégrée **dès V1** (création de rappels via tool calling)
- Notifications : Web Push API via Service Worker
- Hébergement : Vercel (frontend) + Supabase (backend)
- Repo : GitHub privé, branche `main` protégée
- CI : GitHub Actions (typecheck + Vitest + lint)

**Décisions de scope verrouillées** (cf. spec §9) :
- ❌ **Pas de sync Google Calendar** (calendrier interne CRM uniquement, V2)
- ❌ **Pas de sync Google People / Contacts** (la fiche établissement remplace Google Contacts)
- ✅ **Géographie : 4 zones macro × 19 tournées micro** (et non « 4 zones du corridor » comme dans la version initiale)
- ✅ **Le CRM ne déclenche jamais d'action externe** (pas d'API WhatsApp/Twilio/MailerSend). Cyril est notifié, Cyril agit.

## Conventions de code

- Langue UI : français (fr-CH), 100% du contenu utilisateur en français
- Devise : CHF affichée comme `1'234.50 CHF` (apostrophe = milliers, point = décimale)
- Dates : format suisse `JJ.MM.AAAA`. Heure 24h `HH:mm`
- Fuseau : Europe/Zurich
- Noms de fichiers : `kebab-case.tsx`
- Composants React : `PascalCase`
- Fonctions / variables : `camelCase`
- Tables Supabase : `snake_case` singulier (`etablissement`, `visite`, `rappel`)
- Imports : alias `@/` pour la racine `src/`
- Champs métier : français (`client.nom`, jamais `client.name`)

## Règles de qualité non négociables

- **TDD obligatoire** : tests d'abord, code ensuite. Vitest pour les tests unitaires, Playwright pour le e2e quand pertinent.
- TypeScript strict : `strict: true`, zéro `any` sans commentaire justifiant.
- Pas de secrets en dur : tout via `.env.local`, jamais commités. Vérifier `.gitignore`.
- Migrations Supabase : versionner toutes les migrations SQL dans `supabase/migrations/`. Jamais via UI Supabase.
- Validation des inputs : Zod pour tous les formulaires et toutes les API routes.
- Erreurs visibles : afficher proprement à l'utilisateur, pas de try/catch silencieux.
- Commits : messages en français, format conventionnel (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`).

## Données métier (vocabulaire)

- **Établissement** : point de vente (restaurant, caviste, hôtel, épicerie, cave d'altitude, ...). Cœur du modèle.
- **Entreprise** : entité légale (parent optionnel d'1..N établissements)
- **Contact** : personne (patron, sommelier, acheteur, ...) rattachée à un établissement
- **Client** : établissement avec statut `client_actif` ou `client_inactif` (calculé auto sur `derniere_commande_at`)
- **Prospect** : établissement avec statut `prospect` (démarchage en cours)
- **`pas_interesse`** : a refusé pour le moment, **on peut ré-essayer plus tard**
- **`prospect_abandonne`** : refus **définitif**, ne plus démarcher (visuellement grisé, exclu prospection auto V2/V3, réactivable manuellement)
- **Visite** : passage chez un établissement (date, durée, notes libres, photos en V1.5). Les **dégustations** sont en texte libre dans `visite.notes` en V1 (table dédiée en V2).
- **Visite manquée** (`est_manquee = true`) : passage prévu mais raté. **Cadence sacrée** : pas de rattrapage hors cycle, le client revient au prochain tour normal.
- **Rappel / Tâche** : action à faire à une échéance précise. Module central V1, distinct du calendrier (V2). Canal indicatif (whatsapp/mail/téléphone/sms) **purement informatif**.
- **Commande** (V2) : commande passée par un client (lignes, montant CHF)
- **Cuvée** : un vin du portefeuille Schenk. Texte libre V1, référentiel structuré V2.
- **Offre temporelle** : promotion Schenk (cuvée, prix, dates, conditions). Saisie manuelle V1, alertes V2, import auto PDF V3.
- **Zone** : 4 zones macro (à confirmer N4)
- **Tournée** : 19 micro-tournées issues de l'Excel (Anzère-Ayent, Sion-Savièse, etc.)
- **CA** : Chiffre d'Affaires (montant cumulé des commandes)
- **Cycle en retard** : établissement `client_actif`/`client_inactif` non visité depuis > cycle de sa tournée (2 sem hot / 4 sem autre). Badge fiche + cadran home + notif push quotidienne. **Information, pas obligation.**

## Modules V1 (scope FIGÉ)

1. **Établissements & contacts** : import Excel minimal, CRUD, recherche, fiche optimisée mobile, badge retard
2. **Visites** : CRUD offline-first, durées rapides 60/120 min, **visite manquée** + cadence sacrée
3. **Pilotage 6+2** : 6 visites clients + 2 prospects/jour, compteur live home, settings modulables
4. **Offres temporelles** : page « Offres en cours », CRUD manuel, PDF en pièce jointe optionnel
5. **Rappels & tâches** : CRUD, vue dédiée « Tâches à faire », **carnet d'appels de la semaine**, notifications push
6. **Chat Claude** : drawer global, tool `creer_rappel` (1 seul outil V1), streaming, monitoring tokens
7. **Offline & sync** : queue Dexie FIFO, retry exponentiel, badge en attente, bandeau hors-ligne, sync manuelle 1-tap

**Hors V1** (cf. spec §8) :
- Photos, carte, géocodage → V1.5
- Calendrier, commandes, planif auto, référentiel cuvée, funnel dégustation, Claude étendu (suggestions) → V2
- Import auto PDF, prospection IA, enrichissement web, Claude conversationnel complet → V3

**🔒 SCOPE V1 FIGÉ.** Aucune nouvelle feature avant la livraison V1. Toute idée nouvelle → §12 « Idées V2+ » du spec.

## Rôle de Claude API en V1 (limites strictes)

Claude V1 fait **UNE SEULE chose** : créer des rappels structurés à partir d'une intention en langage naturel.

✅ Lit le contexte (visite courante, établissement, date locale)
✅ Crée 1..N rappels via tool `creer_rappel`
✅ Streaming de la réponse, persistance dans `conversation`

❌ N'envoie aucun message externe (jamais)
❌ Ne consulte pas l'historique (V2)
❌ Ne répond pas aux questions analytiques sur CA/clients/agenda (V3)
❌ Ne modifie ni établissements, contacts, offres

> **Le CRM est l'assistant de Cyril, pas son agent.** Notification push → Cyril agit manuellement.

## À éviter

- Pas de bibliothèques lourdes pour des features simples (pas de Redux quand un `useState` suffit)
- Pas de réécriture de code existant qui marche
- Pas de premature optimization
- Pas d'over-engineering : c'est un CRM solo, pas SAP
- Pas de noms en anglais sur le métier français (`client.nom`, pas `client.name`)
- **Pas d'intégration messagerie externe**, même « pour faciliter la vie »

## Workflow Superpowers

Pour toute nouvelle feature ou changement non trivial :
1. **Brainstorming** : on discute le besoin avant le code
2. **Plan** : tâches découpées en chunks de 2-5 minutes max (`writing-plans`)
3. **TDD** : test rouge → code minimal → test vert → refactor
4. **Code review** : `/code-review` avant merge
5. **Security review** : `/security-review` pour tout ce qui touche auth, secrets, données utilisateur

## Contexte humain

Je code mais je ne suis pas dev pro. Mon métier, c'est la vente de vin. Privilégier la clarté sur la performance théorique. Si tu fais un choix d'archi non évident, explique-moi pourquoi. Si je propose quelque chose de bancal, dis-le-moi plutôt que d'obéir.
