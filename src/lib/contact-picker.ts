// Contact Picker API — Chrome Android, HTTPS, geste utilisateur requis.
// Non supporté sur iOS Safari, Firefox, desktop → bouton grisé côté UI.

interface ContactInfo {
  name?: string[]
  tel?: string[]
  email?: string[]
}

interface ContactsManager {
  select(
    properties: string[],
    options?: { multiple?: boolean },
  ): Promise<ContactInfo[]>
}

interface NavigatorWithContacts extends Navigator {
  contacts?: ContactsManager
}

export interface ContactPreselection {
  prenom?: string
  nom?: string
  telephone?: string
  email?: string
}

export function splitContactName(
  fullName: string | null | undefined,
): { prenom?: string; nom?: string } {
  if (!fullName) return {}
  const nettoye = fullName.trim().replace(/\s+/g, ' ')
  if (!nettoye) return {}
  const dernierEspace = nettoye.lastIndexOf(' ')
  if (dernierEspace === -1) return { nom: nettoye }
  return {
    prenom: nettoye.slice(0, dernierEspace),
    nom: nettoye.slice(dernierEspace + 1),
  }
}

export function isContactPickerSupported(): boolean {
  if (typeof navigator === 'undefined') return false
  const nav = navigator as NavigatorWithContacts
  return (
    typeof nav.contacts !== 'undefined' &&
    typeof nav.contacts.select === 'function'
  )
}

export async function selectContact(): Promise<ContactPreselection | null> {
  if (!isContactPickerSupported()) return null
  const nav = navigator as NavigatorWithContacts
  try {
    const contacts = await nav.contacts!.select(['name', 'tel', 'email'], {
      multiple: false,
    })
    if (contacts.length === 0) return null
    const c = contacts[0]
    const { prenom, nom } = splitContactName(c.name?.[0])
    return {
      prenom,
      nom,
      telephone: c.tel?.[0],
      email: c.email?.[0],
    }
  } catch {
    return null
  }
}
