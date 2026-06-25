import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import { useMapStore } from '../../store/map.store'
import { fetchStaticMapFromBounds } from '../../lib/staticMap'

export function PrintControl() {
  const { map } = useMapStore()
  const [active, setActive] = useState(false)
  const [status, setStatus] = useState('')
  const rectRef = useRef<L.Rectangle | null>(null)
  const startRef = useRef<L.LatLng | null>(null)
  const clickCountRef = useRef(0)

  useEffect(() => {
    if (!map || !active) return
    const m = map
    m.getContainer().style.cursor = 'crosshair'
    clickCountRef.current = 0
    startRef.current = null

    function onClick(e: L.LeafletMouseEvent) {
      if (clickCountRef.current === 0) {
        startRef.current = e.latlng
        clickCountRef.current = 1
        setStatus('Clique para definir o segundo canto do recorte')
      } else {
        const bounds = L.latLngBounds(startRef.current!, e.latlng)
        if (rectRef.current) m.removeLayer(rectRef.current)
        rectRef.current = L.rectangle(bounds, { color: '#2563eb', weight: 2, fillOpacity: 0.08 }).addTo(m)
        setActive(false)
        setStatus('Gerando PDF…')
        runPrint(bounds)
      }
    }

    function onMouseMove(e: L.LeafletMouseEvent) {
      if (clickCountRef.current !== 1 || !startRef.current) return
      const bounds = L.latLngBounds(startRef.current, e.latlng)
      if (rectRef.current) rectRef.current.setBounds(bounds)
      else rectRef.current = L.rectangle(bounds, { color: '#2563eb', weight: 2, fillOpacity: 0.08 }).addTo(m)
    }

    map.on('click', onClick)
    map.on('mousemove', onMouseMove)
    return () => {
      map.off('click', onClick)
      map.off('mousemove', onMouseMove)
      map.getContainer().style.cursor = ''
    }
  }, [map, active]) // eslint-disable-line react-hooks/exhaustive-deps

  async function runPrint(bounds: L.LatLngBounds) {
    try {
      const sw = bounds.getSouthWest()
      const ne = bounds.getNorthEast()
      const img = await fetchStaticMapFromBounds(sw.lat, sw.lng, ne.lat, ne.lng, 1200, 900)
      if (!img) { setStatus('Erro ao capturar mapa'); return }

      const { default: jsPDF } = await import('jspdf')
      const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' })
      pdf.addImage(img, 'JPEG', 10, 10, 277, 190)
      pdf.setFontSize(8)
      pdf.setTextColor(120)
      pdf.text(
        `SIGWEB Tupanciretã · ${new Date().toLocaleString('pt-BR')} · SW ${sw.lat.toFixed(5)},${sw.lng.toFixed(5)} NE ${ne.lat.toFixed(5)},${ne.lng.toFixed(5)}`,
        10, 206,
      )
      pdf.save(`mapa_${Date.now()}.pdf`)
      setStatus('PDF gerado!')
    } catch {
      setStatus('Erro ao gerar PDF')
    } finally {
      if (rectRef.current) { map?.removeLayer(rectRef.current); rectRef.current = null }
      setTimeout(() => setStatus(''), 3000)
    }
  }

  function cancel() {
    setActive(false)
    setStatus('')
    startRef.current = null
    clickCountRef.current = 0
    if (rectRef.current) { map?.removeLayer(rectRef.current); rectRef.current = null }
  }

  return (
    <div style={{ position: 'absolute', bottom: 28, left: 10, zIndex: 1000 }}>
      {status && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 6,
          background: active ? '#1e3a5f' : 'white', color: active ? 'white' : '#374151',
          border: '1px solid #e5e7eb', borderRadius: 6, padding: '6px 10px',
          fontSize: 12, whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
        }}>
          {status}
          {active && (
            <button onClick={cancel} style={{
              marginLeft: 8, background: 'none', border: 'none',
              color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontSize: 11,
            }}>✕ Cancelar</button>
          )}
        </div>
      )}
      <button
        onClick={active ? cancel : () => { setActive(true); setStatus('Clique para definir o primeiro canto do recorte') }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 14px', background: active ? '#1e3a5f' : 'white',
          color: active ? 'white' : '#1f2937', border: 'none', borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,0.2)', cursor: 'pointer', fontSize: 13, fontWeight: 500,
        }}
      >
        🖨 Imprimir
      </button>
    </div>
  )
}
