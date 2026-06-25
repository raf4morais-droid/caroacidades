import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useMapStore } from '../../store/map.store'
import { useAuthStore } from '../../store/auth.store'
import api from '../../lib/api'
import toast from 'react-hot-toast'

type Setor = { id: string; nome: string; geometry: GeoJSON.Geometry | null }
type Polo  = { id: string; nome: string; tipo: string | null; geometry: GeoJSON.Geometry | null }
type Pendente = { tipo: 'setor' | 'polo'; geometry: GeoJSON.Geometry; layer: L.Layer }

// Exibe os setores de cálculo e polos valorizantes do PGV no mapa, e permite
// desenhar novos diretamente sobre ele (req 211)
export function PgvSetoresLayer() {
  const map = useMapStore(s => s.map)
  const { perfil } = useAuthStore()
  const qc = useQueryClient()
  const [pendente, setPendente] = useState<Pendente | null>(null)
  const [nome, setNome] = useState('')
  const [tipo, setTipo] = useState('')

  const setoresLayerRef = useRef<L.GeoJSON | null>(null)
  const polosLayerRef = useRef<L.LayerGroup | null>(null)

  const podeDesenhar = perfil === 'ADMIN' || perfil === 'FISCAL_TRIBUTARIO'

  const { data: setores = [] } = useQuery<Setor[]>({
    queryKey: ['pgv-setores-mapa'],
    queryFn: () => api.get('/pgv/setores').then(r => r.data),
  })

  const { data: polos = [] } = useQuery<Polo[]>({
    queryKey: ['pgv-polos'],
    queryFn: () => api.get('/pgv/polos').then(r => r.data),
  })

  // Setores existentes — polígonos
  useEffect(() => {
    if (!map) return
    const features = setores
      .filter(s => s.geometry)
      .map(s => ({ type: 'Feature' as const, geometry: s.geometry!, properties: { nome: s.nome } }))
    const layer = L.geoJSON({ type: 'FeatureCollection', features } as GeoJSON.FeatureCollection, {
      style: { color: '#2563eb', weight: 2, fillColor: '#93c5fd', fillOpacity: 0.15, dashArray: '6,4' },
      onEachFeature: (f, l) => l.bindTooltip(f.properties.nome, { sticky: true }),
    }).addTo(map)
    setoresLayerRef.current = layer
    return () => { map.removeLayer(layer) }
  }, [map, setores])

  // Polos valorizantes existentes — marcadores
  useEffect(() => {
    if (!map) return
    const group = L.layerGroup()
    for (const p of polos) {
      if (!p.geometry || p.geometry.type !== 'Point') continue
      const [lng, lat] = p.geometry.coordinates as [number, number]
      L.marker([lat, lng], {
        icon: L.divIcon({
          className: '',
          html: '<div style="width:16px;height:16px;border-radius:50%;background:#f59e0b;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        }),
      }).bindTooltip(`${p.nome}${p.tipo ? ` (${p.tipo})` : ''}`).addTo(group)
    }
    group.addTo(map)
    polosLayerRef.current = group
    return () => { map.removeLayer(group) }
  }, [map, polos])

  // Captura a geometria desenhada: polígono → novo setor, marcador → novo polo
  useEffect(() => {
    if (!map || !podeDesenhar) return
    const onCreated = (e: any) => {
      if (e.shape === 'Polygon') {
        const geojson = (e.layer as L.Polygon).toGeoJSON() as GeoJSON.Feature<GeoJSON.Polygon>
        setPendente({ tipo: 'setor', geometry: geojson.geometry, layer: e.layer })
      }
      if (e.shape === 'Marker') {
        const geojson = (e.layer as L.Marker).toGeoJSON() as GeoJSON.Feature<GeoJSON.Point>
        setPendente({ tipo: 'polo', geometry: geojson.geometry, layer: e.layer })
      }
      ;(map as any).pm.disableDraw()
    }
    map.on('pm:create', onCreated)
    return () => { map.off('pm:create', onCreated) }
  }, [map, podeDesenhar])

  const salvarSetor = useMutation({
    mutationFn: () => api.post('/pgv/setores', { nome, geometry: pendente!.geometry }),
    onSuccess: () => {
      toast.success('Setor PGV criado')
      qc.invalidateQueries({ queryKey: ['pgv-setores-mapa'] })
      qc.invalidateQueries({ queryKey: ['pgv-setores'] })
      cancelar()
    },
    onError: () => toast.error('Erro ao criar setor'),
  })

  const salvarPolo = useMutation({
    mutationFn: () => api.post('/pgv/polos', { nome, tipo: tipo || undefined, geometry: pendente!.geometry }),
    onSuccess: () => {
      toast.success('Polo valorizante criado')
      qc.invalidateQueries({ queryKey: ['pgv-polos'] })
      cancelar()
    },
    onError: () => toast.error('Erro ao criar polo'),
  })

  function cancelar() {
    if (pendente) map?.removeLayer(pendente.layer)
    setPendente(null)
    setNome('')
    setTipo('')
  }

  function confirmar() {
    if (!nome.trim()) { toast.error('Informe um nome'); return }
    if (pendente?.tipo === 'setor') salvarSetor.mutate()
    else salvarPolo.mutate()
  }

  if (!podeDesenhar) return null

  return (
    <>
      <div style={{ position: 'absolute', top: 10, left: 50, zIndex: 1000, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <button onClick={() => (map as any)?.pm.enableDraw('Polygon')} style={btnSt}>⬡ Desenhar setor</button>
        <button onClick={() => (map as any)?.pm.enableDraw('Marker')} style={btnSt}>📍 Adicionar polo</button>
      </div>

      {pendente && (
        <div style={{ position: 'absolute', top: 10, left: 200, zIndex: 1000, background: 'white', borderRadius: 8, padding: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.2)', width: 220 }}>
          <p style={{ margin: '0 0 8px', fontWeight: 700, fontSize: 13, color: '#1e3a5f' }}>
            {pendente.tipo === 'setor' ? 'Novo setor PGV' : 'Novo polo valorizante'}
          </p>
          <input
            value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome" autoFocus
            style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }}
          />
          {pendente.tipo === 'polo' && (
            <input
              value={tipo} onChange={e => setTipo(e.target.value)} placeholder="Tipo (ex: praça, escola)"
              style={{ width: '100%', padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, marginBottom: 8, boxSizing: 'border-box' }}
            />
          )}
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button onClick={cancelar} style={{ ...btnSt, background: '#f3f4f6', color: '#374151' }}>Cancelar</button>
            <button
              onClick={confirmar}
              disabled={salvarSetor.isPending || salvarPolo.isPending}
              style={{ ...btnSt, background: '#1e3a5f', color: 'white' }}
            >
              Salvar
            </button>
          </div>
        </div>
      )}
    </>
  )
}

const btnSt: React.CSSProperties = {
  padding: '6px 10px', borderRadius: 8, border: 'none', cursor: 'pointer',
  background: 'white', color: '#374151', fontSize: 12, fontWeight: 600,
  boxShadow: '0 2px 6px rgba(0,0,0,0.18)', textAlign: 'left',
}
