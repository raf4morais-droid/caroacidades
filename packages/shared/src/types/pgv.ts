import { GeoJSONGeometry } from './common'

export interface AmostraPGV {
  id: string
  setorId: string
  valorAmostra: number
  idadeAparente?: number
  estadoConservacao?: string
  tipologia?: string
  padraoCub?: string
  distanciaPolo?: number
  geometry?: GeoJSONGeometry
  createdAt: string
}

export interface SetorPGV {
  id: string
  nome: string
  equacao?: string
  r2?: number
  geometry?: GeoJSONGeometry
  createdAt: string
}

export interface PoloPGV {
  id: string
  nome: string
  tipo?: string
  geometry?: GeoJSONGeometry
  createdAt: string
}

export interface FaceQuadra {
  id: string
  quadraId: string
  logradouroId?: string
  valorCalculado?: number
  distanciaPolo?: number
  setorId?: string
  geometry?: GeoJSONGeometry
}

export interface SimulacaoIPTU {
  id: string
  descricao: string
  aliquotaResidencial: number
  aliquotaComercial: number
  aliquotaIndustrial: number
  aliquotaTerreno: number
  tetoAumentoPercent: number
  createdAt: string
}
