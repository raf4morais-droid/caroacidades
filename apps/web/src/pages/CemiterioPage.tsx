import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import toast from 'react-hot-toast'

type Cemiterio = { id: string; nome: string }
type Sepultura = {
  id: string
  codigo: string
  cemiterio_nome: string
  titular: string | null
  falecido: string | null
  data_falecimento: string | null
  tipo_sepultura: string | null
  situacao: string
}

const SIT_COLOR: Record<string, string> = {
  ocupada:     '#ef4444',
  disponivel:  '#10b981',
  perpetua:    '#3b82f6',
  transferida: '#9ca3af',
}

export function CemiterioPage() {
  const qc = useQueryClient()
  const [cemId, setCemId] = useState('')
  const [filtroSit, setFiltroSit] = useState('')
  const [busca, setBusca] = useState('')
  const [selected, setSelected] = useState<Sepultura | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    cemiterioId: '', codigo: '', titular: '', falecido: '',
    dataFalecimento: '', dataSepultamento: '', tipoSepultura: 'carneiro',
    situacao: 'ocupada' as const, latitude: '', longitude: '',
  })

  const { data: cemiterios = [] } = useQuery<Cemiterio[]>({
    queryKey: ['cemiterios'],
    queryFn: () => api.get('/cemiterio/cemiterios').then(r => r.data),
  })

  const { data: sepulturas = [] } = useQuery<Sepultura[]>({
    queryKey: ['sepulturas', cemId, filtroSit, busca],
    queryFn: () => {
      const p = new URLSearchParams()
      if (cemId)    p.set('cemiterioId', cemId)
      if (filtroSit) p.set('situacao', filtroSit)
      if (busca)    p.set('q', busca)
      return api.get(`/cemiterio/sepulturas?${p}`).then(r => r.data)
    },
  })

  const { data: relatorio = [] } = useQuery<{ situacao: string; total: number }[]>({
    queryKey: ['cemiterio-rel', cemId],
    queryFn: () => api.get(`/cemiterio/relatorio${cemId ? `?cemiterioId=${cemId}` : ''}`).then(r => r.data),
  })

  const criar = useMutation({
    mutationFn: () => api.post('/cemiterio/sepulturas', {
      ...form,
      latitude: parseFloat(form.latitude),
      longitude: parseFloat(form.longitude),
      dataFalecimento:  form.dataFalecimento  || undefined,
      dataSepultamento: form.dataSepultamento || undefined,
      titular:  form.titular  || undefined,
      falecido: form.falecido || undefined,
    }),
    onSuccess: () => {
      toast.success('Sepultura cadastrada')
      qc.invalidateQueries({ queryKey: ['sepulturas'] })
      qc.invalidateQueries({ queryKey: ['cemiterio-rel'] })
      setShowForm(false)
    },
    onError: () => toast.error('Erro ao cadastrar'),
  })

  return (
    <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, color: '#1e3a5f', fontSize: 20 }}>Gestão de Cemitérios</h2>
          <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{sepulturas.length} sepulturas</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <select value={cemId} onChange={e => { setCemId(e.target.value); setForm(f => ({ ...f, cemiterioId: e.target.value })) }}
            style={selectStyle}>
            <option value="">Todos os cemitérios</option>
            {cemiterios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
          <select value={filtroSit} onChange={e => setFiltroSit(e.target.value)} style={selectStyle}>
            <option value="">Todas as situações</option>
            {Object.keys(SIT_COLOR).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar falecido..."
            style={{ padding: '7px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, width: 180 }} />
          <button onClick={() => setShowForm(true)}
            style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
            + Cadastrar
          </button>
        </div>
      </div>

      {/* Resumo */}
      {relatorio.length > 0 && (
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {relatorio.map(r => (
            <div key={r.situacao} style={{
              background: 'white', borderRadius: 8, border: `1px solid ${SIT_COLOR[r.situacao] ?? '#e5e7eb'}`,
              padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 2,
            }}>
              <span style={{ fontSize: 22, fontWeight: 700, color: SIT_COLOR[r.situacao] ?? '#374151' }}>{r.total}</span>
              <span style={{ fontSize: 12, color: '#6b7280', textTransform: 'capitalize' }}>{r.situacao}</span>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: 'white', borderRadius: 10, padding: 24, width: 480, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', color: '#1e3a5f' }}>Nova Sepultura</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={labelStyle}>Cemitério *</label>
                <select value={form.cemiterioId} onChange={e => setForm(f => ({ ...f, cemiterioId: e.target.value }))} style={{ ...inputStyle, width: '100%' }}>
                  <option value="">Selecione...</option>
                  {cemiterios.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              {[
                { label: 'Código *', key: 'codigo' },
                { label: 'Tipo', key: 'tipoSepultura' },
                { label: 'Titular', key: 'titular' },
                { label: 'Falecido', key: 'falecido' },
                { label: 'Data falecimento', key: 'dataFalecimento', type: 'date' },
                { label: 'Data sepultamento', key: 'dataSepultamento', type: 'date' },
                { label: 'Latitude *', key: 'latitude' },
                { label: 'Longitude *', key: 'longitude' },
              ].map(({ label, key, type }) => (
                <div key={key}>
                  <label style={labelStyle}>{label}</label>
                  <input
                    type={type ?? 'text'}
                    value={(form as any)[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              ))}
              <div>
                <label style={labelStyle}>Situação</label>
                <select value={form.situacao} onChange={e => setForm(f => ({ ...f, situacao: e.target.value as any }))} style={inputStyle}>
                  {Object.keys(SIT_COLOR).map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={btnSec}>Cancelar</button>
              <button onClick={() => criar.mutate()} disabled={!form.cemiterioId || !form.codigo || criar.isPending} style={btnPri}>
                {criar.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tabela */}
      <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Código', 'Cemitério', 'Falecido', 'Titular', 'Tipo', 'Falecimento', 'Situação'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sepulturas.map(s => (
              <tr key={s.id} style={{ borderBottom: '1px solid #f3f4f6', cursor: 'pointer' }} onClick={() => setSelected(s)}>
                <td style={{ padding: '10px 12px', fontWeight: 600 }}>{s.codigo}</td>
                <td style={{ padding: '10px 12px', color: '#6b7280' }}>{s.cemiterio_nome}</td>
                <td style={{ padding: '10px 12px' }}>{s.falecido ?? '—'}</td>
                <td style={{ padding: '10px 12px', color: '#6b7280' }}>{s.titular ?? '—'}</td>
                <td style={{ padding: '10px 12px', color: '#6b7280' }}>{s.tipo_sepultura ?? '—'}</td>
                <td style={{ padding: '10px 12px', color: '#6b7280' }}>
                  {s.data_falecimento ? new Date(s.data_falecimento).toLocaleDateString('pt-BR') : '—'}
                </td>
                <td style={{ padding: '10px 12px' }}>
                  <span style={{ background: (SIT_COLOR[s.situacao] ?? '#9ca3af') + '22', color: SIT_COLOR[s.situacao] ?? '#9ca3af', padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                    {s.situacao}
                  </span>
                </td>
              </tr>
            ))}
            {sepulturas.length === 0 && (
              <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Nenhuma sepultura encontrada</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const selectStyle: React.CSSProperties = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }
const btnPri: React.CSSProperties = { background: '#1e3a5f', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }
const btnSec: React.CSSProperties = { background: 'white', color: '#374151', border: '1px solid #d1d5db', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }
