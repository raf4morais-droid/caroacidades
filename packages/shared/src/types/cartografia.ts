import { GeoJSONGeometry } from './common'

export interface Poste {
  id: string
  codigo: string
  logradouroId?: string
  numeroPredial?: string
  tipo?: string
  potencia?: number
  situacao: 'normal' | 'defeito' | 'em_manutencao'
  geometry?: GeoJSONGeometry
  createdAt: string
}

export interface Arvore {
  id: string
  codigo: number
  logradouroId?: string
  especie?: string
  altura?: number
  dap?: number
  estadoFitossanitario?: string
  situacaoCaucada?: string
  dataCadastro?: string
  geometry?: GeoJSONGeometry
}
