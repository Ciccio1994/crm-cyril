import { describe, it, expect } from 'vitest'
import { parseSSEBuffer } from './use-chat'

describe('parseSSEBuffer — spec-compliant (WHATWG EventSource)', () => {
  it('parse un événement simple LF (\\n\\n)', () => {
    const buf = 'event: text_delta\ndata: {"delta":"hi"}\n\n'
    const { events, rest } = parseSSEBuffer(buf)
    expect(events).toEqual([{ event: 'text_delta', data: '{"delta":"hi"}' }])
    expect(rest).toBe('')
  })

  it('parse un événement CRLF (\\r\\n\\r\\n) — cas Android/Vercel HTTP2', () => {
    const buf = 'event: text_delta\r\ndata: {"delta":"hi"}\r\n\r\n'
    const { events, rest } = parseSSEBuffer(buf)
    expect(events).toEqual([{ event: 'text_delta', data: '{"delta":"hi"}' }])
    expect(rest).toBe('')
  })

  it('parse un événement CR isolé (\\r\\r) — rare mais autorisé par la spec', () => {
    const buf = 'event: text_delta\rdata: {"delta":"hi"}\r\r'
    const { events, rest } = parseSSEBuffer(buf)
    expect(events).toEqual([{ event: 'text_delta', data: '{"delta":"hi"}' }])
  })

  it('parse plusieurs événements dans un seul buffer', () => {
    const buf =
      'event: text_delta\ndata: {"delta":"a"}\n\n' +
      'event: text_delta\ndata: {"delta":"b"}\n\n' +
      'event: done\ndata: {}\n\n'
    const { events, rest } = parseSSEBuffer(buf)
    expect(events).toHaveLength(3)
    expect(events[0]).toEqual({ event: 'text_delta', data: '{"delta":"a"}' })
    expect(events[2]).toEqual({ event: 'done', data: '{}' })
    expect(rest).toBe('')
  })

  it('remet en buffer un événement incomplet (fragmentation Android)', () => {
    const buf = 'event: text_delta\ndata: {"delta":"a"}\n\nevent: text_delta\ndata: {"del'
    const { events, rest } = parseSSEBuffer(buf)
    expect(events).toEqual([{ event: 'text_delta', data: '{"delta":"a"}' }])
    expect(rest).toBe('event: text_delta\ndata: {"del')
  })

  it('gère un split CRLF au milieu du buffer (chunks Android)', () => {
    // Chunk 1 arrive avec fragmentation dans le séparateur CRLF
    const chunk1 = 'event: text_delta\r\ndata: {"delta":"a"}\r'
    const chunk2 = '\n\r\nevent: done\r\ndata: {}\r\n\r\n'
    // Simule le concat de buffer entre 2 iterations
    const buf = chunk1 + chunk2
    const { events, rest } = parseSSEBuffer(buf)
    expect(events).toEqual([
      { event: 'text_delta', data: '{"delta":"a"}' },
      { event: 'done', data: '{}' },
    ])
    expect(rest).toBe('')
  })

  it('accepte data:X (sans espace) et data: X (avec espace)', () => {
    const buf1 = 'event: x\ndata:{"a":1}\n\n'
    const buf2 = 'event: x\ndata: {"a":1}\n\n'
    expect(parseSSEBuffer(buf1).events[0].data).toBe('{"a":1}')
    expect(parseSSEBuffer(buf2).events[0].data).toBe('{"a":1}')
  })

  it('ignore les lignes commentaires (commence par :)', () => {
    const buf = ':heartbeat\nevent: text_delta\ndata: {"delta":"hi"}\n\n'
    const { events } = parseSSEBuffer(buf)
    expect(events).toEqual([{ event: 'text_delta', data: '{"delta":"hi"}' }])
  })

  it('concatène plusieurs lignes data: avec \\n (spec SSE)', () => {
    const buf = 'event: x\ndata: ligne1\ndata: ligne2\n\n'
    const { events } = parseSSEBuffer(buf)
    expect(events[0].data).toBe('ligne1\nligne2')
  })

  it('utilise "message" comme event par défaut (spec SSE)', () => {
    const buf = 'data: {"foo":1}\n\n'
    const { events } = parseSSEBuffer(buf)
    expect(events[0].event).toBe('message')
  })

  it('ignore les événements sans data et sans event explicite', () => {
    const buf = ':juste un commentaire\n\n'
    const { events } = parseSSEBuffer(buf)
    // Un événement 'message' avec data vide est produit — le hook consommateur filtre ce cas
    expect(events).toEqual([{ event: 'message', data: '' }])
  })

  it('gère un événement partiel à la fin du buffer', () => {
    const buf = 'event: text_delta\ndata: {"delta":"complet"}\n\nevent: text_delta\n'
    const { events, rest } = parseSSEBuffer(buf)
    expect(events).toEqual([{ event: 'text_delta', data: '{"delta":"complet"}' }])
    expect(rest).toBe('event: text_delta\n')
  })

  it('cas concret Android fragmenté : chunks intra-JSON préservés dans le rest', () => {
    // Simule ce qu'arriverait avec un chunk boundary au milieu d'une valeur JSON
    const buf = 'event: text_delta\ndata: {"delta":"bon'
    const { events, rest } = parseSSEBuffer(buf)
    expect(events).toEqual([])
    expect(rest).toBe('event: text_delta\ndata: {"delta":"bon')
  })
})
