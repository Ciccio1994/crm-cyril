import { describe, it, expect, beforeEach } from 'vitest'
import { db } from '@/lib/db/dexie'
import {
  enqueue, prochainesTaches, marquerReussi, marquerEchec, calculerBackoff,
} from '@/lib/sync/queue'

beforeEach(async () => {
  await db.sync_queue.clear()
})

describe('enqueue', () => {
  it("crée une entrée avec statut 'en_attente' + tentatives=0", async () => {
    const id = await enqueue('creerVisite', { etablissement_id: 'e1' }, null)
    const row = await db.sync_queue.get(id)
    expect(row?.statut).toBe('en_attente')
    expect(row?.tentatives).toBe(0)
    expect(row?.nom_action).toBe('creerVisite')
    expect(row?.payload_json).toBe(JSON.stringify({ etablissement_id: 'e1' }))
  })

  it("stocke cible_id pour les updates/deletes", async () => {
    const id = await enqueue('mettreAJourVisite', { notes: 'X' }, 'v1')
    const row = await db.sync_queue.get(id)
    expect(row?.cible_id).toBe('v1')
  })
})

describe('prochainesTaches', () => {
  it("retourne les entrées 'en_attente' ordonnées par created_at", async () => {
    await enqueue('creerVisite', { etablissement_id: 'e2' }, null)
    await new Promise((r) => setTimeout(r, 5))
    await enqueue('creerVisite', { etablissement_id: 'e3' }, null)
    const taches = await prochainesTaches()
    expect(taches).toHaveLength(2)
    expect(taches[0].payload_json).toContain('e2')
    expect(taches[1].payload_json).toContain('e3')
  })

  it("ignore les 'reussi' et respecte le backoff pour les 'echec'", async () => {
    const idOK = await enqueue('creerVisite', { x: 1 }, null)
    await marquerReussi(idOK)
    const idKO = await enqueue('creerVisite', { x: 2 }, null)
    await marquerEchec(idKO, 'Boom')
    const taches = await prochainesTaches()
    expect(taches).toHaveLength(0)
  })

  it("réinclut un 'echec' quand son backoff est écoulé", async () => {
    const id = await enqueue('creerVisite', { x: 1 }, null)
    await marquerEchec(id, 'transient')
    const passe = new Date(Date.now() - 10_000).toISOString()
    await db.sync_queue.update(id, { dernier_essai_at: passe })
    const taches = await prochainesTaches()
    expect(taches).toHaveLength(1)
  })
})

describe('marquerReussi', () => {
  it("passe l'entrée en 'reussi'", async () => {
    const id = await enqueue('creerVisite', {}, null)
    await marquerReussi(id)
    const row = await db.sync_queue.get(id)
    expect(row?.statut).toBe('reussi')
  })
})

describe('marquerEchec', () => {
  it("incrémente tentatives et statut='en_attente' si < 3 tentatives", async () => {
    const id = await enqueue('creerVisite', {}, null)
    await marquerEchec(id, 'net')
    const row = await db.sync_queue.get(id)
    expect(row?.tentatives).toBe(1)
    expect(row?.statut).toBe('en_attente')
    expect(row?.dernier_message).toBe('net')
  })

  it("passe en 'echec' définitif après 3 tentatives", async () => {
    const id = await enqueue('creerVisite', {}, null)
    await marquerEchec(id, 'x')
    await marquerEchec(id, 'x')
    await marquerEchec(id, 'x')
    const row = await db.sync_queue.get(id)
    expect(row?.tentatives).toBe(3)
    expect(row?.statut).toBe('echec')
  })
})

describe('calculerBackoff', () => {
  it("respecte 1 s / 5 s / 30 s en fonction de tentatives", () => {
    expect(calculerBackoff(0)).toBe(1000)
    expect(calculerBackoff(1)).toBe(5000)
    expect(calculerBackoff(2)).toBe(30_000)
  })
})
