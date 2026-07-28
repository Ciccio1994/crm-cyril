'use client'

import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { chercherLieux, detailsLieu } from '@/actions/geocode'
import type { DetailsLieu, SuggestionLieu } from '@/lib/geocode'

interface ChampAdresseAutocompleteProps {
  id?: string
  value: string
  onChange: (value: string) => void
  onSuggestion: (details: DetailsLieu) => void
}

const DEBOUNCE_MS = 300
const MIN_CHARS = 3

function nouveauToken() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function ChampAdresseAutocomplete({
  id,
  value,
  onChange,
  onSuggestion,
}: ChampAdresseAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<SuggestionLieu[]>([])
  const [loading, setLoading] = useState(false)
  const [ouvert, setOuvert] = useState(false)
  const [suppressed, setSuppressed] = useState(false)
  const [chargementDetails, setChargementDetails] = useState(false)
  const [sessionToken, setSessionToken] = useState(() => nouveauToken())
  const dernierQueryRef = useRef<string>('')

  useEffect(() => {
    const q = value.trim()
    if (suppressed) {
      setSuppressed(false)
      return
    }
    if (q.length < MIN_CHARS) {
      setSuggestions([])
      setLoading(false)
      return
    }

    const controller = new AbortController()
    dernierQueryRef.current = q
    console.log('[Autocomplete] effect fired, query:', q, '| min chars ok, will debounce', DEBOUNCE_MS, 'ms')
    const timeout = setTimeout(async () => {
      console.log('[Autocomplete] debounce end → calling chercherLieux for:', q)
      setLoading(true)
      const result = await chercherLieux(q, sessionToken)
      console.log('[Autocomplete] result:', result)
      if (controller.signal.aborted) {
        console.log('[Autocomplete] aborted, ignore result')
        return
      }
      if (dernierQueryRef.current !== q) {
        console.log('[Autocomplete] stale (dernier=', dernierQueryRef.current, ', q=', q, ')')
        return
      }
      setLoading(false)
      if (result.data) {
        console.log('[Autocomplete] setting', result.data.length, 'suggestions + ouvert=true')
        setSuggestions(result.data)
        setOuvert(true)
      } else {
        console.log('[Autocomplete] no data, erreur:', result.erreur)
      }
    }, DEBOUNCE_MS)

    return () => {
      controller.abort()
      clearTimeout(timeout)
    }
  }, [value, suppressed, sessionToken])

  async function choisir(s: SuggestionLieu) {
    setChargementDetails(true)
    setOuvert(false)
    setSuppressed(true)
    try {
      const result = await detailsLieu(s.placeId, sessionToken)
      if (result.data) {
        onSuggestion(result.data)
      }
    } finally {
      setChargementDetails(false)
      setSuggestions([])
      // Session Google terminée → nouveau token pour la prochaine saisie
      setSessionToken(nouveauToken())
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setOuvert(true)}
        onBlur={() => setTimeout(() => setOuvert(false), 150)}
        className="h-12 text-base"
        autoComplete="off"
        disabled={chargementDetails}
      />
      {ouvert && (loading || suggestions.length > 0) && (
        <ul
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover shadow-lg"
          role="listbox"
        >
          {loading && suggestions.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              Recherche…
            </li>
          )}
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choisir(s)}
                className="tap-target block w-full border-b px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted/50"
              >
                <span className="block font-medium">{s.mainText}</span>
                {s.secondaryText && (
                  <span className="block text-xs text-muted-foreground">
                    {s.secondaryText}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
