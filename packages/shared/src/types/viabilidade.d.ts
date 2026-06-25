export type TipoViabilidade = 'edificacao' | 'parcelamento' | 'cnae';
export interface ConsultaViabilidade {
    id: string;
    codigoVerificacao: string;
    parcelaId: string;
    tipo: TipoViabilidade;
    cnae?: string;
    cnaDescricao?: string;
    zonaUso?: string;
    parametros?: Record<string, unknown>;
    resultado: 'viavel' | 'inviavel' | 'condicional';
    observacoes?: string;
    pdfUrl?: string;
    solicitanteNome?: string;
    solicitanteEmail?: string;
    createdAt: string;
}
export interface ZonaUso {
    id: string;
    nome: string;
    sigla: string;
    descricao?: string;
    to?: number;
    ca?: number;
    afastamentoFrontal?: number;
    afastamentoLateral?: number;
    afastamentoPosterior?: number;
    gabarito?: number;
    usoPermitido?: string[];
    usoPermitidoCnaes?: string[];
    geometry?: unknown;
}
