import { useEffect } from 'react'
import L from 'leaflet'
import { useMapStore } from '../../store/map.store'
import { useAuthStore } from '../../store/auth.store'
import { auth } from '../../lib/firebase'

const PG_TILESERV = import.meta.env.VITE_PG_TILESERV_URL ?? '/tiles'

// Estilo por situação da parcela / edificação
const PARCELA_STYLE = {
  weight: 1.5,
  color: '#2563eb',
  fillColor: '#93c5fd',
  fillOpacity: 0.3,
}

const PARCELA_SELECTED = {
  ...PARCELA_STYLE,
  color: '#dc2626',
  fillColor: '#fca5a5',
  fillOpacity: 0.5,
  weight: 2.5,
}

const POSTE_COLORS: Record<string, string> = {
  normal: '#22c55e',
  defeito: '#ef4444',
  em_manutencao: '#f59e0b',
}

export function MVTLayer() {
  const { map, activeLayers, selectParcela, selectedParcelaId } = useMapStore()
  const { user } = useAuthStore()

  useEffect(() => {
    if (!map) return

    // pg_tileserv serve MVT diretamente do PostGIS
    // URL padrão: /tiles/{table}/{z}/{x}/{y}.pbf
    const parcelasLayer = (L as any).vectorGrid?.protobuf(
      `${PG_TILESERV}/sigweb.parcelas/{z}/{x}/{y}.pbf`,
      {
        vectorTileLayerStyles: {
          'sigweb.parcelas': (props: any) =>
            props.id === selectedParcelaId ? PARCELA_SELECTED : PARCELA_STYLE,
        },
        interactive: true,
        getFeatureId: (f: any) => f.properties.id,
      }
    )

    if (parcelasLayer && activeLayers.includes('parcelas')) {
      parcelasLayer.addTo(map)
      parcelasLayer.on('click', (e: any) => {
        const id = e.layer?.properties?.id
        if (id) selectParcela(id)
      })
    }

    return () => {
      if (parcelasLayer) map.removeLayer(parcelasLayer)
    }
  }, [map, activeLayers, selectedParcelaId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Camada de postes (quando ativa)
  useEffect(() => {
    if (!map || !activeLayers.includes('postes')) return

    const postesLayer = (L as any).vectorGrid?.protobuf(
      `${PG_TILESERV}/sigweb.postes/{z}/{x}/{y}.pbf`,
      {
        vectorTileLayerStyles: {
          'sigweb.postes': (props: any) => ({
            radius: 4,
            fillColor: POSTE_COLORS[props.situacao] ?? '#6b7280',
            color: '#fff',
            weight: 1,
            fillOpacity: 0.9,
          }),
        },
        interactive: true,
        rendererFactory: (L as any).canvas?.(),
      }
    )

    if (postesLayer) postesLayer.addTo(map)
    return () => { if (postesLayer) map.removeLayer(postesLayer) }
  }, [map, activeLayers])

  return null
}
