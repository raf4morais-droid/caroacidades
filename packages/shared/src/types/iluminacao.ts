export type SituacaoOS = 'aberta' | 'em_andamento' | 'concluida' | 'cancelada'

export interface OrdemServicoIP {
  id: string
  posteId: string
  tipo: string
  defeito?: string
  equipeId?: string
  situacao: SituacaoOS
  observacoes?: string
  abertaEm: string
  concluidaEm?: string
  createdAt: string
}

export interface Estoque {
  id: string
  produto: string
  marca?: string
  unidade: string
  quantidade: number
  localId: string
  createdAt: string
  updatedAt: string
}

export interface MovimentacaoEstoque {
  id: string
  estoqueId: string
  tipo: 'entrada' | 'saida' | 'transferencia'
  quantidade: number
  osId?: string
  observacoes?: string
  createdAt: string
}
