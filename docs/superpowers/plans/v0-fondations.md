# V0 — Fondations

> Phase 0 : projet fonctionnel en prod, aucune feature métier. Objectif : CI verte, auth active, DB migrée, PWA installable, Web Push configuré, Claude répond.

> **⏱️ Note sur les durées :** Les durées indiquées sont des estimations pour un dev expérimenté. Pour un développeur débutant ou semi-débutant, prévoir ×3 (durée totale réelle V0 ≈ 7-10h étalées sur 1 semaine).

**Prérequis avant de commencer :**
- Compte Supabase créé (plan Free suffit)
- Compte Vercel connecté au repo GitHub
- Clé API Anthropic disponible
- Compte Google Cloud (pour OAuth, credentials créés)

---

### Tâche 1 : Scaffold Next.js 15
**Durée :** ~10 min
**Prérequis :** aucun

```bash
npx create-next-app@latest . \
  --typescript --tailwind --eslint \
  --app --src-dir --import-alias "@/*" \
  --no-turbopack
```

Puis supprimer le contenu de démonstration (`src/app/page.tsx` → page vide `<main />`), supprimer `public/vercel.svg` et `public/next.svg`.

**Critère de fin :** `npm run dev` lance sur localhost:3000 sans erreur, `npm run build` passe.

---

### Tâche 2 : TypeScript strict + outils qualité
**Durée :** ~10 min
**Prérequis :** Tâche 1

Configurer `tsconfig.json` avec `"strict": true` (déjà activé par défaut avec create-next-app). Vérifier que `noImplicitAny`, `strictNullChecks` sont bien actifs.

Installer et configurer Prettier :
```bash
npm install -D prettier prettier-plugin-tailwindcss
```

Créer `.prettierrc` :
```json
{
  "semi": false,
  "singleQuote": true,
  "trailingComma": "es5",
  "plugins": ["prettier-plugin-tailwindcss"]
}
```

Ajouter dans `package.json` :
```json
"scripts": {
  "format": "prettier --write src/",
  "type-check": "tsc --noEmit"
}
```

**Critère de fin :** `npm run type-check` passe sans erreur, `npm run format` s'exécute sans crash.

---

### Tâche 3 : Vitest + premier test témoin
**Durée :** ~10 min
**Prérequis :** Tâche 2

```bash
npm install -D vitest @vitejs/plugin-react jsdom @testing-library/react @testing-library/jest-dom
```

Créer `vitest.config.ts` :
```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

Créer `src/test/setup.ts` :
```ts
import '@testing-library/jest-dom'
```

Créer `src/test/smoke.test.ts` :
```ts
import { describe, it, expect } from 'vitest'
describe('smoke', () => {
  it('1 + 1 = 2', () => expect(1 + 1).toBe(2))
})
```

Ajouter dans `package.json` : `"test": "vitest run"`, `"test:watch": "vitest"`.

**Critère de fin :** `npm test` passe avec 1 test vert.

---

### Tâche 4 : Variables d'environnement + .gitignore
**Durée :** ~5 min
**Prérequis :** Tâche 1

Créer `.env.local` (jamais commité) :
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
NEXT_PUBLIC_VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:cicero.cyril.pro@gmail.com
```

Vérifier que `.gitignore` contient `.env.local`, `.env*.local`, `samples/`.

Créer `.env.example` avec les mêmes clés mais valeurs vides (ce fichier EST commité).

**Critère de fin :** `.env.local` n'apparaît pas dans `git status`. `.env.example` est commité.

---

### Tâche 5 : Supabase client + middleware auth
**Durée :** ~15 min
**Prérequis :** Tâche 4, projet Supabase créé avec URL + clés

```bash
npm install @supabase/supabase-js @supabase/ssr
```

Créer `src/lib/supabase/client.ts` (navigateur) :
```ts
import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}
```

Créer `src/lib/supabase/server.ts` (server components / route handlers) :
```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {}
        },
      },
    }
  )
}
```

Créer `src/middleware.ts` :
```ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  if (!user && !request.nextUrl.pathname.startsWith('/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icons|api/webhooks).*)'],
}
```

**Critère de fin :** `npm run type-check` passe. Naviguer sur localhost:3000 redirige vers /login (404 pour l'instant, c'est normal).

---

### Tâche 5b : Configurer Google OAuth dans Supabase
**Durée :** ~15 min
**Prérequis :** Tâche 5

1. Aller sur [console.cloud.google.com](https://console.cloud.google.com) → créer un projet `crm-cyril`
2. APIs & Services → Bibliothèque → activer **Google+ API** et **Google People API**
3. APIs & Services → Identifiants → Créer des identifiants → **ID client OAuth 2.0** (type : Application Web)
4. Ajouter dans *URI de redirection autorisés* :
   ```
   https://[ton-projet].supabase.co/auth/v1/callback
   http://localhost:3000/auth/callback
   ```
5. Copier le **Client ID** et le **Client Secret** générés
6. Dans Supabase Dashboard → Authentication → Providers → **Google** : coller Client ID et Client Secret, activer, sauvegarder

**Critère de fin :** Le provider Google apparaît comme "Enabled" dans Supabase. Aucune erreur de configuration visible.

---

### Tâche 6 : Page login + Google OAuth
**Durée :** ~15 min
**Prérequis :** Tâche 5, credentials Google OAuth configurés dans Supabase

Créer `src/app/login/page.tsx` :
```tsx
'use client'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const handleLogin = async () => {
    const supabase = createClient()
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    })
  }

  return (
    <main className="flex min-h-screen items-center justify-center">
      <button
        onClick={handleLogin}
        className="rounded-lg bg-blue-600 px-6 py-3 text-white font-medium"
      >
        Se connecter avec Google
      </button>
    </main>
  )
}
```

Créer `src/app/auth/callback/route.ts` :
```ts
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  return NextResponse.redirect(`${origin}/`)
}
```

Dans Supabase Dashboard → Authentication → URL Configuration : ajouter `http://localhost:3000/auth/callback` aux Redirect URLs.

**Critère de fin :** Cliquer "Se connecter avec Google" → flux OAuth complet → retour sur `/` sans erreur 401.

---

### Tâche 7 : Migrations SQL — 001_init.sql
**Durée :** ~20 min
**Prérequis :** Tâche 5

Créer `supabase/migrations/001_init.sql` avec le schéma complet :

```sql
-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Enums
CREATE TYPE statut_commercial AS ENUM (
  'prospect', 'client_actif', 'client_inactif',
  'pas_interesse', 'prospect_abandonne', 'ferme', 'contentieux'
);
CREATE TYPE type_etablissement AS ENUM (
  'restaurant', 'caviste', 'hotel', 'epicerie_fine',
  'cave_altitude', 'bar', 'autre'
);
CREATE TYPE groupe_prix AS ENUM ('economique', 'standard', 'premium', 'luxe');
CREATE TYPE motif_visite_manquee AS ENUM (
  'ferme', 'patron_absent', 'pas_le_temps', 'autre'
);
CREATE TYPE canal_rappel AS ENUM (
  'whatsapp', 'mail', 'telephone', 'sms', 'autre'
);
CREATE TYPE statut_rappel AS ENUM ('a_faire', 'fait', 'annule');

-- Trigger helper
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- Tables
CREATE TABLE zone (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE tournee (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom TEXT NOT NULL,
  zone_id UUID REFERENCES zone(id),
  frequence_semaines INTEGER NOT NULL DEFAULT 4,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE entreprise (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nom TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE etablissement (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  enseigne TEXT NOT NULL,
  type_etablissement type_etablissement,
  statut statut_commercial NOT NULL DEFAULT 'prospect',
  groupe_prix groupe_prix,
  adresse TEXT,
  ville TEXT,
  code_postal TEXT,
  telephone TEXT,
  email TEXT,
  notes TEXT,
  entreprise_id UUID REFERENCES entreprise(id),
  tournee_id UUID REFERENCES tournee(id),
  derniere_visite_at TIMESTAMPTZ,
  derniere_commande_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE contact (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  etablissement_id UUID NOT NULL REFERENCES etablissement(id) ON DELETE CASCADE,
  prenom TEXT,
  nom TEXT NOT NULL,
  role TEXT,
  telephone TEXT,
  email TEXT,
  est_principal BOOLEAN DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE visite (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  etablissement_id UUID NOT NULL REFERENCES etablissement(id) ON DELETE CASCADE,
  date_visite TIMESTAMPTZ NOT NULL,
  duree_minutes INTEGER,
  notes TEXT,
  est_manquee BOOLEAN DEFAULT false,
  motif_manquee motif_visite_manquee,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE rappel (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titre TEXT NOT NULL,
  description TEXT,
  echeance TIMESTAMPTZ NOT NULL,
  statut statut_rappel NOT NULL DEFAULT 'a_faire',
  canal canal_rappel,
  etablissement_id UUID REFERENCES etablissement(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE offre (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  titre TEXT NOT NULL,
  description TEXT,
  cuvee TEXT,
  prix_ht NUMERIC(10, 2),
  date_debut DATE,
  date_fin DATE,
  conditions TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE parametre (
  cle TEXT PRIMARY KEY,
  valeur TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE conversation (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  etablissement_id UUID REFERENCES etablissement(id) ON DELETE SET NULL,
  messages JSONB NOT NULL DEFAULT '[]',
  tokens_input INTEGER DEFAULT 0,
  tokens_output INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger : updated_at auto
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'zone','tournee','entreprise','etablissement','contact',
    'visite','rappel','offre','parametre','conversation'
  ] LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%s_updated_at BEFORE UPDATE ON %s
       FOR EACH ROW EXECUTE FUNCTION set_updated_at()', t, t
    );
  END LOOP;
END $$;

-- Trigger : derniere_visite_at
CREATE OR REPLACE FUNCTION update_derniere_visite()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT NEW.est_manquee THEN
    UPDATE etablissement
    SET derniere_visite_at = NEW.date_visite
    WHERE id = NEW.etablissement_id
      AND (derniere_visite_at IS NULL OR NEW.date_visite > derniere_visite_at);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_visite_derniere_visite
AFTER INSERT ON visite
FOR EACH ROW EXECUTE FUNCTION update_derniere_visite();

-- RLS
ALTER TABLE zone ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournee ENABLE ROW LEVEL SECURITY;
ALTER TABLE entreprise ENABLE ROW LEVEL SECURITY;
ALTER TABLE etablissement ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact ENABLE ROW LEVEL SECURITY;
ALTER TABLE visite ENABLE ROW LEVEL SECURITY;
ALTER TABLE rappel ENABLE ROW LEVEL SECURITY;
ALTER TABLE offre ENABLE ROW LEVEL SECURITY;
ALTER TABLE parametre ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'zone','tournee','entreprise','etablissement','contact',
    'visite','rappel','offre','parametre','conversation'
  ] LOOP
    EXECUTE format(
      'CREATE POLICY "%s_auth_all" ON %s FOR ALL TO authenticated USING (true) WITH CHECK (true)', t, t
    );
  END LOOP;
END $$;
```

Exécuter dans Supabase Dashboard → SQL Editor.

> ⚠️ **Note de sécurité V1 :** Ces policies sont volontairement permissives car le CRM est en mode single-user solo. Elles devront être restreintes par `user_id` en V2 si un autre utilisateur est ajouté.

**Critère de fin :** Toutes les tables apparaissent dans Supabase → Table Editor. Aucune erreur SQL.

---

### Tâche 8 : Seeds — 002_seeds.sql
**Durée :** ~10 min
**Prérequis :** Tâche 7

Créer `supabase/migrations/002_seeds.sql` :

```sql
-- 4 zones macro
INSERT INTO zone (id, nom, code) VALUES
  ('11111111-0000-0000-0000-000000000001', 'Martigny-Entremont', 'A'),
  ('11111111-0000-0000-0000-000000000002', 'Sion-Valais Central', 'B'),
  ('11111111-0000-0000-0000-000000000003', 'Sierre-Anniviers', 'C'),
  ('11111111-0000-0000-0000-000000000004', 'Crans-Montana-Verbier', 'D');

-- 19 tournées (frequence_semaines : 2 = hot, 4 = standard)
INSERT INTO tournee (nom, zone_id, frequence_semaines) VALUES
  -- Zone A
  ('Martigny-Ville',           '11111111-0000-0000-0000-000000000001', 4),
  ('Martigny-Finhaut-Ravoir-Trient', '11111111-0000-0000-0000-000000000001', 2),
  ('Fully-Saillon',            '11111111-0000-0000-0000-000000000001', 4),
  ('Leytron-Chamoson',         '11111111-0000-0000-0000-000000000001', 4),
  ('Saxon-Riddes',             '11111111-0000-0000-0000-000000000001', 4),
  ('Sembrancher-Orsières',     '11111111-0000-0000-0000-000000000001', 4),
  ('Verbier-Village',          '11111111-0000-0000-0000-000000000001', 4),
  -- Zone B
  ('Sion-Savièse',             '11111111-0000-0000-0000-000000000002', 2),
  ('Sion-Bramois',             '11111111-0000-0000-0000-000000000002', 4),
  ('Conthey-Vétroz',           '11111111-0000-0000-0000-000000000002', 4),
  ('Nendaz-Haute',             '11111111-0000-0000-0000-000000000002', 4),
  ('Ardon-Chamoson-Est',       '11111111-0000-0000-0000-000000000002', 4),
  ('Anzère-Ayent',             '11111111-0000-0000-0000-000000000002', 2),
  ('Evolène-Hérémence',        '11111111-0000-0000-0000-000000000002', 4),
  -- Zone C
  ('Sierre-Grône',             '11111111-0000-0000-0000-000000000003', 2),
  ('Val d''Anniviers',         '11111111-0000-0000-0000-000000000003', 4),
  -- Zone D
  ('Crans-Montana',            '11111111-0000-0000-0000-000000000004', 2),
  ('Châble-Verbier',           '11111111-0000-0000-0000-000000000004', 2),
  ('Loèche-les-Bains',         '11111111-0000-0000-0000-000000000004', 4);

-- Paramètres par défaut
INSERT INTO parametre (cle, valeur) VALUES
  ('objectif_visites_clients', '6'),
  ('objectif_prospects', '2'),
  ('vapid_subscriptions', '[]');
```

Exécuter dans Supabase Dashboard → SQL Editor.

**Critère de fin :** 4 zones et 19 tournées visibles dans Table Editor.

---

### Tâche 9 : PWA — manifest + next-pwa
**Durée :** ~15 min
**Prérequis :** Tâche 1

```bash
npm install @ducanh2912/next-pwa
```

Créer `public/manifest.webmanifest` :
```json
{
  "name": "CRM Cyril",
  "short_name": "CRM",
  "description": "CRM commercial vins Schenk/Obrist",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1e40af",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any maskable" }
  ]
}
```

Créer des icônes placeholder dans `public/icons/` (192×192 et 512×512, PNG bleu uni suffit pour V0).

Mettre à jour `next.config.ts` :
```ts
import withPWA from '@ducanh2912/next-pwa'

const nextConfig = withPWA({
  dest: 'public',
  cacheOnFrontEndNav: true,
  aggressiveFrontEndNavCaching: true,
  reloadOnOnline: true,
  disable: process.env.NODE_ENV === 'development',
})({
  // config Next.js ici
})

export default nextConfig
```

Ajouter le lien manifest dans `src/app/layout.tsx` :
```tsx
<link rel="manifest" href="/manifest.webmanifest" />
<meta name="theme-color" content="#1e40af" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

**Critère de fin :** `npm run build && npm start` → Lighthouse PWA score ≥ 80. Chrome DevTools → Application → Manifest : pas d'erreur.

---

### Tâche 10 : Web Push — génération VAPID + endpoint
**Durée :** ~15 min
**Prérequis :** Tâches 5, 9

```bash
npm install web-push
npm install -D @types/web-push
```

Générer les clés VAPID (une seule fois, à stocker dans `.env.local`) :
```bash
node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k,null,2))"
```

Copier `publicKey` → `NEXT_PUBLIC_VAPID_PUBLIC_KEY` et `privateKey` → `VAPID_PRIVATE_KEY` dans `.env.local`.

Créer `src/app/api/push/subscribe/route.ts` :
```ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { z } from 'zod'

const subscriptionSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string(), auth: z.string() }),
})

export async function POST(req: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const body = subscriptionSchema.safeParse(await req.json())
  if (!body.success) return NextResponse.json({ error: 'Données invalides' }, { status: 400 })

  const { data: param } = await supabase
    .from('parametre').select('valeur').eq('cle', 'vapid_subscriptions').single()

  const subs: object[] = param ? JSON.parse(param.valeur) : []
  if (!subs.some((s: any) => s.endpoint === body.data.endpoint)) {
    subs.push(body.data)
    await supabase.from('parametre')
      .upsert({ cle: 'vapid_subscriptions', valeur: JSON.stringify(subs) })
  }

  return NextResponse.json({ ok: true })
}
```

Créer `src/app/api/push/send/route.ts` (usage interne uniquement, appelé depuis les Server Actions) :
```ts
import { NextResponse } from 'next/server'
import webpush from 'web-push'
import { createClient } from '@/lib/supabase/server'

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
)

export async function POST(req: Request) {
  const { title, body, url } = await req.json()
  const supabase = await createClient()
  const { data: param } = await supabase
    .from('parametre').select('valeur').eq('cle', 'vapid_subscriptions').single()

  const subs: PushSubscriptionJSON[] = param ? JSON.parse(param.valeur) : []
  await Promise.allSettled(
    subs.map(sub =>
      webpush.sendNotification(sub as any, JSON.stringify({ title, body, url }))
    )
  )
  return NextResponse.json({ sent: subs.length })
}
```

Créer `public/sw-push.js` (géré par next-pwa, mais handler push custom) — next-pwa gère le SW principal, on ajoute le listener push dans `public/worker.js` :
```js
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? { title: 'CRM Cyril', body: '' }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: { url: data.url ?? '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow(event.notification.data.url))
})
```

**Critère de fin :** `POST /api/push/subscribe` avec un payload valide renvoie `{ ok: true }`. `POST /api/push/send` avec `{ title, body }` envoie une notification push visible dans le navigateur (tester avec Postman ou un test Vitest + mock).

---

### Tâche 11 : Claude API — smoke test
**Durée :** ~10 min
**Prérequis :** Tâches 4, 5

```bash
npm install @anthropic-ai/sdk
```

Créer `src/lib/claude/client.ts` :
```ts
import Anthropic from '@anthropic-ai/sdk'

export const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})
```

Créer `src/test/claude-smoke.test.ts` (test d'intégration, skippé en CI si ANTHROPIC_API_KEY absente) :
```ts
import { describe, it, expect } from 'vitest'
import { anthropic } from '@/lib/claude/client'

describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Claude API smoke', () => {
  it('répond à un message simple', async () => {
    const msg = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      messages: [{ role: 'user', content: 'Réponds juste: OK' }],
    })
    expect(msg.content[0].type).toBe('text')
  }, 10_000)
})
```

**Critère de fin :** `npm test` passe. Si `ANTHROPIC_API_KEY` est définie localement, le test d'intégration passe aussi.

---

### Tâche 11b : Push initial sur GitHub
**Durée :** ~5 min
**Prérequis :** Tâche 11

1. Créer un repo GitHub privé nommé `crm-cyril` — **sans** cocher "Initialiser avec README", ".gitignore" ou "License" (on a déjà les nôtres)
2. Dans le terminal du projet :
   ```bash
   git remote add origin https://github.com/[ton-compte]/crm-cyril.git
   git branch -M main
   git push -u origin main
   ```
3. Vérifier sur GitHub que le repo affiche le commit initial avec tous les fichiers du projet

**Critère de fin :** Le repo GitHub privé est visible avec tous les fichiers. `.env.local` n'apparaît pas dans le repo.

---

### Tâche 12 : CI GitHub Actions
**Durée :** ~10 min
**Prérequis :** Tâches 1, 3, repo GitHub créé

Créer `.github/workflows/ci.yml` :
```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run type-check
      - run: npm test
      - run: npm run build
    env:
      NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.NEXT_PUBLIC_SUPABASE_URL }}
      NEXT_PUBLIC_SUPABASE_ANON_KEY: ${{ secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY }}
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: ${{ secrets.NEXT_PUBLIC_VAPID_PUBLIC_KEY }}
```

Ajouter les secrets dans GitHub → Settings → Secrets and variables → Actions (les 3 clés NEXT_PUBLIC_ suffisent pour build sans ANTHROPIC_API_KEY).

**Critère de fin :** Premier push sur `main` → CI verte dans GitHub Actions.

---

### Tâche 13 : Deploy Vercel
**Durée :** ~10 min
**Prérequis :** Tâches 12, compte Vercel connecté au repo

1. Vercel → New Project → importer le repo GitHub
2. Framework : Next.js (auto-détecté)
3. Ajouter toutes les variables d'environnement dans Vercel → Settings → Environment Variables (`.env.local` complet)
4. Dans Supabase → Authentication → URL Configuration : ajouter l'URL Vercel de prod aux Redirect URLs

**Critère de fin :** URL Vercel de prod charge la page `/login`. Le flux Google OAuth complet fonctionne en prod. URL Vercel de preview créée automatiquement à chaque PR.

---

## Résumé V0

| # | Tâche | Durée |
|---|-------|-------|
| 1 | Scaffold Next.js 15 | ~10 min |
| 2 | TypeScript strict + Prettier | ~10 min |
| 3 | Vitest + test smoke | ~10 min |
| 4 | Env vars + .gitignore | ~5 min |
| 5 | Supabase client + middleware auth | ~15 min |
| 6 | Page login + Google OAuth | ~15 min |
| 7 | Migrations 001_init.sql | ~20 min |
| 8 | Seeds 002_seeds.sql | ~10 min |
| 9 | PWA manifest + next-pwa | ~15 min |
| 10 | Web Push VAPID + endpoints | ~15 min |
| 11 | Claude API smoke test | ~10 min |
| 12 | CI GitHub Actions | ~10 min |
| 13 | Deploy Vercel | ~10 min |

**Total estimé V0 : ~2h35**

**Validation V0 :** Application en prod, auth fonctionnelle, DB migrée, PWA installable, Web Push configuré, Claude répond, CI verte.
