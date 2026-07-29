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
  telephone_mobile?: string
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

// L'API Contact Picker renvoie un simple tableau de strings sans distinction
// fixe/mobile. Heuristique : si 2 numéros disponibles, prendre le 1er comme
// telephone (souvent le fixe/principal enregistré) et le 2ème comme mobile.
// Si un seul numéro, il va dans telephone_mobile car sur Android c'est très
// souvent le portable qui est renseigné.
export function extraireTelephones(
  tel: string[] | undefined,
): { telephone?: string; telephone_mobile?: string } {
  if (!tel || tel.length === 0) return {}
  const nettoyes = tel.map((t) => t.trim()).filter((t) => t.length > 0)
  if (nettoyes.length === 0) return {}
  if (nettoyes.length === 1) {
    // Un seul numéro : on le met dans telephone (principal)
    return { telephone: nettoyes[0] }
  }
  // 2+ numéros : 1er → telephone, 2e → telephone_mobile
  return { telephone: nettoyes[0], telephone_mobile: nettoyes[1] }
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
    const { telephone, telephone_mobile } = extraireTelephones(c.tel)
    return {
      prenom,
      nom,
      telephone,
      telephone_mobile,
      email: c.email?.[0],
    }
  } catch {
    return null
  }
}
