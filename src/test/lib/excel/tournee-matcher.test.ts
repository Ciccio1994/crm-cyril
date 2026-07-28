import { describe, it, expect } from 'vitest'
import { mapperTournee, tokeniserNomTournee } from '@/lib/excel/tournee-matcher'

const CANDIDATS = [
  { id: 't1',  nom: 'Anzère - Ayent' },
  { id: 't2',  nom: 'Ardon - Vétroz' },
  { id: 't3',  nom: 'Conthey - Aproz' },
  { id: 't4',  nom: 'Crans-Montana - Chermignon' },
  { id: 't5',  nom: 'Fully - Saxon - Charrat' },
  { id: 't6',  nom: 'Sierre - Grône - Bramois - Vercorin' },
  { id: 't7',  nom: 'Sion - Savièse' },
  { id: 't8',  nom: 'Saillon - Leytron - Riddes - Tzoumaz' },
  { id: 't9',  nom: 'Ovronnaz' },
  { id: 't10', nom: 'B. St-Pierre - Champex - Liddes - Bovernier' },
  { id: 't11', nom: 'Martigny - Finhaut - Ravoire - Trient' },
  { id: 't12', nom: 'Chamoson' },
  { id: 't13', nom: 'Nendaz' },
  { id: 't14', nom: 'Nax - Mase' },
  { id: 't15', nom: 'Châble - Verbier - Vollèges' },
  { id: 't16', nom: "Val d'Anniviers - Chandolin - Zinal" },
  { id: 't17', nom: 'Orsières' },
  { id: 't18', nom: 'Hérémence - Thyon' },
]

describe('tokeniserNomTournee', () => {
  it('lowercase + accents + split sur non-word', () => {
    expect(tokeniserNomTournee('Sion - Savièse')).toEqual(['sion', 'saviese'])
  })
  it("retire le préfixe numérique '1. '", () => {
    expect(tokeniserNomTournee('1. Anzère - Ayent')).toEqual(['anzere', 'ayent'])
  })
  it("retire le préfixe numérique '10.' (sans espace)", () => {
    expect(tokeniserNomTournee('10.B. S.P. - Champ- Liddes-Bove'))
      .toEqual(['b', 's', 'p', 'champ', 'liddes', 'bove'])
  })
  it("apostrophes et tirets deviennent séparateurs", () => {
    expect(tokeniserNomTournee("Val d'Anniviers - Chandolin - Zinal"))
      .toEqual(['val', 'd', 'anniviers', 'chandolin', 'zinal'])
  })
  it('renvoie tableau vide sur chaîne vide', () => {
    expect(tokeniserNomTournee('')).toEqual([])
  })
})

describe('mapperTournee — 18 onglets Excel réels de Cyril', () => {
  const CAS: [string, string][] = [
    ['1. Anzère - Ayent',                    'Anzère - Ayent'],
    ['2. Ardon - Vétroz',                    'Ardon - Vétroz'],
    ['3. Conthey - Aproz',                   'Conthey - Aproz'],
    ['4. Crans-Montana - Chermignon',        'Crans-Montana - Chermignon'],
    ['5. Fully - Saxon - Charrat',           'Fully - Saxon - Charrat'],
    ['6. Sierre - Grône - Bram- Verco',      'Sierre - Grône - Bramois - Vercorin'],
    ['7. Sion - Savièse',                    'Sion - Savièse'],
    ['8.Saill - Leytron- Riddes-tzoum',      'Saillon - Leytron - Riddes - Tzoumaz'],
    ['9. Ovronnaz',                          'Ovronnaz'],
    ['10.B. S.P. - Champ- Liddes-Bove',      'B. St-Pierre - Champex - Liddes - Bovernier'],
    ['11. Mart.-Finhaut-Ravoir-trient',      'Martigny - Finhaut - Ravoire - Trient'],
    ['12. Chamoson',                         'Chamoson'],
    ['13. Nendaz',                           'Nendaz'],
    ['14. Nax - Mase',                       'Nax - Mase'],
    ['15. Châble - Verbier - Vollèges',      'Châble - Verbier - Vollèges'],
    ["16. Val d'an. Chandolin - Zinal",      "Val d'Anniviers - Chandolin - Zinal"],
    ['17. Orsière',                          'Orsières'],
    ['18. Hérémence - Thyon',                'Hérémence - Thyon'],
  ]

  for (const [excel, attendu] of CAS) {
    it(`matche "${excel}" → "${attendu}"`, () => {
      const r = mapperTournee(excel, CANDIDATS)
      expect(r?.nom).toBe(attendu)
    })
  }
})

describe('mapperTournee — cas edge', () => {
  it('renvoie null si aucun candidat', () => {
    expect(mapperTournee('X', [])).toBeNull()
  })

  it('renvoie null si le nom Excel est vide (pas de tokens)', () => {
    expect(mapperTournee('', CANDIDATS)).toBeNull()
    expect(mapperTournee('12.', CANDIDATS)).toBeNull()
  })

  it('renvoie null si ambiguïté (deux tournées à même score max)', () => {
    // "Ardon - Sion" : ardon (Ardon-Vétroz), sion (Sion-Savièse) → tie 1/1
    expect(mapperTournee('Ardon - Sion', CANDIDATS)).toBeNull()
  })

  it('renvoie null si aucune tournée ne dépasse le seuil de la moitié des tokens', () => {
    expect(mapperTournee('Zzz Aaa Bbb Ccc', CANDIDATS)).toBeNull()
  })
})
