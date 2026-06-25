import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMapStore } from '../../store/map.store'
import api from '../../lib/api'
import { ICONE_PATRIMONIO } from '../../lib/patrimonio'

type Patrimonio = {
  id: string
  nome: string
  finalidade: string
  geometry: GeoJSON.Geometry | null
}

// Camada de patrimônio público no mapa principal — ícone por finalidade,
// clique seleciona o item e abre o painel de detalhes (req 29/30)
export function PatrimonioLayer() {
  const { map, activeLayers, selectPatrimonio } = useMapStore()
  const layerRef = useRef<L.LayerGroup | null>(null)

  useEffect(() => {
    if (!map) return

    const active = activeLayers.includes('patrimonio')

    if (!active) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      return
    }

    if (layerRef.current) return

    api.get<Patrimonio[]>('/patrimonio').then(res => {
      const itens = (res.data ?? []).filter(p => p.geometry)
      if (!itens.length || !map) return

      const group = L.layerGroup()

      itens.forEach(p => {
        if (!p.geometry) return

        if (p.geometry.type === 'Point') {
          const [lng, lat] = p.geometry.coordinates as [number, number]
          const icon = L.divIcon({
            className: '',
            html: `<div style="background:#1e3a5f;color:white;border-radius:50%;width:30px;height:30px;display:flex;align-items:center;justify-content:center;font-size:14px;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4)">${ICONE_PATRIMONIO[p.finalidade] ?? '📍'}</div>`,
            iconSize: [30, 30],
            iconAnchor: [15, 15],
          })
          const marker = L.marker([lat, lng], { icon })
          marker.bindTooltip(p.nome, { sticky: true })
          marker.on('click', () => selectPatrimonio(p.id))
          group.addLayer(marker)
        } else {
          const gj = L.geoJSON(p.geometry as any, {
            style: { color: '#1e3a5f', fillColor: '#1e3a5f', fillOpacity: 0.2, weight: 1.5 },
          })
          gj.bindTooltip(p.nome, { sticky: true })
          gj.on('click', () => selectPatrimonio(p.id))
          group.addLayer(gj)
        }
      })

      group.addTo(map)
      layerRef.current = group
    }).catch(() => {
      // silently ignore se não houver patrimônios cadastrados
    })

    return () => {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map, activeLayers]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}
