import { createClient } from '@/lib/supabase/server'
import type { ModeleClaude } from '@/types/conversation'

const TARIFS_USD: Record<ModeleClaude, { input: number; output: number }> = {
  haiku:  { input: 1,  output: 5  }, // $ / 1M tokens
  sonnet: { input: 3,  output: 15 },
}
const USD_TO_CHF = 0.88

export function calculerCoutCHF(modele: ModeleClaude, tokensIn: number, tokensOut: number): number {
  const t = TARIFS_USD[modele]
  const usd = (tokensIn / 1e6) * t.input + (tokensOut / 1e6) * t.output
  return Math.round(usd * USD_TO_CHF * 10000) / 10000
}

export function estAuDelaSeuil(cumuleCHF: number, seuilCHF: number): boolean {
  if (seuilCHF <= 0) return false
  return cumuleCHF >= seuilCHF * 0.8
}

export interface EtatMonitoring {
  tokens_mois: number
  cout_chf_mois: number
  seuil_chf: number
  au_dela_seuil: boolean
}

interface DataParametre {
  tokens_mois: number
  cout_chf_mois: number
  seuil_chf: number
}

export async function ajouterConsommation(
  modele: ModeleClaude,
  tokensIn: number,
  tokensOut: number,
): Promise<EtatMonitoring> {
  const supabase = await createClient()
  const cle = 'monitoring_consommation_claude'
  const { data } = await supabase
    .from('parametre')
    .select('valeur')
    .eq('cle', cle)
    .maybeSingle()

  const prec: DataParametre = data?.valeur
    ? (JSON.parse(data.valeur) as DataParametre)
    : { tokens_mois: 0, cout_chf_mois: 0, seuil_chf: 30 }

  const nouveau: EtatMonitoring = {
    tokens_mois:   prec.tokens_mois + tokensIn + tokensOut,
    cout_chf_mois: Math.round((prec.cout_chf_mois + calculerCoutCHF(modele, tokensIn, tokensOut)) * 10000) / 10000,
    seuil_chf:     prec.seuil_chf,
    au_dela_seuil: false,
  }
  nouveau.au_dela_seuil = estAuDelaSeuil(nouveau.cout_chf_mois, nouveau.seuil_chf)

  await supabase.from('parametre').upsert({
    cle,
    valeur: JSON.stringify({
      tokens_mois:   nouveau.tokens_mois,
      cout_chf_mois: nouveau.cout_chf_mois,
      seuil_chf:     nouveau.seuil_chf,
    }),
  })
  return nouveau
}

export async function lireMonitoring(): Promise<EtatMonitoring> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('parametre')
    .select('valeur')
    .eq('cle', 'monitoring_consommation_claude')
    .maybeSingle()

  const p: DataParametre = data?.valeur
    ? (JSON.parse(data.valeur) as DataParametre)
    : { tokens_mois: 0, cout_chf_mois: 0, seuil_chf: 30 }

  return { ...p, au_dela_seuil: estAuDelaSeuil(p.cout_chf_mois, p.seuil_chf) }
}
