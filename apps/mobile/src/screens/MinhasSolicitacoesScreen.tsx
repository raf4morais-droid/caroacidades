import { View, Text, StyleSheet, FlatList, ActivityIndicator } from 'react-native'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

type Me = { id: string }
type Solicitacao = {
  id: string
  descricao: string
  endereco: string | null
  situacao: string
  categoria_nome: string
  created_at: string
}

const SITUACAO_LABEL: Record<string, string> = {
  aberta: 'Aberta',
  em_analise: 'Em análise',
  em_andamento: 'Em andamento',
  concluida: 'Concluída',
  cancelada: 'Cancelada',
}

const SITUACAO_COR: Record<string, string> = {
  aberta: '#2563eb',
  em_analise: '#d97706',
  em_andamento: '#7c3aed',
  concluida: '#16a34a',
  cancelada: '#6b7280',
}

// Lista as solicitações do próprio cidadão (req 163)
export function MinhasSolicitacoesScreen() {
  const { data: me } = useQuery<Me>({ queryKey: ['mobile-me'], queryFn: () => api.get('/mobile/me').then((r) => r.data) })

  const { data: solicitacoes = [], isLoading } = useQuery<Solicitacao[]>({
    queryKey: ['minhas-solicitacoes', me?.id],
    queryFn: () => api.get(`/mobile/chamados?usuarioId=${me!.id}`).then((r) => r.data),
    enabled: !!me?.id,
  })

  if (isLoading || !me) {
    return (
      <View style={styles.centro}>
        <ActivityIndicator size="large" color="#1e3a5f" />
      </View>
    )
  }

  if (solicitacoes.length === 0) {
    return (
      <View style={styles.centro}>
        <Text style={styles.vazioTexto}>Você ainda não enviou nenhuma solicitação.</Text>
      </View>
    )
  }

  return (
    <FlatList
      data={solicitacoes}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.lista}
      renderItem={({ item }) => (
        <View style={styles.cartao}>
          <View style={styles.cabecalho}>
            <Text style={styles.categoria}>{item.categoria_nome}</Text>
            <View style={[styles.situacao, { backgroundColor: SITUACAO_COR[item.situacao] ?? '#6b7280' }]}>
              <Text style={styles.situacaoTexto}>{SITUACAO_LABEL[item.situacao] ?? item.situacao}</Text>
            </View>
          </View>
          <Text style={styles.descricao} numberOfLines={3}>{item.descricao}</Text>
          {item.endereco && <Text style={styles.endereco}>📍 {item.endereco}</Text>}
          <Text style={styles.data}>{new Date(item.created_at).toLocaleDateString('pt-BR')}</Text>
        </View>
      )}
    />
  )
}

const styles = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  vazioTexto: { color: '#6b7280', fontSize: 14, textAlign: 'center' },
  lista: { padding: 16, gap: 12 },
  cartao: {
    backgroundColor: 'white', borderRadius: 12, padding: 14, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2,
  },
  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  categoria: { fontSize: 13, fontWeight: '700', color: '#1e3a5f' },
  situacao: { borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10 },
  situacaoTexto: { color: 'white', fontSize: 11, fontWeight: '700' },
  descricao: { fontSize: 14, color: '#374151', marginBottom: 6 },
  endereco: { fontSize: 12, color: '#6b7280', marginBottom: 4 },
  data: { fontSize: 11, color: '#9ca3af' },
})
