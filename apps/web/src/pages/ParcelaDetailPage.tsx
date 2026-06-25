import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import toast from 'react-hot-toast'

type Parcela = {
  id: string
  codigo: string
  bairro_nome: string | null
  bairro_id: string | null
  logradouro_nome: string | null
  logradouro_tipo: string | null
  logradouro_id: string | null
  quadra_codigo: string | null
  quadra_id: string | null
  area_m2: number | null
  area_m2_calc: number | null
  testada_principal: number | null
  testada_secundaria: number | null
  camada_id: string | null
}

const inputSt: React.CSSProperties = {
  padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: 6,
  fontSize: 13, width: '100%', boxSizing: 'border-box',
}

export function ParcelaDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [editando, setEditando] = useState(false)
  const [form, setForm] = useState<Partial<Parcela>>({})

  const { data: parcela, isLoading } = useQuery<Parcela>({
    queryKey: ['parcela', id],
    queryFn: () => api.get(`/parcelas/${id}`).then(r => r.data),
    enabled: !!id,
  })

  useEffect(() => {
    if (!parcela) return
    setForm({
      codigo: parcela.codigo,
      bairro_id: parcela.bairro_id ?? '',
      logradouro_id: parcela.logradouro_id ?? '',
      quadra_id: parcela.quadra_id ?? '',
      camada_id: parcela.camada_id ?? '',
      testada_principal: parcela.testada_principal ?? undefined,
      testada_secundaria: parcela.testada_secundaria ?? undefined,
    })
  }, [parcela])

  const { data: bairros = [] } = useQuery<{ id: string; nome: string }[]>({
    queryKey: ['bairros'],
    queryFn: () => api.get('/bairros').then(r => r.data?.data ?? []),
  })

  const { data: logradouros = [] } = useQuery<{ id: string; nome: string; tipo: string }[]>({
    queryKey: ['logradouros'],
    queryFn: () => api.get('/logradouros').then(r => r.data?.data ?? []),
  })

  const { data: camadas = [] } = useQuery<{ id: string; nome: string; cor: string }[]>({
    queryKey: ['camadas'],
    queryFn: () => api.get('/camadas').then(r => r.data),
  })

  const salvar = useMutation({
    mutationFn: () => api.put(`/parcelas/${id}`, {
      codigo: form.codigo,
      bairroId: form.bairro_id || undefined,
      logradouroId: form.logradouro_id || undefined,
      quadraId: form.quadra_id || undefined,
      testadaPrincipal: form.testada_principal ? Number(form.testada_principal) : undefined,
      testadaSecundaria: form.testada_secundaria ? Number(form.testada_secundaria) : undefined,
      camadaId: form.camada_id || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parcela', id] })
      qc.invalidateQueries({ queryKey: ['parcelas-list'] })
      setEditando(false)
      toast.success('Parcela atualizada')
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Erro ao salvar'),
  })

  if (isLoading) return (
    <div style={{ padding: 40, color: '#6b7280' }}>Carregando parcela...</div>
  )
  if (!parcela) return (
    <div style={{ padding: 40, color: '#dc2626' }}>Parcela não encontrada.</div>
  )

  const logradouro = parcela.logradouro_nome
    ? [parcela.logradouro_tipo, parcela.logradouro_nome].filter(Boolean).join(' ')
    : '—'

  const camada = camadas.find(c => c.id === parcela.camada_id)

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      {/* Cabeçalho */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#6b7280', padding: 0 }}
        >
          ←
        </button>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: '#1e3a5f' }}>Parcela {parcela.codigo}</h2>
          <p style={{ margin: '2px 0 0', fontSize: 13, color: '#6b7280' }}>ID: {parcela.id}</p>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
          {!editando ? (
            <button
              onClick={() => setEditando(true)}
              style={{ padding: '8px 18px', background: '#1e3a5f', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
            >
              Editar
            </button>
          ) : (
            <>
              <button
                onClick={() => setEditando(false)}
                style={{ padding: '8px 14px', background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              >
                Cancelar
              </button>
              <button
                onClick={() => salvar.mutate()}
                disabled={salvar.isPending}
                style={{ padding: '8px 18px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              >
                {salvar.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Seção dados cadastrais */}
      <section style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Dados Cadastrais
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Campo label="Código">
            {editando
              ? <input style={inputSt} value={form.codigo ?? ''} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} />
              : <Valor>{parcela.codigo}</Valor>
            }
          </Campo>

          <Campo label="Bairro">
            {editando
              ? (
                <select style={inputSt} value={form.bairro_id ?? ''} onChange={e => setForm(f => ({ ...f, bairro_id: e.target.value }))}>
                  <option value="">— nenhum —</option>
                  {bairros.map(b => <option key={b.id} value={b.id}>{b.nome}</option>)}
                </select>
              )
              : <Valor>{parcela.bairro_nome}</Valor>
            }
          </Campo>

          <Campo label="Logradouro">
            {editando
              ? (
                <select style={inputSt} value={form.logradouro_id ?? ''} onChange={e => setForm(f => ({ ...f, logradouro_id: e.target.value }))}>
                  <option value="">— nenhum —</option>
                  {logradouros.map(l => <option key={l.id} value={l.id}>{l.tipo} {l.nome}</option>)}
                </select>
              )
              : <Valor>{logradouro}</Valor>
            }
          </Campo>

          <Campo label="Camada">
            {editando
              ? (
                <select style={inputSt} value={form.camada_id ?? ''} onChange={e => setForm(f => ({ ...f, camada_id: e.target.value }))}>
                  <option value="">— nenhum —</option>
                  {camadas.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              )
              : camada
                ? <span style={{ background: camada.cor + '22', color: camada.cor, padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>{camada.nome}</span>
                : <Valor>—</Valor>
            }
          </Campo>

          <Campo label="Testada principal (m)">
            {editando
              ? <input style={inputSt} type="number" step="0.01" value={form.testada_principal ?? ''} onChange={e => setForm(f => ({ ...f, testada_principal: e.target.value ? Number(e.target.value) : undefined }))} />
              : <Valor>{parcela.testada_principal ? `${parcela.testada_principal} m` : undefined}</Valor>
            }
          </Campo>

          <Campo label="Testada secundária (m)">
            {editando
              ? <input style={inputSt} type="number" step="0.01" value={form.testada_secundaria ?? ''} onChange={e => setForm(f => ({ ...f, testada_secundaria: e.target.value ? Number(e.target.value) : undefined }))} />
              : <Valor>{parcela.testada_secundaria ? `${parcela.testada_secundaria} m` : undefined}</Valor>
            }
          </Campo>
        </div>
      </section>

      {/* Seção dados calculados */}
      <section style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 10, padding: 20 }}>
        <h3 style={{ margin: '0 0 16px', fontSize: 14, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Dados Calculados (PostGIS)
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <Campo label="Área (m²)">
            <Valor>{parcela.area_m2_calc ? Number(parcela.area_m2_calc).toFixed(2) : parcela.area_m2 ? Number(parcela.area_m2).toFixed(2) : undefined}</Valor>
          </Campo>
          <Campo label="Quadra">
            <Valor>{parcela.quadra_codigo}</Valor>
          </Campo>
        </div>
      </section>
    </div>
  )
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function Valor({ children }: { children?: string | number | null }) {
  return (
    <div style={{ fontSize: 14, color: children != null ? '#111827' : '#9ca3af', fontWeight: children != null ? 500 : 400 }}>
      {children ?? '—'}
    </div>
  )
}
