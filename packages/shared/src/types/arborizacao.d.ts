export interface BoletimArborizacao {
    id: string;
    arvoreId: string;
    tipo: string;
    descricao?: string;
    fotoUrls?: string[];
    createdAt: string;
}
export interface OrdemServicoArb {
    id: string;
    arvoreId: string;
    tipo: string;
    equipeId?: string;
    situacao: 'aberta' | 'em_andamento' | 'concluida' | 'cancelada';
    observacoes?: string;
    createdAt: string;
    concluidaEm?: string;
}
