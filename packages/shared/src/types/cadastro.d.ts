import { GeoJSONGeometry } from './common';
export interface Bairro {
    id: string;
    nome: string;
    codigo: string;
    geometry?: GeoJSONGeometry;
    createdAt: string;
    updatedAt: string;
}
export interface Logradouro {
    id: string;
    nome: string;
    tipo: string;
    codigo: string;
    cep?: string;
    bairroId: string;
    geometry?: GeoJSONGeometry;
    createdAt: string;
    updatedAt: string;
}
export interface Loteamento {
    id: string;
    nome: string;
    decreto?: string;
    dataAprovacao?: string;
    geometry?: GeoJSONGeometry;
    createdAt: string;
    updatedAt: string;
}
export interface Quadra {
    id: string;
    codigo: string;
    loteamentoId: string;
    geometry?: GeoJSONGeometry;
    createdAt: string;
    updatedAt: string;
}
export interface Parcela {
    id: string;
    codigo: string;
    areaM2: number;
    testadaPrincipal?: number;
    testadaSecundaria?: number;
    bairroId: string;
    logradouroId: string;
    loteamentoId?: string;
    quadraId?: string;
    geometry?: GeoJSONGeometry;
    createdAt: string;
    updatedAt: string;
    bairro?: Bairro;
    logradouro?: Logradouro;
    quadra?: Quadra;
    edificacoes?: Edificacao[];
}
export type SituacaoEdificacao = 'regular' | 'irregular' | 'em_construcao' | 'demolida' | 'terreno_vazio';
export interface Edificacao {
    id: string;
    inscricaoImobiliaria?: string;
    cadastroImobiliario?: string;
    areaConstruida?: number;
    parcelaId: string;
    proprietarioId?: string;
    faceQuadra?: string;
    numeroPredial?: string;
    situacao: SituacaoEdificacao;
    geometry?: GeoJSONGeometry;
    createdAt: string;
    updatedAt: string;
}
export interface Pessoa {
    id: string;
    nome: string;
    cpfCnpj?: string;
    email?: string;
    telefone?: string;
    endereco?: string;
    tipo: 'fisica' | 'juridica';
    createdAt: string;
    updatedAt: string;
}
export type SituacaoRecadastramento = 'pendente' | 'visitado' | 'recadastrado' | 'impedido';
export interface BIC {
    id: string;
    parcelaId: string;
    edificacaoId?: string;
    situacaoRecadastramento: SituacaoRecadastramento;
    areaTerreno?: number;
    areaEdificada?: number;
    numeroPavimentos?: number;
    tipologiaConstrutiva?: string;
    estadoConservacao?: string;
    numeroPredial?: string;
    observacoes?: string;
    fotoUrls: string[];
    latitudeColeta?: number;
    longitudeColeta?: number;
    coletadoPor?: string;
    coletadoEm?: string;
    sincronizadoEm?: string;
    createdAt: string;
}
export interface HistoricoCartografico {
    id: string;
    entidade: string;
    entidadeId: string;
    geometryAntes?: GeoJSONGeometry;
    geometryDepois?: GeoJSONGeometry;
    usuarioId: string;
    operacao: 'insert' | 'update' | 'delete' | 'desmembramento' | 'unificacao';
    createdAt: string;
}
