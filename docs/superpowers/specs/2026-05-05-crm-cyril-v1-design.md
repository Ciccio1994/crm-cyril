# CRM Cyril — Design Spec V1

| | |
|---|---|
| **Date** | 2026-05-05 |
| **Auteur** | Cyril Cicero (avec assistance Claude Opus 4.7) |
| **Statut** | Brainstorming validé, **scope V1 FIGÉ**, prêt pour `writing-plans` |
| **Périmètre** | V0 (fondations techniques) + V1 (MVP utilisable terrain). V1.5 / V2 / V3 esquissés. |
| **Source** | `samples/blablabla.xlsx` (anonymisé, gitignored), `CLAUDE.md`, conversation brainstorming du 2026-05-05 |

---

## 1. Contexte métier

### 1.1 Qui et où

Cyril Cicero est commercial en vins (Schenk/Obrist) sur le corridor Martigny-Sierre dans le Valais suisse. Activité solo, B2B, ~180 clients/prospects répartis sur **19 tournées géographiques regroupées en 4 zones macro**. Travail principalement mobile : voiture entre caves et restaurants, parfois en zones de montagne sans réseau.

### 1.2 Le métier : faire déguster pour vendre

Le cœur du travail commercial = **faire goûter pour vendre**. À chaque visite, Cyril peut faire déguster 1 à N cuvées au client. Ce qui l'intéresse n'est pas « le client a-t-il aimé ? » mais **« où en est-il dans le funnel d'achat sur cette cuvée précise ? »**.

En V1, les dégustations sont consignées dans le champ **`notes` libre de la visite** (Cyril ne déguste pas à chaque visite, ça ne mérite pas une table dédiée pour l'instant). Le funnel commercial structuré arrive en V2, alimenté par parsing des notes via Claude + référentiel cuvée Schenk.

### 1.3 Cadence commerciale (RÈGLE MÉTIER, PAS PLANNING DEV)

Cyril vise **6 visites clients + 2 visites prospects = 8 stops/jour** (cible de référence, modulable).

Sa **cadence de tournée** :
- **5 zones « hot »** (Sion, Martigny, Sierre, Verbier, Crans-Montana) → 2 passages / 4 semaines, espacés ~2 semaines, jours différents
- **14 zones autres** → 1 passage / 4 semaines

> **ATTENTION terminologie** : ces « 4 semaines » et « 2 semaines » désignent la **cadence commerciale de tournée**, **pas le planning de développement** du CRM. Le développement se fait au rythme nécessaire pour livrer un outil sur mesure et durable. Voir §1.6.

Réalité du terrain : certaines visites durent **2h+**, notamment quand Cyril mange chez le client à midi (11h30 → 14h, patron libre après service pour discuter et déguster). Le calendrier interne (V2) doit donc gérer des **durées variables par RDV**, pas des slots fixes.

### 1.4 Outils remplacés

Le CRM remplace deux outils existants :

1. **Un fichier Excel multi-onglets** (1 onglet par tournée) — sera importé en mode minimaliste (option C : nom, enseigne, adresse, tél, contact, tournée, type, statut, marqueur prospect). On ignore à l'import : horaires (texte libre incohérent), historique de visites (sans année donc inexploitable), notes libres dispersées.
2. **Google Contacts**, utilisé comme « mini-CRM mobile » : Cyril y écrit aujourd'hui ses notes de visite directement dans la fiche contact. Le CRM doit **surclasser** Google Contacts en ergonomie mobile, sinon Cyril continuera d'utiliser Google Contacts et abandonnera le CRM.

**Ce n'est pas une démo, ni un POC.** C'est un outil quotidien sur 5+ ans. Privilégier la durabilité et la clarté à la sophistication.

### 1.5 Offres temporelles Schenk

Schenk pousse régulièrement des **offres temporelles** par mail avec PDF joint (ex : « Fendant 2023 à 12 CHF jusqu'au 15 mai »). Cyril ne crée pas d'offres lui-même — son rôle est de les **consulter pendant les visites** pour les présenter au client. Le CRM doit lui permettre d'enregistrer ces offres et les consulter rapidement sur le terrain.

### 1.6 Philosophie de développement

> **Qualité > rapidité.** Mieux vaut V1 livré en 8 semaines et utilisable 5 ans qu'un V1 bâclé en 4 semaines.

Conséquences :
- **V1 est défini par son contenu, pas par sa durée.**
- TDD obligatoire conformément au CLAUDE.md (Vitest pour unit, Playwright pour e2e ciblé).
- Pas de raccourci sur la qualité du code, des tests, de l'UX, ou de la sécurité (auth, validation Zod, gestion des secrets).
- Pas de scope creep non plus : si une feature n'est pas dans V1, elle attend V1.5+.
- Découpage en chunks 2-5 minutes (writing-plans) → progrès visible, pas de blocage long.

## 2. Critère de succès (le seul qui compte)

> **La fiche établissement sur mobile doit être PLUS PRATIQUE que Google Contacts.**

Si après 2 semaines d'utilisation Cyril revient écrire ses notes dans Google Contacts au lieu du CRM, le projet a échoué — peu importe la qualité technique du reste.

**Conséquences concrètes pour le design** :
- La fiche établissement ouvre directement sur l'**historique des visites en colonne**, pas dans un onglet caché ni dans une section pliée.
- Bouton « Nouvelle visite » accessible **en 1 tap** depuis la fiche, sticky en bas si la liste de visites est longue.
- Saisie texte large, ergonomique, sans champ obligatoire bloquant.
- Performance perçue : ouverture < 300ms (cache local IndexedDB).
- Mobile-first : tous les choix UX se valident d'abord sur iPhone, puis sur Surface Pro.

Ce critère a la **priorité absolue** sur tout le reste, y compris la pureté technique.

## 3. Architecture technique

| Couche | Choix | Notes |
|---|---|---|
| Frontend | Next.js 15 (App Router) + React 19 + TypeScript strict | `strict: true`, zéro `any` sans justification |
| UI | Tailwind CSS + shadcn/ui | |
| Stockage local | Dexie.js (IndexedDB) | Cœur de la stratégie offline |
| Service Worker | Workbox via `next-pwa` | PWA installable iOS + Android |
| Notifications push | Web Push API via Service Worker | Pour les rappels (V1) |
| Backend | Supabase (Postgres + Auth + Storage) | Realtime envisagé V2+, pas V1 |
| Auth | Supabase Auth + OAuth Google (single user) | |
| **AI** | **Claude API (Anthropic SDK), dès V1** | **Création de rappels via tool calling** |
| API externe (V3+) | Google Places API, lecture PDF Schenk via Claude | Prospection, enrichissement, import offres |
| Hébergement | Vercel (frontend) + Supabase (backend) | |
| Repo | GitHub privé, branche `main` protégée | |
| CI | GitHub Actions | typecheck + tests Vitest + lint |
| Tests | Vitest (unit) + Playwright (e2e ciblé) | TDD obligatoire |
| Validation | Zod | Tous les formulaires + API routes |

**Supprimés du CLAUDE.md initial** :
- ~~Google People API (sync contacts)~~
- ~~Google Calendar API (sync agenda)~~ — Cyril utilise Outlook personnellement, calendrier CRM purement interne

### Conventions de code

| Aspect | Convention |
|---|---|
| Langue UI | Français (fr-CH), 100% français |
| Devise | `1'234.50 CHF` (apostrophe = milliers, point = décimale) |
| Date | `JJ.MM.AAAA` |
| Heure | `HH:mm` (24h) |
| Fichiers | `kebab-case.tsx` |
| Composants React | `PascalCase` |
| Fonctions / variables | `camelCase` |
| Tables Supabase | `snake_case` singulier (`etablissement`, pas `etablissements`) |
| Imports | alias `@/` pour la racine `src/` |
| Champs métier | français (`client.nom`, jamais `client.name`) |
| Commits | français, conventional (`feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`) |

## 4. Modèle de données

### 4.1 Hiérarchie

```
zone (4 macro, statique)
 └── tournee (19 micro, statique)
      └── etablissement (point de vente, ~180)
           ├── entreprise (entité légale, parent optionnel)
           ├── contact[]    (1..N)
           ├── visite[]     (1..N — incluant les visites manquées)
           │    └── rappel[] (0..N — un rappel peut naître d'une visite)
           ├── rappel[]     (0..N — peut aussi être autonome)
           └── commande[]   (V2)

offre        (saisie manuelle V1, alertes V2, import auto PDF V3)
parametre    (table key/value pour settings utilisateur)
conversation (V1 — historique chat Claude)

cuvee        (V2 : référentiel Schenk structuré)
degustation  (V2 : table dédiée, alimentée par parsing notes via Claude)
```

**Pourquoi `entreprise` séparée de `etablissement`** : le fichier Excel contient des cas où une seule entité légale chapeaute plusieurs points de vente (Tertianum × 2 enseignes, Christian Constantin SA × 2). Visites / commandes / rappels sont rattachés à l'**établissement**, pas à l'entreprise.

### 4.2 Tables (V1)

Conventions communes : PK `id uuid`, timestamps `created_at`, `updated_at`, `deleted_at` (tombstone, pas de `DELETE` SQL).

#### `zone`
- `id`, `nom`
- 4 lignes seedées (à confirmer en N4)

#### `tournee`
- `id`, `nom`, `zone_id` (FK)
- `frequence_visite_semaines` (number, défaut 4)
- `jour_prefere` (text nullable, ex `mardi`)
- 19 lignes seedées depuis l'Excel (Anzère-Ayent, Ardon-Vétroz, Conthey-Aproz, Crans-Montana-Chermignon, Fully-Saxon-Charrat, Sierre-Grône-Bramois-Vercorin, Sion-Savièse, Saillon-Leytron-Riddes-Tzoumaz, Ovronnaz, Bourg-St-Pierre-Champex-Liddes-Bovernier, Martigny-Finhaut-Ravoir-Trient, Chamoson, Nendaz, Nax-Mase, Châble-Verbier-Vollèges, Val d'Anniviers-Chandolin-Zinal, Orsière, Hérémence-Thyon, Autres-Fouly-Vernayaz)

#### `entreprise` (optionnelle)
- `id`, `raison_sociale`, `forme_juridique` (SA, Sàrl, indépendant, ...)

#### `etablissement` (cœur)
- `id`, `entreprise_id` (FK nullable), `tournee_id` (FK)
- `enseigne` (nom commercial visible)
- `type` (enum `type_etablissement`)
- `statut` (enum `statut_commercial`)
- `adresse_ligne_1`, `adresse_ligne_2` (nullable), `code_postal`, `ville`
- `latitude`, `longitude` (nullable, V1.5)
- `telephone_principal`, `telephone_mobile`
- `email`, `site_web` (nullable, V3)
- `groupe_prix` (enum `groupe_prix` — codes Schenk)
- `horaires_libre` (text V1) → `horaires_structure jsonb` (V1.5)
- `notes_internes` (text long)
- `seuil_inactivite_mois` (int nullable, défaut 12, override saisonniers)
- `derniere_visite_at`, `derniere_commande_at` (timestamptz, calculés via triggers)

#### `contact`
- `id`, `etablissement_id` (FK)
- `nom`, `prenom`, `fonction` (text — patron, sommelier, acheteur, ...)
- `telephone`, `email` (nullable)
- `est_principal` (bool, max 1 `true` par établissement)
- `notes` (text)

#### `visite`
- `id`, `etablissement_id` (FK), `contact_id` (FK nullable)
- `date_visite` (timestamptz)
- `duree_minutes` (int nullable)
- `notes` (text long — **le cœur métier**, contient aussi les éventuelles notes de dégustation libre en V1)
- **`est_manquee` (bool, default false)** *(NOUVEAU)*
- **`motif_manquee` (enum `motif_visite_manquee` nullable)** *(NOUVEAU)* — rempli uniquement si `est_manquee = true`
- `prochaine_action` (text V1 → lien `rappel` V1 ; lien `evenement_agenda` V2)
- `synced_at` (timestamptz nullable — NULL = créée offline, pas encore poussée)

Quand `est_manquee = true`, les champs `duree_minutes` et `notes` sont optionnels.

#### `rappel` *(NOUVEAU — module central V1)*
- `id`
- `titre` (text, max 200)
- `description` (text nullable)
- `echeance` (timestamptz)
- `etablissement_id` (FK nullable — un rappel peut être autonome)
- `visite_id` (FK nullable — si créé suite à une visite)
- `canal` (enum `canal_rappel` nullable)
- `statut` (enum `statut_rappel`, default `'a_faire'`)
- `fait_at` (timestamptz nullable)
- `push_active` (bool, default `true`)
- `cree_par` (enum `'utilisateur' | 'claude'`, default `'utilisateur'`)

#### `offre` (offres temporelles Schenk)
- `id`
- `cuvee_text` (text V1 — saisie libre)
- `cuvee_id` (FK vers `cuvee` nullable, V2)
- `prix_promo_chf` (numeric)
- `date_debut`, `date_fin` (date)
- `conditions` (text — ex « qté min 12 bouteilles », « HORECA uniquement »)
- `source_pdf_url` (text nullable — Supabase Storage path)
- `notes` (text)

V1 = saisie manuelle uniquement.

#### `parametre` (settings utilisateur)
- `cle` (text, PK)
- `valeur` (jsonb)
- `mis_a_jour_at` (timestamptz)

Clés prévues V1 :
- `objectif_visites_clients_par_jour` (default `6`)
- `objectif_visites_prospects_par_jour` (default `2`)
- `seuil_inactivite_mois_global` (default `12`)
- `claude_chat_active` (default `true`)
- `monitoring_consommation_claude` (jsonb : tokens consommés mois courant, alerte si > seuil)

#### `conversation` *(NOUVEAU — historique chat Claude V1)*
- `id`
- `messages` (jsonb : array de `{role: 'user' | 'assistant', content: string, tool_calls?: ..., timestamp: ISO}`)
- `contexte_initial` (jsonb nullable : établissement_id, visite_id, page courante, date locale)
- `tokens_consommes` (int, somme cumulée pour la conversation)

V1 : 1 conversation = 1 « session » de chat. Pas de gestion de threads multiples (V2+).

#### `pending_mutation` *(Dexie local UNIQUEMENT, jamais répliqué Supabase)*
Voir §6.

### 4.3 Enums

```sql
CREATE TYPE type_etablissement AS ENUM (
  'restaurant', 'bar', 'hotel', 'cafe_tearoom', 'caviste',
  'epicerie', 'cabane_montagne', 'institution', 'association',
  'revendeur', 'particulier', 'autre'
);

CREATE TYPE statut_commercial AS ENUM (
  'prospect', 'client_actif', 'client_inactif',
  'pas_interesse', 'prospect_abandonne', 'ferme', 'contentieux'
);

CREATE TYPE groupe_prix AS ENUM (
  'HORECA', 'PART', 'EPI', 'REVENDEURS',
  'NEG', 'HORECASRB', 'HELICO'
);

-- NOUVEAUX enums pour visite manquée
CREATE TYPE motif_visite_manquee AS ENUM (
  'ferme', 'absent', 'urgence_personnelle', 'autre'
);

-- NOUVEAUX enums pour rappels
CREATE TYPE canal_rappel AS ENUM (
  'whatsapp', 'mail', 'telephone', 'sms', 'autre'
);

CREATE TYPE statut_rappel AS ENUM (
  'a_faire', 'fait', 'annule'
);
```

**Supprimés** par rapport à la version précédente du spec :
- ~~`qualite_percue`~~ — dégustations en texte libre V1
- ~~`statut_commercial_degustation`~~ — idem

`client_actif` ↔ `client_inactif` sont **calculés automatiquement** sur la base de `derniere_commande_at` vs `seuil_inactivite_mois`. Cyril ne saisit jamais ces deux valeurs à la main.

**Sémantique des statuts prospect** :
- `prospect` : pas encore client, pas encore tranché — démarchage en cours
- `pas_interesse` : a refusé pour le moment, **on peut ré-essayer plus tard** (changement de carte, nouveau patron, nouvelles cuvées, etc.)
- `prospect_abandonne` : refus **définitif** ou totalement fermé à nos vins — **ne plus démarcher**. Reste dans la base pour ne pas être redécouvert/redémarché par erreur. Cyril peut le réactiver manuellement (changement de statut). Visuellement grisé dans les listes ; exclu de la prospection auto V2/V3.

### 4.4 Migrations

- Toutes versionnées dans `supabase/migrations/`
- Jamais de modif via UI Supabase
- Migration initiale : schéma V1 complet + seeds zones/tournées/enums + valeurs par défaut `parametre`
- Convention nommage : `NNN_description.sql` (ex `001_init.sql`)

## 5. Règles métier

### 5.1 Géographie

- 4 zones macro × 19 tournées micro
- 1 établissement = 1 et 1 seule tournée (pas de double appartenance V1)
- Les 19 noms de tournées sont fixes (issus de l'Excel) — Cyril peut renommer, pas créer/supprimer en V1

### 5.2 Statut actif/inactif

- Seuil par défaut : **12 mois sans commande** → `client_actif` → `client_inactif`
- Override par établissement via `seuil_inactivite_mois`
- Cas saisonniers (Anzère, Verbier, Crans-Montana, cabanes de montagne) → seuil 18-24 mois
- En V1, recalcul à la lecture suffit (180 lignes, négligeable). Batch nocturne en V1.5+.

### 5.3 Cadence de tournée (automatisée en V2)

- **5 zones « hot »** (Sion, Martigny, Sierre, Verbier, Crans-Montana) → 2 passages / 4 semaines, espacés ~2 semaines, jours différents
- **14 zones autres** → 1 passage / 4 semaines
- Préférence jour-de-la-semaine par tournée (`jour_prefere`)
- **La planification doit respecter l'objectif quotidien 6+2** (§5.6)

En V1, Cyril planifie manuellement.

### 5.4 Saisonnalité

Supportée en V1.5 via `horaires_structure` JSON.

### 5.5 Modèle Entreprise → Établissement

- Établissement peut être indépendant (`entreprise_id IS NULL`)
- Entreprise peut chapeauter plusieurs établissements
- Visites / commandes / rappels rattachés à l'**établissement**

### 5.6 Objectif commercial quotidien

- Cible par défaut : **6 visites `client_actif`/`client_inactif` + 2 visites `prospect` = 8 stops/jour**
- Modulable via la table `parametre` (UI settings)
- **V1** : compteur live sur la home (« 5/6 clients · 1/2 prospects · total 6/8 »)
- **V2** : dashboard mensuel + planification auto qui respecte l'objectif + suggestions prospects manquants

### 5.7 Durées variables des RDV

- Pas de slots fixes 30 min ou 1h
- 15 min (passage rapide) ↔ 2h+ (déjeuner client 11h30→14h)
- En V1, `duree_minutes` saisi manuellement après la visite ; en V2 utilisé par planif auto

**Valeurs par défaut V1** (saisie rapide depuis la fiche établissement) :
- 2 boutons rapides à la création de visite : **« Visite (60 min) »** et **« Déjeuner (120 min) »**
- L'utilisateur peut toujours saisir une durée custom dans le formulaire
- En V1.5, `type_visite` enum (`passage_court`, `dejeuner_client`, ...) remplacera ces deux boutons par des choix typés ; `duree_minutes` continue d'être ajustable

### 5.8 Visite manquée et cadence sacrée *(NOUVEAU — règle métier critique)*

**Bouton « Visite manquée » sur la fiche établissement.**
- Crée une entrée `visite` avec `est_manquee = true`
- Pas de `duree_minutes` ni `notes` obligatoires
- `motif_manquee` optionnel (enum : `ferme`, `absent`, `urgence_personnelle`, `autre`)
- Compteur visible sur la fiche : « Total : 47 visites (3 manquées dans les 12 derniers mois) »

**RÈGLE MÉTIER : la cadence est sacrée.**

Si Cyril rate un client, **on NE replanifie PAS sa visite avant le prochain cycle normal** :
- Zone hot → prochaine visite dans 2 semaines (cycle normal)
- Zone autre → prochaine visite dans 4 semaines (cycle normal)

Cette règle :
- **N'a aucun impact V1** (planif manuelle).
- **Conditionne la planif auto V2** : l'algorithme ne doit **jamais** créer de RDV de rattrapage hors cycle après une `est_manquee = true`. Le client revient simplement au prochain tour normal.
- Implique aussi que **les visites manquées comptent dans la fréquence** (un rendez-vous prévu chaque 4 semaines reste calé sur sa date prévue, manqué ou pas).

### 5.9 Funnel dégustation (V2, hors-V1)

- V1 : dégustations en texte libre dans `visite.notes`
- V2 : référentiel `cuvee` + table `degustation` + parsing des notes V1 par Claude pour pré-remplir
- Requête cible V2 : « tous les clients `interesse_offre` sur cuvée X dans les 60 derniers jours »

### 5.10 Rappels et notifications *(NOUVEAU)*

- Un **rappel** est une tâche unitaire à faire à une échéance précise.
- Peut être lié à un établissement, à une visite, ou autonome.
- `canal` indicatif (whatsapp, mail, téléphone, sms, autre) — **purement informatif**, le CRM ne déclenche aucune action externe.
- Notification push PWA quand l'échéance arrive (si `push_active = true`).
- Les rappels apparaissent dans une **vue dédiée « Tâches à faire »** distincte du calendrier (§7.4).
- **Le calendrier (V2) ne contient que les VRAIS RDV/visites, pas les rappels.**

### 5.11 Rôle de Claude (limites strictes V1) *(NOUVEAU)*

**Claude V1 fait UNE SEULE chose : créer des rappels structurés à partir d'une intention exprimée en langage naturel.**

Ce que Claude **fait** :
- Lit le contexte fourni (visite courante, établissement courant, date locale Cyril)
- Comprend l'intention de Cyril (« faut que je rappelle X vendredi »)
- Crée 1 ou N rappels structurés via le tool `creer_rappel`
- Renvoie une confirmation lisible

Ce que Claude **NE FAIT PAS** :
- ❌ N'envoie **aucun** message externe (WhatsApp, mail, SMS, appel) — pas d'API WhatsApp Business, pas de Twilio, pas de MailerSend, **rien**.
- ❌ Ne consulte pas l'historique de visites pour proposer des relances (V2)
- ❌ Ne répond pas à des questions sur le CA, les clients, l'agenda (V3)
- ❌ Ne modifie ni établissements, ni contacts, ni offres (jamais en V1, peut-être V3+)

> **Le CRM est l'assistant de Cyril, pas son agent automatique.** Quand un rappel est dû, Cyril reçoit une notification push, et il fait l'action manuellement (il ouvre WhatsApp lui-même, il envoie lui-même).

### 5.12 Détection automatique des clients « en retard » *(NOUVEAU V1)*

**Calcul automatique** : pour chaque établissement avec statut `client_actif` ou `client_inactif`, comparer `now() - derniere_visite_at` à `frequence_visite_semaines` de la `tournee` :

- Zone hot (cycle 2 semaines) → en retard si > 2 semaines depuis dernière visite
- Zone autre (cycle 4 semaines) → en retard si > 4 semaines depuis dernière visite
- Cas saisonniers : seuil ignoré si `seuil_inactivite_mois` indique fermeture saisonnière (override individuel V1.5)

**Affichage** :
- Badge rouge **« ⚠️ Retard X jours »** sur la fiche établissement
- Badge identique dans les listes (filtre par tournée, recherche)
- Tri possible « En retard d'abord » dans la liste

**Notification push quotidienne** (heure configurable, défaut 08:00 Europe/Zurich) :
> « Tu as N clients en retard sur ta cadence dans tes zones »

Cliquable → ouvre une **liste filtrée des clients en retard**, triée par jours de retard décroissants.

> **Important : « en retard » ≠ « obligation ».** Cyril décide. Le CRM informe, point. La cadence sacrée (§5.8) reste intacte : pas de rattrapage automatique, le client revient au prochain cycle normal.

## 6. Stratégie offline détaillée

### 6.1 Périmètre du cache local

**Tout en local** :

| Donnée | Volume | Taille |
|---|---|---|
| 180 établissements | ~1 KB | 180 KB |
| ~500 contacts | ~500 B | 250 KB |
| ~2 000 visites texte | ~2 KB | 4 MB |
| ~500 rappels actifs + historique 12 mois | ~500 B | 250 KB |
| ~50 offres actives + historique | ~1 KB | 50 KB |
| Conversations Claude (récentes) | ~10 KB chacune | ~1 MB |
| **Total** | | **~6 MB** |

IndexedDB iOS Safari accepte ~50 MB sans permission. **Inutile de paginer.**

Photos = traitées séparément en V1.5.

### 6.2 Modèle de queue de mutations

Table Dexie locale **uniquement** :

```ts
interface PendingMutation {
  id: string;
  table: 'etablissement' | 'contact' | 'visite' | 'rappel' | 'offre' | 'parametre';
  type: 'insert' | 'update' | 'delete';
  payload: Record<string, unknown>;
  local_created_at: string;
  retry_count: number;
  last_error: string | null;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
}
```

Push **FIFO strict** : sinon FK violations.

### 6.3 Triggers de sync

- Event `online` du navigateur
- Retour foreground PWA (`visibilitychange`)
- **Bouton manuel « Synchroniser maintenant »** sur la home (1 tap)

### 6.4 Retry exponentiel

`1s → 5s → 30s → 5min → 30min → abandon`. Échec final → `status = 'failed'`.

| Phase | Comportement échec final |
|---|---|
| V1 | Alerte UI « 1 action a échoué, ouvrir Supabase ou intervenir manuellement ». |
| V1.5 | UI dédiée : retry, édition payload, abandon explicite. |

**Aucune donnée n'est jamais perdue silencieusement.**

### 6.5 UX hors ligne

- **Bandeau discret** en haut : icône wifi barré + « Hors ligne ».
- **Badge global** « 3 en attente », cliquable → page détail queue.
- **Indicateur per-item** : icône cloud-arrow sur visites/rappels non sync.
- **Toast non-bloquant** « 3 actions synchronisées » à la reconnexion.
- **Tout est instantané localement** : zéro spinner après « Sauvegarder ».
- **Chat Claude désactivé hors ligne** : champ disabled + message « Reconnectez-vous pour discuter avec Claude ».

### 6.6 Token Supabase

- `access_token` 1h, auto-refresh
- `refresh_token` étendu de 7 jours à **30 jours**
- Dexie ne dépend PAS du token

### 6.7 Conflits multi-device (cas solo)

Stratégie **last-write-wins par `updated_at`** :

| Type | Conflit possible ? | Stratégie |
|---|---|---|
| `visite`, `commande` | INSERT only | Pas de conflit |
| `rappel` | INSERT + UPDATE (statut `fait`) | Last-write-wins. Si Cyril coche `fait` sur 2 devices, les deux convergent à `fait`. |
| `etablissement`, `contact`, `offre`, `parametre` | UPDATE | Plus récent gagne |
| Suppressions | Tombstone `deleted_at` | Propagation propre |

### 6.8 Stratégie de pull au reconnect

V1 :
1. Push pending_mutations (FIFO)
2. Pull `WHERE updated_at > last_pull_at` sur chaque table
3. Merge dans Dexie

Pas de Supabase Realtime en V1. V2+ envisagé.

## 7. UX critique

### 7.1 Fiche établissement (critère de succès §2)

```
┌────────────────────────────────────┐
│ ← retour                  [⋮ menu] │
├────────────────────────────────────┤
│ 🏨 ENSEIGNE EN GROS                │
│ Raison sociale (petit, gris)       │
│ [Tournée] · [Type] · [Statut]      │
├────────────────────────────────────┤
│ 📞 +41 27 ...   📱 +41 79 ...      │
│ 📍 Adresse complète                │
│ 👤 Contact principal · fonction    │
├────────────────────────────────────┤
│ ┌──────────────┐  ┌──────────────┐ │
│ │ + VISITE     │  │ ✗ MANQUÉE    │ │  ← 2 boutons côte à côte
│ └──────────────┘  └──────────────┘ │
│ Total : 47 visites (3 manquées /12m)│
├────────────────────────────────────┤
│ HISTORIQUE                         │
│                                    │
│ 28.04.2026 (mardi)                 │  ← le plus récent en haut
│ Patron content de la cuvée X.      │
│ Pousser Y au prochain coup.        │
│                                    │
│ 15.04.2026  ⊘ MANQUÉE (fermé)      │  ← visite manquée distincte
│                                    │
│ 02.04.2026                         │
│ Sommelier absent. Note assistant.  │
└────────────────────────────────────┘
```

### 7.2 Règles strictes fiche établissement

- **Pas d'onglets** sur la fiche. Vertical, scrollable.
- Bouton « Nouvelle visite » sticky en bas si l'historique est long.
- **Saisie de visite** : grand textarea, date pré-remplie aujourd'hui, bouton « Enregistrer » qui sauve **localement immédiatement** et ferme.
- **Saisie de visite manquée** : popup léger avec choix `motif_manquee` optionnel, sauvegarde immédiate.
- Affichage visite : **date + texte** par défaut. Visite manquée affichée différemment (icône + label « MANQUÉE », optionnellement le motif).
- Performance : ouverture < 300ms via cache Dexie.

### 7.3 Home

```
┌────────────────────────────────────┐
│  CRM Cyril                  [⚙️]   │
├────────────────────────────────────┤
│  📊 Aujourd'hui                    │
│  5/6 clients · 1/2 prospects       │
│  ↳ total 6/8                       │
├────────────────────────────────────┤
│  ⚠️ 7 clients en retard            │  ← §5.12, 1 tap → liste filtrée
├────────────────────────────────────┤
│  ✅ Tâches à faire (3 dues)        │  ← lien vers §7.4
│  → Rappeler Hôtel Splendide        │
│    aujourd'hui 14:00               │
│  → Envoyer fiche Pinot 2024 à...   │
├────────────────────────────────────┤
│  📞 Carnet d'appels de la semaine  │  ← §7.6, 1 tap
│      (4 appels, 1 fait)            │
├────────────────────────────────────┤
│  🔍 [ Recherche établissement ]    │
├────────────────────────────────────┤
│  📍 Tournées                       │
│  Sion-Savièse (28)  · Martigny (15)│
│  Sierre-Grône (22)  · ...          │
├────────────────────────────────────┤
│  💬 [Chat Claude]  🔄 [Sync]       │  ← FAB ou nav bar
└────────────────────────────────────┘
```

### 7.4 Vue « Tâches à faire » *(NOUVEAU)*

**Distincte du calendrier** (le calendrier est V2 et contient uniquement les vrais RDV).

```
┌────────────────────────────────────┐
│ ← retour     Tâches à faire        │
├────────────────────────────────────┤
│ [Aujourd'hui][Cette semaine][En retard][Fait] │
├────────────────────────────────────┤
│ EN RETARD (1)                      │
│ ☐ 04.05 09:00 ⚠️                   │
│   Envoyer offre Fendant à Auberge  │
│   📱 WhatsApp                       │
├────────────────────────────────────┤
│ AUJOURD'HUI (2)                    │
│ ☐ 14:00                            │
│   Rappeler Hôtel Splendide         │
│   📞 Téléphone                      │
│ ☐ 17:00                            │
│   Envoyer fiche Pinot 2024 à Alpha │
│   📱 WhatsApp                       │
├────────────────────────────────────┤
│ DEMAIN (3)                         │
│ ☐ ...                              │
└────────────────────────────────────┘
```

Caractéristiques :
- Cases à cocher pour marquer `fait` (sauvegarde immédiate locale, sync différé)
- Tri par échéance asc par défaut
- Filtres : Aujourd'hui / Cette semaine / En retard / Fait
- Création manuelle d'un rappel (bouton `+`) avec formulaire simple
- Notifications push PWA quand l'échéance arrive (si `push_active`)
- Le canal s'affiche avec une icône, **mais aucune action n'est lancée par le CRM**

### 7.5 Interface chat Claude *(NOUVEAU)*

**Accessible depuis** :
- FAB discret en bas à droite (mobile) ou icône en nav bar (desktop)
- Visible aussi depuis n'importe quelle page (drawer global)

**Interaction type** :

```
Cyril : "Après ma visite chez Restaurant Alpha aujourd'hui, faut que je
        lui envoie la fiche technique du Pinot 2024 demain matin et que
        je le rappelle vendredi pour avoir son retour."

Claude : ✅ J'ai créé 2 rappels :
         📌 06.05 09:00 — Envoyer fiche technique Pinot 2024 à
            Restaurant Alpha (canal: WhatsApp)
         📌 08.05 14:00 — Appeler Restaurant Alpha pour retour
            dégustation (canal: téléphone)
```

**Architecture technique** :

- **Anthropic SDK** côté serveur (route Next.js `/api/chat`). **Jamais d'appel direct depuis le client** — la clé API ne sort pas du serveur.
- **Tool calling** : Claude définit un seul outil V1 :
  ```ts
  {
    name: "creer_rappel",
    description: "Crée un rappel/tâche dans le CRM",
    input_schema: {
      titre: { type: "string", maxLength: 200 },
      description: { type: "string", optional: true },
      echeance: { type: "string", description: "ISO 8601" },
      etablissement_id: { type: "string", optional: true },
      canal: {
        type: "string",
        enum: ["whatsapp", "mail", "telephone", "sms", "autre"],
        optional: true
      }
    }
  }
  ```
- **Contexte injecté** dans le system prompt : timezone Europe/Zurich, date locale, établissement courant (si Cyril est sur une fiche), visite courante (si saisie en cours), liste des établissements connus pour résolution de noms (« Restaurant Alpha » → `etablissement_id`).
- **Streaming réponse** : oui, pour UX fluide.
- **Persistance** : chaque message stocké dans `conversation.messages`. Historique consultable.
- **Coût** : monitoring tokens consommés (via API Anthropic) stocké dans `parametre.monitoring_consommation_claude`. Alerte si > seuil (à définir, ex 50 CHF/mois).
- **Hors-ligne** : champ chat désactivé, message « Reconnectez-vous pour discuter avec Claude ». Pas de queue Claude (les rappels sont des actions sync uniquement).

**Limites strictes** (rappel §5.11) :
- Pas d'envoi externe (jamais)
- Pas de lecture d'historique pour suggestions (V2)
- Pas de réponses à des questions analytiques (V3)

### 7.6 Vue « Carnet d'appels de la semaine » *(NOUVEAU V1)*

Page dédiée accessible depuis la home (1 tap, distincte de §7.4 « Tâches à faire »).

**Contenu** : tous les rappels de la semaine où `canal = 'telephone'`, regroupés par jour, triés par échéance ascendante.

```
┌────────────────────────────────────┐
│ ← retour     Carnet d'appels       │
│              (cette semaine)        │
├────────────────────────────────────┤
│ LUNDI 04.05                         │
│ ☐ 09:00  Hôtel Splendide           │
│   Retour dégustation Pinot 2024     │
├────────────────────────────────────┤
│ MARDI 05.05                         │
│ ☐ 14:00  Restaurant Alpha           │
│ ☐ 16:30  Caviste Beta               │
├────────────────────────────────────┤
│ JEUDI 07.05                         │
│ ☐ 10:00  Auberge Gamma              │
└────────────────────────────────────┘
```

**Objectif** : permettre à Cyril de **batcher** tous ses appels de la semaine en 30 min de focus (entre deux tournées, le matin au bureau), au lieu de les éparpiller. Cocher = `statut = 'fait'` (sauvegarde immédiate locale, sync différé).

Pas de filtres complexes V1 — vue strictement « cette semaine, canal téléphone ». La semaine = lundi 00:00 → dimanche 23:59 Europe/Zurich.

### 7.7 Détails à valider en implémentation

- Couleurs des puces statut/type sur la fiche (N6)
- Édition / suppression d'une visite passée (N7)
- Comportement compteur 6+2 si visite passe minuit (N9)
- Position exacte du FAB chat Claude (mobile vs desktop)

## 8. Priorisation V0 → V4

### V0 — Fondations techniques

**Objectif** : chaîne technique propre, automatisée, déployée.

- [ ] Repo Next.js 15 + TS strict + ESLint + Prettier
- [ ] Tailwind + shadcn/ui scaffold
- [ ] Projet Supabase + OAuth Google
- [ ] Schéma BDD V1 dans `supabase/migrations/001_init.sql` + seeds zones/tournées/parametres
- [ ] PWA installable : manifest, icônes, Service Worker (`next-pwa`)
- [ ] Web Push API setup (clés VAPID, demande de permission)
- [ ] **Anthropic SDK installé + route `/api/chat` minimaliste** (validation chaîne API key, prompt simple, pas encore de tool calling)
- [ ] CI GitHub Actions : typecheck + Vitest + ESLint
- [ ] Page « Hello, Cyril » derrière auth, déployée Vercel
- [ ] **Test précoce iPhone** (R1 mitigation) : install PWA, Service Worker fonctionnel, IndexedDB OK

**Critère de sortie V0** : Cyril installe le PWA sur iPhone, se connecte Google, voit « Hello, Cyril », envoie un message de test à Claude qui répond.

### V1 — MVP terrain

**Objectif** : remplacer Excel + Google Contacts au quotidien, avec assistant Claude pour rappels.

#### V1a — Cœur fiche & visites
- [ ] Import Excel minimaliste → 180 fiches Établissement + leurs contacts
- [ ] CRUD Établissement, **statuts incluant `prospect_abandonne`** (§4.3) avec affichage grisé en liste
- [ ] CRUD Contact (multi par établissement, principal unique)
- [ ] Vue **liste filtrée par tournée** avec tri par dernière visite et **tri « En retard d'abord »**
- [ ] Recherche plein-texte (nom, enseigne, ville, code postal)
- [ ] **Fiche établissement optimisée mobile** (cf §7.1, critère de succès) **avec badge « ⚠️ Retard X jours »** quand applicable (§5.12)
- [ ] CRUD Visite **offline-first** avec **2 boutons rapides « Visite (60 min) » / « Déjeuner (120 min) »** (§5.7)
- [ ] **Visite manquée** : bouton sur fiche, motif optionnel, compteur visible (§5.8)
- [ ] Horaires en texte libre

#### V1b — Pilotage quotidien
- [ ] Compteur sur la home : « 5/6 clients · 1/2 prospects · total 6/8 »
- [ ] **Cadran « N clients en retard »** sur la home (§5.12) → 1 tap → liste filtrée triée par jours de retard
- [ ] **Notification push quotidienne** (heure configurable, défaut 08:00) « Tu as N clients en retard » (§5.12)
- [ ] Page settings : modifier objectifs + autres `parametre` (incl. heure de notif retard)
- [ ] Calcul live basé sur visites du jour (heure locale Europe/Zurich)

#### V1c — Offres temporelles
- [ ] Page « Offres en cours » avec filtre dates valides
- [ ] CRUD offre (saisie manuelle : cuvée texte, prix, dates, conditions, notes)
- [ ] Upload PDF Schenk en pièce jointe (Supabase Storage) — optionnel
- [ ] Accessible en 1 tap depuis la home

#### V1d — Rappels et tâches *(NOUVEAU module central)*
- [ ] Table `rappel` + CRUD
- [ ] Vue dédiée **« Tâches à faire »** (§7.4) accessible 1 tap depuis la home
- [ ] Filtres Aujourd'hui / Cette semaine / En retard / Fait
- [ ] Cases à cocher pour marquer `fait`
- [ ] Notifications push PWA quand échéance atteinte
- [ ] Indicateur de canal (icône) **sans action externe**
- [ ] Création manuelle de rappel via formulaire
- [ ] **Vue « Carnet d'appels de la semaine »** (§7.6) : rappels `canal = telephone` de la semaine, groupés par jour, accessibles 1 tap depuis la home

#### V1e — Chat Claude (création de rappels) *(NOUVEAU)*
- [ ] Drawer/page de chat Claude accessible globalement
- [ ] Intégration Anthropic SDK serveur (route `/api/chat`)
- [ ] Tool `creer_rappel` exposé à Claude (structured output)
- [ ] Injection contexte (établissement courant, visite, date locale)
- [ ] Streaming réponse
- [ ] Persistance dans `conversation`
- [ ] Monitoring tokens consommés + alerte budget
- [ ] Désactivation hors-ligne avec message clair

#### V1f — Offline & sync
- [ ] Queue Dexie + retry exponentiel
- [ ] Badge « N en attente » + bouton **« Synchroniser maintenant »**
- [ ] Bandeau hors-ligne discret
- [ ] Alerte simple si mutation `failed`
- [ ] Cache local de toutes les tables V1

#### Hors V1 (reportés)
- ❌ Photos (V1.5)
- ❌ Carte (V1.5)
- ❌ Calendrier interne (V2)
- ❌ Référentiel cuvée structuré (V2)
- ❌ Reporting funnel (V2)
- ❌ Planification 4 semaines auto (V2)
- ❌ Claude lecture historique pour suggestions (V2)
- ❌ Claude conversationnel complet (V3)

**Critère de sortie V1** : Cyril utilise le CRM pendant 2 semaines complètes sans rouvrir Excel ni écrire de note dans Google Contacts. Il consulte ses offres en cours pendant les visites. Il dicte ses rappels à Claude pendant ou après visite. Les rappels lui notifient correctement.

### V1.5 — Confort terrain

- [ ] Carte interactive (Leaflet pressenti, à valider en N1) — pins, clustering, filtres
- [ ] Géocodage batch des 180 adresses + UI correction manuelle
- [ ] Cache tuiles offline zone Valais
- [ ] Horaires structurés JSON + UI saisie + saisonnalité
- [ ] Photos sur visites (compression client + Supabase Storage différé)
- [ ] Seuil actif/inactif configurable par établissement (UI)
- [ ] UI retry/édition des `pending_mutation` failed
- [ ] Recherche dans l'historique d'un établissement
- [ ] Type visite (`type_visite` enum : passage_court, dejeuner_client, ...)

### V2 — Commerce, pilotage, Claude étendu

- [ ] **Référentiel `cuvee` structuré** (catalogue Schenk)
- [ ] Module Commandes : saisie manuelle ligne par ligne, calcul CA
- [ ] **Table `degustation`** structurée + parsing des notes V1 par Claude pour pré-remplir
- [ ] **Reporting funnel dégustation** : « Clients `interesse_offre` sur cuvée X dans 60 derniers jours »
- [ ] Tableau de bord : CA mensuel, par zone, par client, top références
- [ ] Dashboard objectifs : « X jours × 8 stops attendus, j'en ai fait Z »
- [ ] **Calendrier interne CRM** : durées variables, RDV/visites uniquement, **pas de sync externe**, **pas de rappels** (qui restent dans la vue Tâches)
- [ ] **Planification 4 semaines automatique** : règle 2x/4sem hot zones + 1x/4sem autres + jours différents + respect objectif 6+2 + suggestions prospects + **respect cadence sacrée** (pas de rattrapage après visite manquée)
- [ ] **Alertes offres** : « Offre Pinot Noir se termine dans 3 jours, 5 clients à relancer »
- [ ] **Claude étendu** : lit l'historique des notes/visites/dégustations pour suggérer des relances, suggérer des prospects, alerter sur offres pertinentes — toujours via création de **rappels**
- [ ] **Notifications « clients pas vus » avancées** : intégrées avec planif auto V2, distinguent retard simple (§5.12) et inactivité longue durée
- [ ] **Filtre vins valaisans / étrangers** sur les listes et reportings (nécessite référentiel `cuvee` V2)
- [ ] **Aperçu par région** : dashboard CA + prospects suggérés + nb visites par zone
- [ ] **Fiche enrichie sur agenda** : vue détaillée RDV avec tenancier, vins déjà commandés par le client, suggestions à pousser
- [ ] **Score potentiel client 1-5 étoiles** : calculé à partir du CA + fréquence + couverts/chambres, modulable manuellement
- [ ] **Anniversaires et dates clés** : champs sur fiche établissement (anniv tenancier, ouverture, événements récurrents) + génération auto de rappels
- [ ] **Vins testés mais pas commandés** : requête sur historique funnel dégustation (cuvées goûtées sans commande dans X mois)
- [ ] **Comparaison année passée** sur la fiche : « L'an dernier à cette date, X visites, Y CHF de CA »

### V2.5 — Bonus si simple
- [ ] Import historique CA Schenk one-shot (CSV)

### V3 — IA et automatisation

- [ ] **Import automatique des PDFs Schenk via Claude** : extraction structurée des offres
- [ ] Prospection assistée Google Places + dédup
- [ ] **Enrichissement web automatique** par Claude : tenancier, photos, avis, site web, carte des vins (PDF → texte) — exécuté en batch sur les fiches existantes ou à la création
- [ ] **Assistant Claude conversationnel COMPLET** : « Combien de CA chez Splendide depuis 1 an ? », « Qui je vais voir cet après-midi ? », « Résume mes 5 dernières visites en zone Sion ». Tools étendus (lecture seule sur toutes les tables).
- [ ] **Température client** (calculée par Claude qui parse les notes) : « chaud / tiède / froid » selon la tonalité des dernières visites + fréquence + commandes
- [ ] **Trajets matinaux optimisés** : TSP simplifié + Google Maps Distance Matrix API pour ordonner la tournée du jour

### V4+ — Cerise

- Capacité couverts/chambres → estimation potentiel
- Gamme cible / argumentaire par client
- Délais de paiement / contentieux
- OCR photo pour saisie commande rapide
- Routage géographique optimisé (TSP simplifié)

## 9. Décisions de scope confirmées

À propager dans `CLAUDE.md` à la clôture du brainstorming :

| Décision | Statut |
|---|---|
| ~~Sync Google Calendar bidirectionnelle~~ | **Supprimée.** Calendrier interne CRM uniquement. |
| ~~Sync Google People API (contacts)~~ | **Supprimée.** |
| ~~4 zones du corridor (Martigny-Saxon, ...)~~ | **Remplacé** par 4 zones macro + 19 tournées micro. |
| Import Schenk historique CA | **One-shot bonus V2.5**, pas critique. Saisie commandes manuelle V2. |
| **Claude API** | **Intégrée dès V1** pour création de rappels (tool calling). Étendue V2 (suggestions), V3 (conversationnel complet). |
| **Module Rappels** | **V1 obligatoire**, séparé du calendrier (V2). |
| **Visite manquée** | **V1 obligatoire**, avec règle « cadence sacrée » (pas de replanification). |
| Dégustation V1 | **Texte libre** dans `visite.notes`. Table dédiée + parsing en V2. |
| Modules V1 | Établissements + Contacts + Visites (avec manquées) + Compteur 6+2 + Offres + **Rappels** + **Chat Claude (rappels)** + Offline |
| Modules V2 | Commandes + Calendrier + Planif auto + Référentiel cuvée + Funnel + Alertes offres + Claude étendu |
| Modules V3 | Import auto PDF + Prospection IA + Enrichissement + Claude conversationnel complet |
| Realtime Supabase | V2+, pas V1 |
| Photos visites | V1.5, pas V1 |
| Carte | V1.5, pas V1 |
| **Philosophie planning dev** | **Qualité > rapidité.** V1 défini par contenu, pas par durée. |
| **Périmètre strict Claude** | **Le CRM ne fait jamais d'action externe.** Pas d'API WhatsApp/Twilio/MailerSend. Cyril est notifié, Cyril agit. |
| **Statut `prospect_abandonne`** | **V1.** Refus définitif, exclu de la prospection auto V2/V3, réactivable manuellement. |
| **Durées RDV par défaut** | **V1.** 60 min (visite) / 120 min (déjeuner), via 2 boutons rapides. Custom toujours possible. |
| **Détection cycle en retard** | **V1.** Calcul auto sur `derniere_visite_at` vs cycle de la tournée. Badge fiche + cadran home + notif push quotidienne. **N'impose rien** — info uniquement. |
| **Carnet d'appels de la semaine** | **V1.** Vue dédiée filtrant les rappels `canal = telephone` de la semaine, pour batcher les appels. |
| **🔒 SCOPE V1 FIGÉ** | À partir de ce point, **plus aucune feature ajoutée à V1**. Toute nouvelle idée → §12 « Idées V2+ ». |

## 10. Risques et points non décidés

### 10.1 Risques identifiés

| ID | Risque | Mitigation |
|---|---|---|
| R1 | PWA iOS Safari quirks (Service Worker, IndexedDB purge sous pression mémoire, Web Push iOS limité) | Tester très tôt en V0 sur iPhone réel. Vérifier support Web Push iOS Safari (16.4+). Plan B : email de notif si iOS Push échoue. |
| R2 | Géocodage de 180 adresses partiellement ambiguës | Fallback UI manuel V1.5 |
| R3 | Si la fiche établissement n'est pas plus pratique que Google Contacts au bout de V1 → projet rate son but | Test terrain dès le jour de la livraison V1. Si Cyril retourne à Google Contacts, retravailler la fiche en priorité absolue avant tout autre travail. |
| R4 | Cyril n'est pas dev pro à temps plein | Découpage en chunks 2-5 min. Pas de course contre la montre — V1 livré quand V1 est prêt. |
| R5 | Codes Schenk (`C00xxxxx`) restés dans le fichier « anonymisé » | Re-vérifier l'anonymisation avant tout import en clair |
| R6 | Migration cuvée texte → FK V2 = potentielle dette | Acceptable. V1 propose autocomplete localStorage des cuvées déjà saisies pour cohérence relative. Migration V2 = script de matching texte → cuvée structurée + UI correction. |
| R7 | Cadence sacrée non respectée par la planif auto V2 | Tests automatisés stricts en V2 sur l'algo de planification (cas : visite manquée, vérifier prochaine visite hors cycle de rattrapage). |
| **R8** | **Complexité chat Claude V1** : intégration Anthropic SDK + tool calling + résolution de noms d'établissements + monitoring coût + offline + qualité du prompt | **Prototype en V0** : route `/api/chat` minimale qui valide la chaîne (clé API, model, réponse). En V1, scope strict (1 seul tool `creer_rappel`). Prompt engineering en TDD : suite de prompts représentatifs avec assertions sur les rappels créés. Monitoring usage Claude dès V1 + alerte budget. |
| **R9** | **Coût Claude API non maîtrisé** | `parametre.monitoring_consommation_claude` track tokens consommés mois courant. Alerte si > seuil (50 CHF par défaut, modifiable). Pas de retry agressif côté chat. Claude Haiku envisagé si coût Sonnet/Opus trop élevé pour usage simple. |
| **R10** | **Notifications push PWA peu fiables sur iOS** | Plan B : badge dans l'app + email de secours. Tester en V0. Si iOS Push insuffisant, fallback en V1 = badge + check-in manuel. |
| **R11** | **Résolution de noms par Claude** : « Restaurant Alpha » doit matcher l'`etablissement_id` correct | Injection de la liste des 180 établissements dans le system prompt (compact : id + enseigne + ville). Si ambigu, Claude demande clarification. Fallback : rappel créé sans `etablissement_id`, Cyril l'attache manuellement. |

### 10.2 Non décidés (à trancher en writing-plans ou plus tard)

| ID | Point | Quand trancher |
|---|---|---|
| N1 | Carte V1.5 : Leaflet vs Mapbox vs MapLibre | Début V1.5 |
| N2 | Tuiles offline : OSM brut vs tuiles pré-générées | Début V1.5 |
| N3 | Format `horaires_structure` JSON | Début V1.5 |
| N4 | Choix exact des 4 zones macro | Avant fin V0 (seed) |
| N5 | Supabase CLI vs autre outil pour migrations | V0 |
| N6 | Couleurs des puces statut/type sur la fiche | V1 implémentation |
| N7 | Édition / suppression d'une visite passée | V1, à confirmer |
| N8 | Saisie cuvée V1 : texte libre pur ou autocomplete localStorage ? | V1 implémentation |
| N9 | Compteur quotidien : règle minuit, fuseau, visite à cheval ? | V1 implémentation |
| N10 | Modèle Claude V1 : Haiku, Sonnet, Opus ? | V0/V1 (en fonction coût/qualité observés) |
| N11 | Position exacte du FAB chat Claude | V1 implémentation |
| N12 | Seuil exact du budget Claude alertant l'utilisateur | V1 implémentation (50 CHF par défaut) |
| N13 | Web Push iOS : support et fallback | V0, à valider sur iPhone réel |

## 11. Suite

Une fois ce spec validé par Cyril :

1. **Mise à jour du `CLAUDE.md`** : suppression sync Google, modèle 4 zones × 19 tournées, critère de succès vs Google Contacts, ajout dégustations / objectifs / offres / **rappels** / **Claude V1**, ajout philosophie « qualité > rapidité », ajout `prospect_abandonne` / durées 60-120 / cycle en retard / carnet d'appels.
2. **Invocation de `writing-plans`** pour découper V0 + V1 (a/b/c/d/e/f) en plan d'implémentation détaillé (chunks 2-5 min).
3. **Initialisation du repo Git** + premier commit incluant `CLAUDE.md` + ce spec doc.
4. **Démarrage V0** selon le plan.

## 12. Idées V2+ (parking — scope V1 figé)

Toute nouvelle idée arrivée **après le gel du scope V1** atterrit ici. **Aucune ne touche V1**. Réévaluation à la livraison V1 pour réordonner V1.5 / V2 / V3.

*(Liste vide à la clôture du brainstorming. À alimenter au fil du développement V1 quand des idées émergent.)*
