import { useEffect, useRef } from 'react'
import L from 'leaflet'
import { useMapStore } from '../../store/map.store'
import api from '../../lib/api'

type FaceQuadra = {
  id: string
  valor_calculado: number
  lado: string | null
  quadra_codigo: string | null
  logradouro_nome: string | null
  geometry: GeoJSON.Geometry
}

const COR_MIN: [number, number, number] = [0xfd, 0xe6, 0x8a] // amarelo claro
const COR_MAX: [number, number, number] = [0xb9, 0x1c, 0x1c] // vermelho escuro

function corPorValor(valor: number, min: number, max: number): string {
  const t = max === min ? 0.5 : (valor - min) / (max - min)
  const [r1, g1, b1] = COR_MIN
  const [r2, g2, b2] = COR_MAX
  const r = Math.round(r1 + (r2 - r1) * t)
  const g = Math.round(g1 + (g2 - g1) * t)
  const b = Math.round(b1 + (b2 - b1) * t)
  return `rgb(${r},${g},${b})`
}

const formatoMoeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

// Camada temática de faces de quadra com valor PGV calculado — gradiente de
// cor do menor (amarelo) ao maior valor por m² (vermelho) — req 219
export function PgvLayer() {
  const { map, activeLayers } = useMapStore()
  const layerRef = useRef<L.GeoJSON | null>(null)

  useEffect(() => {
    if (!map) return

    const active = activeLayers.includes('pgv')

    if (!active) {
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
      return
    }

    if (layerRef.current) return

    api.get<FaceQuadra[]>('/pgv/faces-quadra').then(res => {
      const faces = res.data ?? []
      if (!faces.length || !map) return

      const valores = faces.map(f => f.valor_calculado)
      const min = Math.min(...valores)
      const max = Math.max(...valores)

      const features = faces.map(f => ({
        type: 'Feature' as const,
        geometry: f.geometry,
        properties: {
          id: f.id,
          valor: f.valor_calculado,
          quadraCodigo: f.quadra_codigo,
          logradouroNome: f.logradouro_nome,
          lado: f.lado,
        },
      }))

      const geoLayer = L.geoJSON(
        { type: 'FeatureCollection', features } as GeoJSON.FeatureCollection,
        {
          style: (feature) => ({
            color: corPorValor(feature!.properties.valor, min, max),
            weight: 5,
            opacity: 0.85,
          }),
          onEachFeature: (feature, layer) => {
            const p = feature.properties
            const local = [p.logradouroNome, p.quadraCodigo ? `Quadra ${p.quadraCodigo}` : null]
              .filter(Boolean).join(' — ')
            layer.bindTooltip(
              `${local || 'Face de quadra'}<br/>${formatoMoeda.format(p.valor)}/m²`,
              { sticky: true, className: 'pgv-tooltip' }
            )
          },
        }
      ).addTo(map)

      layerRef.current = geoLayer
    }).catch(() => {
      // silently ignore if no faces calculadas yet
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
