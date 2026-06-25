import { useState, useMemo, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { SIGMap } from '../components/map/SIGMap'
import { useMapStore } from '../store/map.store'
import toast from 'react-hot-toast'

type Camada = { id: string; nome: string; cor: string }
type Pessoa = { id: string; nome: string; cpf_cnpj?: string; email?: string; telefone?: string; endereco?: string; tipo: 'fisica' | 'juridica' }
type Loteamento = { id: string; nome: string; decreto?: string; data_aprovacao?: string }
type Quadra = { id: string; codigo: string; loteamento_id?: string; loteamento_nome?: string }
type Parcela = { id: string; codigo: string; area_m2: number | null; geometry?: any; bairro?: string; logradouro?: string; camada_id?: string }
type Bairro = { id: string; nome: string; codigo: string }
type Logradouro = { id: string; nome: string; tipo: string; codigo: string; cep?: string; bairro_id?: string; bairro_nome?: string }
type Zona = { id: string; nome: string; codigo: string }

type TabKey = 'parcelas' | 'pessoas' | 'loteamentos' | 'quadras' | 'bairros' | 'logradouros' | 'zoneamentos' | 'mapa'

const COR_PADRAO = '#2563eb'

const btn = (cor = '#2563eb', small = false): React.CSSProperties => ({
  padding: small ? '4px 12px' : '8px 18px',
  background: cor,
  color: 'white',
  border: 'none',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: small ? 12 : 13,
  fontWeight: 500,
})

const outlineBtn = (small = false): React.CSSProperties => ({
  padding: small ? '4px 12px' : '8px 16px',
  background: 'white',
  color: '#374151',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  cursor: 'pointer',
  fontSize: small ? 12 : 13,
})

const input: React.CSSProperties = {
  padding: '8px 12px',
  border: '1px solid #d1d5db',
  borderRadius: 6,
  fontSize: 13,
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
}

const card: React.CSSProperties = {
  background: 'white',
  border: '1px solid #e5e7eb',
  borderRadius: 10,
  padding: 20,
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'parcelas', label: 'Parcelas' },
  { key: 'pessoas', label: 'Pessoas' },
  { key: 'loteamentos', label: 'Loteamentos' },
  { key: 'quadras', label: 'Quadras' },
  { key: 'bairros', label: 'Bairros' },
  { key: 'logradouros', label: 'Logradouros' },
  { key: 'zoneamentos', label: 'Zoneamentos' },
  { key: 'mapa', label: 'Mapa' },
]

function createBlobDownload(data: Blob, filename: string) {
  const url = URL.createObjectURL(data)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function useExport() {
  async function download(path: string, filename: string, format: string) {
    try {
      const response = await api.get(path, {
        params: { format },
        responseType: 'blob',
      })
      createBlobDownload(new Blob([response.data]), filename)
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Falha ao exportar arquivo')
    }
  }

  return { download }
}

export function CadastroPage() {
  const [tab, setTab] = useState<TabKey>('parcelas')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [camadaFiltro, setCamadaFiltro] = useState('')
  const [criando, setCriando] = useState(false)
  const [novoCodigo, setNovoCodigo] = useState('')
  const [novaCamada, setNovaCamada] = useState('')
  const [pessoaForm, setPessoaForm] = useState<Pessoa>({ id: '', nome: '', tipo: 'fisica' })
  const [loteamentoForm, setLoteamentoForm] = useState<Omit<Loteamento, 'id'>>({ nome: '' })
  const [quadraForm, setQuadraForm] = useState<Partial<Quadra>>({ codigo: '' })
  const [editPessoaId, setEditPessoaId] = useState<string | null>(null)
  const [editLoteamentoId, setEditLoteamentoId] = useState<string | null>(null)
  const [editQuadraId, setEditQuadraId] = useState<string | null>(null)
  const [bairroForm, setBairroForm] = useState<Partial<Bairro>>({ nome: '', codigo: '' })
  const [editBairroId, setEditBairroId] = useState<string | null>(null)
  const [editBairroGeomId, setEditBairroGeomId] = useState<string | null>(null)
  const [logradouroForm, setLogradouroForm] = useState<Partial<Logradouro>>({ nome: '', tipo: 'Rua', codigo: '' })
  const [editLogradouroId, setEditLogradouroId] = useState<string | null>(null)
  const [zonaForm, setZonaForm] = useState<Partial<Zona>>({ nome: '', codigo: '' })
  const [editZonaId, setEditZonaId] = useState<string | null>(null)
  const [quadrasSelecionadas, setQuadrasSelecionadas] = useState<Set<string>>(new Set())

  // Campos BIC para criação rápida de parcela
  const [parcelaLogradouroId, setParcelaLogradouroId] = useState('')
  const [parcelaBairroId, setParcelaBairroId] = useState('')
  const [parcelaLoteamentoId, setParcelaLoteamentoId] = useState('')
  const [parcelaQuadraId, setParcelaQuadraId] = useState('')
  const [parcelaAreaConstruida, setParcelaAreaConstruida] = useState('')
  const [parcelaUso, setParcelaUso] = useState('')
  const [parcelaSituacaoOcupacao, setParcelaSituacaoOcupacao] = useState('')

  const { flyTo, selectParcela, lastDrawnGeometry, setLastDrawnGeometry } = useMapStore()

  useEffect(() => {
    if (!editBairroGeomId || !lastDrawnGeometry) return
    saveBairroGeom(lastDrawnGeometry).then(() => setLastDrawnGeometry(null))
  }, [lastDrawnGeometry]) // eslint-disable-line react-hooks/exhaustive-deps
  const qc = useQueryClient()
  const { download } = useExport()

  const parcelasQuery = useQuery({
    queryKey: ['parcelas-list', search, page, camadaFiltro],
    queryFn: () => {
      const params = new URLSearchParams({
        q: search || 'aa',
        page: String(page),
        limit: '50',
      })
      if (camadaFiltro) params.set('camada_id', camadaFiltro)
      return api.get(`/parcelas/search?${params}`).then(r => r.data)
    },
    enabled: tab === 'parcelas' && ((search?.length ?? 0) >= 2 || search === ''),
    staleTime: 30_000,
  })

  const pessoasQuery = useQuery({
    queryKey: ['pessoas', search, page],
    queryFn: () => api.get('/pessoas', { params: { q: search || undefined, page, limit: 50 } }).then(r => r.data),
    enabled: tab === 'pessoas',
    staleTime: 30_000,
  })

  const loteamentosQuery = useQuery({
    queryKey: ['loteamentos', search, page],
    queryFn: () => api.get('/loteamentos', { params: { q: search || undefined, page, limit: 50 } }).then(r => r.data),
    enabled: tab === 'loteamentos' || tab === 'quadras' || tab === 'parcelas',
    staleTime: 30_000,
  })

  const bairrosQuery = useQuery({
    queryKey: ['bairros-crud', search, page],
    queryFn: () => api.get('/bairros').then(r => r.data?.data ?? []),
    enabled: tab === 'bairros' || tab === 'logradouros' || tab === 'parcelas',
    staleTime: 30_000,
  })

  const logradourosQuery = useQuery({
    queryKey: ['logradouros-crud', search],
    queryFn: () => api.get('/logradouros', { params: { q: search || undefined } }).then(r => r.data),
    enabled: tab === 'logradouros' || tab === 'parcelas',
    staleTime: 30_000,
  })

  const quadrasQuery = useQuery({
    queryKey: ['quadras'],
    queryFn: () => api.get('/quadras').then(r => r.data),
    enabled: tab === 'quadras',
    staleTime: 30_000,
  })

  const zonasQuery = useQuery({
    queryKey: ['zonas'],
    queryFn: () => api.get('/zonas').then(r => r.data?.data ?? []),
    enabled: tab === 'zoneamentos',
    staleTime: 30_000,
  })

  const { data: camadas = [] } = useQuery<Camada[]>({
    queryKey: ['camadas'],
    queryFn: () => api.get('/camadas').then(r => r.data),
  })

  const loteamentosForSelect = useMemo(() => loteamentosQuery.data?.data ?? [], [loteamentosQuery.data])
  const selectedPessoas = pessoasQuery.data?.data ?? []
  const selectedLoteamentos = loteamentosQuery.data?.data ?? []

  const selectedQuadras = useMemo(() => {
    const rows: Quadra[] = quadrasQuery.data ?? []
    if (!search.trim()) return rows
    const term = search.toLowerCase()
    return rows.filter((q) => q.codigo.toLowerCase().includes(term) || q.loteamento_nome?.toLowerCase().includes(term))
  }, [quadrasQuery.data, search])

  function resetParcelasForm() {
    setCriando(false)
    setNovoCodigo('')
    setNovaCamada('')
    setParcelaLogradouroId('')
    setParcelaBairroId('')
    setParcelaLoteamentoId('')
    setParcelaQuadraId('')
    setParcelaAreaConstruida('')
    setParcelaUso('')
    setParcelaSituacaoOcupacao('')
  }

  function resetBairroForm() {
    setBairroForm({ nome: '', codigo: '' })
    setEditBairroId(null)
    setEditBairroGeomId(null)
  }

  function resetZonaForm() {
    setZonaForm({ nome: '', codigo: '' })
    setEditZonaId(null)
  }

  function resetLogradouroForm() {
    setLogradouroForm({ nome: '', tipo: 'Rua', codigo: '' })
    setEditLogradouroId(null)
  }

  function resetPessoaForm() {
    setPessoaForm({ id: '', nome: '', tipo: 'fisica' })
    setEditPessoaId(null)
  }

  function resetLoteamentoForm() {
    setLoteamentoForm({ nome: '' })
    setEditLoteamentoId(null)
  }

  function resetQuadraForm() {
    setQuadraForm({ codigo: '' })
    setEditQuadraId(null)
  }

  function handleSetTab(next: TabKey) {
    setTab(next)
    setSearch('')
    setPage(1)
    resetParcelasForm()
    resetPessoaForm()
    resetLoteamentoForm()
    resetQuadraForm()
    resetBairroForm()
    resetLogradouroForm()
    resetZonaForm()
    setQuadrasSelecionadas(new Set())
  }

  async function handleRowClick(parcela: Parcela) {
    const geom = parcela.geometry
    if (geom?.coordinates?.[0]?.length) {
      const flat = geom.coordinates[0]
      const lng = flat.reduce((s: number, p: number[]) => s + p[0], 0) / flat.length
      const lat = flat.reduce((s: number, p: number[]) => s + p[1], 0) / flat.length
      flyTo(lat, lng, 18)
    }
    selectParcela(parcela.id)
  }

  async function exportEntity(entity: TabKey, format: string) {
    await download(`/api/${entity}/export`, `${entity}.${format}`, format)
  }

  async function criarParcela() {
    if (!novoCodigo.trim()) { toast.error('Informe o código da parcela'); return }
    try {
      await api.post('/parcelas', {
        codigo: novoCodigo.trim(),
        ...(novaCamada ? { camadaId: novaCamada } : {}),
        ...(parcelaLogradouroId ? { logradouroId: parcelaLogradouroId } : {}),
        ...(parcelaBairroId ? { bairroId: parcelaBairroId } : {}),
        ...(parcelaLoteamentoId ? { loteamentoId: parcelaLoteamentoId } : {}),
        ...(parcelaQuadraId ? { quadraId: parcelaQuadraId } : {}),
        ...(parcelaAreaConstruida ? { areaM2: Number(parcelaAreaConstruida) } : {}),
      })
      toast.success('Parcela criada')
      resetParcelasForm()
      qc.invalidateQueries({ queryKey: ['parcelas-list'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao criar parcela')
    }
  }

  async function saveBairro() {
    if (!bairroForm.nome?.trim()) { toast.error('Informe o nome do bairro'); return }
    if (!bairroForm.codigo?.trim()) { toast.error('Informe o código do bairro'); return }
    try {
      if (editBairroId) {
        await api.put(`/bairros/${editBairroId}`, { nome: bairroForm.nome, codigo: bairroForm.codigo })
        toast.success('Bairro atualizado')
      } else {
        await api.post('/bairros', { nome: bairroForm.nome, codigo: bairroForm.codigo })
        toast.success('Bairro criado')
      }
      resetBairroForm()
      qc.invalidateQueries({ queryKey: ['bairros-crud'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao salvar bairro')
    }
  }

  async function removeBairro(id: string) {
    if (!window.confirm('Remover este bairro?')) return
    try {
      await api.delete(`/bairros/${id}`)
      toast.success('Bairro removido')
      if (editBairroId === id) resetBairroForm()
      qc.invalidateQueries({ queryKey: ['bairros-crud'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao remover bairro')
    }
  }

  function selectBairro(item: Bairro) {
    setEditBairroId(item.id)
    setBairroForm({ nome: item.nome, codigo: item.codigo })
  }

  async function saveLogradouro() {
    if (!logradouroForm.nome?.trim()) { toast.error('Informe o nome do logradouro'); return }
    if (!logradouroForm.codigo?.trim()) { toast.error('Informe o código do logradouro'); return }
    try {
      if (editLogradouroId) {
        await api.put(`/logradouros/${editLogradouroId}`, {
          nome: logradouroForm.nome,
          tipo: logradouroForm.tipo || 'Rua',
          codigo: logradouroForm.codigo,
          cep: logradouroForm.cep || undefined,
          bairroId: logradouroForm.bairro_id || undefined,
        })
        toast.success('Logradouro atualizado')
      } else {
        await api.post('/logradouros', {
          nome: logradouroForm.nome,
          tipo: logradouroForm.tipo || 'Rua',
          codigo: logradouroForm.codigo,
          cep: logradouroForm.cep || undefined,
          bairroId: logradouroForm.bairro_id || undefined,
        })
        toast.success('Logradouro criado')
      }
      resetLogradouroForm()
      qc.invalidateQueries({ queryKey: ['logradouros-crud'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao salvar logradouro')
    }
  }

  async function removeLogradouro(id: string) {
    if (!window.confirm('Remover este logradouro?')) return
    try {
      await api.delete(`/logradouros/${id}`)
      toast.success('Logradouro removido')
      if (editLogradouroId === id) resetLogradouroForm()
      qc.invalidateQueries({ queryKey: ['logradouros-crud'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao remover logradouro')
    }
  }

  function selectLogradouro(item: Logradouro) {
    setEditLogradouroId(item.id)
    setLogradouroForm({ nome: item.nome, tipo: item.tipo, codigo: item.codigo, cep: item.cep, bairro_id: item.bairro_id })
  }

  async function savePessoa() {
    if (!pessoaForm.nome.trim()) { toast.error('Informe o nome da pessoa'); return }
    try {
      if (editPessoaId) {
        await api.put(`/pessoas/${editPessoaId}`, {
          nome: pessoaForm.nome,
          cpfCnpj: pessoaForm.cpf_cnpj,
          email: pessoaForm.email,
          telefone: pessoaForm.telefone,
          endereco: pessoaForm.endereco,
          tipo: pessoaForm.tipo,
        })
        toast.success('Pessoa atualizada')
      } else {
        await api.post('/pessoas', {
          nome: pessoaForm.nome,
          cpfCnpj: pessoaForm.cpf_cnpj,
          email: pessoaForm.email,
          telefone: pessoaForm.telefone,
          endereco: pessoaForm.endereco,
          tipo: pessoaForm.tipo,
        })
        toast.success('Pessoa criada')
      }
      resetPessoaForm()
      qc.invalidateQueries({ queryKey: ['pessoas'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao salvar pessoa')
    }
  }

  async function removePessoa(id: string) {
    if (!window.confirm('Remover esta pessoa?')) return
    try {
      await api.delete(`/pessoas/${id}`)
      toast.success('Pessoa removida')
      if (editPessoaId === id) resetPessoaForm()
      qc.invalidateQueries({ queryKey: ['pessoas'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao remover pessoa')
    }
  }

  function selectPessoa(item: Pessoa) {
    setEditPessoaId(item.id)
    setPessoaForm({
      id: item.id,
      nome: item.nome,
      cpf_cnpj: item.cpf_cnpj,
      email: item.email,
      telefone: item.telefone,
      endereco: item.endereco,
      tipo: item.tipo,
    })
  }

  async function saveLoteamento() {
    if (!loteamentoForm.nome.trim()) { toast.error('Informe o nome do loteamento'); return }
    try {
      if (editLoteamentoId) {
        await api.put(`/loteamentos/${editLoteamentoId}`, {
          nome: loteamentoForm.nome,
          decreto: loteamentoForm.decreto,
          dataAprovacao: loteamentoForm.data_aprovacao,
        })
        toast.success('Loteamento atualizado')
      } else {
        await api.post('/loteamentos', {
          nome: loteamentoForm.nome,
          decreto: loteamentoForm.decreto,
          dataAprovacao: loteamentoForm.data_aprovacao,
        })
        toast.success('Loteamento criado')
      }
      resetLoteamentoForm()
      qc.invalidateQueries({ queryKey: ['loteamentos'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao salvar loteamento')
    }
  }

  async function removeLoteamento(id: string) {
    if (!window.confirm('Remover este loteamento?')) return
    try {
      await api.delete(`/loteamentos/${id}`)
      toast.success('Loteamento removido')
      if (editLoteamentoId === id) resetLoteamentoForm()
      qc.invalidateQueries({ queryKey: ['loteamentos'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao remover loteamento')
    }
  }

  function selectLoteamento(item: Loteamento & { id: string }) {
    setEditLoteamentoId(item.id)
    setLoteamentoForm({ nome: item.nome, decreto: item.decreto, data_aprovacao: item.data_aprovacao })
  }

  async function saveQuadra() {
    if (!quadraForm.codigo?.trim()) { toast.error('Informe o código da quadra'); return }
    try {
      if (editQuadraId) {
        await api.put(`/quadras/${editQuadraId}`, {
          codigo: quadraForm.codigo,
          loteamentoId: quadraForm.loteamento_id || null,
        })
        toast.success('Quadra atualizada')
      } else {
        await api.post('/quadras', {
          codigo: quadraForm.codigo,
          loteamentoId: quadraForm.loteamento_id || null,
        })
        toast.success('Quadra criada')
      }
      resetQuadraForm()
      qc.invalidateQueries({ queryKey: ['quadras'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao salvar quadra')
    }
  }

  async function removeQuadra(id: string) {
    if (!window.confirm('Remover esta quadra?')) return
    try {
      await api.delete(`/quadras/${id}`)
      toast.success('Quadra removida')
      if (editQuadraId === id) resetQuadraForm()
      qc.invalidateQueries({ queryKey: ['quadras'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao remover quadra')
    }
  }

  function selectQuadra(item: Quadra & { id: string }) {
    setEditQuadraId(item.id)
    setQuadraForm({ codigo: item.codigo, loteamento_id: item.loteamento_id })
  }

  function toggleQuadraSelecionada(id: string) {
    setQuadrasSelecionadas(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function unificarQuadras() {
    if (quadrasSelecionadas.size < 2) return
    if (!window.confirm(`Unificar ${quadrasSelecionadas.size} quadras? As quadras secundárias serão excluídas.`)) return
    try {
      await api.post('/quadras/unificar', { quadraIds: Array.from(quadrasSelecionadas) })
      toast.success('Quadras unificadas')
      setQuadrasSelecionadas(new Set())
      qc.invalidateQueries({ queryKey: ['quadras'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao unificar quadras')
    }
  }

  async function saveZona() {
    if (!zonaForm.nome?.trim()) { toast.error('Informe o nome da zona'); return }
    if (!zonaForm.codigo?.trim()) { toast.error('Informe o código da zona'); return }
    try {
      if (editZonaId) {
        await api.put(`/zonas/${editZonaId}`, { nome: zonaForm.nome, codigo: zonaForm.codigo })
        toast.success('Zona atualizada')
      } else {
        await api.post('/zonas', { nome: zonaForm.nome, codigo: zonaForm.codigo })
        toast.success('Zona criada')
      }
      resetZonaForm()
      qc.invalidateQueries({ queryKey: ['zonas'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao salvar zona')
    }
  }

  async function removeZona(id: string) {
    if (!window.confirm('Remover esta zona?')) return
    try {
      await api.delete(`/zonas/${id}`)
      toast.success('Zona removida')
      if (editZonaId === id) resetZonaForm()
      qc.invalidateQueries({ queryKey: ['zonas'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao remover zona')
    }
  }

  function selectZona(item: Zona) {
    setEditZonaId(item.id)
    setZonaForm({ nome: item.nome, codigo: item.codigo })
  }

  async function saveBairroGeom(geojson: object) {
    if (!editBairroGeomId) return
    try {
      await api.put(`/bairros/${editBairroGeomId}`, { geometry: geojson })
      toast.success('Contorno do bairro salvo')
      setEditBairroGeomId(null)
      qc.invalidateQueries({ queryKey: ['bairros-crud'] })
    } catch (err: any) {
      toast.error(err.response?.data?.error ?? 'Erro ao salvar geometria')
    }
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 20, gap: 16 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, color: '#1e3a5f' }}>Cadastro Imobiliário</h2>
          <p style={{ margin: '6px 0 0', color: '#6b7280', fontSize: 13 }}>CRUD completo de Pessoas, Loteamentos e Quadras com exportação.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {['csv', 'xml', 'xlsx'].map((fmt) => (
            <button key={fmt} onClick={() => exportEntity(tab, fmt)} style={{ padding: '6px 14px', background: 'white', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13, textTransform: 'uppercase' }}>{fmt}</button>
          ))}
          {tab === 'parcelas' && (
            <button onClick={() => setCriando((p) => !p)} style={{ padding: '6px 16px', background: '#2563eb', color: 'white', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13 }}>+ Nova Parcela</button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {TABS.map((item) => (
          <button key={item.key} onClick={() => handleSetTab(item.key)} style={{ padding: '8px 16px', borderRadius: 8, border: '1px solid #d1d5db', background: tab === item.key ? '#2563eb' : 'white', color: tab === item.key ? 'white' : '#374151', cursor: 'pointer', fontSize: 13 }}>{item.label}</button>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <input
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder={tab === 'parcelas' ? 'Pesquisar por código, logradouro...' : tab === 'pessoas' ? 'Pesquisar por nome, CPF ou email...' : tab === 'loteamentos' ? 'Pesquisar por loteamento ou decreto...' : 'Pesquisar por código ou loteamento...'}
          style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, outline: 'none', flex: 1, minWidth: 220, maxWidth: 420 }}
        />
        {tab === 'parcelas' && (
          <select value={camadaFiltro} onChange={(e) => { setCamadaFiltro(e.target.value); setPage(1) }} style={{ padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', minWidth: 200 }}>
            <option value="">Todas as camadas</option>
            {camadas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        )}
      </div>

      {tab === 'parcelas' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          {criando && (
            <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, padding: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#1d4ed8', display: 'block', marginBottom: 3 }}>Código *</label>
                <input autoFocus value={novoCodigo} onChange={(e) => setNovoCodigo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && criarParcela()} placeholder="Ex: 001-A-0001" style={{ padding: '7px 10px', border: '1px solid #93c5fd', borderRadius: 6, fontSize: 13, outline: 'none', width: 180 }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 600, color: '#1d4ed8', display: 'block', marginBottom: 3 }}>Camada</label>
                <select value={novaCamada} onChange={(e) => setNovaCamada(e.target.value)} style={{ padding: '7px 10px', border: '1px solid #93c5fd', borderRadius: 6, fontSize: 13, outline: 'none' }}>
                  <option value="">— sem camada —</option>
                  {camadas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </div>
              <button onClick={criarParcela} style={{ padding: '7px 16px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Criar</button>
              <button onClick={() => setCriando(false)} style={{ padding: '7px 12px', background: 'white', color: '#374151', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>Cancelar</button>
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                {['Código', 'Logradouro', 'Bairro', 'Camada', 'Área (m²)', 'Ações'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parcelasQuery.isLoading && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Carregando...</td></tr>}
              {!parcelasQuery.isLoading && parcelasQuery.data?.data?.map((item: Parcela) => {
                const camada = camadas.find((c) => c.id === item.camada_id)
                return (
                  <tr key={item.id} onClick={() => handleRowClick(item)} style={{ cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }} onMouseEnter={(e) => (e.currentTarget.style.background = '#eff6ff')} onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}>
                    <td style={{ padding: '9px 12px', fontWeight: 600, color: '#2563eb' }}>{item.codigo}</td>
                    <td style={{ padding: '9px 12px' }}>{item.logradouro ?? '—'}</td>
                    <td style={{ padding: '9px 12px' }}>{item.bairro ?? '—'}</td>
                    <td style={{ padding: '9px 12px' }}>{camada ? <span style={{ background: camada.cor + '22', color: camada.cor, padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 600, border: `1px solid ${camada.cor}44` }}>{camada.nome}</span> : '—'}</td>
                    <td style={{ padding: '9px 12px' }}>{item.area_m2 ? Number(item.area_m2).toFixed(2) : '—'}</td>
                    <td style={{ padding: '9px 12px' }}><a href={`/cadastro/parcelas/${item.id}`} onClick={(e) => e.stopPropagation()} style={{ color: '#2563eb', textDecoration: 'none', fontSize: 12 }}>Editar</a></td>
                  </tr>
                )
              })}
              {!parcelasQuery.isLoading && parcelasQuery.data?.data?.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Nenhuma parcela encontrada</td></tr>}
            </tbody>
          </table>

          {parcelasQuery.data?.pagination && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#6b7280' }}>
              <span>Total: {parcelasQuery.data.pagination.total} parcelas</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '4px 12px', cursor: 'pointer' }}>← Anterior</button>
                <span>Página {page}</span>
                <button onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= parcelasQuery.data.pagination.total} style={{ padding: '4px 12px', cursor: 'pointer' }}>Próxima →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'pessoas' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ ...card, display: 'grid', gap: 12, gridTemplateColumns: '1.5fr 1fr', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Nome *</label>
              <input style={input} value={pessoaForm.nome} onChange={(e) => setPessoaForm({ ...pessoaForm, nome: e.target.value })} placeholder="Nome completo" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Tipo</label>
              <select style={input} value={pessoaForm.tipo} onChange={(e) => setPessoaForm({ ...pessoaForm, tipo: e.target.value as 'fisica' | 'juridica' })}>
                <option value="fisica">Física</option>
                <option value="juridica">Jurídica</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>CPF / CNPJ</label>
              <input style={input} value={pessoaForm.cpf_cnpj ?? ''} onChange={(e) => setPessoaForm({ ...pessoaForm, cpf_cnpj: e.target.value })} placeholder="CPF ou CNPJ" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Telefone</label>
              <input style={input} value={pessoaForm.telefone ?? ''} onChange={(e) => setPessoaForm({ ...pessoaForm, telefone: e.target.value })} placeholder="(99) 99999-9999" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Email</label>
              <input style={input} value={pessoaForm.email ?? ''} onChange={(e) => setPessoaForm({ ...pessoaForm, email: e.target.value })} placeholder="email@dominio.com" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Endereço</label>
              <input style={input} value={pessoaForm.endereco ?? ''} onChange={(e) => setPessoaForm({ ...pessoaForm, endereco: e.target.value })} placeholder="Rua, número, bairro" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn()} onClick={savePessoa}>{editPessoaId ? 'Salvar' : 'Criar'}</button>
              <button style={outlineBtn()} onClick={resetPessoaForm}>Limpar</button>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                {['Nome', 'CPF/CNPJ', 'Email', 'Telefone', 'Endereço', 'Tipo', 'Ações'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pessoasQuery.isLoading && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Carregando...</td></tr>}
              {!pessoasQuery.isLoading && selectedPessoas.map((item: Pessoa & { id: string }) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 12px' }}>{item.nome}</td>
                  <td style={{ padding: '10px 12px' }}>{item.cpf_cnpj ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{item.email ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{item.telefone ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{item.endereco ?? '—'}</td>
                  <td style={{ padding: '10px 12px', textTransform: 'capitalize' }}>{item.tipo}</td>
                  <td style={{ padding: '10px 12px', display: 'flex', gap: 8 }}>
                    <button style={outlineBtn(true)} onClick={() => selectPessoa(item)}>Editar</button>
                    <button style={{ ...outlineBtn(true), color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => removePessoa(item.id)}>Apagar</button>
                  </td>
                </tr>
              ))}
              {!pessoasQuery.isLoading && selectedPessoas.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Nenhuma pessoa encontrada</td></tr>}
            </tbody>
          </table>

          {pessoasQuery.data?.pagination && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#6b7280', marginTop: 12 }}>
              <span>Total: {pessoasQuery.data.pagination.total} pessoas</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '4px 12px', cursor: 'pointer' }}>← Anterior</button>
                <span>Página {page}</span>
                <button onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= pessoasQuery.data.pagination.total} style={{ padding: '4px 12px', cursor: 'pointer' }}>Próxima →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'loteamentos' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ ...card, display: 'grid', gap: 12, gridTemplateColumns: '1.2fr 1fr 1fr', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Nome *</label>
              <input style={input} value={loteamentoForm.nome} onChange={(e) => setLoteamentoForm({ ...loteamentoForm, nome: e.target.value })} placeholder="Loteamento" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Decreto</label>
              <input style={input} value={loteamentoForm.decreto ?? ''} onChange={(e) => setLoteamentoForm({ ...loteamentoForm, decreto: e.target.value })} placeholder="Decreto" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Data de aprovação</label>
              <input type="date" style={input} value={loteamentoForm.data_aprovacao ?? ''} onChange={(e) => setLoteamentoForm({ ...loteamentoForm, data_aprovacao: e.target.value })} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn()} onClick={saveLoteamento}>{editLoteamentoId ? 'Salvar' : 'Criar'}</button>
              <button style={outlineBtn()} onClick={resetLoteamentoForm}>Limpar</button>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                {['Nome', 'Decreto', 'Data Aprovação', 'Ações'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loteamentosQuery.isLoading && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Carregando...</td></tr>}
              {!loteamentosQuery.isLoading && selectedLoteamentos.map((item: Loteamento & { id: string }) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 12px' }}>{item.nome}</td>
                  <td style={{ padding: '10px 12px' }}>{item.decreto ?? '—'}</td>
                  <td style={{ padding: '10px 12px' }}>{item.data_aprovacao ?? '—'}</td>
                  <td style={{ padding: '10px 12px', display: 'flex', gap: 8 }}>
                    <button style={outlineBtn(true)} onClick={() => selectLoteamento(item)}>Editar</button>
                    <button style={{ ...outlineBtn(true), color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => removeLoteamento(item.id)}>Apagar</button>
                  </td>
                </tr>
              ))}
              {!loteamentosQuery.isLoading && selectedLoteamentos.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Nenhum loteamento encontrado</td></tr>}
            </tbody>
          </table>

          {loteamentosQuery.data?.pagination && (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#6b7280', marginTop: 12 }}>
              <span>Total: {loteamentosQuery.data.pagination.total} loteamentos</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} style={{ padding: '4px 12px', cursor: 'pointer' }}>← Anterior</button>
                <span>Página {page}</span>
                <button onClick={() => setPage((p) => p + 1)} disabled={page * 50 >= loteamentosQuery.data.pagination.total} style={{ padding: '4px 12px', cursor: 'pointer' }}>Próxima →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'quadras' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ ...card, display: 'grid', gap: 12, gridTemplateColumns: '1.3fr 1fr', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Código *</label>
              <input style={input} value={quadraForm.codigo ?? ''} onChange={(e) => setQuadraForm({ ...quadraForm, codigo: e.target.value })} placeholder="Código da quadra" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Loteamento</label>
              <select style={input} value={quadraForm.loteamento_id ?? ''} onChange={(e) => setQuadraForm({ ...quadraForm, loteamento_id: e.target.value || undefined })}>
                <option value="">— Sem loteamento —</option>
                {loteamentosForSelect.map((lt: Loteamento) => (
                  <option key={lt.id} value={lt.id}>{lt.nome}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn()} onClick={saveQuadra}>{editQuadraId ? 'Salvar' : 'Criar'}</button>
              <button style={outlineBtn()} onClick={resetQuadraForm}>Limpar</button>
            </div>
          </div>

          {quadrasSelecionadas.size >= 2 && (
            <div style={{ margin: '12px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
              <button
                onClick={unificarQuadras}
                style={{ ...btn('#7c3aed'), display: 'flex', alignItems: 'center', gap: 6 }}
              >
                Unificar selecionadas ({quadrasSelecionadas.size})
              </button>
              <span style={{ fontSize: 12, color: '#6b7280' }}>
                A geometria das quadras será unida via ST_Union. As quadras secundárias serão excluídas.
              </span>
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                {['Sel.', 'Código', 'Loteamento', 'Ações'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {quadrasQuery.isLoading && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Carregando...</td></tr>}
              {!quadrasQuery.isLoading && selectedQuadras.map((item: Quadra & { id: string }) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', background: quadrasSelecionadas.has(item.id) ? '#f5f3ff' : 'white' }}>
                  <td style={{ padding: '10px 12px' }}>
                    <input
                      type="checkbox"
                      checked={quadrasSelecionadas.has(item.id)}
                      onChange={() => toggleQuadraSelecionada(item.id)}
                      style={{ width: 16, height: 16, cursor: 'pointer' }}
                    />
                  </td>
                  <td style={{ padding: '10px 12px' }}>{item.codigo}</td>
                  <td style={{ padding: '10px 12px' }}>{item.loteamento_nome ?? '—'}</td>
                  <td style={{ padding: '10px 12px', display: 'flex', gap: 8 }}>
                    <button style={outlineBtn(true)} onClick={() => selectQuadra(item)}>Editar</button>
                    <button style={{ ...outlineBtn(true), color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => removeQuadra(item.id)}>Apagar</button>
                  </td>
                </tr>
              ))}
              {!quadrasQuery.isLoading && selectedQuadras.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Nenhuma quadra encontrada</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'bairros' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ ...card, display: 'grid', gap: 12, gridTemplateColumns: '1.5fr 1fr', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Nome *</label>
              <input style={input} value={bairroForm.nome ?? ''} onChange={(e) => setBairroForm({ ...bairroForm, nome: e.target.value })} placeholder="Nome do bairro" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Código *</label>
              <input style={input} value={bairroForm.codigo ?? ''} onChange={(e) => setBairroForm({ ...bairroForm, codigo: e.target.value })} placeholder="Ex: 001" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn()} onClick={saveBairro}>{editBairroId ? 'Salvar' : 'Criar'}</button>
              <button style={outlineBtn()} onClick={resetBairroForm}>Limpar</button>
            </div>
          </div>

          {editBairroGeomId && (
            <div style={{ ...card, marginTop: 16, borderColor: '#bfdbfe', background: '#eff6ff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: '#1d4ed8' }}>
                  Editando contorno: {(bairrosQuery.data ?? []).find((b: Bairro) => b.id === editBairroGeomId)?.nome}
                </p>
                <button onClick={() => setEditBairroGeomId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', fontSize: 16 }}>✕</button>
              </div>
              <p style={{ margin: '0 0 10px', fontSize: 12, color: '#374151' }}>
                Desenhe ou edite o polígono no mapa abaixo e clique em "Salvar contorno".
              </p>
              <div style={{ height: 320, borderRadius: 8, overflow: 'hidden', border: '1px solid #bfdbfe' }}>
                <SIGMap compact />
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#1d4ed8' }}>
                Use a ferramenta de desenho no mapa para definir o contorno. O polígono sera salvo automaticamente ao ser desenhado.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
                <button onClick={() => setEditBairroGeomId(null)} style={outlineBtn(true)}>Cancelar</button>
              </div>
            </div>
          )}

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                {['Código', 'Nome', 'Ações'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bairrosQuery.isLoading && <tr><td colSpan={3} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Carregando...</td></tr>}
              {!bairrosQuery.isLoading && (bairrosQuery.data ?? []).map((item: Bairro) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', background: editBairroGeomId === item.id ? '#eff6ff' : 'white' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{item.codigo}</td>
                  <td style={{ padding: '10px 12px' }}>{item.nome}</td>
                  <td style={{ padding: '10px 12px', display: 'flex', gap: 8 }}>
                    <button style={outlineBtn(true)} onClick={() => selectBairro(item)}>Editar</button>
                    <button
                      style={{ ...outlineBtn(true), color: '#2563eb', borderColor: '#93c5fd' }}
                      onClick={() => setEditBairroGeomId(editBairroGeomId === item.id ? null : item.id)}
                    >
                      Editar contorno
                    </button>
                    <button style={{ ...outlineBtn(true), color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => removeBairro(item.id)}>Apagar</button>
                  </td>
                </tr>
              ))}
              {!bairrosQuery.isLoading && (bairrosQuery.data ?? []).length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Nenhum bairro cadastrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'logradouros' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ ...card, display: 'grid', gap: 12, gridTemplateColumns: '1.5fr 0.8fr 0.8fr', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Nome *</label>
              <input style={input} value={logradouroForm.nome ?? ''} onChange={(e) => setLogradouroForm({ ...logradouroForm, nome: e.target.value })} placeholder="Nome do logradouro" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Tipo</label>
              <select style={input} value={logradouroForm.tipo ?? 'Rua'} onChange={(e) => setLogradouroForm({ ...logradouroForm, tipo: e.target.value })}>
                {['Rua', 'Avenida', 'Travessa', 'Alameda', 'Rodovia', 'Estrada', 'Linha', 'Vila'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Código *</label>
              <input style={input} value={logradouroForm.codigo ?? ''} onChange={(e) => setLogradouroForm({ ...logradouroForm, codigo: e.target.value })} placeholder="Ex: 0042" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>CEP</label>
              <input style={input} value={logradouroForm.cep ?? ''} onChange={(e) => setLogradouroForm({ ...logradouroForm, cep: e.target.value })} placeholder="00000-000" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Bairro</label>
              <select style={input} value={logradouroForm.bairro_id ?? ''} onChange={(e) => setLogradouroForm({ ...logradouroForm, bairro_id: e.target.value || undefined })}>
                <option value="">— Sem bairro —</option>
                {(bairrosQuery.data ?? []).map((b: Bairro) => (
                  <option key={b.id} value={b.id}>{b.nome}</option>
                ))}
              </select>
            </div>
            <div style={{ display: 'flex', gap: 8, alignSelf: 'end' }}>
              <button style={btn()} onClick={saveLogradouro}>{editLogradouroId ? 'Salvar' : 'Criar'}</button>
              <button style={outlineBtn()} onClick={resetLogradouroForm}>Limpar</button>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                {['Código', 'Tipo', 'Nome', 'CEP', 'Bairro', 'Ações'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {logradourosQuery.isLoading && <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Carregando...</td></tr>}
              {!logradourosQuery.isLoading && (logradourosQuery.data?.data ?? logradourosQuery.data ?? []).map((item: Logradouro) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace' }}>{item.codigo}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>{item.tipo}</td>
                  <td style={{ padding: '10px 12px' }}>{item.nome}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>{item.cep ?? '—'}</td>
                  <td style={{ padding: '10px 12px', color: '#6b7280' }}>{item.bairro_nome ?? '—'}</td>
                  <td style={{ padding: '10px 12px', display: 'flex', gap: 8 }}>
                    <button style={outlineBtn(true)} onClick={() => selectLogradouro(item)}>Editar</button>
                    <button style={{ ...outlineBtn(true), color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => removeLogradouro(item.id)}>Apagar</button>
                  </td>
                </tr>
              ))}
              {!logradourosQuery.isLoading && (logradourosQuery.data?.data ?? logradourosQuery.data ?? []).length === 0 && (
                <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Nenhum logradouro cadastrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'zoneamentos' && (
        <div style={{ flex: 1, overflow: 'auto' }}>
          <div style={{ ...card, display: 'grid', gap: 12, gridTemplateColumns: '1.5fr 1fr', alignItems: 'end' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Nome *</label>
              <input style={input} value={zonaForm.nome ?? ''} onChange={(e) => setZonaForm({ ...zonaForm, nome: e.target.value })} placeholder="Ex: Zona Residencial 1" />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>Código *</label>
              <input style={input} value={zonaForm.codigo ?? ''} onChange={(e) => setZonaForm({ ...zonaForm, codigo: e.target.value })} placeholder="Ex: ZR1" />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button style={btn()} onClick={saveZona}>{editZonaId ? 'Salvar' : 'Criar'}</button>
              <button style={outlineBtn()} onClick={resetZonaForm}>Limpar</button>
            </div>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 16 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                {['Código', 'Nome', 'Ações'].map((h) => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {zonasQuery.isLoading && <tr><td colSpan={3} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Carregando...</td></tr>}
              {!zonasQuery.isLoading && (zonasQuery.data ?? []).map((item: Zona) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6', background: editZonaId === item.id ? '#f0fdf4' : 'white' }}>
                  <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontWeight: 600, color: '#059669' }}>{item.codigo}</td>
                  <td style={{ padding: '10px 12px' }}>{item.nome}</td>
                  <td style={{ padding: '10px 12px', display: 'flex', gap: 8 }}>
                    <button style={outlineBtn(true)} onClick={() => selectZona(item)}>Editar</button>
                    <button style={{ ...outlineBtn(true), color: '#dc2626', borderColor: '#fca5a5' }} onClick={() => removeZona(item.id)}>Apagar</button>
                  </td>
                </tr>
              ))}
              {!zonasQuery.isLoading && (zonasQuery.data ?? []).length === 0 && (
                <tr><td colSpan={3} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Nenhuma zona cadastrada</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'mapa' && (
        <div style={{ flex: 1, overflow: 'hidden', borderRadius: 12, border: '1px solid #e5e7eb', height: 500 }}>
          <SIGMap compact />
        </div>
      )}
    </div>
  )
}
