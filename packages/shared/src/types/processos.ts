export type TipoProcesso = 'aprovacao_projeto' | 'habite_se' | 'reurb'
export type SituacaoProcesso = 'rascunho' | 'aberto' | 'em_analise' | 'aprovado' | 'reprovado' | 'cancelado'

export interface Processo {
  id: string
  codigo: string
  tipo: TipoProcesso
  situacao: SituacaoProcesso
  requerenteId: string
  parcelaId?: string
  analistaId?: string
  setorAtual?: string
  createdAt: string
  updatedAt: string
}

export interface EtapaProcesso {
  id: string
  processoId: string
  nome: string
  ordem: number
  situacao: 'pendente' | 'aprovado' | 'reprovado'
  analistaId?: string
  parecer?: string
  createdAt: string
  concluidaEm?: string
}

export interface AnexoProcesso {
  id: string
  processoId: string
  nome: string
  tipo: string
  tamanhoBytes: number
  url: string
  createdAt: string
}
