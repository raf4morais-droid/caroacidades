import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMapStore, type BaseLayerId } from '../../store/map.store'

const LAYERS: { id: BaseLayerId; label: string }[] = [
  { id: 'osm',              label: 'Mapa' },
  { id: 'google_maps',      label: 'Ruas' },
  { id: 'google_satellite', label: 'Satélite' },
  { id: 'topografia',       label: 'Topografia' },
]

export function BaseLayerSwitcher() {
  const { map, baseLayer, setBaseLayer } = useMapStore()
  const containerRef = useRef<HTMLDivElement>(null)

  // Impede que cliques no seletor propaguem para o mapa
  useEffect(() => {
    if (!containerRef.current) return
    L.DomEvent.disableClickPropagation(containerRef.current)
    L.DomEvent.disableScrollPropagation(containerRef.current)
  }, [])

  if (!map) return null

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        display: 'flex',
        background: 'white',
        borderRadius: 10,
        boxShadow: '0 2px 10px rgba(0,0,0,0.18)',
        overflow: 'hidden',
      }}
    >
      {LAYERS.map((layer, i) => {
        const active = baseLayer === layer.id
        return (
          <button
            key={layer.id}
            onClick={() => setBaseLayer(layer.id)}
            style={{
              padding: '8px 20px',
              border: 'none',
              borderRight: i < LAYERS.length - 1 ? '1px solid #e5e7eb' : 'none',
              cursor: 'pointer',
              fontSize: 13,
              fontWeight: active ? 700 : 400,
              background: active ? '#1e3a5f' : 'white',
              color: active ? 'white' : '#374151',
              transition: 'background 0.15s, color 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {layer.label}
          </button>
        )
      })}
    </div>
  )
}
