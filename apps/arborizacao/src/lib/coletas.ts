import AsyncStorage from '@react-native-async-storage/async-storage'

const CHAVE = 'arvores_coletadas'

export type ColetaArvore = {
  localId: string
  remoteId?: string
  codigo?: number
  latitude: number
  longitude: number
  especie?: string
  nomePopular?: string
  alturaM?: number
  dapCm?: number
  estadoFitossanitario?: string
  situacaoCalcada?: string
  logradouroId?: string
  logradouroNome?: string
  fotos: string[]
  sincronizado: boolean
  criadoEm: string
}

export async function listarColetas(): Promise<ColetaArvore[]> {
  const bruto = await AsyncStorage.getItem(CHAVE)
  return bruto ? JSON.parse(bruto) : []
}

async function salvarTodas(coletas: ColetaArvore[]) {
  await AsyncStorage.setItem(CHAVE, JSON.stringify(coletas))
}

export async function salvarColeta(coleta: ColetaArvore) {
  const atuais = await listarColetas()
  const indice = atuais.findIndex((c) => c.localId === coleta.localId)
  if (indice >= 0) atuais[indice] = coleta
  else atuais.unshift(coleta)
  await salvarTodas(atuais)
  return atuais
}

export async function removerColeta(localId: string) {
  const atuais = await listarColetas()
  const restantes = atuais.filter((c) => c.localId !== localId)
  await salvarTodas(restantes)
  return restantes
}

export function novoLocalId() {
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`
}
