import { useState, useEffect, type CSSProperties } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import jsPDF from 'jspdf'
import api from '../lib/api'
import { SIGMap } from '../components/map/SIGMap'
import { useMapStore } from '../store/map.store'
import { fetchStaticMapImage } from '../lib/staticMap'
import toast from 'react-hot-toast'

type BoletimForm = {
  altura_m: string
  dap_cm: string
  estado_fitossanitario: string
  situacao_calcada: string
  conflito_rede: boolean
  observacoes: string
}

type OS = {
  id: string
  arvore_codigo: number
  especie: string
  tipo: string
  situacao: string
  observacoes: string
  created_at: string
  concluida_em: string | null
  equipe_nome: string | null
  logradouro_nome?: string | null
  arvore_geometry: { type: string; coordinates: [number, number] } | null
}

const SITUACOES: Record<string, { label: string; color: string }> = {
  pendente:      { label: 'Pendente',      color: '#f59e0b' },
  em_andamento:  { label: 'Em andamento',  color: '#3b82f6' },
  concluida:     { label: 'Concluída',     color: '#10b981' },
  cancelada:     { label: 'Cancelada',     color: '#9ca3af' },
}

function geoJsonToLatLng(geometry: any): [number, number] | null {
  if (!geometry || geometry.type !== 'Point') return null
  const [lng, lat] = geometry.coordinates
  return [lat, lng]
}

export function ArboriacaoPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'mapa' | 'arvores' | 'os'>('os')
  const [filtro, setFiltro] = useState('')
  const [novaOS, setNovaOS] = useState(false)
  const [form, setForm] = useState({ arvoreId: '', tipo: 'Poda', observacoes: '' })
  const [boletim, setBoletim] = useState<BoletimForm>({ altura_m: '', dap_cm: '', estado_fitossanitario: '', situacao_calcada: '', conflito_rede: false, observacoes: '' })
  const [boletimSalvando, setBoletimSalvando] = useState(false)
  const { flyToFeature, setPendingTarget, activeLayers, toggleLayer, selectedArvoreId, selectArvore, refreshArvores } = useMapStore()

  // Ao clicar em árvore no mapa, troca para aba Árvores (req 75)
  useEffect(() => {
    if (selectedArvoreId) setTab('arvores')
  }, [selectedArvoreId])

  const { data: osList = [] } = useQuery<OS[]>({
    queryKey: ['arborizacao-os', filtro],
    queryFn: () => api.get(`/arborizacao/os${filtro ? `?situacao=${filtro}` : ''}`).then(r => r.data),
  })

  const { data: arvores = [] } = useQuery<{ id: string; codigo: number; especie: string; situacao?: string; geometry?: any }[]>({
    queryKey: ['arvores-lista'],
    queryFn: () => api.get('/arborizacao/arvores').then(r => r.data),
    enabled: tab === 'arvores' || novaOS,
  })

  const { data: arvoreDetalhe } = useQuery({
    queryKey: ['arvore-detalhe', selectedArvoreId],
    queryFn: () => api.get(`/arborizacao/arvores/${selectedArvoreId}`).then(r => r.data),
    enabled: !!selectedArvoreId,
  })

  // Preenche formulário do boletim com dados atuais da árvore
  useEffect(() => {
    if (!arvoreDetalhe) return
    setBoletim({
      altura_m: arvoreDetalhe.altura_m != null ? String(arvoreDetalhe.altura_m) : '',
      dap_cm: arvoreDetalhe.dap_cm != null ? String(arvoreDetalhe.dap_cm) : '',
      estado_fitossanitario: arvoreDetalhe.estado_fitossanitario ?? '',
      situacao_calcada: arvoreDetalhe.situacao_calcada ?? '',
      conflito_rede: arvoreDetalhe.conflito_rede ?? false,
      observacoes: arvoreDetalhe.observacoes ?? '',
    })
  }, [arvoreDetalhe])

  const { data: arvoreOS = [] } = useQuery({
    queryKey: ['arvore-os', selectedArvoreId],
    queryFn: () => api.get(`/arborizacao/arvores/${selectedArvoreId}/os`).then(r => r.data),
    enabled: !!selectedArvoreId,
  })

  const criar = useMutation({
    mutationFn: () => api.post('/arborizacao/os', form),
    onSuccess: () => {
      toast.success('OS criada')
      qc.invalidateQueries({ queryKey: ['arborizacao-os'] })
      qc.invalidateQueries({ queryKey: ['arvore-detalhe', form.arvoreId] })
      refreshArvores()
      setNovaOS(false)
      setForm({ arvoreId: '', tipo: 'Poda', observacoes: '' })
    },
    onError: () => toast.error('Erro ao criar OS'),
  })

  const atualizarSituacao = useMutation({
    mutationFn: ({ id, situacao }: { id: string; situacao: string }) =>
      api.patch(`/arborizacao/os/${id}/situacao`, { situacao }),
    onSuccess: () => {
      toast.success('Situação atualizada')
      qc.invalidateQueries({ queryKey: ['arborizacao-os'] })
      qc.invalidateQueries({ queryKey: ['arvore-detalhe', selectedArvoreId] })
      refreshArvores()
    },
  })

  async function salvarBoletim() {
    if (!selectedArvoreId) return
    setBoletimSalvando(true)
    try {
      await api.patch(`/arborizacao/arvores/${selectedArvoreId}`, {
        altura_m: boletim.altura_m !== '' ? Number(boletim.altura_m) : undefined,
        dap_cm: boletim.dap_cm !== '' ? Number(boletim.dap_cm) : undefined,
        estado_fitossanitario: boletim.estado_fitossanitario || undefined,
        situacao_calcada: boletim.situacao_calcada || undefined,
        conflito_rede: boletim.conflito_rede,
        observacoes: boletim.observacoes || undefined,
      })
      toast.success('Boletim cadastral salvo')
      qc.invalidateQueries({ queryKey: ['arvore-detalhe', selectedArvoreId] })
      qc.invalidateQueries({ queryKey: ['arvores-lista'] })
    } catch {
      toast.error('Erro ao salvar boletim')
    } finally {
      setBoletimSalvando(false)
    }
  }

  function handleVerNoMapa(geometry: any) {
    const coords = geoJsonToLatLng(geometry)
    if (!coords) { toast.error('Árvore sem localização cadastrada'); return }
    const [lat, lng] = coords
    if (!activeLayers.includes('arvores')) toggleLayer('arvores')
    if (tab === 'mapa') {
      flyToFeature(lat, lng, 'arvores')
    } else {
      setTab('mapa')
      setPendingTarget({ lat, lng, zoom: 19 })
    }
  }

  // Impressão da OS com mapa de localização da árvore (req 86)
  async function imprimirOS(os: OS) {
    const sit = SITUACOES[os.situacao] ?? { label: os.situacao, color: '#9ca3af' }
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const coords = geoJsonToLatLng(os.arvore_geometry)
    const mapImg = coords ? await fetchStaticMapImage(coords[0], coords[1], 17) : null

    pdf.setFontSize(16)
    pdf.text('Ordem de Serviço — Arborização', 14, 20)
    pdf.setFontSize(10)
    pdf.text(`OS: ${os.id}`, 14, 30)
    pdf.text(`Árvore: #${os.arvore_codigo} — ${os.especie ?? '—'}`, 14, 36)
    pdf.text(`Tipo de serviço: ${os.tipo}`, 14, 42)
    pdf.text(`Equipe: ${os.equipe_nome ?? '—'}`, 14, 48)
    pdf.text(`Situação: ${sit.label}`, 14, 54)
    pdf.text(`Aberta em: ${new Date(os.created_at).toLocaleString('pt-BR')}`, 14, 60)
    if (os.concluida_em) pdf.text(`Concluída em: ${new Date(os.concluida_em).toLocaleString('pt-BR')}`, 14, 66)

    let y = os.concluida_em ? 76 : 70
    pdf.setFontSize(11)
    pdf.text('Localização da árvore', 14, y)
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
      pdf.text('Coordenadas não disponíveis para esta árvore.', 14, y)
      y += 8
    }

    if (mapImg) {
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

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Abas */}
      <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #e5e7eb', background: 'white', flexShrink: 0 }}>
        {([
          { id: 'mapa', label: 'Mapa de Árvores' },
          { id: 'arvores', label: 'Árvores' },
          { id: 'os', label: 'Ordens de Serviço' },
        ] as const).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '12px 24px', border: 'none', background: 'none', cursor: 'pointer',
              fontSize: 14, fontWeight: tab === t.id ? 700 : 400,
              color: tab === t.id ? '#16a34a' : '#6b7280',
              borderBottom: tab === t.id ? '2px solid #16a34a' : '2px solid transparent',
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

        {tab === 'arvores' && (
          <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
            {/* Tabela de árvores */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 20, overflow: 'hidden' }}>
              <div style={{ flex: 1, overflow: 'auto' }}>
                <h3 style={{ margin: '0 0 16px', color: '#1e3a5f' }}>Árvores Cadastradas</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
                    {['Código', 'Espécie', 'Situação', 'Ver no Mapa'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {arvores.map(a => (
                    <tr
                      key={a.id}
                      onClick={() => selectArvore(selectedArvoreId === a.id ? null : a.id)}
                      style={{
                        borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                        background: selectedArvoreId === a.id ? '#f0fdf4' : 'white',
                      }}
                    >
                      <td style={{ padding: '9px 12px', fontWeight: 600 }}>#{a.codigo}</td>
                      <td style={{ padding: '9px 12px' }}>{a.especie ?? '—'}</td>
                      <td style={{ padding: '9px 12px' }}>
                        <span style={{
                          background: '#16a34a22', color: '#16a34a',
                          padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600,
                        }}>
                          {a.situacao ?? 'Ativa'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px' }}>
                        {a.geometry ? (
                          <button
                            onClick={e => { e.stopPropagation(); handleVerNoMapa(a.geometry) }}
                            style={btnMap}
                          >
                            📍 Ver
                          </button>
                        ) : <span style={{ color: '#9ca3af', fontSize: 12 }}>Sem coord.</span>}
                      </td>
                    </tr>
                  ))}
                  {arvores.length === 0 && (
                    <tr><td colSpan={4} style={{ padding: 30, textAlign: 'center', color: '#9ca3af' }}>Nenhuma árvore cadastrada</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            </div>

            {/* Painel lateral — detalhes + OS da árvore selecionada (req 75, 80, 85) */}
            {selectedArvoreId && (
              <div style={{ width: 320, borderLeft: '1px solid #e5e7eb', background: 'white', overflowY: 'auto', padding: 20, flexShrink: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <h4 style={{ margin: 0, color: '#1e3a5f', fontSize: 15 }}>
                    Árvore #{arvoreDetalhe?.codigo ?? '...'}
                  </h4>
                  <button onClick={() => selectArvore(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af' }}>✕</button>
                </div>

                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                  Espécie: <strong style={{ color: '#111' }}>{arvoreDetalhe?.especie ?? '—'}</strong>
                </div>
                {arvoreDetalhe?.logradouro_nome && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                    Logradouro: <strong style={{ color: '#111' }}>{arvoreDetalhe.logradouro_nome}</strong>
                  </div>
                )}
                {arvoreDetalhe?.numero_predial && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                    Número: <strong style={{ color: '#111' }}>{arvoreDetalhe.numero_predial}</strong>
                  </div>
                )}
                {arvoreDetalhe?.data_plantio && (
                  <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
                    Plantio: <strong style={{ color: '#111' }}>{new Date(arvoreDetalhe.data_plantio).toLocaleDateString('pt-BR')}</strong>
                  </div>
                )}

                {arvoreDetalhe?.geometry && (
                  <button
                    onClick={() => handleVerNoMapa(arvoreDetalhe.geometry)}
                    style={{ ...btnMap, width: '100%', textAlign: 'center', marginBottom: 16 }}
                  >
                    📍 Ver no Mapa
                  </button>
                )}

                {/* Boletim Cadastral (req 72) */}
                <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 8px' }}>
                  Boletim Cadastral
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 2 }}>Altura (m)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={boletim.altura_m}
                        onChange={e => setBoletim(b => ({ ...b, altura_m: e.target.value }))}
                        style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 2 }}>DAP (cm)</label>
                      <input
                        type="number"
                        min={0}
                        step={0.1}
                        value={boletim.dap_cm}
                        onChange={e => setBoletim(b => ({ ...b, dap_cm: e.target.value }))}
                        style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box' }}
                      />
                    </div>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 2 }}>Estado fitossanitário</label>
                    <select
                      value={boletim.estado_fitossanitario}
                      onChange={e => setBoletim(b => ({ ...b, estado_fitossanitario: e.target.value }))}
                      style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12 }}
                    >
                      <option value="">— selecione —</option>
                      {['Ótimo', 'Bom', 'Regular', 'Ruim', 'Crítico', 'Morta'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 2 }}>Situação da calçada</label>
                    <select
                      value={boletim.situacao_calcada}
                      onChange={e => setBoletim(b => ({ ...b, situacao_calcada: e.target.value }))}
                      style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12 }}
                    >
                      <option value="">— selecione —</option>
                      {['Sem danos', 'Levantamento leve', 'Levantamento grave', 'Calçada destruída'].map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#374151', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={boletim.conflito_rede}
                      onChange={e => setBoletim(b => ({ ...b, conflito_rede: e.target.checked }))}
                    />
                    Conflito com rede elétrica/telefônica
                  </label>
                  <div>
                    <label style={{ fontSize: 11, color: '#6b7280', display: 'block', marginBottom: 2 }}>Observações</label>
                    <textarea
                      value={boletim.observacoes}
                      onChange={e => setBoletim(b => ({ ...b, observacoes: e.target.value }))}
                      rows={3}
                      style={{ width: '100%', padding: '5px 8px', border: '1px solid #d1d5db', borderRadius: 5, fontSize: 12, boxSizing: 'border-box', resize: 'vertical' }}
                    />
                  </div>
                  <button
                    onClick={salvarBoletim}
                    disabled={boletimSalvando}
                    style={{ ...btnPrimary, padding: '6px 14px', fontSize: 12, opacity: boletimSalvando ? 0.6 : 1 }}
                  >
                    {boletimSalvando ? 'Salvando...' : 'Salvar boletim'}
                  </button>
                </div>

                <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 8px' }}>
                  Ordens de Serviço ({(arvoreOS as any[]).length})
                </p>

                {(arvoreOS as any[]).length === 0 && (
                  <p style={{ fontSize: 12, color: '#9ca3af' }}>Sem OS registradas</p>
                )}
                {(arvoreOS as any[]).map((os: any) => {
                  const sit = SITUACOES[os.situacao] ?? { label: os.situacao, color: '#9ca3af' }
                  return (
                    <div key={os.id} style={{ border: '1px solid #e5e7eb', borderRadius: 6, padding: '8px 10px', marginBottom: 8, fontSize: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600 }}>{os.tipo}</span>
                        <span style={{ background: sit.color + '22', color: sit.color, padding: '1px 6px', borderRadius: 10, fontWeight: 600 }}>
                          {sit.label}
                        </span>
                      </div>
                      {os.equipe_nome && <div style={{ color: '#6b7280' }}>Equipe: {os.equipe_nome}</div>}
                      <div style={{ color: '#9ca3af', marginTop: 2 }}>{new Date(os.created_at).toLocaleDateString('pt-BR')}</div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {tab === 'os' && (
          <div style={{ padding: 24, height: '100%', overflow: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <div>
                <h2 style={{ margin: 0, color: '#1e3a5f', fontSize: 20 }}>Arborização Urbana</h2>
                <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>
                  {osList.length} ordens de serviço
                </p>
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                <select
                  value={filtro}
                  onChange={e => setFiltro(e.target.value)}
                  style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                >
                  <option value="">Todas as situações</option>
                  {Object.entries(SITUACOES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => setNovaOS(true)}
                  style={{ background: '#15803d', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                >
                  + Nova OS
                </button>
              </div>
            </div>

            <div style={{ marginBottom: 16, height: 240, border: '1px solid #e5e7eb', borderRadius: 12, overflow: 'hidden' }}>
              <SIGMap compact />
            </div>

            {/* Modal nova OS */}
            {novaOS && (
              <div style={{
                position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000,
              }}>
                <div style={{ background: 'white', borderRadius: 10, padding: 24, width: 400, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
                  <h3 style={{ margin: '0 0 16px', color: '#1e3a5f' }}>Nova Ordem de Serviço</h3>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div>
                      <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Árvore</label>
                      <select
                        value={form.arvoreId}
                        onChange={e => setForm(f => ({ ...f, arvoreId: e.target.value }))}
                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                      >
                        <option value="">Selecione...</option>
                        {arvores.map(a => (
                          <option key={a.id} value={a.id}>#{a.codigo} — {a.especie ?? 'Sem espécie'}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Tipo de serviço</label>
                      <select
                        value={form.tipo}
                        onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
                      >
                        {['Poda', 'Remoção', 'Tratamento fitossanitário', 'Plantio', 'Emergência'].map(t => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Observações</label>
                      <textarea
                        value={form.observacoes}
                        onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))}
                        rows={3}
                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }}
                      />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                    <button onClick={() => setNovaOS(false)} style={btnSecondary}>Cancelar</button>
                    <button
                      onClick={() => criar.mutate()}
                      disabled={!form.arvoreId || criar.isPending}
                      style={btnPrimary}
                    >
                      {criar.isPending ? 'Salvando...' : 'Criar OS'}
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
                    {['Árvore', 'Espécie', 'Tipo', 'Situação', 'Equipe', 'Data', 'Mapa', 'Ações'].map(h => (
                      <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {osList.map(os => {
                    const sit = SITUACOES[os.situacao] ?? { label: os.situacao, color: '#9ca3af' }
                    return (
                      <tr key={os.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>#{os.arvore_codigo}</td>
                        <td style={{ padding: '10px 12px', color: '#374151' }}>{os.especie ?? '—'}</td>
                        <td style={{ padding: '10px 12px' }}>{os.tipo}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span style={{ background: sit.color + '22', color: sit.color, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                            {sit.label}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#6b7280' }}>{os.equipe_nome ?? '—'}</td>
                        <td style={{ padding: '10px 12px', color: '#6b7280' }}>{new Date(os.created_at).toLocaleDateString('pt-BR')}</td>
                        <td style={{ padding: '10px 12px' }}>
                          {os.arvore_geometry ? (
                            <button
                              onClick={() => handleVerNoMapa(os.arvore_geometry)}
                              style={btnMap}
                              title="Localizar árvore no mapa"
                            >
                              📍 Ver
                            </button>
                          ) : <span style={{ color: '#d1d5db', fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          {os.situacao === 'pendente' && (
                            <button
                              onClick={() => atualizarSituacao.mutate({ id: os.id, situacao: 'em_andamento' })}
                              style={{ ...btnSm, background: '#dbeafe', color: '#1d4ed8' }}
                            >
                              Iniciar
                            </button>
                          )}
                          {os.situacao === 'em_andamento' && (
                            <button
                              onClick={() => atualizarSituacao.mutate({ id: os.id, situacao: 'concluida' })}
                              style={{ ...btnSm, background: '#d1fae5', color: '#065f46' }}
                            >
                              Concluir
                            </button>
                          )}
                          <button
                            onClick={() => imprimirOS(os)}
                            style={{ ...btnMap, marginLeft: 6 }}
                            title="Imprimir OS com dados de localização da árvore"
                          >
                            🖨 Imprimir
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                  {osList.length === 0 && (
                    <tr><td colSpan={8} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>Nenhuma OS encontrada</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

const btnPrimary: CSSProperties = {
  background: '#15803d', color: 'white', border: 'none',
  padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
const btnSecondary: CSSProperties = {
  background: 'white', color: '#374151', border: '1px solid #d1d5db',
  padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
}
const btnSm: CSSProperties = {
  border: 'none', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 600,
}
const btnMap: CSSProperties = {
  padding: '3px 8px', background: '#f0fdf4', color: '#16a34a',
  border: '1px solid #bbf7d0', borderRadius: 5, cursor: 'pointer',
  fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
}
