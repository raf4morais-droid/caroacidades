import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import toast from 'react-hot-toast'

type Produto = {
  id: string; nome: string; unidade: string; descricao: string | null
  marca: string | null; fabricante: string | null; familia: string | null; fornecedor: string | null
}
type Local = { id: string; nome: string; tipo: string; descricao: string | null }
type ItemEstoque = {
  id: string; produto_nome: string; unidade: string; marca: string | null; familia: string | null
  local_nome: string; local_tipo: string; quantidade: number; lote_serie: string | null; garantia_ate: string | null
}
type Movimentacao = {
  id: string; produto_nome: string; unidade: string; local_nome: string
  tipo: string; quantidade: number; created_at: string
}
type GarantiaItem = {
  id: string; produto_nome: string; unidade: string; marca: string | null; familia: string | null
  local_nome: string; local_tipo: string; quantidade: number; lote_serie: string | null
  garantia_ate: string; situacao_garantia: 'vencida' | 'a_vencer' | 'vigente'
}

const SITUACAO_GARANTIA: Record<string, { label: string; color: string }> = {
  vencida:  { label: 'Vencida',   color: '#ef4444' },
  a_vencer: { label: 'A vencer',  color: '#f59e0b' },
  vigente:  { label: 'Vigente',   color: '#16a34a' },
}

const EXPORT_FORMATS = ['csv', 'xlsx', 'xml'] as const

function buildParams(filters: Record<string, string>) {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v)
  return p
}

async function exportReport(path: string, baseName: string, format: string, filters: Record<string, string>) {
  try {
    const params = buildParams(filters)
    params.set('format', format)
    const response = await api.get(`${path}?${params}`, { responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([response.data]))
    const link = document.createElement('a')
    link.href = url
    link.download = `${baseName}.${format}`
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  } catch {
    toast.error('Falha ao exportar relatório')
  }
}

const TIPO_MOV: Record<string, { label: string; color: string }> = {
  entrada:       { label: 'Entrada',       color: '#22c55e' },
  saida:         { label: 'Saída',         color: '#ef4444' },
  transferencia: { label: 'Transferência', color: '#3b82f6' },
}

const TABS = [
  { id: 'saldo',         label: 'Saldo' },
  { id: 'produtos',      label: 'Produtos' },
  { id: 'locais',        label: 'Locais' },
  { id: 'entrada',       label: 'Entrada de Material' },
  { id: 'transferencia', label: 'Transferência' },
  { id: 'movs',          label: 'Movimentações' },
  { id: 'garantia',      label: 'Garantia' },
] as const

type Tab = typeof TABS[number]['id']

const EMPTY_PROD = { nome: '', unidade: 'un', descricao: '', marca: '', fabricante: '', familia: '', fornecedor: '' }
const EMPTY_LOCAL = { nome: '', tipo: 'principal', descricao: '' }

export function EstoquePage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<Tab>('saldo')

  // ── Produtos ──────────────────────────────────────────────────────────
  const [modalProd, setModalProd] = useState(false)
  const [editProd, setEditProd] = useState<Produto | null>(null)
  const [formProd, setFormProd] = useState({ ...EMPTY_PROD })

  const { data: produtos = [] } = useQuery<Produto[]>({
    queryKey: ['estoque-produtos'],
    queryFn: () => api.get('/iluminacao/produtos').then(r => r.data),
  })

  const salvarProduto = useMutation({
    mutationFn: () => editProd
      ? api.patch(`/iluminacao/produtos/${editProd.id}`, formProd)
      : api.post('/iluminacao/produtos', formProd),
    onSuccess: () => {
      toast.success(editProd ? 'Produto atualizado' : 'Produto criado')
      qc.invalidateQueries({ queryKey: ['estoque-produtos'] })
      setModalProd(false); setEditProd(null); setFormProd({ ...EMPTY_PROD })
    },
    onError: () => toast.error('Erro ao salvar produto'),
  })

  const deletarProduto = useMutation({
    mutationFn: (id: string) => api.delete(`/iluminacao/produtos/${id}`),
    onSuccess: () => { toast.success('Produto removido'); qc.invalidateQueries({ queryKey: ['estoque-produtos'] }) },
    onError: () => toast.error('Não é possível remover — produto com saldo ou movimentações'),
  })

  // ── Locais ────────────────────────────────────────────────────────────
  const [modalLocal, setModalLocal] = useState(false)
  const [editLocal, setEditLocal] = useState<Local | null>(null)
  const [formLocal, setFormLocal] = useState({ ...EMPTY_LOCAL })

  const { data: locais = [] } = useQuery<Local[]>({
    queryKey: ['estoque-locais'],
    queryFn: () => api.get('/iluminacao/locais').then(r => r.data),
  })

  const familias = useMemo(
    () => Array.from(new Set(produtos.map(p => p.familia).filter((f): f is string => !!f))).sort(),
    [produtos]
  )
  const tiposLocal = useMemo(
    () => Array.from(new Set(locais.map(l => l.tipo))).sort(),
    [locais]
  )

  const salvarLocal = useMutation({
    mutationFn: () => editLocal
      ? api.patch(`/iluminacao/locais/${editLocal.id}`, formLocal)
      : api.post('/iluminacao/locais', formLocal),
    onSuccess: () => {
      toast.success(editLocal ? 'Local atualizado' : 'Local criado')
      qc.invalidateQueries({ queryKey: ['estoque-locais'] })
      setModalLocal(false); setEditLocal(null); setFormLocal({ ...EMPTY_LOCAL })
    },
    onError: () => toast.error('Erro ao salvar local'),
  })

  const deletarLocal = useMutation({
    mutationFn: (id: string) => api.delete(`/iluminacao/locais/${id}`),
    onSuccess: () => { toast.success('Local removido'); qc.invalidateQueries({ queryKey: ['estoque-locais'] }) },
    onError: () => toast.error('Não é possível remover — local com itens em estoque'),
  })

  // ── Saldo (sem filtro — usado por Entrada/Transferência) ──────────────
  const { data: itens = [] } = useQuery<ItemEstoque[]>({
    queryKey: ['estoque-itens'],
    queryFn: () => api.get('/iluminacao/estoque/itens').then(r => r.data),
    enabled: tab === 'entrada' || tab === 'transferencia',
  })

  // ── Saldo (req 54 — relatório com filtros e exportação) ───────────────
  const [filtroSaldo, setFiltroSaldo] = useState({ produtoId: '', localId: '', localTipo: '', familia: '' })

  const { data: saldo = [] } = useQuery<ItemEstoque[]>({
    queryKey: ['estoque-saldo', filtroSaldo],
    queryFn: () => api.get(`/iluminacao/estoque/itens?${buildParams(filtroSaldo)}`).then(r => r.data),
    enabled: tab === 'saldo',
  })

  // ── Entrada de Material (req 50) ───────────────────────────────────────
  const [formEntrada, setFormEntrada] = useState({ produtoId: '', localId: '', loteSerie: '', quantidade: '', garantiaAte: '', observacoes: '' })

  const registrarEntrada = useMutation({
    mutationFn: async () => {
      const { produtoId, localId, loteSerie, quantidade, garantiaAte, observacoes } = formEntrada
      // 1. Garante item de estoque existe (upsert)
      const { data: item } = await api.post('/iluminacao/estoque/itens', {
        produtoId, localId, loteSerie: loteSerie || null,
        quantidade: Number(quantidade), garantiaAte: garantiaAte || null,
      })
      // 2. Registra movimentação de entrada
      await api.post('/iluminacao/estoque/movimentacao', {
        estoqueId: item.id, tipo: 'entrada', quantidade: Number(quantidade), observacoes: observacoes || null,
      })
    },
    onSuccess: () => {
      toast.success('Entrada registrada')
      qc.invalidateQueries({ queryKey: ['estoque-itens'] })
      qc.invalidateQueries({ queryKey: ['estoque-movs'] })
      setFormEntrada({ produtoId: '', localId: '', loteSerie: '', quantidade: '', garantiaAte: '', observacoes: '' })
    },
    onError: () => toast.error('Erro ao registrar entrada'),
  })

  // ── Transferência entre locais (req 52) ──────────────────────────────
  const [formTransf, setFormTransf] = useState({ produtoId: '', localOrigemId: '', localDestinoId: '', loteSerie: '', quantidade: '', observacoes: '' })

  const registrarTransferencia = useMutation({
    mutationFn: () => api.post('/iluminacao/estoque/transferencia', {
      produtoId: formTransf.produtoId,
      localOrigemId: formTransf.localOrigemId,
      localDestinoId: formTransf.localDestinoId,
      loteSerie: formTransf.loteSerie || undefined,
      quantidade: Number(formTransf.quantidade),
      observacoes: formTransf.observacoes || undefined,
    }),
    onSuccess: () => {
      toast.success('Transferência registrada')
      qc.invalidateQueries({ queryKey: ['estoque-itens'] })
      qc.invalidateQueries({ queryKey: ['estoque-movs'] })
      setFormTransf({ produtoId: '', localOrigemId: '', localDestinoId: '', loteSerie: '', quantidade: '', observacoes: '' })
    },
    onError: (e: any) => toast.error(e?.response?.data?.error ?? 'Erro ao transferir'),
  })

  // saldo disponível para o produto+local selecionados na transferência
  const saldoOrigem = formTransf.produtoId && formTransf.localOrigemId
    ? itens.find(i => {
        const prod = produtos.find(p => p.id === formTransf.produtoId)
        return i.produto_nome === prod?.nome && i.local_nome === locais.find(l => l.id === formTransf.localOrigemId)?.nome
          && (formTransf.loteSerie ? i.lote_serie === formTransf.loteSerie : true)
      })
    : null

  // ── Movimentações (req 53) ────────────────────────────────────────────
  const [filtroMov, setFiltroMov] = useState({ tipo: '', de: '', ate: '' })

  const { data: movimentacoes = [] } = useQuery<Movimentacao[]>({
    queryKey: ['estoque-movs', filtroMov],
    queryFn: () => api.get(`/iluminacao/movimentacoes?${buildParams(filtroMov)}`).then(r => r.data),
    enabled: tab === 'movs',
  })

  // ── Garantia (req 55) ─────────────────────────────────────────────────
  const [filtroGarantia, setFiltroGarantia] = useState({ produtoId: '', localId: '', localTipo: '', familia: '' })

  const { data: garantias = [] } = useQuery<GarantiaItem[]>({
    queryKey: ['estoque-garantia', filtroGarantia],
    queryFn: () => api.get(`/iluminacao/estoque/garantia?${buildParams(filtroGarantia)}`).then(r => r.data),
    enabled: tab === 'garantia',
  })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Abas */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', background: 'white', flexShrink: 0 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '12px 22px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 13, fontWeight: tab === t.id ? 700 : 400,
            color: tab === t.id ? '#2563eb' : '#6b7280',
            borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
            marginBottom: -2, whiteSpace: 'nowrap',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'auto', padding: 20 }}>

        {/* ── SALDO (req 54) ──────────────────────────────────────────── */}
        {tab === 'saldo' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ margin: 0, color: '#1e3a5f' }}>Saldo de Estoque</h3>
              <ExportButtons onExport={fmt => exportReport('/iluminacao/estoque/itens/export', 'saldo_estoque', fmt, filtroSaldo)} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <select value={filtroSaldo.produtoId} onChange={e => setFiltroSaldo(f => ({ ...f, produtoId: e.target.value }))} style={{ ...sel, width: 200 }}>
                <option value="">Todos os produtos</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <select value={filtroSaldo.localId} onChange={e => setFiltroSaldo(f => ({ ...f, localId: e.target.value }))} style={{ ...sel, width: 180 }}>
                <option value="">Todos os locais</option>
                {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
              <select value={filtroSaldo.localTipo} onChange={e => setFiltroSaldo(f => ({ ...f, localTipo: e.target.value }))} style={{ ...sel, width: 160 }}>
                <option value="">Todos os tipos de local</option>
                {tiposLocal.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filtroSaldo.familia} onChange={e => setFiltroSaldo(f => ({ ...f, familia: e.target.value }))} style={{ ...sel, width: 160 }}>
                <option value="">Todas as famílias</option>
                {familias.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <Table
              cols={['Produto', 'Família', 'Marca', 'Local', 'Tipo Local', 'Qtd', 'Unid.', 'Lote/Série', 'Garantia até']}
              empty="Nenhum item em estoque"
            >
              {saldo.map(i => (
                <tr key={i.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={td}>{i.produto_nome}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{i.familia ?? '—'}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{i.marca ?? '—'}</td>
                  <td style={td}>{i.local_nome}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{i.local_tipo}</td>
                  <td style={{ ...td, fontWeight: 700, color: i.quantidade === 0 ? '#ef4444' : '#111' }}>
                    {i.quantidade}
                  </td>
                  <td style={{ ...td, color: '#6b7280' }}>{i.unidade}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{i.lote_serie ?? '—'}</td>
                  <td style={{ ...td, color: garantiaColor(i.garantia_ate) }}>
                    {i.garantia_ate ? new Date(i.garantia_ate).toLocaleDateString('pt-BR') : '—'}
                  </td>
                </tr>
              ))}
            </Table>
          </>
        )}

        {/* ── PRODUTOS (req 49) ──────────────────────────────────────── */}
        {tab === 'produtos' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: '#1e3a5f' }}>Produtos</h3>
              <button onClick={() => { setEditProd(null); setFormProd({ ...EMPTY_PROD }); setModalProd(true) }} style={btnPrimary}>
                + Novo Produto
              </button>
            </div>
            <Table cols={['Nome', 'Família', 'Marca', 'Fabricante', 'Fornecedor', 'Unid.', '']} empty="Nenhum produto cadastrado">
              {produtos.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{p.nome}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{p.familia ?? '—'}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{p.marca ?? '—'}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{p.fabricante ?? '—'}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{p.fornecedor ?? '—'}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{p.unidade}</td>
                  <td style={{ ...td }}>
                    <button onClick={() => { setEditProd(p); setFormProd({ nome: p.nome, unidade: p.unidade, descricao: p.descricao ?? '', marca: p.marca ?? '', fabricante: p.fabricante ?? '', familia: p.familia ?? '', fornecedor: p.fornecedor ?? '' }); setModalProd(true) }} style={btnEdit}>Editar</button>
                    <button onClick={() => { if (confirm('Remover produto?')) deletarProduto.mutate(p.id) }} style={btnDel}>Remover</button>
                  </td>
                </tr>
              ))}
            </Table>
          </>
        )}

        {/* ── LOCAIS (req 49) ────────────────────────────────────────── */}
        {tab === 'locais' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ margin: 0, color: '#1e3a5f' }}>Locais de Estoque</h3>
              <button onClick={() => { setEditLocal(null); setFormLocal({ ...EMPTY_LOCAL }); setModalLocal(true) }} style={btnPrimary}>
                + Novo Local
              </button>
            </div>
            <Table cols={['Nome', 'Tipo', 'Descrição', '']} empty="Nenhum local cadastrado">
              {locais.map(l => (
                <tr key={l.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ ...td, fontWeight: 600 }}>{l.nome}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{l.tipo}</td>
                  <td style={{ ...td, color: '#6b7280' }}>{l.descricao ?? '—'}</td>
                  <td style={td}>
                    <button onClick={() => { setEditLocal(l); setFormLocal({ nome: l.nome, tipo: l.tipo, descricao: l.descricao ?? '' }); setModalLocal(true) }} style={btnEdit}>Editar</button>
                    <button onClick={() => { if (confirm('Remover local?')) deletarLocal.mutate(l.id) }} style={btnDel}>Remover</button>
                  </td>
                </tr>
              ))}
            </Table>
          </>
        )}

        {/* ── ENTRADA DE MATERIAL (req 50) ───────────────────────────── */}
        {tab === 'entrada' && (
          <div style={{ maxWidth: 560 }}>
            <h3 style={{ margin: '0 0 20px', color: '#1e3a5f' }}>Registrar Entrada de Material</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Produto *">
                <select value={formEntrada.produtoId} onChange={e => setFormEntrada(f => ({ ...f, produtoId: e.target.value }))} style={sel}>
                  <option value="">Selecione...</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.unidade})</option>)}
                </select>
              </Field>
              <Field label="Local de destino *">
                <select value={formEntrada.localId} onChange={e => setFormEntrada(f => ({ ...f, localId: e.target.value }))} style={sel}>
                  <option value="">Selecione...</option>
                  {locais.map(l => <option key={l.id} value={l.id}>{l.nome} — {l.tipo}</option>)}
                </select>
              </Field>
              <div style={{ display: 'flex', gap: 12 }}>
                <Field label="Quantidade *" style={{ flex: 1 }}>
                  <input type="number" min={0.001} step="any" value={formEntrada.quantidade}
                    onChange={e => setFormEntrada(f => ({ ...f, quantidade: e.target.value }))} style={inp} />
                </Field>
                <Field label="Lote / N° de série" style={{ flex: 1 }}>
                  <input value={formEntrada.loteSerie} onChange={e => setFormEntrada(f => ({ ...f, loteSerie: e.target.value }))} style={inp} />
                </Field>
              </div>
              <Field label="Garantia até">
                <input type="date" value={formEntrada.garantiaAte} onChange={e => setFormEntrada(f => ({ ...f, garantiaAte: e.target.value }))} style={inp} />
              </Field>
              <Field label="Observações">
                <input value={formEntrada.observacoes} onChange={e => setFormEntrada(f => ({ ...f, observacoes: e.target.value }))} style={inp} />
              </Field>
              <button
                onClick={() => registrarEntrada.mutate()}
                disabled={!formEntrada.produtoId || !formEntrada.localId || !formEntrada.quantidade || registrarEntrada.isPending}
                style={{ ...btnPrimary, alignSelf: 'flex-start', marginTop: 4 }}
              >
                {registrarEntrada.isPending ? 'Registrando...' : '✓ Registrar entrada'}
              </button>
            </div>
          </div>
        )}

        {/* ── TRANSFERÊNCIA (req 52) ────────────────────────────────── */}
        {tab === 'transferencia' && (
          <div style={{ maxWidth: 560 }}>
            <h3 style={{ margin: '0 0 20px', color: '#1e3a5f' }}>Transferência entre Locais</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Produto *">
                <select value={formTransf.produtoId} onChange={e => setFormTransf(f => ({ ...f, produtoId: e.target.value }))} style={sel}>
                  <option value="">Selecione...</option>
                  {produtos.map(p => <option key={p.id} value={p.id}>{p.nome} ({p.unidade})</option>)}
                </select>
              </Field>
              <div style={{ display: 'flex', gap: 12 }}>
                <Field label="Local de origem *" style={{ flex: 1 }}>
                  <select value={formTransf.localOrigemId} onChange={e => setFormTransf(f => ({ ...f, localOrigemId: e.target.value }))} style={sel}>
                    <option value="">Selecione...</option>
                    {locais.map(l => <option key={l.id} value={l.id}>{l.nome} — {l.tipo}</option>)}
                  </select>
                </Field>
                <Field label="Local de destino *" style={{ flex: 1 }}>
                  <select value={formTransf.localDestinoId} onChange={e => setFormTransf(f => ({ ...f, localDestinoId: e.target.value }))} style={sel}>
                    <option value="">Selecione...</option>
                    {locais.filter(l => l.id !== formTransf.localOrigemId).map(l => <option key={l.id} value={l.id}>{l.nome} — {l.tipo}</option>)}
                  </select>
                </Field>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <Field label="Quantidade *" style={{ flex: 1 }}>
                  <input type="number" min={0.001} step="any" value={formTransf.quantidade}
                    onChange={e => setFormTransf(f => ({ ...f, quantidade: e.target.value }))} style={inp} />
                  {saldoOrigem && (
                    <span style={{ fontSize: 11, color: saldoOrigem.quantidade < Number(formTransf.quantidade) ? '#ef4444' : '#16a34a', marginTop: 3, display: 'block' }}>
                      Disponível na origem: {saldoOrigem.quantidade} {saldoOrigem.unidade}
                    </span>
                  )}
                </Field>
                <Field label="Lote / N° de série" style={{ flex: 1 }}>
                  <input value={formTransf.loteSerie} onChange={e => setFormTransf(f => ({ ...f, loteSerie: e.target.value }))} style={inp} placeholder="Opcional" />
                </Field>
              </div>
              <Field label="Observações">
                <input value={formTransf.observacoes} onChange={e => setFormTransf(f => ({ ...f, observacoes: e.target.value }))} style={inp} />
              </Field>
              <button
                onClick={() => registrarTransferencia.mutate()}
                disabled={!formTransf.produtoId || !formTransf.localOrigemId || !formTransf.localDestinoId || !formTransf.quantidade || registrarTransferencia.isPending}
                style={{ ...btnPrimary, alignSelf: 'flex-start', marginTop: 4 }}
              >
                {registrarTransferencia.isPending ? 'Transferindo...' : '⇄ Registrar transferência'}
              </button>
            </div>
          </div>
        )}

        {/* ── MOVIMENTAÇÕES (req 53) ─────────────────────────────────── */}
        {tab === 'movs' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ margin: 0, color: '#1e3a5f' }}>Movimentações de Estoque</h3>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={filtroMov.tipo} onChange={e => setFiltroMov(f => ({ ...f, tipo: e.target.value }))} style={{ ...sel, padding: '6px 10px' }}>
                  <option value="">Todos os tipos</option>
                  {Object.entries(TIPO_MOV).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
                <input type="date" value={filtroMov.de} onChange={e => setFiltroMov(f => ({ ...f, de: e.target.value }))}
                  title="Data inicial" style={{ ...inp, width: 130 }} />
                <input type="date" value={filtroMov.ate} onChange={e => setFiltroMov(f => ({ ...f, ate: e.target.value }))}
                  title="Data final" style={{ ...inp, width: 130 }} />
                <ExportButtons onExport={fmt => exportReport('/iluminacao/movimentacoes/export', 'movimentacoes_estoque', fmt, filtroMov)} />
              </div>
            </div>
            <Table cols={['Data', 'Produto', 'Local', 'Lote/Série', 'Tipo', 'Qtd', 'Unid.']} empty="Nenhuma movimentação encontrada">
              {movimentacoes.map(m => {
                const sit = TIPO_MOV[m.tipo] ?? { label: m.tipo, color: '#9ca3af' }
                return (
                  <tr key={m.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...td, color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {new Date(m.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ ...td, fontWeight: 500 }}>{m.produto_nome}</td>
                    <td style={{ ...td, color: '#6b7280' }}>{m.local_nome}</td>
                    <td style={{ ...td, color: '#6b7280' }}>{(m as any).lote_serie ?? '—'}</td>
                    <td style={td}>
                      <span style={{ background: sit.color + '22', color: sit.color, padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>
                        {sit.label}
                      </span>
                    </td>
                    <td style={{ ...td, fontWeight: 600 }}>{m.quantidade}</td>
                    <td style={{ ...td, color: '#6b7280' }}>{m.unidade}</td>
                  </tr>
                )
              })}
            </Table>
          </>
        )}

        {/* ── GARANTIA (req 55) ──────────────────────────────────────── */}
        {tab === 'garantia' && (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
              <h3 style={{ margin: 0, color: '#1e3a5f' }}>Relatório de Garantia de Produtos</h3>
              <ExportButtons onExport={fmt => exportReport('/iluminacao/estoque/garantia/export', 'garantia_produtos', fmt, filtroGarantia)} />
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
              <select value={filtroGarantia.produtoId} onChange={e => setFiltroGarantia(f => ({ ...f, produtoId: e.target.value }))} style={{ ...sel, width: 200 }}>
                <option value="">Todos os produtos</option>
                {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
              <select value={filtroGarantia.localId} onChange={e => setFiltroGarantia(f => ({ ...f, localId: e.target.value }))} style={{ ...sel, width: 180 }}>
                <option value="">Todos os locais</option>
                {locais.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
              </select>
              <select value={filtroGarantia.localTipo} onChange={e => setFiltroGarantia(f => ({ ...f, localTipo: e.target.value }))} style={{ ...sel, width: 160 }}>
                <option value="">Todos os tipos de local</option>
                {tiposLocal.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filtroGarantia.familia} onChange={e => setFiltroGarantia(f => ({ ...f, familia: e.target.value }))} style={{ ...sel, width: 160 }}>
                <option value="">Todas as famílias</option>
                {familias.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <Table cols={['Produto', 'Família', 'Marca', 'Local', 'Lote/Série', 'Qtd', 'Garantia até', 'Situação']} empty="Nenhum item com garantia cadastrada">
              {garantias.map(g => {
                const sit = SITUACAO_GARANTIA[g.situacao_garantia]
                return (
                  <tr key={g.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ ...td, fontWeight: 500 }}>{g.produto_nome}</td>
                    <td style={{ ...td, color: '#6b7280' }}>{g.familia ?? '—'}</td>
                    <td style={{ ...td, color: '#6b7280' }}>{g.marca ?? '—'}</td>
                    <td style={{ ...td, color: '#6b7280' }}>{g.local_nome}</td>
                    <td style={{ ...td, color: '#6b7280' }}>{g.lote_serie ?? '—'}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{g.quantidade} {g.unidade}</td>
                    <td style={td}>{new Date(g.garantia_ate).toLocaleDateString('pt-BR')}</td>
                    <td style={td}>
                      <span style={{ background: sit.color + '22', color: sit.color, padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>
                        {sit.label}
                      </span>
                    </td>
                  </tr>
                )
              })}
            </Table>
          </>
        )}
      </div>

      {/* Modal Produto */}
      {modalProd && (
        <Modal title={editProd ? 'Editar Produto' : 'Novo Produto'} onClose={() => { setModalProd(false); setEditProd(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Nome *"><input value={formProd.nome} onChange={e => setFormProd(f => ({ ...f, nome: e.target.value }))} style={inp} /></Field>
            <div style={{ display: 'flex', gap: 10 }}>
              <Field label="Unidade *" style={{ width: 100 }}>
                <select value={formProd.unidade} onChange={e => setFormProd(f => ({ ...f, unidade: e.target.value }))} style={sel}>
                  {['un', 'cx', 'kg', 'l', 'm', 'par', 'rolo'].map(u => <option key={u}>{u}</option>)}
                </select>
              </Field>
              <Field label="Família" style={{ flex: 1 }}><input value={formProd.familia} onChange={e => setFormProd(f => ({ ...f, familia: e.target.value }))} style={inp} /></Field>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <Field label="Marca" style={{ flex: 1 }}><input value={formProd.marca} onChange={e => setFormProd(f => ({ ...f, marca: e.target.value }))} style={inp} /></Field>
              <Field label="Fabricante" style={{ flex: 1 }}><input value={formProd.fabricante} onChange={e => setFormProd(f => ({ ...f, fabricante: e.target.value }))} style={inp} /></Field>
            </div>
            <Field label="Fornecedor"><input value={formProd.fornecedor} onChange={e => setFormProd(f => ({ ...f, fornecedor: e.target.value }))} style={inp} /></Field>
            <Field label="Descrição"><input value={formProd.descricao} onChange={e => setFormProd(f => ({ ...f, descricao: e.target.value }))} style={inp} /></Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button onClick={() => { setModalProd(false); setEditProd(null) }} style={btnSecondary}>Cancelar</button>
            <button onClick={() => salvarProduto.mutate()} disabled={!formProd.nome.trim() || salvarProduto.isPending} style={btnPrimary}>
              {salvarProduto.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </Modal>
      )}

      {/* Modal Local */}
      {modalLocal && (
        <Modal title={editLocal ? 'Editar Local' : 'Novo Local de Estoque'} onClose={() => { setModalLocal(false); setEditLocal(null) }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Field label="Nome *"><input value={formLocal.nome} onChange={e => setFormLocal(f => ({ ...f, nome: e.target.value }))} style={inp} /></Field>
            <Field label="Tipo">
              <select value={formLocal.tipo} onChange={e => setFormLocal(f => ({ ...f, tipo: e.target.value }))} style={sel}>
                {['principal', 'campo', 'veiculo', 'deposito', 'externo'].map(t => <option key={t}>{t}</option>)}
              </select>
            </Field>
            <Field label="Descrição"><input value={formLocal.descricao} onChange={e => setFormLocal(f => ({ ...f, descricao: e.target.value }))} style={inp} /></Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
            <button onClick={() => { setModalLocal(false); setEditLocal(null) }} style={btnSecondary}>Cancelar</button>
            <button onClick={() => salvarLocal.mutate()} disabled={!formLocal.nome.trim() || salvarLocal.isPending} style={btnPrimary}>
              {salvarLocal.isPending ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Componentes utilitários ───────────────────────────────────────────────

function Table({ cols, children, empty }: { cols: string[]; children: React.ReactNode; empty: string }) {
  return (
    <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
            {cols.map(c => <th key={c} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {children}
          {!children || (Array.isArray(children) && children.length === 0) ? (
            <tr><td colSpan={cols.length} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>{empty}</td></tr>
          ) : null}
        </tbody>
      </table>
    </div>
  )
}

function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
      <div style={{ background: 'white', borderRadius: 10, padding: 24, width: 480, boxShadow: '0 8px 32px rgba(0,0,0,0.2)', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: 16 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9ca3af' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children, style }: { label: string; children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={style}>
      <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

function ExportButtons({ onExport }: { onExport: (format: typeof EXPORT_FORMATS[number]) => void }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {EXPORT_FORMATS.map(fmt => (
        <button key={fmt} onClick={() => onExport(fmt)} style={btnSecondary} title={`Exportar em ${fmt.toUpperCase()}`}>
          ⬇ {fmt.toUpperCase()}
        </button>
      ))}
    </div>
  )
}

function garantiaColor(data: string | null): string {
  if (!data) return '#9ca3af'
  const dias = (new Date(data).getTime() - Date.now()) / 86400000
  if (dias < 0)   return '#ef4444'
  if (dias < 30)  return '#f59e0b'
  return '#374151'
}

const td: React.CSSProperties = { padding: '9px 12px' }
const inp: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }
const sel: React.CSSProperties = { width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }
const btnPrimary: React.CSSProperties = { background: '#2563eb', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }
const btnSecondary: React.CSSProperties = { background: 'white', color: '#374151', border: '1px solid #d1d5db', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }
const btnEdit: React.CSSProperties = { background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11, marginRight: 4 }
const btnDel: React.CSSProperties = { background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', padding: '3px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 11 }
