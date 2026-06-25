import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { useMapStore } from '../store/map.store'
import toast from 'react-hot-toast'

type ParcelaListItem = {
  id: string
  codigo: string
  bairro: string | null
  logradouro: string | null
  quadra_codigo: string | null
  area_m2: number | null
}

const inputSt: React.CSSProperties = {
  padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 8,
  fontSize: 14, width: '100%', maxWidth: 360, boxSizing: 'border-box',
}

const pillSt: React.CSSProperties = {
  padding: '8px 14px', borderRadius: 999, border: '1px solid #d1d5db',
  background: 'white', color: '#374151', cursor: 'pointer', fontSize: 13,
}

function centroidFromGeoJSON(geometry: any): [number, number] | null {
  const ring =
    geometry?.type === 'Polygon' ? geometry.coordinates[0] :
    geometry?.type === 'MultiPolygon' ? geometry.coordinates[0]?.[0] : null
  if (!ring?.length) return null
  const lng = ring.reduce((s: number, c: number[]) => s + c[0], 0) / ring.length
  const lat = ring.reduce((s: number, c: number[]) => s + c[1], 0) / ring.length
  return [lat, lng]
}

export function BancoDadosPage() {
  const navigate = useNavigate()
  const { selectParcela, setPendingTarget } = useMapStore()
  const [search, setSearch] = useState('')
  const [bairroFiltro, setBairroFiltro] = useState('')
  const [logradouroFiltro, setLogradouroFiltro] = useState('')
  const [loadingMapId, setLoadingMapId] = useState<string | null>(null)

  async function handleVerNoMapa(parcelaId: string) {
    setLoadingMapId(parcelaId)
    try {
      const { data } = await api.get(`/parcelas/${parcelaId}`)
      const coords = centroidFromGeoJSON(data.geometry)
      selectParcela(parcelaId)
      if (coords) setPendingTarget({ lat: coords[0], lng: coords[1], zoom: 18 })
      navigate('/mapa')
    } catch {
      toast.error('Erro ao localizar parcela no mapa')
    } finally {
      setLoadingMapId(null)
    }
  }

  const { data = [], isLoading, isError } = useQuery<ParcelaListItem[]>({
    queryKey: ['parcelas-all'],
    queryFn: () => api.get('/parcelas/all').then((r) => r.data),
  })

  const bairros = useMemo(
    () => Array.from(new Set(data.map((p) => p.bairro ?? '').filter(Boolean))).sort(),
    [data]
  )

  const logradouros = useMemo(
    () => Array.from(new Set(data.map((p) => p.logradouro ?? '').filter(Boolean))).sort(),
    [data]
  )

  const filteredData = useMemo(() => {
    const term = search.trim().toLowerCase()
    return data.filter((item) => {
      if (bairroFiltro && item.bairro !== bairroFiltro) return false
      if (logradouroFiltro && item.logradouro !== logradouroFiltro) return false
      if (!term) return true
      return [item.codigo, item.bairro, item.logradouro, item.quadra_codigo, item.id]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
    })
  }, [data, search, bairroFiltro, logradouroFiltro])

  useEffect(() => {
    if (isError) toast.error('Erro ao carregar parcelas do banco de dados')
  }, [isError])

  return (
    <div style={{ padding: 24, minHeight: '100vh', background: '#f8fafc' }}>
      <div style={{ marginBottom: 24, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <h1 style={{ margin: 0, fontSize: 26, color: '#1e3a5f' }}>Banco de Dados</h1>
        <p style={{ margin: 0, color: '#64748b', maxWidth: 760, lineHeight: 1.6 }}>
          Lista de todas as parcelas cadastradas no banco de dados. Use os filtros para encontrar lotes por código, bairro, logradouro ou ID.
          Clique em uma linha para abrir o detalhamento da parcela.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 22, alignItems: 'end' }}>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#475569' }}>Buscar</label>
          <input
            placeholder="código, bairro, logradouro ou id"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={inputSt}
          />
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#475569' }}>Bairro</label>
          <select
            value={bairroFiltro}
            onChange={(e) => setBairroFiltro(e.target.value)}
            style={inputSt}
          >
            <option value="">Todos os bairros</option>
            {bairros.map((bairro) => (
              <option key={bairro} value={bairro}>{bairro}</option>
            ))}
          </select>
        </div>
        <div style={{ minWidth: 0 }}>
          <label style={{ display: 'block', marginBottom: 6, fontSize: 13, color: '#475569' }}>Logradouro</label>
          <select
            value={logradouroFiltro}
            onChange={(e) => setLogradouroFiltro(e.target.value)}
            style={inputSt}
          >
            <option value="">Todos os logradouros</option>
            {logradouros.map((logradouro) => (
              <option key={logradouro} value={logradouro}>{logradouro}</option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ marginBottom: 16, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ ...pillSt, background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }}>
          Total no banco: {data.length}
        </span>
        <span style={{ ...pillSt, background: '#f8fafc', borderColor: '#cbd5e1' }}>
          Exibindo: {filteredData.length}
        </span>
      </div>

      <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 14, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead style={{ background: '#f8fafc' }}>
            <tr>
              <th style={{ textAlign: 'left', padding: '14px 16px', color: '#475569' }}>Código</th>
              <th style={{ textAlign: 'left', padding: '14px 16px', color: '#475569' }}>Bairro</th>
              <th style={{ textAlign: 'left', padding: '14px 16px', color: '#475569' }}>Logradouro</th>
              <th style={{ textAlign: 'left', padding: '14px 16px', color: '#475569' }}>Quadra</th>
              <th style={{ textAlign: 'right', padding: '14px 16px', color: '#475569' }}>Área (m²)</th>
              <th style={{ padding: '14px 16px', color: '#475569' }}>Mapa</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Carregando parcelas...</td></tr>
            ) : filteredData.length === 0 ? (
              <tr><td colSpan={6} style={{ padding: 20, textAlign: 'center', color: '#64748b' }}>Nenhuma parcela encontrada.</td></tr>
            ) : filteredData.map((parcela) => (
              <tr
                key={parcela.id}
                onClick={() => navigate(`/cadastro/parcelas/${parcela.id}`)}
                style={{ cursor: 'pointer', transition: 'background 0.15s', borderTop: '1px solid #f1f5f9' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = '#f8fafc' }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'transparent' }}
              >
                <td style={{ padding: '14px 16px', fontWeight: 600, color: '#1f2937' }}>{parcela.codigo}</td>
                <td style={{ padding: '14px 16px', color: '#475569' }}>{parcela.bairro ?? '—'}</td>
                <td style={{ padding: '14px 16px', color: '#475569' }}>{parcela.logradouro ?? '—'}</td>
                <td style={{ padding: '14px 16px', color: '#475569' }}>{parcela.quadra_codigo ?? '—'}</td>
                <td style={{ padding: '14px 16px', textAlign: 'right', color: '#475569' }}>{parcela.area_m2 ? parcela.area_m2.toFixed(2) : '—'}</td>
                <td style={{ padding: '10px 16px' }}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleVerNoMapa(parcela.id) }}
                    disabled={loadingMapId === parcela.id}
                    style={{
                      padding: '4px 10px', background: '#eff6ff', color: '#2563eb',
                      border: '1px solid #bfdbfe', borderRadius: 5, cursor: 'pointer',
                      fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
                      opacity: loadingMapId === parcela.id ? 0.6 : 1,
                    }}
                  >
                    {loadingMapId === parcela.id ? '...' : '📍 Ver'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
