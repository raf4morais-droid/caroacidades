import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  ScatterChart, Scatter, XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, Line, ResponsiveContainer
} from 'recharts'
import api from '../lib/api'
import toast from 'react-hot-toast'

export function PGVPage() {
  const [tab, setTab] = useState<'setores' | 'amostras' | 'simulacao'>('setores')
  const [setorSelecionado, setSetorSelecionado] = useState<string | null>(null)
  const qc = useQueryClient()

  const { data: setores } = useQuery({
    queryKey: ['pgv-setores'],
    queryFn: () => api.get('/pgv/setores').then(r => r.data),
  })

  const { data: amostras } = useQuery({
    queryKey: ['pgv-amostras', setorSelecionado],
    queryFn: () =>
      api.get(`/pgv/relatorio?setorId=${setorSelecionado}`).then(r => r.data),
    enabled: !!setorSelecionado,
  })

  const calcular = useMutation({
    mutationFn: (setorId: string) => api.post('/pgv/calcular', { setorId }).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['pgv-setores'] })
      toast.success(`Equação: ${data.equacao} | R²=${data.r2?.toFixed(4)}`)
    },
    onError: () => toast.error('Erro no cálculo. Verifique as amostras.'),
  })

  const setor = setores?.find((s: any) => s.id === setorSelecionado)

  // Dados do scatter chart — dispersão (distância × valor)
  const scatterData = (amostras ?? []).map((a: any) => ({
    x: a.distancia_polo ?? 0,
    y: a.valor_calculado ?? 0,
    id: a.id,
  }))

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', background: 'white', flexShrink: 0 }}>
        {(['setores', 'amostras', 'simulacao'] as const).map(t => (
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
            {{ setores: 'Setores PGV', amostras: 'Amostras e Regressão', simulacao: 'Simulação IPTU' }[t]}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>
        {tab === 'setores' && (
          <div>
            <h3 style={{ margin: '0 0 16px', color: '#1e3a5f' }}>Setores de Cálculo PGV</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {setores?.map((s: any) => (
                <div
                  key={s.id}
                  onClick={() => { setSetorSelecionado(s.id); setTab('amostras') }}
                  style={{
                    background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
                    padding: 16, cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                  }}
                >
                  <h4 style={{ margin: '0 0 8px', color: '#1e3a5f' }}>{s.nome}</h4>
                  <p style={{ margin: '0 0 4px', fontSize: 13, color: '#6b7280' }}>
                    Amostras: <strong>{s.qtd_amostras}</strong>
                  </p>
                  {s.equacao && (
                    <p style={{ margin: '0 0 4px', fontSize: 12, fontFamily: 'monospace', color: '#374151' }}>
                      {s.equacao}
                    </p>
                  )}
                  {s.r2 && (
                    <p style={{ margin: 0, fontSize: 12, color: s.r2 > 0.7 ? '#22c55e' : '#f59e0b' }}>
                      R² = {Number(s.r2).toFixed(4)}
                    </p>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); calcular.mutate(s.id) }}
                    disabled={calcular.isPending}
                    style={{
                      marginTop: 12, padding: '6px 14px', background: '#2563eb', color: 'white',
                      border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12,
                    }}
                  >
                    Recalcular
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'amostras' && (
          <div>
            <h3 style={{ margin: '0 0 4px', color: '#1e3a5f' }}>
              Dispersão — {setor?.nome ?? 'Selecione um setor'}
            </h3>
            {setor?.equacao && (
              <p style={{ margin: '0 0 16px', fontFamily: 'monospace', fontSize: 13, color: '#6b7280' }}>
                {setor.equacao} | R² = {Number(setor.r2).toFixed(4)}
              </p>
            )}

            {scatterData.length > 0 ? (
              <ResponsiveContainer width="100%" height={400}>
                <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="x" name="Distância ao polo (m)" unit="m" />
                  <YAxis dataKey="y" name="Valor (R$/m²)" unit="R$" />
                  <Tooltip cursor={{ strokeDasharray: '3 3' }} />
                  <Scatter name="Amostras" data={scatterData} fill="#2563eb" />
                </ScatterChart>
              </ResponsiveContainer>
            ) : (
              <p style={{ color: '#6b7280' }}>
                {setorSelecionado ? 'Nenhuma amostra neste setor.' : 'Selecione um setor na aba "Setores PGV".'}
              </p>
            )}
          </div>
        )}

        {tab === 'simulacao' && (
          <SimulacaoIPTU />
        )}
      </div>
    </div>
  )
}

function SimulacaoIPTU() {
  const [form, setForm] = useState({
    descricao: '', aliquotaResidencial: 0.5, aliquotaComercial: 1.0,
    aliquotaIndustrial: 1.5, aliquotaTereno: 0.3, tetoAumentoPercent: 15,
  })

  async function salvar() {
    await api.post('/pgv/simular-iptu', form)
    toast.success('Simulação salva')
  }

  return (
    <div style={{ maxWidth: 500 }}>
      <h3 style={{ margin: '0 0 20px', color: '#1e3a5f' }}>Simulação de IPTU</h3>
      {[
        ['descricao', 'Descrição', 'text'],
        ['aliquotaResidencial', 'Alíquota Residencial (%)', 'number'],
        ['aliquotaComercial', 'Alíquota Comercial (%)', 'number'],
        ['aliquotaIndustrial', 'Alíquota Industrial (%)', 'number'],
        ['aliquotaTereno', 'Alíquota Terreno (%)', 'number'],
        ['tetoAumentoPercent', 'Teto de Aumento (%)', 'number'],
      ].map(([key, label, type]) => (
        <div key={key} style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 4 }}>
            {label}
          </label>
          <input
            type={type}
            value={(form as any)[key]}
            onChange={e => setForm(f => ({ ...f, [key]: type === 'number' ? Number(e.target.value) : e.target.value }))}
            style={{
              width: '100%', padding: '8px 12px', border: '1px solid #d1d5db',
              borderRadius: 6, fontSize: 14, boxSizing: 'border-box',
            }}
          />
        </div>
      ))}
      <button
        onClick={salvar}
        style={{
          padding: '10px 24px', background: '#2563eb', color: 'white',
          border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14,
        }}
      >
        Salvar Simulação
      </button>
    </div>
  )
}
