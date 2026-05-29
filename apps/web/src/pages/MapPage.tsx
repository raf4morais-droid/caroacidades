import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { SIGMap } from '../components/map/SIGMap'
import { useMapStore } from '../store/map.store'
import api from '../lib/api'

export function MapPage() {
  const { selectedParcelaId, selectParcela } = useMapStore()
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])

  const { data: parcelaDetail } = useQuery({
    queryKey: ['parcela', selectedParcelaId],
    queryFn: () => api.get(`/parcelas/${selectedParcelaId}`).then(r => r.data),
    enabled: !!selectedParcelaId,
  })

  async function handleSearch(q: string) {
    setSearchQuery(q)
    if (q.length < 2) { setSearchResults([]); return }
    const res = await api.get(`/parcelas/search?q=${encodeURIComponent(q)}&limit=10`)
    setSearchResults(res.data.data ?? [])
  }

  function flyToResult(result: any) {
    const geom = result.geometry
    if (geom?.coordinates) {
      const flat = geom.coordinates[0]
      if (flat?.length) {
        const lng = flat.reduce((s: number, p: number[]) => s + p[0], 0) / flat.length
        const lat = flat.reduce((s: number, p: number[]) => s + p[1], 0) / flat.length
        useMapStore.getState().flyTo(lat, lng, 18)
      }
    }
    selectParcela(result.id)
    setSearchResults([])
    setSearchQuery('')
  }

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Barra de busca */}
      <div style={{
        position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)',
        zIndex: 1001, width: 360,
      }}>
        <input
          value={searchQuery}
          onChange={e => handleSearch(e.target.value)}
          placeholder="Buscar parcela, logradouro..."
          style={{
            width: '100%', padding: '10px 14px', border: '1px solid #d1d5db',
            borderRadius: 8, fontSize: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
            boxSizing: 'border-box', outline: 'none',
          }}
        />
        {searchResults.length > 0 && (
          <div style={{
            background: 'white', border: '1px solid #e5e7eb', borderRadius: 8,
            marginTop: 4, boxShadow: '0 4px 16px rgba(0,0,0,0.15)', overflow: 'hidden',
          }}>
            {searchResults.map((r) => (
              <button
                key={r.id}
                onClick={() => flyToResult(r)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  padding: '8px 12px', border: 'none', background: 'white',
                  cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6',
                }}
              >
                <strong>{r.codigo}</strong> — {r.logradouro ?? r.bairro ?? ''}
                <span style={{ color: '#6b7280', marginLeft: 8 }}>
                  {r.area_m2 ? `${r.area_m2.toFixed(0)} m²` : ''}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Mapa principal */}
      <SIGMap />

      {/* Painel de detalhes da parcela selecionada */}
      {selectedParcelaId && (
        <div style={{
          position: 'absolute', right: 0, top: 0, bottom: 0,
          width: 320, background: 'white', boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
          overflow: 'auto', zIndex: 1000, padding: 16,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#1e3a5f' }}>Parcela</h3>
            <button
              onClick={() => selectParcela(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#6b7280' }}
            >
              ✕
            </button>
          </div>

          {parcelaDetail ? (
            <div style={{ fontSize: 13 }}>
              <Row label="Código" value={parcelaDetail.codigo} />
              <Row label="Bairro" value={parcelaDetail.bairro_nome} />
              <Row label="Logradouro" value={`${parcelaDetail.logradouro_tipo} ${parcelaDetail.logradouro_nome}`} />
              <Row label="Quadra" value={parcelaDetail.quadra_codigo} />
              <Row label="Área" value={parcelaDetail.area_m2 ? `${Number(parcelaDetail.area_m2).toFixed(2)} m²` : '—'} />
              <Row label="Testada principal" value={parcelaDetail.testada_principal ? `${parcelaDetail.testada_principal} m` : '—'} />

              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <a
                  href={`/cadastro/parcelas/${selectedParcelaId}`}
                  style={{
                    display: 'block', textAlign: 'center', background: '#2563eb',
                    color: 'white', padding: '8px', borderRadius: 6, textDecoration: 'none', fontSize: 13,
                  }}
                >
                  Abrir cadastro completo
                </a>
                <button
                  onClick={() => window.open(`/api/parcelas/${selectedParcelaId}/memorial`, '_blank')}
                  style={{
                    background: '#f3f4f6', border: '1px solid #d1d5db',
                    padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                  }}
                >
                  Memorial Descritivo
                </button>
              </div>
            </div>
          ) : (
            <p style={{ color: '#6b7280', fontSize: 13 }}>Carregando...</p>
          )}
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div style={{ display: 'flex', borderBottom: '1px solid #f3f4f6', padding: '6px 0' }}>
      <span style={{ color: '#6b7280', width: 130, flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, color: '#111' }}>{value ?? '—'}</span>
    </div>
  )
}
