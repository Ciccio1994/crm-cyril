// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { anthropic } from '@/lib/claude/client'

describe.skipIf(!process.env.ANTHROPIC_API_KEY)('Claude API smoke', () => {
  it(
    'répond à un message simple',
    async () => {
      const msg = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 20,
        messages: [{ role: 'user', content: 'Réponds juste: OK' }],
      })

      expect(msg.content[0].type).toBe('text')
      console.log('Claude répond :', msg.content[0])
    },
    10_000
  )
})