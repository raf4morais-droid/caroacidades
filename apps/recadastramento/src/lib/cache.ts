import AsyncStorage from '@react-native-async-storage/async-storage'

const CHAVE_LOTEAMENTOS = 'cache_loteamentos'
const CHAVE_LOTES_PREFIXO = 'cache_lotes_'

export type Loteamento = { id: string; nome: string; decreto: string | null }

export type Lote = {
  id: string
  codigo: string
  area_m2: number | null
  situacao_recadastramento: 'pendente' | 'visitado' | 'recadastrado' | 'impedido'
  geometry: { type: string; coordinates: any }
}

// Cache local de loteamentos e lotes para permitir navegação e seleção sem conexão (req 175)
export async function salvarCacheLoteamentos(loteamentos: Loteamento[]) {
  await AsyncStorage.setItem(CHAVE_LOTEAMENTOS, JSON.stringify(loteamentos))
}

export async function lerCacheLoteamentos(): Promise<Loteamento[]> {
  const bruto = await AsyncStorage.getItem(CHAVE_LOTEAMENTOS)
  return bruto ? JSON.parse(bruto) : []
}

export async function salvarCacheLotes(loteamentoId: string, lotes: Lote[]) {
  await AsyncStorage.setItem(`${CHAVE_LOTES_PREFIXO}${loteamentoId}`, JSON.stringify(lotes))
}

export async function lerCacheLotes(loteamentoId: string): Promise<Lote[]> {
  const bruto = await AsyncStorage.getItem(`${CHAVE_LOTES_PREFIXO}${loteamentoId}`)
  return bruto ? JSON.parse(bruto) : []
}
