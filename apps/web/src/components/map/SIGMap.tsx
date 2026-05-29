import { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useMapStore } from '../../store/map.store'
import { MVTLayer } from './MVTLayer'
import { EditToolbar } from './EditToolbar'
import { LayerControl } from './LayerControl'

// Tupanciretã/RS — centro aproximado
const CENTER: L.LatLngExpression = [-29.0803, -53.8389]
const ZOOM_INIT = 15

export function SIGMap() {
  const containerRef = useRef<HTMLDivElement>(null)
  const { setMap, map } = useMapStore()

  useEffect(() => {
    if (!containerRef.current || map) return

    const instance = L.map(containerRef.current, {
      center: CENTER,
      zoom: ZOOM_INIT,
      zoomControl: true,
      attributionControl: true,
    })

    // Camada base — OpenStreetMap
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 22,
    }).addTo(instance)

    // Orto-mosaico COG (quando configurado no GCS via Cloud CDN)
    const ortomosaicUrl = import.meta.env.VITE_ORTOMOSAICO_WMTS_URL
    if (ortomosaicUrl) {
      L.tileLayer(ortomosaicUrl, {
        attribution: 'Ortomosaico SIGWEB 2026',
        maxZoom: 22,
        opacity: 0.85,
      }).addTo(instance)
    }

    setMap(instance)

    return () => {
      instance.remove()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="sig-map-wrapper" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ width: '100%', height: '100%' }} />
      {map && (
        <>
          <MVTLayer />
          <EditToolbar />
          <LayerControl />
        </>
      )}
    </div>
  )
}
