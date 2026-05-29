import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { SIGMap } from '../components/map/SIGMap'
import { useMapStore } from '../store/map.store'
import toast from 'react-hot-toast'

const SITUACAO_LABEL: Record<string, string> = {
  aberta: 'Aberta', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada'
}
const SITUACAO_COLOR: Record<string, string> = {
  aberta: '#ef4444', em_andamento: '#f59e0b', concluida: '#22c55e', cancelada: '#9ca3af'
}

export function IluminacaoPage() {
  const [tab, setTab] = useState<'mapa' | 'os' | 'estoque'>('mapa')
  const [situacaoFilter, setSituacaoFilter] = useState('')
  const qc = useQueryClient()

  const { data: ordens } = useQuery({
    queryKey: ['os-ip', situacaoFilter],
    queryFn: () =>
      api.get(`/iluminacao/os${situacaoFilter ? `?situacao=${situacaoFilter}` : ''}`).then(r => r.data),
  })

  const { data: estoque } = useQuery({
    queryKey: ['estoque'],
    queryFn: () => api.get('/iluminacao/estoque').then(r => r.data),
    enabled: tab === 'estoque',
  })

  const updateSituacao = useMutation({
    mutationFn: ({ id, situacao }: { id: string; situacao: string }) =>
      api.patch(`/iluminacao/os/${id}/situacao`, { situacao }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['os-ip'] }); toast.success('OS atualizada') },
  })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Abas */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', background: 'white', flexShrink: 0 }}>
        {(['mapa', 'os', 'estoque'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              padding: '12px 24px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: tab === t ? 700 : 400,
              color: tab === t ? '#2563eb' : '#6b7280',
              borderBottom: tab === t ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {{ mapa: 'Mapa de Postes', os: 'Ordens de Serviço', estoque: 'Estoque' }[t]}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'mapa' && (
          <div style={{ height: '100%' }}>
            <SIGMap />
          </div>
        )}

        {tab === 'os' && (
          <div style={{ padding: 20, height: '100%', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: '#1e3a5f' }}>Ordens de Serviço — Iluminação Pública</h3>
              <select
                value={situacaoFilter}
                onChange={e => setSituacaoFilter(e.target.value)}
                style={{ padding: '6px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
              >
                <option value="">Todas as situações</option>
                {Object.entries(SITUACAO_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  {['OS', 'Poste', 'Defeito', 'Equipe', 'Situação', 'Aberta em', 'Ação'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ordens?.map((os: any) => (
                  <tr key={os.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '9px 12px', fontFamily: 'monospace', fontSize: 12 }}>{os.id.slice(0, 8)}</td>
                    <td style={{ padding: '9px 12px' }}>{os.poste_codigo ?? '—'}</td>
                    <td style={{ padding: '9px 12px' }}>{os.tipo_defeito ?? '—'}</td>
                    <td style={{ padding: '9px 12px' }}>{os.equipe_nome ?? '—'}</td>
                    <td style={{ padding: '9px 12px' }}>
                      <span style={{
                        background: SITUACAO_COLOR[os.situacao] + '22',
                        color: SITUACAO_COLOR[os.situacao],
                        padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                      }}>
                        {SITUACAO_LABEL[os.situacao]}
                      </span>
                    </td>
                    <td style={{ padding: '9px 12px', color: '#6b7280' }}>
                      {new Date(os.aberta_em).toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      {os.situacao === 'aberta' && (
                        <button
                          onClick={() => updateSituacao.mutate({ id: os.id, situacao: 'em_andamento' })}
                          style={{
                            padding: '4px 10px', background: '#f59e0b', color: 'white',
                            border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                          }}
                        >
                          Iniciar
                        </button>
                      )}
                      {os.situacao === 'em_andamento' && (
                        <button
                          onClick={() => updateSituacao.mutate({ id: os.id, situacao: 'concluida' })}
                          style={{
                            padding: '4px 10px', background: '#22c55e', color: 'white',
                            border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12,
                          }}
                        >
                          Concluir
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'estoque' && (
          <div style={{ padding: 20, overflow: 'auto', height: '100%' }}>
            <h3 style={{ margin: '0 0 16px', color: '#1e3a5f' }}>Estoque de Materiais</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  {['Produto', 'Local', 'Qtd', 'Unidade', 'Lote/Série', 'Garantia'].map(h => (
                    <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {estoque?.map((item: any) => (
                  <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '9px 12px', fontWeight: 500 }}>{item.produto_nome}</td>
                    <td style={{ padding: '9px 12px' }}>{item.local_nome}</td>
                    <td style={{ padding: '9px 12px', fontWeight: 700, color: item.quantidade === 0 ? '#ef4444' : '#111' }}>
                      {item.quantidade}
                    </td>
                    <td style={{ padding: '9px 12px', color: '#6b7280' }}>{item.unidade}</td>
                    <td style={{ padding: '9px 12px', color: '#6b7280' }}>{item.lote_serie ?? '—'}</td>
                    <td style={{ padding: '9px 12px', color: '#6b7280' }}>
                      {item.garantia_ate ? new Date(item.garantia_ate).toLocaleDateString('pt-BR') : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
