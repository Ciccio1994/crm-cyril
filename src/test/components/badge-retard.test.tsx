import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { BadgeRetard } from '@/components/etablissements/badge-retard'

describe('BadgeRetard', () => {
  it('affiche "En retard" avec le nombre de jours si en retard', () => {
    render(<BadgeRetard jours={40} enRetard={true} />)
    expect(screen.getByText(/en retard/i)).toBeInTheDocument()
    expect(screen.getByText(/40/)).toBeInTheDocument()
  })

  it('affiche "Jamais visité" si jours null', () => {
    render(<BadgeRetard jours={null} enRetard={false} />)
    expect(screen.getByText(/jamais/i)).toBeInTheDocument()
  })

  it("n'affiche rien si à jour", () => {
    const { container } = render(<BadgeRetard jours={5} enRetard={false} />)
    expect(container.textContent).toBe('')
  })
})
