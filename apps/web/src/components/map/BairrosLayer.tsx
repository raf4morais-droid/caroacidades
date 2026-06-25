import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMapStore } from '../../store/map.store'
import api from '../../lib/api'

const STYLE: L.PathOptions = {
  color: '#d97706',
  weight: 1.8,
  fillColor: '#fbbf24',
  fillOpacity: 0.12,
}

const STYLE_HOVER: L.PathOptions = {
  ...STYLE,
  fillOpacity: 0.3,
  weight: 2.5,
}

export function BairrosLayer() {
  const { map, activeLayers, setBairros } = useMapStore()
  const layerRef = useRef<L.GeoJSON | null>(null)

  useEffect(() => {
    if (!map) return

    const active = activeLayers.includes('bairros')

    if (!active) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      return
    }

    if (layerRef.current) return

    api.get('/bairros').then(res => {
      const bairros: any[] = res.data?.data ?? []
      if (!bairros.length || !map) return

      const features = bairros
        .filter(b => b.geometry)
        .map(b => ({
          type: 'Feature' as const,
          geometry: b.geometry,
          properties: { id: b.id, nome: b.nome, codigo: b.codigo },
        }))

      // Computa bounds de cada bairro e expõe no store para a lista lateral
      const bairroInfos = features.map(f => {
        const tmp = L.geoJSON(f.geometry)
        const b = tmp.getBounds()
        return {
          id: f.properties.id,
          nome: f.properties.nome,
          bounds: [[b.getSouth(), b.getWest()], [b.getNorth(), b.getEast()]] as [[number,number],[number,number]],
        }
      })
      setBairros(bairroInfos)

      // interactive: false → a camada não intercepta nenhum evento do mouse,
      // permitindo clicar em parcelas e outras camadas por baixo.
      const geoLayer = L.geoJSON(
        { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection,
        {
          style: STYLE,
          interactive: false,
          onEachFeature: (feature, layer) => {
            // Tooltip leve com nome do bairro (não bloqueia eventos)
            layer.bindTooltip(feature.properties.nome as string, {
              permanent: false, direction: 'center', className: 'bairro-tooltip',
            })
          },
        }
      ).addTo(map)

      layerRef.current = geoLayer
    }).catch(() => {
      // silently ignore if bairros not yet seeded
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
