import { useState, useEffect, useRef, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import api from '../lib/api'
import { FINALIDADES, ICONE_PATRIMONIO as ICONE } from '../lib/patrimonio'
import toast from 'react-hot-toast'

type GeoJSONGeom = { type: string; coordinates: unknown }

type Patrimonio = {
  id: string
  nome: string
  finalidade: string
  descricao: string | null
  numero_registro: string | null
  area_m2: number | null
  documento_urls: string[]
  geometry?: GeoJSONGeom | null
}

const TUPANCIRETA: [number, number] = [-29.079, -53.841]

type MapMode = null | 'draw' | 'vincular'

export function PatrimonioPage() {
  const qc = useQueryClient()
  const mapDiv = useRef<HTMLDivElement>(null)
  const lmap = useRef<L.Map | null>(null)
  const patrimonioLayers = useRef<L.LayerGroup>(L.layerGroup())
  const parcelasLayer = useRef<L.GeoJSON | null>(null)
  const drawLayer = useRef<L.FeatureGroup>(L.featureGroup())

  // Refs para acesso sem stale closure em event handlers
  const selectedRef = useRef<Patrimonio | null>(null)
  const modeRef = useRef<MapMode>(null)

  const [filtroFin, setFiltroFin] = useState('')
  const [busca, setBusca] = useState('')
  const [selected, setSelected] = useState<Patrimonio | null>(null)
  const [mapMode, setMapMode] = useState<MapMode>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ nome: '', finalidade: 'predio_publico', descricao: '', numeroRegistro: '' })
  const [salvandoGeom, setSalvandoGeom] = useState(false)

  // Sync refs
  selectedRef.current = selected
  modeRef.current = mapMode

  const { data: patrimonios = [] } = useQuery<Patrimonio[]>({
    queryKey: ['patrimonios', filtroFin, busca],
    queryFn: () => {
      const params = new URLSearchParams()
      if (filtroFin) params.set('finalidade', filtroFin)
      if (busca) params.set('q', busca)
      return api.get(`/patrimonio?${params}`).then(r => r.data)
    },
  })

  const criar = useMutation({
    mutationFn: () => api.post('/patrimonio', {
      nome: form.nome, finalidade: form.finalidade,
      descricao: form.descricao || undefined,
      numeroRegistro: form.numeroRegistro || undefined,
    }),
    onSuccess: () => {
      toast.success('Patrimônio cadastrado')
      qc.invalidateQueries({ queryKey: ['patrimonios'] })
      setShowForm(false)
      setForm({ nome: '', finalidade: 'predio_publico', descricao: '', numeroRegistro: '' })
    },
    onError: () => toast.error('Erro ao cadastrar'),
  })

  const excluir = useMutation({
    mutationFn: (id: string) => api.delete(`/patrimonio/${id}`),
    onSuccess: () => {
      toast.success('Excluído')
      qc.invalidateQueries({ queryKey: ['patrimonios'] })
      setSelected(null)
    },
  })

  const saveGeometry = useCallback(async (geom: GeoJSONGeom) => {
    const pat = selectedRef.current
    if (!pat) return
    setSalvandoGeom(true)
    try {
      await api.put(`/patrimonio/${pat.id}`, {
        nome: pat.nome, finalidade: pat.finalidade,
        descricao: pat.descricao ?? undefined,
        numeroRegistro: pat.numero_registro ?? undefined,
        documentoUrls: pat.documento_urls ?? [],
        geometry: geom,
      })
      toast.success('Geometria salva')
      qc.invalidateQueries({ queryKey: ['patrimonios'] })
    } catch {
      toast.error('Erro ao salvar geometria')
    } finally {
      setSalvandoGeom(false)
    }
  }, [qc])

  const removeGeometry = useCallback(async () => {
    const pat = selectedRef.current
    if (!pat) return
    if (!confirm('Remover a geometria deste patrimônio?')) return
    try {
      await api.put(`/patrimonio/${pat.id}`, {
        nome: pat.nome, finalidade: pat.finalidade,
        descricao: pat.descricao ?? undefined,
        numeroRegistro: pat.numero_registro ?? undefined,
        documentoUrls: pat.documento_urls ?? [],
      })
      toast.success('Geometria removida')
      qc.invalidateQueries({ queryKey: ['patrimonios'] })
    } catch {
      toast.error('Erro ao remover geometria')
    }
  }, [qc])

  // ── Init map ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mapDiv.current || lmap.current) return

    const map = L.map(mapDiv.current, { center: TUPANCIRETA, zoom: 14, zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap',
      maxZoom: 20,
    }).addTo(map)

    patrimonioLayers.current.addTo(map)
    drawLayer.current.addTo(map)

    ;(map as any).pm.setLang('ptBR', {
      tooltips: { placeMarker: 'Clique para posicionar', firstVertex: 'Primeiro vértice', continueLine: 'Continuar', finishLine: 'Clique no primeiro ponto para fechar', finishPoly: 'Clique no primeiro ponto para fechar', finishRect: 'Clique para finalizar' },
      actions: { finish: 'Finalizar', cancel: 'Cancelar', removeLastVertex: 'Remover último vértice' },
      buttonTitles: { drawPolyButton: 'Desenhar Polígono', editButton: 'Editar', deleteButton: 'Excluir' },
    }, 'en')
    ;(map as any).pm.setLang('ptBR')

    // Geoman: ouvir evento de polígono criado
    map.on('pm:create', (e: any) => {
      const geom = (e.layer as any).toGeoJSON().geometry as GeoJSONGeom
      drawLayer.current.clearLayers()
      drawLayer.current.addLayer(e.layer)
      ;(map as any).pm.disableDraw()
      saveGeometry(geom)
      setMapMode(null)
    })

    lmap.current = map
    return () => { map.remove(); lmap.current = null }
  }, [saveGeometry])

  // ── Render patrimônio layers ────────────────────────────────────────────────
  useEffect(() => {
    const group = patrimonioLayers.current
    group.clearLayers()

    patrimonios.forEach(p => {
      const isSelected = selectedRef.current?.id === p.id

      if (p.geometry && (p.geometry.type === 'Polygon' || p.geometry.type === 'MultiPolygon')) {
        const layer = L.geoJSON(p.geometry as any, {
          style: {
            color: isSelected ? '#3b82f6' : '#1e3a5f',
            fillOpacity: isSelected ? 0.35 : 0.2,
            weight: isSelected ? 3 : 1.5,
          },
        })
        layer.on('click', () => setSelected(p))
        layer.bindTooltip(p.nome, { permanent: false, sticky: true })
        group.addLayer(layer)
      } else if (p.geometry && p.geometry.type === 'Point') {
        const coords = (p.geometry.coordinates as number[])
        const latlng: [number, number] = [coords[1], coords[0]]
        const icon = L.divIcon({
          className: '',
          html: `<div style="background:${isSelected ? '#3b82f6' : '#1e3a5f'};color:white;border-radius:50%;width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:15px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)">${ICONE[p.finalidade] ?? '📍'}</div>`,
          iconSize: [32, 32],
          iconAnchor: [16, 16],
        })
        const marker = L.marker(latlng, { icon })
        marker.on('click', () => setSelected(p))
        marker.bindTooltip(p.nome)
        group.addLayer(marker)
      }
    })
  }, [patrimonios, selected?.id])

  // ── Zoom to selected ─────────────────────────────────────────────────────────
  useEffect(() => {
    const map = lmap.current
    if (!map || !selected?.geometry) return
    try {
      const bounds = L.geoJSON(selected.geometry as any).getBounds()
      if (bounds.isValid()) map.fitBounds(bounds.pad(0.4))
    } catch { /* malformed geometry */ }
  }, [selected?.id])

  // ── Draw mode ────────────────────────────────────────────────────────────────
  useEffect(() => {
    const map = lmap.current
    if (!map) return

    if (mapMode === 'draw') {
      drawLayer.current.clearLayers()
      ;(map as any).pm.enableDraw('Polygon', { snappable: true })
    } else {
      ;(map as any).pm.disableDraw()
    }
  }, [mapMode])

  // ── Vincular mode: load parcelas in view ──────────────────────────────────
  const loadParcelas = useCallback(async () => {
    const map = lmap.current
    if (!map) return
    const b = map.getBounds()
    try {
      const res = await api.get('/parcelas', {
        params: { minx: b.getWest(), miny: b.getSouth(), maxx: b.getEast(), maxy: b.getNorth() },
      })
      const items: any[] = (res.data.data ?? []).filter((p: any) => p.geometry)

      if (parcelasLayer.current) { parcelasLayer.current.remove(); parcelasLayer.current = null }

      const layer = L.geoJSON(
        { type: 'FeatureCollection', features: items.map(p => ({ type: 'Feature', properties: { id: p.id, codigo: p.codigo }, geometry: p.geometry })) } as any,
        {
          style: { color: '#f59e0b', fillColor: '#fef3c7', fillOpacity: 0.45, weight: 2 },
          onEachFeature: (feature, fl) => {
            fl.on('click', () => {
              const geom = feature.geometry as GeoJSONGeom
              saveGeometry(geom)
              toast.success(`Parcela ${feature.properties?.codigo} vinculada`)
              layer.remove()
              parcelasLayer.current = null
              setMapMode(null)
            })
            fl.bindTooltip(feature.properties?.codigo ?? '', { sticky: true })
          },
        }
      ).addTo(map)
      parcelasLayer.current = layer
    } catch {
      toast.error('Erro ao carregar parcelas para vinculação')
    }
  }, [saveGeometry])

  useEffect(() => {
    if (mapMode === 'vincular') {
      loadParcelas()
    } else {
      if (parcelasLayer.current) { parcelasLayer.current.remove(); parcelasLayer.current = null }
    }
  }, [mapMode, loadParcelas])

  function cancelMode() {
    setMapMode(null)
    if (lmap.current) (lmap.current as any).pm?.disableDraw?.()
  }

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>

      {/* ── Painel esquerdo ─────────────────────────────────────────────────── */}
      <div style={{ width: 360, display: 'flex', flexDirection: 'column', background: '#f9fafb', borderRight: '1px solid #e5e7eb', flexShrink: 0 }}>

        {/* Header */}
        <div style={{ padding: '16px', borderBottom: '1px solid #e5e7eb', background: 'white' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <h2 style={{ margin: 0, color: '#1e3a5f', fontSize: 17 }}>Patrimônio Público</h2>
              <p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: 12 }}>{patrimonios.length} bens cadastrados</p>
            </div>
            <button
              onClick={() => setShowForm(true)}
              style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '7px 13px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
            >
              + Novo
            </button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexDirection: 'column' }}>
            <input
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por nome..."
              style={inputSt}
            />
            <select value={filtroFin} onChange={e => setFiltroFin(e.target.value)} style={inputSt}>
              <option value="">Todas as finalidades</option>
              {FINALIDADES.map(f => <option key={f} value={f}>{ICONE[f]} {f.replace('_', ' ')}</option>)}
            </select>
          </div>
        </div>

        {/* Lista */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {patrimonios.length === 0 && (
            <p style={{ color: '#9ca3af', textAlign: 'center', padding: 32, fontSize: 13 }}>Nenhum patrimônio encontrado</p>
          )}
          {patrimonios.map(p => (
            <div
              key={p.id}
              onClick={() => setSelected(prev => prev?.id === p.id ? null : p)}
              style={{
                padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f3f4f6',
                background: selected?.id === p.id ? '#eff6ff' : 'white',
                borderLeft: `3px solid ${selected?.id === p.id ? '#3b82f6' : 'transparent'}`,
                transition: 'background 0.1s',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span style={{ fontSize: 20 }}>{ICONE[p.finalidade] ?? '📍'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ margin: 0, fontWeight: 600, color: '#1e3a5f', fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</p>
                  <p style={{ margin: '2px 0 0', color: '#6b7280', fontSize: 11, textTransform: 'capitalize' }}>
                    {p.finalidade.replace('_', ' ')}
                    {p.area_m2 ? ` · ${Number(p.area_m2).toFixed(0)} m²` : ''}
                    {!p.geometry && ' · sem geometria'}
                  </p>
                </div>
                {p.geometry && <span title="Tem geometria" style={{ color: '#22c55e', fontSize: 14 }}>◉</span>}
              </div>

              {/* Detalhe expandido */}
              {selected?.id === p.id && (
                <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #dbeafe' }}>
                  {p.numero_registro && <Row label="Registro" value={p.numero_registro} />}
                  {p.descricao && <p style={{ margin: '6px 0 0', fontSize: 12, color: '#374151' }}>{p.descricao}</p>}
                  <button
                    onClick={e => { e.stopPropagation(); if (confirm('Excluir este patrimônio?')) excluir.mutate(p.id) }}
                    style={{ marginTop: 10, width: '100%', background: '#fee2e2', color: '#dc2626', border: 'none', padding: '7px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                  >
                    Excluir patrimônio
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Mapa ─────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, position: 'relative' }}>
        <div ref={mapDiv} style={{ width: '100%', height: '100%' }} />

        {/* Painel de ação sobreposto */}
        {selected && (
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 1000,
            background: 'white', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.18)',
            padding: 16, width: 250, fontFamily: 'system-ui, sans-serif',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div>
                <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: '#1e3a5f' }}>{selected.nome}</p>
                <p style={{ margin: '2px 0 0', fontSize: 11, color: '#6b7280', textTransform: 'capitalize' }}>{selected.finalidade.replace('_', ' ')}</p>
              </div>
              <button onClick={() => { setSelected(null); cancelMode() }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af', flexShrink: 0 }}>✕</button>
            </div>

            {!mapMode && (
              <>
                {selected.geometry && (
                  <div style={{ background: '#f0fdf4', borderRadius: 6, padding: '6px 10px', marginBottom: 10, fontSize: 11, color: '#15803d', display: 'flex', alignItems: 'center', gap: 6 }}>
                    ◉ Geometria cadastrada
                    {selected.area_m2 && ` · ${Number(selected.area_m2).toFixed(0)} m²`}
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <button onClick={() => setMapMode('draw')} style={actionBtn('#1e3a5f')}>
                    {selected.geometry ? '✏ Redesenhar polígono' : '+ Criar polígono'}
                  </button>
                  <button onClick={() => setMapMode('vincular')} style={actionBtn('#059669')}>
                    🔗 Vincular parcela existente
                  </button>
                  {selected.geometry && (
                    <button onClick={removeGeometry} style={actionBtn('#dc2626', true)}>
                      ✕ Remover geometria
                    </button>
                  )}
                </div>
              </>
            )}

            {mapMode === 'draw' && (
              <div>
                <div style={{ background: '#eff6ff', borderRadius: 6, padding: '8px 10px', marginBottom: 10, fontSize: 12, color: '#1d4ed8', lineHeight: 1.5 }}>
                  Clique no mapa para desenhar o polígono. Clique no primeiro ponto para fechar.
                </div>
                <button onClick={cancelMode} style={actionBtn('#6b7280', true)}>Cancelar</button>
              </div>
            )}

            {mapMode === 'vincular' && (
              <div>
                <div style={{ background: '#fffbeb', borderRadius: 6, padding: '8px 10px', marginBottom: 10, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                  As parcelas cadastradas aparecem em amarelo no mapa. Clique numa delas para vincular sua geometria a este patrimônio.
                </div>
                <button onClick={() => { loadParcelas() }} style={{ ...actionBtn('#059669', true), marginBottom: 6 }}>Recarregar parcelas</button>
                <button onClick={cancelMode} style={actionBtn('#6b7280', true)}>Cancelar</button>
              </div>
            )}

            {salvandoGeom && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#6b7280', textAlign: 'center' }}>Salvando...</p>
            )}
          </div>
        )}

        {/* Instrução quando nenhum selecionado */}
        {!selected && (
          <div style={{
            position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
            background: 'white', borderRadius: 8, boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            padding: '10px 16px', fontSize: 12, color: '#6b7280', zIndex: 1000,
            pointerEvents: 'none',
          }}>
            Clique num patrimônio na lista ou no mapa para ver detalhes
          </div>
        )}
      </div>

      {/* ── Modal de cadastro ────────────────────────────────────────────────── */}
      {showForm && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000 }}>
          <div style={{ background: 'white', borderRadius: 10, padding: 24, width: 440, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
            <h3 style={{ margin: '0 0 16px', color: '#1e3a5f' }}>Novo Patrimônio Público</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Nome *">
                <input value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} style={inputSt} />
              </Field>
              <Field label="Finalidade *">
                <select value={form.finalidade} onChange={e => setForm(f => ({ ...f, finalidade: e.target.value }))} style={inputSt}>
                  {FINALIDADES.map(f => <option key={f} value={f}>{ICONE[f]} {f.replace('_', ' ')}</option>)}
                </select>
              </Field>
              <Field label="Nº de registro">
                <input value={form.numeroRegistro} onChange={e => setForm(f => ({ ...f, numeroRegistro: e.target.value }))} style={inputSt} />
              </Field>
              <Field label="Descrição">
                <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} style={{ ...inputSt, resize: 'vertical' }} />
              </Field>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowForm(false)} style={btnSec}>Cancelar</button>
              <button onClick={() => criar.mutate()} disabled={!form.nome || criar.isPending} style={btnPri}>
                {criar.isPending ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', fontSize: 12, marginBottom: 4 }}>
      <span style={{ color: '#6b7280', width: 80, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value ?? '—'}</span>
    </div>
  )
}

const inputSt: React.CSSProperties = {
  width: '100%', padding: '7px 10px', border: '1px solid #d1d5db',
  borderRadius: 6, fontSize: 13, boxSizing: 'border-box', outline: 'none',
}
const btnPri: React.CSSProperties = { background: '#1e3a5f', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }
const btnSec: React.CSSProperties = { background: 'white', color: '#374151', border: '1px solid #d1d5db', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }
const actionBtn = (bg: string, outline = false): React.CSSProperties => ({
  width: '100%', padding: '8px 12px', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontWeight: 500,
  background: outline ? 'white' : bg, color: outline ? bg : 'white',
  border: outline ? `1px solid ${bg}` : 'none',
})
