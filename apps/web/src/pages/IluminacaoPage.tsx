import { useState, useEffect, type CSSProperties } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import jsPDF from 'jspdf'
import api from '../lib/api'
import { SIGMap } from '../components/map/SIGMap'
import { useMapStore } from '../store/map.store'
import { fetchStaticMapImage } from '../lib/staticMap'
import toast from 'react-hot-toast'

const SITUACAO_LABEL: Record<string, string> = {
  aberta: 'Aberta', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada'
}
const SITUACAO_COLOR: Record<string, string> = {
  aberta: '#ef4444', em_andamento: '#f59e0b', concluida: '#22c55e', cancelada: '#9ca3af'
}

function geoJsonToLatLng(geometry: any): [number, number] | null {
  if (!geometry || geometry.type !== 'Point') return null
  const [lng, lat] = geometry.coordinates
  return [lat, lng]
}

const SITUACAO_POSTE: Record<string, string> = {
  normal: 'Normal', defeito: 'Com defeito', em_manutencao: 'Em manutenção',
}

type ItemOS = { estoqueId: string; produtoNome: string; unidade: string; quantidade: number; saldoMax: number }

export function IluminacaoPage() {
  const [tab, setTab] = useState<'mapa' | 'postes' | 'os' | 'estoque'>('os')
  const [situacaoFilter, setSituacaoFilter] = useState('')
  const [modalOS, setModalOS] = useState(false)
  const [formOS, setFormOS] = useState({ tipoDefeitoId: '', equipeId: '', observacoes: '' })
  const [itensOS, setItensOS] = useState<ItemOS[]>([])
  const qc = useQueryClient()
  const { flyToFeature, setPendingTarget, activeLayers, toggleLayer, selectedPosteId, selectPoste, refreshPostes } = useMapStore()

  // Ao clicar em poste no mapa, troca para aba Postes (req 59)
  useEffect(() => {
    if (selectedPosteId) setTab('postes')
  }, [selectedPosteId])

  const { data: ordens } = useQuery({
    queryKey: ['os-ip', situacaoFilter],
    queryFn: () =>
      api.get(`/iluminacao/os${situacaoFilter ? `?situacao=${situacaoFilter}` : ''}`).then(r => r.data),
  })

  const { data: postes } = useQuery({
    queryKey: ['postes-lista'],
    queryFn: () => api.get('/iluminacao/postes').then(r => r.data),
    enabled: tab === 'postes',
  })

  const { data: posteDetalhe } = useQuery({
    queryKey: ['poste-detalhe', selectedPosteId],
    queryFn: () => api.get(`/iluminacao/postes/${selectedPosteId}`).then(r => r.data),
    enabled: !!selectedPosteId,
  })

  const { data: posteOS = [] } = useQuery({
    queryKey: ['poste-os', selectedPosteId],
    queryFn: () => api.get(`/iluminacao/postes/${selectedPosteId}/os`).then(r => r.data),
    enabled: !!selectedPosteId,
  })

  // Composição do poste — itens vinculados a lote de estoque (req 56)
  const { data: posteItens = [] } = useQuery<any[]>({
    queryKey: ['poste-itens', selectedPosteId],
    queryFn: () => api.get(`/iluminacao/postes/${selectedPosteId}/itens`).then(r => r.data),
    enabled: !!selectedPosteId,
  })

  const { data: estoque } = useQuery({
    queryKey: ['estoque'],
    queryFn: () => api.get('/iluminacao/estoque').then(r => r.data),
    enabled: tab === 'estoque',
  })

  const { data: tiposDefeito = [] } = useQuery<{ id: string; nome: string }[]>({
    queryKey: ['tipos-defeito'],
    queryFn: () => api.get('/iluminacao/tipos-defeito').then(r => r.data),
  })

  const { data: equipes = [] } = useQuery<{ id: string; nome: string }[]>({
    queryKey: ['equipes'],
    queryFn: () => api.get('/iluminacao/equipes').then(r => r.data),
  })

  const { data: itensEstoque = [] } = useQuery<any[]>({
    queryKey: ['estoque-itens-os'],
    queryFn: () => api.get('/iluminacao/estoque/itens').then(r => r.data),
    enabled: modalOS || !!selectedPosteId,
  })

  const criarOS = useMutation({
    mutationFn: () => api.post('/iluminacao/os', {
      posteId: selectedPosteId,
      tipoDefeitoId: formOS.tipoDefeitoId || undefined,
      equipeId: formOS.equipeId || undefined,
      observacoes: formOS.observacoes || undefined,
      itens: itensOS.map(i => ({ estoqueId: i.estoqueId, quantidade: i.quantidade })),
    }),
    onSuccess: () => {
      toast.success('OS aberta')
      qc.invalidateQueries({ queryKey: ['os-ip'] })
      qc.invalidateQueries({ queryKey: ['poste-os', selectedPosteId] })
      qc.invalidateQueries({ queryKey: ['estoque-itens-os'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
      refreshPostes()
      setModalOS(false)
      setFormOS({ tipoDefeitoId: '', equipeId: '', observacoes: '' })
      setItensOS([])
    },
    onError: () => toast.error('Erro ao abrir OS'),
  })

  function addItemOS(item: any) {
    if (itensOS.find(i => i.estoqueId === item.id)) return
    setItensOS(prev => [...prev, { estoqueId: item.id, produtoNome: item.produto_nome, unidade: item.unidade, quantidade: 1, saldoMax: item.quantidade }])
  }

  function updateQtdItemOS(estoqueId: string, qtd: number) {
    setItensOS(prev => prev.map(i => i.estoqueId === estoqueId ? { ...i, quantidade: qtd } : i))
  }

  function removeItemOS(estoqueId: string) {
    setItensOS(prev => prev.filter(i => i.estoqueId !== estoqueId))
  }

  // Composição do poste — adicionar/remover itens vinculados a lote de estoque (req 56)
  const [novoItemEstoqueId, setNovoItemEstoqueId] = useState('')
  const [novoItemQtd, setNovoItemQtd] = useState(1)

  const adicionarItemPoste = useMutation({
    mutationFn: () => api.post(`/iluminacao/postes/${selectedPosteId}/itens`, {
      estoqueId: novoItemEstoqueId,
      quantidade: novoItemQtd,
    }),
    onSuccess: () => {
      toast.success('Item vinculado ao poste')
      qc.invalidateQueries({ queryKey: ['poste-itens', selectedPosteId] })
      qc.invalidateQueries({ queryKey: ['estoque-itens-os'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
      setNovoItemEstoqueId('')
      setNovoItemQtd(1)
    },
    onError: () => toast.error('Erro ao vincular item — verifique o saldo do lote'),
  })

  const removerItemPoste = useMutation({
    mutationFn: (itemId: string) => api.delete(`/iluminacao/postes/${selectedPosteId}/itens/${itemId}`),
    onSuccess: () => {
      toast.success('Item removido do poste — saldo devolvido ao estoque')
      qc.invalidateQueries({ queryKey: ['poste-itens', selectedPosteId] })
      qc.invalidateQueries({ queryKey: ['estoque-itens-os'] })
      qc.invalidateQueries({ queryKey: ['estoque'] })
    },
    onError: () => toast.error('Erro ao remover item'),
  })

  const updateSituacao = useMutation({
    mutationFn: ({ id, situacao }: { id: string; situacao: string }) =>
      api.patch(`/iluminacao/os/${id}/situacao`, { situacao }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['os-ip'] })
      qc.invalidateQueries({ queryKey: ['poste-detalhe', selectedPosteId] })
      refreshPostes()
      toast.success('OS atualizada')
    },
  })

  function handleVerNoMapa(geometry: any) {
    const coords = geoJsonToLatLng(geometry)
    if (!coords) { toast.error('Poste sem localização cadastrada'); return }
    const [lat, lng] = coords
    if (!activeLayers.includes('postes')) toggleLayer('postes')
    if (tab === 'mapa') {
      flyToFeature(lat, lng, 'postes')
    } else {
      setTab('mapa')
      setPendingTarget({ lat, lng, zoom: 18 })
    }
  }

  function handlePosteNoMapa(geometry: any) {
    const coords = geoJsonToLatLng(geometry)
    if (!coords) { toast.error('Poste sem localização cadastrada'); return }
    const [lat, lng] = coords
    if (!activeLayers.includes('postes')) toggleLayer('postes')
    setTab('mapa')
    setPendingTarget({ lat, lng, zoom: 19 })
  }

  // Impressão da OS com mapa de localização do poste (req 70)
  async function imprimirOS(os: any) {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const coords = geoJsonToLatLng(os.poste_geometry)
    const mapImg = coords ? await fetchStaticMapImage(coords[0], coords[1], 17) : null

    pdf.setFontSize(16)
    pdf.text('Ordem de Serviço — Iluminação Pública', 14, 20)
    pdf.setFontSize(10)
    pdf.text(`OS: ${os.id}`, 14, 30)
    pdf.text(`Poste: ${os.poste_codigo ?? '—'}`, 14, 36)
    pdf.text(`Defeito: ${os.tipo_defeito ?? '—'}`, 14, 42)
    pdf.text(`Equipe: ${os.equipe_nome ?? '—'}`, 14, 48)
    pdf.text(`Situação: ${SITUACAO_LABEL[os.situacao] ?? os.situacao}`, 14, 54)
    pdf.text(`Aberta em: ${new Date(os.aberta_em ?? os.created_at).toLocaleString('pt-BR')}`, 14, 60)
    if (os.concluida_em) pdf.text(`Concluída em: ${new Date(os.concluida_em).toLocaleString('pt-BR')}`, 14, 66)

    let y = os.concluida_em ? 76 : 70
    pdf.setFontSize(11)
    pdf.text('Localização do poste', 14, y)
    pdf.setFontSize(10)
    y += 7
    if (os.logradouro_nome) { pdf.text(`Logradouro: ${os.logradouro_nome}`, 14, y); y += 6 }
    if (coords) {
      const [lat, lng] = coords
      pdf.text(`Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`, 14, y)
      y += 6
      pdf.text(`Google Maps: https://www.google.com/maps?q=${lat},${lng}`, 14, y)
      y += 8
    } else {
      pdf.text('Coordenadas não disponíveis para este poste.', 14, y)
      y += 8
    }

    if (mapImg) {
      // 768×512px → 3:2 → 130×87 mm (cabe na mesma página com margem)
      pdf.addImage(mapImg, 'JPEG', 14, y, 130, 87)
      pdf.setFontSize(7)
      pdf.text('© OpenStreetMap contributors', 14, y + 88)
      y += 96
    }

    if (os.observacoes) {
      pdf.setFontSize(11)
      pdf.text('Observações da OS', 14, y)
      pdf.setFontSize(9)
      y += 6
      pdf.text(pdf.splitTextToSize(os.observacoes, 182), 14, y)
    }

    pdf.setFontSize(8)
    pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, pdf.internal.pageSize.height - 10)
    pdf.save(`OS_${os.id.slice(0, 8)}.pdf`)
  }

  const TABS = [
    { id: 'mapa', label: 'Mapa de Postes' },
    { id: 'postes', label: 'Postes' },
    { id: 'os', label: 'Ordens de Serviço' },
    { id: 'estoque', label: 'Estoque' },
  ] as const

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Abas */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', background: 'white', flexShrink: 0 }}>
        {TABS.map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '12px 24px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: tab === t.id ? 700 : 400,
              color: tab === t.id ? '#2563eb' : '#6b7280',
              borderBottom: tab === t.id ? '2px solid #2563eb' : '2px solid transparent',
              marginBottom: -2,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, overflow: 'hidden' }}>
        {tab === 'mapa' && (
          <div style={{ height: '100%' }}>
            <SIGMap />
          </div>
        )}

        {tab === 'postes' && (
          <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            {/* Tabela de postes */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, overflow: 'hidden' }}>
              <div style={{ flex: 1, overflow: 'auto' }}>
                <h3 style={{ margin: '0 0 16px', color: '#1e3a5f' }}>Postes Cadastrados</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    {['Código', 'Tipo', 'Situação', 'Ver no Mapa'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {postes?.map((p: any) => (
                    <tr
                      key={p.id}
                      onClick={() => selectPoste(selectedPosteId === p.id ? null : p.id)}
                      style={{
                        borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                        background: selectedPosteId === p.id ? '#eff6ff' : 'white',
                      }}
                    >
                      <td style={{ padding: '9px 12px', fontWeight: 600 }}>{p.codigo}</td>
                      <td style={{ padding: '9px 12px' }}>{p.tipo ?? '—'}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{
                          background: (SITUACAO_COLOR[p.situacao] ?? '#9ca3af') + '22',
                          color: SITUACAO_COLOR[p.situacao] ?? '#9ca3af',
                          padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                        }}>
                          {SITUACAO_LABEL[p.situacao] ?? p.situacao}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        {p.geometry ? (
                          <button
                            onClick={e => { e.stopPropagation(); handlePosteNoMapa(p.geometry) }}
                            style={btnMap}
                          >
                            📍 Ver
                          </button>
                        ) : <span style={{ color: '#9ca3af', fontSize: 12 }}>Sem coord.</span>}
                      </td>
                    </tr>
                  ))}
                  {(!postes || postes.length === 0) && (
                    <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>Nenhum poste cadastrado</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            <div style={{ marginTop: 14, height: 260, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
              <SIGMap compact />
            </div>
            </div>

            {/* Painel lateral — detalhes + OS do poste selecionado (req 59, 64, 69) */}
            {selectedPosteId && (
              <div style={{ width: 320, borderLeft: '1px solid #e5e7eb', background: 'white', overflowY: 'auto', padding: 20, flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h4 style={{ margin: 0, color: '#1e3a5f', fontSize: 15 }}>Poste {posteDetalhe?.codigo ?? '...'}</h4>
                  <button onClick={() => selectPoste(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af' }}>✕</button>
                </div>

                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                  Tipo: <strong style={{ color: '#111' }}>{posteDetalhe?.tipo ?? '—'}</strong>
                </div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                  Situação: <strong style={{ color: '#111' }}>{SITUACAO_POSTE[posteDetalhe?.situacao] ?? posteDetalhe?.situacao ?? '—'}</strong>
                </div>
                {posteDetalhe?.logradouro_nome && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                    Logradouro: <strong style={{ color: '#111' }}>{posteDetalhe.logradouro_nome}</strong>
                  </div>
                )}
                {posteDetalhe?.potencia_w && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
                    Potência: <strong style={{ color: '#111' }}>{posteDetalhe.potencia_w} W</strong>
                  </div>
                )}

                <button
                  onClick={() => posteDetalhe?.geometry && handlePosteNoMapa(posteDetalhe.geometry)}
                  style={{ ...btnMap, width: '100%', textAlign: 'center', marginBottom: 8 }}
                >
                  📍 Ver no Mapa
                </button>
                <button
                  onClick={() => setModalOS(true)}
                  style={{ width: '100%', textAlign: 'center', marginBottom: 16, padding: '6px 12px', background: '#dc2626', color: 'white', border: 'none', borderRadius: 5, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                >
                  + Abrir OS
                </button>

                {/* Composição do poste — itens vinculados a lote de estoque (req 56) */}
                <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 8px' }}>
                  Composição do Poste ({posteItens.length})
                </p>

                {itensEstoque.filter((i: any) => i.quantidade > 0).length > 0 && (
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    <select value={novoItemEstoqueId} onChange={e => setNovoItemEstoqueId(e.target.value)}
                      style={{ flex: 1, padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }}>
                      <option value="">+ Vincular item do estoque...</option>
                      {itensEstoque.filter((i: any) => i.quantidade > 0).map((i: any) => (
                        <option key={i.id} value={i.id}>
                          {i.produto_nome}{i.lote_serie ? ` — lote ${i.lote_serie}` : ''} ({i.local_nome}, saldo: {i.quantidade} {i.unidade})
                        </option>
                      ))}
                    </select>
                    <input type="number" min={1} value={novoItemQtd}
                      onChange={e => setNovoItemQtd(Math.max(1, Number(e.target.value)))}
                      style={{ width: 50, padding: '6px 4px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, textAlign: 'center' }} />
                    <button
                      onClick={() => novoItemEstoqueId && adicionarItemPoste.mutate()}
                      disabled={!novoItemEstoqueId || adicionarItemPoste.isPending}
                      style={{ padding: '6px 10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                    >
                      +
                    </button>
                  </div>
                )}

                {posteItens.length === 0 && (
                  <p style={{ fontSize: 12, color: '#9ca3af' }}>Nenhum item vinculado</p>
                )}
                {posteItens.map((item: any) => (
                  <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '6px 8px', background: '#f9fafb', borderRadius: 6, fontSize: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600 }}>{item.produto_nome}{item.familia ? ` (${item.familia})` : ''}</div>
                      <div style={{ color: '#6b7280' }}>
                        {item.lote_serie ? `Lote ${item.lote_serie} — ` : ''}{item.local_nome} · {item.quantidade} {item.unidade}
                      </div>
                    </div>
                    <button onClick={() => removerItemPoste.mutate(item.id)}
                      disabled={removerItemPoste.isPending}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, padding: '0 2px' }}>✕</button>
                  </div>
                ))}

                <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '16px 0 8px' }}>
                  Ordens de Serviço ({posteOS.length})
                </p>

                {posteOS.length === 0 && (
                  <p style={{ fontSize: 12, color: '#9ca3af' }}>Sem OS registradas</p>
                )}
                {(posteOS as any[]).map((os: any) => (
                  <div
                    key={os.id}
                    style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', marginBottom: 8, fontSize: 12 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{os.tipo_defeito ?? 'Defeito'}</span>
                      <span style={{
                        background: SITUACAO_COLOR[os.situacao] + '22',
                        color: SITUACAO_COLOR[os.situacao],
                        padding: '1px 6px', borderRadius: 10, fontWeight: 600,
                      }}>
                        {SITUACAO_LABEL[os.situacao] ?? os.situacao}
                      </span>
                    </div>
                    {os.equipe_nome && <div style={{ color: '#6b7280' }}>Equipe: {os.equipe_nome}</div>}
                    <div style={{ color: '#9ca3af', marginTop: 2 }}>
                      {new Date(os.created_at).toLocaleDateString('pt-BR')}
                    </div>
                  </div>
                ))}
              </div>
            )}
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

            <div style={{ marginBottom: 16, height: 240, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
              <SIGMap compact />
            </div>

            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                  {['OS', 'Poste', 'Defeito', 'Equipe', 'Situação', 'Aberta em', 'Mapa', 'Ação'].map(h => (
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
                      {new Date(os.aberta_em ?? os.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      {os.poste_geometry ? (
                        <button
                          onClick={() => handleVerNoMapa(os.poste_geometry)}
                          style={btnMap}
                          title="Localizar poste no mapa"
                        >
                          📍 Ver
                        </button>
                      ) : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                    </td>
                    <td style={{ padding: '9px 12px' }}>
                      {os.situacao === 'aberta' && (
                        <button
                          onClick={() => updateSituacao.mutate({ id: os.id, situacao: 'em_andamento' })}
                          style={{ padding: '4px 10px', background: '#f59e0b', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                        >
                          Iniciar
                        </button>
                      )}
                      {os.situacao === 'em_andamento' && (
                        <button
                          onClick={() => updateSituacao.mutate({ id: os.id, situacao: 'concluida' })}
                          style={{ padding: '4px 10px', background: '#22c55e', color: 'white', border: 'none', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
                        >
                          Concluir
                        </button>
                      )}
                      <button
                        onClick={() => imprimirOS(os)}
                        style={{ ...btnMap, marginLeft: 6 }}
                        title="Imprimir OS com dados de localização do poste"
                      >
                        🖨 Imprimir
                      </button>
                    </td>
                  </tr>
                ))}
                {(!ordens || ordens.length === 0) && (
                  <tr>
                    <td colSpan={8} style={{ padding: 40, textAlign: 'center', color: '#9ca3af' }}>
                      <p style={{ margin: '0 0 4px', fontWeight: 600 }}>Nenhuma OS encontrada</p>
                      <p style={{ margin: 0, fontSize: 12 }}>
                        As ordens de serviço aparecem aqui quando postes forem cadastrados no mapa.
                      </p>
                    </td>
                  </tr>
                )}
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
      {/* Modal Nova OS (req 71) */}
      {modalOS && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: 'white', borderRadius: 10, padding: 24, width: 500, maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
              <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: 16 }}>Abrir OS — Poste {posteDetalhe?.codigo}</h3>
              <button onClick={() => setModalOS(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, color: '#9ca3af' }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Tipo de Defeito</label>
                <select value={formOS.tipoDefeitoId} onChange={e => setFormOS(f => ({ ...f, tipoDefeitoId: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                  <option value="">Selecione...</option>
                  {tiposDefeito.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Equipe</label>
                <select value={formOS.equipeId} onChange={e => setFormOS(f => ({ ...f, equipeId: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}>
                  <option value="">Selecione...</option>
                  {equipes.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Observações</label>
                <input value={formOS.observacoes} onChange={e => setFormOS(f => ({ ...f, observacoes: e.target.value }))}
                  style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box' }} />
              </div>

              {/* Materiais utilizados (req 71) */}
              <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: 12 }}>
                <p style={{ margin: '0 0 8px', fontSize: 12, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                  Materiais utilizados (opcional)
                </p>
                {itensEstoque.filter((i: any) => i.quantidade > 0 && !itensOS.find(x => x.estoqueId === i.id)).length > 0 && (
                  <select defaultValue="" onChange={e => { const item = itensEstoque.find((i: any) => i.id === e.target.value); if (item) addItemOS(item); e.target.value = '' }}
                    style={{ width: '100%', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, marginBottom: 8 }}>
                    <option value="">+ Adicionar material do estoque...</option>
                    {itensEstoque.filter((i: any) => i.quantidade > 0 && !itensOS.find(x => x.estoqueId === i.id)).map((i: any) => (
                      <option key={i.id} value={i.id}>{i.produto_nome} — {i.local_nome} (saldo: {i.quantidade} {i.unidade})</option>
                    ))}
                  </select>
                )}
                {itensOS.length === 0 && (
                  <p style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>Nenhum material adicionado</p>
                )}
                {itensOS.map(item => (
                  <div key={item.estoqueId} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, padding: '6px 8px', background: '#f9fafb', borderRadius: 6, fontSize: 13 }}>
                    <span style={{ flex: 1, fontWeight: 500 }}>{item.produtoNome}</span>
                    <input type="number" min={1} max={item.saldoMax} value={item.quantidade}
                      onChange={e => updateQtdItemOS(item.estoqueId, Math.min(Number(e.target.value), item.saldoMax))}
                      style={{ width: 60, padding: '3px 6px', border: '1px solid #d1d5db', borderRadius: 4, fontSize: 13, textAlign: 'center' }} />
                    <span style={{ color: '#6b7280', fontSize: 12 }}>{item.unidade}</span>
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>/ {item.saldoMax}</span>
                    <button onClick={() => removeItemOS(item.estoqueId)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', fontSize: 16, padding: '0 2px' }}>✕</button>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20 }}>
              <button onClick={() => setModalOS(false)}
                style={{ background: 'white', color: '#374151', border: '1px solid #d1d5db', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                Cancelar
              </button>
              <button onClick={() => criarOS.mutate()} disabled={criarOS.isPending}
                style={{ background: '#dc2626', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {criarOS.isPending ? 'Abrindo...' : 'Abrir OS'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const btnMap: CSSProperties = {
  padding: '3px 8px', background: '#eff6ff', color: '#2563eb',
  border: '1px solid #bfdbfe', borderRadius: 5, cursor: 'pointer',
  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
}
