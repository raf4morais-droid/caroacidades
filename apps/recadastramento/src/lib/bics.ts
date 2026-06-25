import AsyncStorage from '@react-native-async-storage/async-storage'

const CHAVE = 'bics_coletados'

export type SituacaoRecadastramento = 'visitado' | 'recadastrado' | 'impedido'

export type BicColetado = {
  localId: string
  remoteId?: string
  parcelaId: string
  parcelaCodigo?: string
  loteamentoNome?: string
  situacaoRecadastramento: SituacaoRecadastramento
  areaTerreno?: number
  areaEdificada?: number
  numeroPavimentos?: number
  tipologiaConstrutiva?: string
  estadoConservacao?: string
  numeroPredial?: string
  observacoes?: string
  fotos: string[]
  latitudeColeta?: number
  longitudeColeta?: number
  sincronizado: boolean
  criadoEm: string
}

export async function listarBics(): Promise<BicColetado[]> {
  const bruto = await AsyncStorage.getItem(CHAVE)
  return bruto ? JSON.parse(bruto) : []
}

async function salvarTodos(bics: BicColetado[]) {
  await AsyncStorage.setItem(CHAVE, JSON.stringify(bics))
}

export async function salvarBic(bic: BicColetado) {
  const atuais = await listarBics()
  const indice = atuais.findIndex((b) => b.localId === bic.localId)
  if (indice >= 0) atuais[indice] = bic
  else atuais.unshift(bic)
  await salvarTodos(atuais)
  return atuais
}

export async function removerBic(localId: string) {
  const atuais = await listarBics()
  const restantes = atuais.filter((b) => b.localId !== localId)
  await salvarTodos(restantes)
  return restantes
}

export function novoLocalId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
