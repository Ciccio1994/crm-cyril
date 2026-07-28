import { Badge } from '@/components/ui/badge'

interface BadgeRetardProps {
  jours: number | null
  enRetard: boolean
}

export function BadgeRetard({ jours, enRetard }: BadgeRetardProps) {
  if (jours === null) {
    return <Badge variant="secondary">Jamais visité</Badge>
  }
  if (enRetard) {
    return <Badge variant="destructive">En retard · {jours} j</Badge>
  }
  return null
}
