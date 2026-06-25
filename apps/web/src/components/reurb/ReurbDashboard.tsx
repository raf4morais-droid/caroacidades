import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { SIT } from '../../pages/ProcessosPage'

type Dashboard = {
  porSituacao: { situacao: string; total: number }[]
  total: number
  tempoMedioDiasConclusao: number | null
}

// Dashboard de processos REURB por situação, atualizado em tempo real (req 208)
export function ReurbDashboard() {
  const { data } = useQuery<Dashboard>({
    queryKey: ['processos-dashboard', 'reurb'],
    queryFn: () => api.get('/processos/dashboard?tipo=reurb').then(r => r.data),
    refetchInterval: 30000,
  })

  const totalPorSituacao = (situacao: string) =>
    data?.porSituacao.find(p => p.situacao === situacao)?.total ?? 0

  return (
    <div style={{ padding: 24, overflowY: 'auto', height: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <h2 style={{ margin: 0, color: '#1e3a5f', fontSize: 20 }}>Dashboard REURB</h2>
        <p style={{ margin: 0, color: '#6b7280', fontSize: 12 }}>Atualizado automaticamente a cada 30s</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 20 }}>
        <Card label="Total de processos" value={data?.total ?? 0} color="#1e3a5f" />
        {Object.entries(SIT).map(([situacao, info]) => (
          <Card key={situacao} label={info.label} value={totalPorSituacao(situacao)} color={info.color} />
        ))}
      </div>

      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, maxWidth: 320 }}>
        <p style={{ margin: '0 0 4px', fontSize: 12, color: '#6b7280' }}>Tempo médio até conclusão (aprovado/reprovado)</p>
        <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#1e3a5f' }}>
          {data?.tempoMedioDiasConclusao != null ? `${data.tempoMedioDiasConclusao} dias` : '—'}
        </p>
      </div>
    </div>
  )
}

function Card({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14 }}>
      <p style={{ margin: '0 0 6px', fontSize: 12, color: '#6b7280' }}>{label}</p>
      <p style={{ margin: 0, fontSize: 28, fontWeight: 700, color }}>{value}</p>
    </div>
  )
}
