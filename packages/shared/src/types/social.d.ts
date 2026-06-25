export interface PessoaSocial {
    id: string;
    nome: string;
    cpf?: string;
    nis?: string;
    pis?: string;
    dataNascimento?: string;
    sexo?: string;
    escolaridade?: string;
    familiaId?: string;
    createdAt: string;
}
export interface Familia {
    id: string;
    codigo: string;
    edificacaoId?: string;
    situacaoCadastral: string;
    rendaBruta?: number;
    rendaPerCapita?: number;
    qtdMembros: number;
    indiceVulnerabilidade?: number;
    programasSociais?: string[];
    createdAt: string;
    updatedAt: string;
}
