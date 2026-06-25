import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { Viewer } from 'mapillary-js'
import 'mapillary-js/dist/mapillary.css'
import { Viewer as PanoramaViewer } from '@photo-sphere-viewer/core'
import '@photo-sphere-viewer/core/index.css'
import { useMapStore } from '../../store/map.store'
import api from '../../lib/api'

// ─── configuração ─────────────────────────────────────────────────────────────
const LAYER_ID = '360_terrestre'

// Bbox do município de Tupanciretã (da análise dos bairros IBGE)
// formato Mapillary: [minLng, minLat, maxLng, maxLat]
const MUNI_BBOX = [-53.88, -29.10, -53.80, -29.05] as const

type Panorama = { id: string; titulo: string; lat: number; lng: number; url_panorama?: string | null; heading?: number }

const DEMO: Panorama[] = [
  { id: 'd1', titulo: 'Praça João Maia — Centro (demo)',      lat: -29.07800, lng: -53.83900 },
  { id: 'd2', titulo: 'Av. Getúlio Vargas (demo)',             lat: -29.07920, lng: -53.83850 },
  { id: 'd3', titulo: 'Rua Sete de Setembro (demo)',           lat: -29.08100, lng: -53.83750 },
  { id: 'd4', titulo: 'Câmara Municipal — Centro (demo)',      lat: -29.07650, lng: -53.83650 },
]

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ─── Viewer Mapillary ─────────────────────────────────────────────────────────
type ViewerStatus = 'loading' | 'ok' | 'no-data'

function MapillaryViewer({ lat, lng, imageId }: { lat: number; lng: number; imageId: string | null }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef    = useRef<Viewer | null>(null)
  const [status, setStatus] = useState<ViewerStatus>('loading')
  const token = import.meta.env.VITE_MAPILLARY_TOKEN as string | undefined

  useEffect(() => {
    if (!containerRef.current || !token) { setStatus('no-data'); return }
    let cancelled = false
    setStatus('loading')

    async function init() {
      let id = imageId

      // Se não tem imageId, busca a imagem mais próxima via API
      if (!id) {
        const res = await fetch(
          `https://graph.mapillary.com/images?access_token=${token}&fields=id,computed_geometry&closeto=${lng},${lat}&radius=250&limit=1`,
          { headers: { 'Content-Type': 'application/json' } }
        )
        const data = await res.json()
        id = data.data?.[0]?.id ?? null
      }

      if (cancelled) return
      if (!id) { setStatus('no-data'); return }

      // Destrói viewer anterior se existir
      if (viewerRef.current) { viewerRef.current.remove(); viewerRef.current = null }

      viewerRef.current = new Viewer({
        accessToken: token,
        container: containerRef.current!,
        imageId: id,
        component: { cover: false },
      })
      setStatus('ok')
    }

    init().catch(() => { if (!cancelled) setStatus('no-data') })

    return () => {
      cancelled = true
      viewerRef.current?.remove()
      viewerRef.current = null
    }
  }, [lat, lng, imageId, token])

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, background: '#0d1117' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%', display: status === 'ok' ? 'block' : 'none' }} />

      {status === 'loading' && (
        <div style={centerMsgSt}>
          <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.6 }}>🌐</div>
          Buscando imagem no Mapillary...
        </div>
      )}
      {status === 'no-data' && (
        <div style={centerMsgSt}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📷</div>
          <strong>Sem cobertura Mapillary aqui</strong>
          <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.7 }}>
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
          <a href={`https://www.mapillary.com/app/?lat=${lat}&lng=${lng}&z=16`}
            target="_blank" rel="noopener noreferrer"
            style={{ display: 'block', marginTop: 14, color: '#60a5fa', fontSize: 13 }}>
            Contribuir com imagens ↗
          </a>
        </div>
      )}
      {!token && (
        <div style={{ ...centerMsgSt, background: '#1e1e2e' }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>🔑</div>
          <strong>Configure VITE_MAPILLARY_TOKEN</strong>
          <p style={{ margin: '8px 0 0', fontSize: 12, opacity: 0.7, maxWidth: 280, textAlign: 'center', lineHeight: 1.5 }}>
            Obtenha um token gratuito em{' '}
            <a href="https://www.mapillary.com/developer/api-documentation/" target="_blank" rel="noopener noreferrer"
              style={{ color: '#60a5fa' }}>mapillary.com/developer</a>
          </p>
        </div>
      )}
    </div>
  )
}

// ─── Viewer de panoramas equirretangulares próprios (req 28) ──────────────────
function EquirectangularViewer({ url, heading }: { url: string; heading: number }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewerRef    = useRef<PanoramaViewer | null>(null)
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading')

  useEffect(() => {
    if (!containerRef.current) return
    setStatus('loading')

    if (viewerRef.current) { viewerRef.current.destroy(); viewerRef.current = null }

    const viewer = new PanoramaViewer({
      container: containerRef.current,
      panorama: url,
      defaultYaw: `${heading}deg`,
      navbar: ['zoom', 'fullscreen'],
    })
    viewerRef.current = viewer
    viewer.addEventListener('ready', () => setStatus('ok'))
    viewer.addEventListener('panorama-error', () => setStatus('error'))

    return () => {
      viewer.destroy()
      viewerRef.current = null
    }
  }, [url, heading])

  return (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, background: '#0d1117' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />

      {status === 'loading' && (
        <div style={centerMsgSt}>
          <div style={{ fontSize: 28, marginBottom: 10, opacity: 0.6 }}>🌐</div>
          Carregando panorama...
        </div>
      )}
      {status === 'error' && (
        <div style={centerMsgSt}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>📷</div>
          <strong>Não foi possível carregar a imagem panorâmica</strong>
        </div>
      )}
    </div>
  )
}

const centerMsgSt: React.CSSProperties = {
  position: 'absolute', inset: 0,
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
  color: 'rgba(255,255,255,0.75)', fontSize: 14, padding: 24,
}

// ─── Componente principal ─────────────────────────────────────────────────────
type OpenData = { lat: number; lng: number; imageId: string | null; urlPanorama: string | null; heading: number }

export function StreetView360() {
  const { map, activeLayers, toggleLayer } = useMapStore()
  const [openData, setOpenData]       = useState<OpenData | null>(null)
  const [pegmanActive, setPegmanActive] = useState(false)
  const [fullscreen, setFullscreen]   = useState(false)
  const [ownPanoramas, setOwnPanoramas] = useState<Panorama[]>([])
  const coverageRef = useRef<L.LayerGroup | null>(null)
  const posRef      = useRef<L.CircleMarker | null>(null)

  const token = import.meta.env.VITE_MAPILLARY_TOKEN as string | undefined
  const open  = openData !== null

  // ── Carregar e exibir pontos de cobertura no mapa ──────────────────────────
  async function mostrarCobertura() {
    if (!map) return
    removerCobertura()

    const group = L.layerGroup().addTo(map)
    coverageRef.current = group

    // 1. Panoramas próprios do município
    let proprios: Panorama[] = DEMO
    try {
      const res = await api.get('/imagens360')
      const data: Panorama[] = res.data?.data ?? []
      if (data.length > 0) proprios = data
    } catch {}
    setOwnPanoramas(proprios)

    adicionarPontosAoGrupo(group, proprios, '#f59e0b', (p) => {
      // panoramas próprios são equirretangulares — renderizados via Photo Sphere Viewer
      abrirEm(p.lat, p.lng, null, p.url_panorama ?? null, p.heading ?? 0)
    })

    // 2. Imagens do Mapillary dentro do município
    if (token) {
      try {
        const [minLng, minLat, maxLng, maxLat] = MUNI_BBOX
        const res = await fetch(
          `https://graph.mapillary.com/images?access_token=${token}` +
          `&fields=id,computed_geometry&bbox=${minLng},${minLat},${maxLng},${maxLat}&limit=500`
        )
        const data = await res.json()
        const imgs: Array<{ id: string; computed_geometry: { coordinates: [number, number] } }> = data.data ?? []

        const mapillaryPanoramas: Panorama[] = imgs.map(img => ({
          id: img.id,
          titulo: `Mapillary · ${img.id.slice(0, 8)}`,
          lat: img.computed_geometry.coordinates[1],
          lng: img.computed_geometry.coordinates[0],
        }))

        adicionarPontosAoGrupo(group, mapillaryPanoramas, '#1a73e8', (p) => {
          abrirEm(p.lat, p.lng, p.id) // id já é o imageId do Mapillary
        })
      } catch {}
    }
  }

  function adicionarPontosAoGrupo(
    group: L.LayerGroup,
    lista: Panorama[],
    cor: string,
    onClick: (p: Panorama) => void
  ) {
    lista.forEach(p => {
      L.circleMarker([p.lat, p.lng], {
        radius: 14, color: 'transparent', fillColor: cor, fillOpacity: 0.15, interactive: false,
      }).addTo(group)

      const marker = L.circleMarker([p.lat, p.lng], {
        radius: 6, color: 'white', weight: 2, fillColor: cor, fillOpacity: 1,
      })
        .addTo(group)
        .bindTooltip(p.titulo, { direction: 'top', offset: [0, -10], className: 'sv-tooltip' })
        .on('click', (e) => { L.DomEvent.stopPropagation(e); onClick(p) })
      ;(marker as any)._panoramaData = p
    })
  }

  function removerCobertura() {
    if (coverageRef.current && map) { map.removeLayer(coverageRef.current); coverageRef.current = null }
    if (posRef.current && map)      { map.removeLayer(posRef.current);      posRef.current = null }
  }

  function handlePegmanClick() {
    if (open)         { fecharViewer(); return }
    if (pegmanActive) { setPegmanActive(false); removerCobertura(); return }
    if (!activeLayers.includes(LAYER_ID)) toggleLayer(LAYER_ID)
    setPegmanActive(true)
    mostrarCobertura()
  }

  // ── Clique no mapa (pegman ativo) ─────────────────────────────────────────
  useEffect(() => {
    if (!map || !pegmanActive) return

    const onClick = (e: L.LeafletMouseEvent) => {
      const { lat, lng } = e.latlng

      // Snapping: busca o ponto mais próximo (Mapillary ou próprio) a ≤ 100m
      const grupo = coverageRef.current
      if (grupo) {
        let nearest: { panorama: Panorama; d: number } | null = null
        grupo.eachLayer((layer: any) => {
          const latlng = layer.getLatLng?.()
          const panorama: Panorama | undefined = layer._panoramaData
          if (!latlng || !panorama) return
          const d = haversine(lat, lng, latlng.lat, latlng.lng)
          if (d <= 100 && (!nearest || d < nearest.d)) {
            nearest = { panorama, d }
          }
        })
        if (nearest) {
          const p = (nearest as { panorama: Panorama }).panorama
          if (p.url_panorama) {
            abrirEm(p.lat, p.lng, null, p.url_panorama, p.heading ?? 0)
          } else {
            abrirEm(p.lat, p.lng, p.id) // imageId do Mapillary
          }
          return
        }
      }

      // Nenhum ponto próximo — abre na coordenada clicada (API vai buscar no Mapillary)
      abrirEm(lat, lng, null)
    }

    map.on('click', onClick)
    map.getContainer().style.cursor = 'crosshair'
    return () => { map.off('click', onClick); map.getContainer().style.cursor = '' }
  }, [map, pegmanActive, ownPanoramas])

  function abrirEm(lat: number, lng: number, imageId: string | null, urlPanorama: string | null = null, heading = 0) {
    setOpenData({ lat, lng, imageId, urlPanorama, heading })
    setPegmanActive(false)
    if (map) map.getContainer().style.cursor = ''
    removerCobertura()

    if (map) {
      posRef.current = L.circleMarker([lat, lng], {
        radius: 9, color: 'white', weight: 3, fillColor: '#1a73e8', fillOpacity: 1,
      }).addTo(map)
    }
  }

  function fecharViewer() {
    setOpenData(null); setFullscreen(false)
    if (posRef.current && map) { map.removeLayer(posRef.current); posRef.current = null }
    setPegmanActive(false)
  }

  return (
    <>
      <style>{`
        .sv-tooltip {
          background: #1a73e8 !important; color: white !important;
          border: none !important; border-radius: 6px !important;
          font-size: 11px !important; font-weight: 600 !important;
          padding: 4px 8px !important; box-shadow: 0 2px 8px rgba(0,0,0,.3) !important;
        }
        .sv-tooltip::before { border-top-color: #1a73e8 !important; }
        .mly-viewer { z-index: 0 !important; }
      `}</style>

      {/* Botão pegman */}
      <div style={{
        position: 'absolute', bottom: 68, right: 10, zIndex: 1001,
        display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6,
      }}>
        {pegmanActive && (
          <div style={{
            background: '#1a73e8', color: 'white', padding: '7px 13px',
            borderRadius: 8, fontSize: 12, fontWeight: 500,
            boxShadow: '0 2px 8px rgba(0,0,0,.25)', whiteSpace: 'nowrap',
          }}>
            {token ? 'Clique num ponto azul ou em qualquer rua' : 'Configure VITE_MAPILLARY_TOKEN'}
          </div>
        )}
        <button
          onClick={handlePegmanClick}
          title={pegmanActive ? 'Cancelar' : 'Visão de Rua 360° — Mapillary'}
          style={{
            width: 44, height: 44, borderRadius: 8,
            background: (pegmanActive || open) ? '#1a73e8' : 'white',
            color: (pegmanActive || open) ? 'white' : '#3c4043',
            border: 'none', cursor: 'pointer', fontSize: 22,
            boxShadow: '0 2px 8px rgba(0,0,0,.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 0.15s',
          }}
        >🧍</button>
      </div>

      {/* Painel Mapillary */}
      {open && openData && (
        <div style={{
          position: 'absolute',
          ...(fullscreen ? { inset: 0 } : { bottom: 0, left: 0, right: 0, height: '58%' }),
          zIndex: 2000, display: 'flex', flexDirection: 'column',
          boxShadow: '0 -4px 24px rgba(0,0,0,.5)',
        }}>
          {/* Barra superior */}
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
            padding: '8px 12px',
            background: 'linear-gradient(to bottom, rgba(0,0,0,.75) 0%, transparent 100%)',
            display: 'flex', alignItems: 'center', gap: 8,
            pointerEvents: 'none',
          }}>
            <div style={{ pointerEvents: 'auto', display: 'flex', gap: 6 }}>
              <button onClick={fecharViewer} style={circleBtn}>✕</button>
              <button onClick={() => setFullscreen(v => !v)} style={circleBtn}>{fullscreen ? '⊡' : '⛶'}</button>
            </div>
            <span style={{ color: 'rgba(255,255,255,.75)', fontSize: 11, pointerEvents: 'none' }}>
              {openData.urlPanorama ? 'Panorama do município' : 'Mapillary Street View'} · {openData.lat.toFixed(5)}, {openData.lng.toFixed(5)}
            </span>
            {!openData.urlPanorama && (
              <a href={`https://www.mapillary.com/app/?lat=${openData.lat}&lng=${openData.lng}&z=17`}
                target="_blank" rel="noopener noreferrer"
                style={{ marginLeft: 'auto', color: 'rgba(255,255,255,.6)', fontSize: 11, textDecoration: 'none', pointerEvents: 'auto' }}>
                Abrir no Mapillary ↗
              </a>
            )}
          </div>

          {openData.urlPanorama
            ? <EquirectangularViewer url={openData.urlPanorama} heading={openData.heading} />
            : <MapillaryViewer lat={openData.lat} lng={openData.lng} imageId={openData.imageId} />
          }
        </div>
      )}
    </>
  )
}

const circleBtn: React.CSSProperties = {
  width: 30, height: 30, borderRadius: '50%',
  background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(4px)',
  border: '1px solid rgba(255,255,255,.28)',
  color: 'white', cursor: 'pointer', fontSize: 13,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
}
