import { useEffect } from 'react'
import L from 'leaflet'
import '@geoman-io/leaflet-geoman-free'
import '@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css'
import { useMapStore } from '../../store/map.store'
import { useAuthStore } from '../../store/auth.store'
import api from '../../lib/api'
import toast from 'react-hot-toast'

export function EditToolbar() {
  const { map, selectedParcelaId } = useMapStore()
  const { perfil } = useAuthStore()

  const canEdit = perfil === 'ADMIN' || perfil === 'FISCAL_TRIBUTARIO'

  useEffect(() => {
    if (!map || !canEdit) return

    // Ativa o Leaflet Geoman (PMGlify)
    ;(map as any).pm.addControls({
      position: 'topleft',
      drawMarker: true,
      drawCircleMarker: false,
      drawPolyline: true,
      drawRectangle: false,
      drawPolygon: true,
      drawCircle: false,
      editMode: true,
      dragMode: true,
      cutPolygon: true,  // desmembramento
      removalMode: false,
      rotateMode: true,
    })

    // Configurações de snap
    ;(map as any).pm.setGlobalOptions({
      snappable: true,
      snapDistance: 10,
      allowSelfIntersection: false,
    })

    // Listener: criação de geometria (nova parcela / lote)
    map.on('pm:create', async (e: any) => {
      const geojson = (e.layer as L.Path).toGeoJSON()
      try {
        if (selectedParcelaId) {
          // Atualizar geometria de parcela existente
          await api.put(`/parcelas/${selectedParcelaId}/geometry`, {
            geometry: (geojson as any).geometry,
          })
          toast.success('Geometria atualizada')
        }
        map.removeLayer(e.layer)
      } catch {
        toast.error('Erro ao salvar geometria')
        map.removeLayer(e.layer)
      }
    })

    // Listener: corte de polígono (desmembramento)
    map.on('pm:cut', async (e: any) => {
      if (!selectedParcelaId) return
      const linha = (e.layer as L.Path).toGeoJSON()
      try {
        const res = await api.post(`/parcelas/${selectedParcelaId}/desmembrar`, {
          linhaGeoJSON: (linha as any).geometry,
        })
        toast.success(`Parcela desmembrada: ${res.data.novas.length} novas parcelas`)
      } catch {
        toast.error('Erro no desmembramento')
      }
    })

    return () => {
      map.off('pm:create')
      map.off('pm:cut')
      ;(map as any).pm.removeControls()
    }
  }, [map, canEdit, selectedParcelaId])

  return null
}
