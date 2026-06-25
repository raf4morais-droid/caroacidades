import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import api from '../lib/api'
import toast from 'react-hot-toast'
import { SIGMap } from '../components/map/SIGMap'
import { useMapStore } from '../store/map.store'

type Situacao = 'regular' | 'irregular' | 'em_construcao' | 'demolida' | 'terreno_vazio'

type Edificacao = {
  id: string
  inscricao_imobiliaria: string | null
  cadastro_imobiliario: string | null
  area_construida: number | null
  parcela_id: string
  parcela_codigo: string | null
  proprietario_id: string | null
  proprietario_nome: string | null
  face_quadra: string | null
  numero_predial: string | null
  situacao: Situacao
}

const SITUACOES: { value: Situacao; label: string; cor: string }[] = [
  { value: 'regular',       label: 'Regular',        cor: '#10b981' },
  { value: 'irregular',     label: 'Irregular',      cor: '#ef4444' },
  { value: 'em_construcao', label: 'Em construção',  cor: '#3b82f6' },
  { value: 'demolida',      label: 'Demolida',       cor: '#6b7280' },
  { value: 'terreno_vazio', label: 'Terreno vazio',  cor: '#9ca3af' },
]

const btn = (cor = '#1e3a5f'): React.CSSProperties => ({
  padding: '8px 16px', background: cor, color: 'white', border: 'none',
  borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 500,
})
const outlineBtn: React.CSSProperties = {
  padding: '8px 16px', background: 'white', color: '#374151',
  border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
const input: React.CSSProperties = {
  padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6,
  fontSize: 13, outline: 'none', width: '100%', boxSizing: 'border-box',
}
const labelSt: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block',
  marginBottom: 3, textTransform: 'uppercase',
}

const SITUACAO_INFO = (s: Situacao) => SITUACOES.find(x => x.value === s) ?? SITUACOES[0]

function vazia(): Omit<Edificacao, 'id' | 'parcela_codigo' | 'proprietario_nome'> {
  return {
    inscricao_imobiliaria: '', cadastro_imobiliario: '', area_construida: null,
    parcela_id: '', proprietario_id: null, face_quadra: '', numero_predial: '',
    situacao: 'regular',
  }
}

export function EdificacoesPage() {
  const qc = useQueryClient()
  const { map, selectedParcelaId, selectParcela } = useMapStore()

  const [busca, setBusca] = useState('')
  const [filtroSituacao, setFiltroSituacao] = useState<Situacao | ''>('')
  const [page, setPage] = useState(1)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(vazia())
  const [proprietarioBusca, setProprietarioBusca] = useState('')
  const [geometry, setGeometry] = useState<any>(null)
  const [desenhando, setDesenhando] = useState(false)

  const lista = useQuery({
    queryKey: ['edificacoes-list', busca, filtroSituacao, page],
    queryFn: () => {
      const params: Record<string, string> = { page: String(page), limit: '30' }
      if (busca.trim()) params.q = busca.trim()
      if (filtroSituacao) params.situacao = filtroSituacao
      return api.get('/edificacoes', { params }).then(r => r.data)
    },
  })

  const proprietarios = useQuery({
    queryKey: ['pessoas-busca', proprietarioBusca],
    queryFn: () => api.get('/pessoas', { params: { q: proprietarioBusca, limit: 8 } }).then(r => r.data?.data ?? []),
    enabled: proprietarioBusca.trim().length >= 2,
  })

  function novo() {
    setEditId(null)
    setForm(vazia())
    setGeometry(null)
    setProprietarioBusca('')
    selectParcela(null)
  }

  function editar(item: Edificacao) {
    setEditId(item.id)
    setForm({
      inscricao_imobiliaria: item.inscricao_imobiliaria ?? '',
      cadastro_imobiliario: item.cadastro_imobiliario ?? '',
      area_construida: item.area_construida,
      parcela_id: item.parcela_id,
      proprietario_id: item.proprietario_id,
      face_quadra: item.face_quadra ?? '',
      numero_predial: item.numero_predial ?? '',
      situacao: item.situacao,
    })
    setGeometry(null)
    setProprietarioBusca(item.proprietario_nome ?? '')
    selectParcela(item.parcela_id)
  }

  // Sincroniza a parcela escolhida no mapa com o campo do formulário
  useEffect(() => {
    if (selectedParcelaId) setForm(f => ({ ...f, parcela_id: selectedParcelaId }))
  }, [selectedParcelaId])

  const salvar = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        inscricaoImobiliaria: form.inscricao_imobiliaria || undefined,
        cadastroImobiliario: form.cadastro_imobiliario || undefined,
        areaConstruida: form.area_construida ?? undefined,
        parcelaId: form.parcela_id,
        proprietarioId: form.proprietario_id ?? undefined,
        faceQuadra: form.face_quadra || undefined,
        numeroPredial: form.numero_predial || undefined,
        situacao: form.situacao,
      }
      if (geometry) body.geometry = geometry
      return editId ? api.put(`/edificacoes/${editId}`, body) : api.post('/edificacoes', body)
    },
    onSuccess: () => {
      toast.success(editId ? 'Edificação atualizada' : 'Edificação cadastrada')
      if (form.situacao === 'irregular') toast('Notificação de irregularidade enviada aos analistas', { icon: '🔔' })
      qc.invalidateQueries({ queryKey: ['edificacoes-list'] })
      novo()
    },
    onError: (err: any) => toast.error(err.response?.data?.error ?? 'Erro ao salvar edificação'),
  })

  const remover = useMutation({
    mutationFn: (id: string) => api.delete(`/edificacoes/${id}`),
    onSuccess: () => {
      toast.success('Edificação removida')
      qc.invalidateQueries({ queryKey: ['edificacoes-list'] })
      novo()
    },
    onError: () => toast.error('Erro ao remover edificação'),
  })

  async function exportar(formato: 'csv' | 'xml' | 'xlsx') {
    try {
      const res = await api.get('/edificacoes/export', { params: { format: formato }, responseType: 'blob' })
      const url = URL.createObjectURL(new Blob([res.data]))
      const a = document.createElement('a')
      a.href = url
      a.download = `edificacoes.${formato}`
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)
    } catch {
      toast.error('Erro ao exportar')
    }
  }

  // Habilita o desenho do contorno da edificação (vetorização — req 26)
  function ativarDesenho() {
    if (!map) return
    setDesenhando(true)
    toast('Desenhe o contorno da edificação no mapa', { icon: '✏️' })
    ;(map as any).pm.enableDraw('Polygon', { snappable: true, snapDistance: 10 })

    const onCreated = (e: any) => {
      const geo = e.layer.toGeoJSON()
      setGeometry(geo.geometry)
      map.removeLayer(e.layer)
      ;(map as any).pm.disableDraw()
      setDesenhando(false)
      map.off('pm:create', onCreated)
      toast.success('Contorno registrado — salve a edificação para gravar')
    }
    map.on('pm:create', onCreated)
  }

  const dados: Edificacao[] = lista.data?.data ?? []
  const paginacao = lista.data?.pagination

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Lista */}
      <div style={{ width: 420, borderRight: '1px solid #e5e7eb', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h2 style={{ margin: 0, fontSize: 16, color: '#1e3a5f' }}>Edificações / Unidades imobiliárias</h2>
            <button style={btn()} onClick={novo}>+ Nova</button>
          </div>
          <input
            style={{ ...input, marginBottom: 8 }}
            placeholder="Buscar por inscrição, nº predial ou parcela..."
            value={busca}
            onChange={e => { setBusca(e.target.value); setPage(1) }}
          />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <select
              style={{ ...input, width: 'auto', flex: 1 }}
              value={filtroSituacao}
              onChange={e => { setFiltroSituacao(e.target.value as Situacao | ''); setPage(1) }}
            >
              <option value="">Todas as situações</option>
              {SITUACOES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <button style={outlineBtn} onClick={() => exportar('csv')} title="Exportar CSV">CSV</button>
            <button style={outlineBtn} onClick={() => exportar('xml')} title="Exportar XML">XML</button>
            <button style={outlineBtn} onClick={() => exportar('xlsx')} title="Exportar XLSX">XLSX</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {lista.isLoading && <p style={{ padding: 16, color: '#9ca3af', fontSize: 13 }}>Carregando...</p>}
          {!lista.isLoading && dados.length === 0 && <p style={{ padding: 16, color: '#9ca3af', fontSize: 13 }}>Nenhuma edificação encontrada</p>}
          {dados.map(item => {
            const info = SITUACAO_INFO(item.situacao)
            return (
              <div
                key={item.id}
                onClick={() => editar(item)}
                style={{
                  padding: '10px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                  background: editId === item.id ? '#eff6ff' : 'white',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13, color: '#1f2937' }}>
                    {item.inscricao_imobiliaria || item.numero_predial || `Parcela ${item.parcela_codigo ?? '—'}`}
                  </strong>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 10,
                    background: info.cor + '22', color: info.cor,
                  }}>
                    {info.label}
                  </span>
                </div>
                <p style={{ margin: '3px 0 0', fontSize: 12, color: '#6b7280' }}>
                  Parcela {item.parcela_codigo ?? '—'} · {item.proprietario_nome ?? 'sem proprietário vinculado'}
                </p>
              </div>
            )
          })}
        </div>

        {paginacao && paginacao.total > paginacao.limit && (
          <div style={{ padding: 10, borderTop: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 12, color: '#6b7280' }}>
            <span>{paginacao.total} edificações</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button style={outlineBtn} disabled={page <= 1} onClick={() => setPage(p => p - 1)}>← Anterior</button>
              <button style={outlineBtn} disabled={page * paginacao.limit >= paginacao.total} onClick={() => setPage(p => p + 1)}>Próxima →</button>
            </div>
          </div>
        )}
      </div>

      {/* Formulário + mapa */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb', overflowY: 'auto', maxHeight: '50%' }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#1e3a5f' }}>
            {editId ? 'Editar edificação' : 'Nova edificação'}
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 10 }}>
            <div>
              <label style={labelSt}>Inscrição imobiliária</label>
              <input style={input} value={form.inscricao_imobiliaria ?? ''} onChange={e => setForm(f => ({ ...f, inscricao_imobiliaria: e.target.value }))} />
            </div>
            <div>
              <label style={labelSt}>Cadastro imobiliário</label>
              <input style={input} value={form.cadastro_imobiliario ?? ''} onChange={e => setForm(f => ({ ...f, cadastro_imobiliario: e.target.value }))} />
            </div>
            <div>
              <label style={labelSt}>Nº predial / face de quadra</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input style={input} placeholder="nº predial" value={form.numero_predial ?? ''} onChange={e => setForm(f => ({ ...f, numero_predial: e.target.value }))} />
                <input style={input} placeholder="face quadra" value={form.face_quadra ?? ''} onChange={e => setForm(f => ({ ...f, face_quadra: e.target.value }))} />
              </div>
            </div>
            <div>
              <label style={labelSt}>Área construída (m²)</label>
              <input style={input} type="number" min={0} value={form.area_construida ?? ''}
                onChange={e => setForm(f => ({ ...f, area_construida: e.target.value === '' ? null : Number(e.target.value) }))} />
            </div>
            <div>
              <label style={labelSt}>Situação</label>
              <select style={input} value={form.situacao} onChange={e => setForm(f => ({ ...f, situacao: e.target.value as Situacao }))}>
                {SITUACOES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div style={{ position: 'relative' }}>
              <label style={labelSt}>Proprietário</label>
              <input
                style={input}
                placeholder="Buscar pessoa pelo nome..."
                value={proprietarioBusca}
                onChange={e => { setProprietarioBusca(e.target.value); setForm(f => ({ ...f, proprietario_id: null })) }}
              />
              {proprietarioBusca.trim().length >= 2 && !form.proprietario_id && (proprietarios.data?.length ?? 0) > 0 && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'white', border: '1px solid #d1d5db', borderRadius: 6, boxShadow: '0 4px 12px rgba(0,0,0,.1)', maxHeight: 160, overflowY: 'auto' }}>
                  {proprietarios.data.map((p: any) => (
                    <div key={p.id} onClick={() => { setForm(f => ({ ...f, proprietario_id: p.id })); setProprietarioBusca(p.nome) }}
                      style={{ padding: '6px 10px', fontSize: 12, cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
                      onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'white')}
                    >
                      {p.nome} {p.cpf_cnpj ? `· ${p.cpf_cnpj}` : ''}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {form.situacao === 'irregular' && (
            <p style={{ margin: '0 0 10px', fontSize: 12, color: '#b91c1c', background: '#fee2e2', padding: '6px 10px', borderRadius: 6 }}>
              ⚠ Ao salvar com situação "Irregular", uma notificação será enviada aos perfis ADMIN e Fiscal Tributário (req. 27).
            </p>
          )}

          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
            <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>
              Parcela vinculada: <strong>{form.parcela_id ? (dados.find(d => d.parcela_id === form.parcela_id)?.parcela_codigo ?? form.parcela_id.slice(0, 8)) : '— clique numa parcela no mapa —'}</strong>
            </p>
            <button style={outlineBtn} onClick={ativarDesenho} disabled={desenhando}>
              {desenhando ? 'Desenhando…' : geometry ? '✓ Contorno desenhado — refazer' : '✏️ Vetorizar contorno no mapa'}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button style={btn()} onClick={() => salvar.mutate()} disabled={salvar.isPending || !form.parcela_id}>
              {editId ? 'Salvar alterações' : 'Cadastrar edificação'}
            </button>
            <button style={outlineBtn} onClick={novo}>Limpar</button>
            {editId && (
              <button
                style={{ ...outlineBtn, color: '#ef4444', borderColor: '#fecaca' }}
                onClick={() => { if (confirm('Excluir esta edificação?')) remover.mutate(editId) }}
              >
                Excluir
              </button>
            )}
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0 }}>
          <SIGMap compact />
        </div>
      </div>
    </div>
  )
}
