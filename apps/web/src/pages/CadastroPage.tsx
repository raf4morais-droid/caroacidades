import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useMapStore } from '../store/map.store'
import toast from 'react-hot-toast'

export function CadastroPage() {
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const { flyTo, selectParcela } = useMapStore()
  const qc = useQueryClient()

  const { data, isLoading } = useQuery({
    queryKey: ['parcelas-list', search, page],
    queryFn: () =>
      api.get(`/parcelas/search?q=${encodeURIComponent(search || 'a')}&page=${page}&limit=50`)
        .then(r => r.data),
    staleTime: 30_000,
  })

  function handleRowClick(parcela: any) {
    const geom = parcela.geometry
    if (geom?.coordinates?.[0]?.length) {
      const flat = geom.coordinates[0]
      const lng = flat.reduce((s: number, p: number[]) => s + p[0], 0) / flat.length
      const lat = flat.reduce((s: number, p: number[]) => s + p[1], 0) / flat.length
      flyTo(lat, lng, 18)
    }
    selectParcela(parcela.id)
  }

  async function exportar(formato: string) {
    const url = `/api/parcelas/exportar?formato=${formato}&q=${encodeURIComponent(search)}`
    window.open(url, '_blank')
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', padding: 20, gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontSize: 20, color: '#1e3a5f' }}>Cadastro Imobiliário</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          {['xls', 'pdf', 'csv'].map(fmt => (
            <button
              key={fmt}
              onClick={() => exportar(fmt)}
              style={{
                padding: '6px 14px', background: 'white', border: '1px solid #d1d5db',
                borderRadius: 6, cursor: 'pointer', fontSize: 13, textTransform: 'uppercase',
              }}
            >
              {fmt}
            </button>
          ))}
          <a
            href="/cadastro/parcelas/novo"
            style={{
              padding: '6px 16px', background: '#2563eb', color: 'white',
              borderRadius: 6, textDecoration: 'none', fontSize: 13,
            }}
          >
            + Nova Parcela
          </a>
        </div>
      </div>

      <input
        value={search}
        onChange={e => { setSearch(e.target.value); setPage(1) }}
        placeholder="Pesquisar por código, logradouro..."
        style={{
          padding: '10px 14px', border: '1px solid #d1d5db', borderRadius: 6,
          fontSize: 14, outline: 'none', maxWidth: 400,
        }}
      />

      <div style={{ flex: 1, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '2px solid #e5e7eb' }}>
              {['Código', 'Logradouro', 'Bairro', 'Quadra', 'Área (m²)', 'Ações'].map(h => (
                <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', whiteSpace: 'nowrap' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Carregando...</td></tr>
            )}
            {!isLoading && data?.data?.map((p: any) => (
              <tr
                key={p.id}
                onClick={() => handleRowClick(p)}
                style={{ cursor: 'pointer', borderBottom: '1px solid #f3f4f6' }}
                onMouseEnter={e => (e.currentTarget.style.background = '#eff6ff')}
                onMouseLeave={e => (e.currentTarget.style.background = 'white')}
              >
                <td style={{ padding: '9px 12px', fontWeight: 600, color: '#2563eb' }}>{p.codigo}</td>
                <td style={{ padding: '9px 12px' }}>{p.logradouro ?? '—'}</td>
                <td style={{ padding: '9px 12px' }}>{p.bairro ?? '—'}</td>
                <td style={{ padding: '9px 12px' }}>—</td>
                <td style={{ padding: '9px 12px' }}>{p.area_m2 ? Number(p.area_m2).toFixed(2) : '—'}</td>
                <td style={{ padding: '9px 12px' }}>
                  <a
                    href={`/cadastro/parcelas/${p.id}`}
                    onClick={e => e.stopPropagation()}
                    style={{ color: '#2563eb', textDecoration: 'none', fontSize: 12 }}
                  >
                    Editar
                  </a>
                </td>
              </tr>
            ))}
            {!isLoading && data?.data?.length === 0 && (
              <tr><td colSpan={6} style={{ textAlign: 'center', padding: 40, color: '#6b7280' }}>Nenhuma parcela encontrada</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {data?.pagination && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13, color: '#6b7280' }}>
          <span>Total: {data.pagination.total} parcelas</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              style={{ padding: '4px 12px', cursor: 'pointer' }}>← Anterior</button>
            <span>Página {page}</span>
            <button
              onClick={() => setPage(p => p + 1)}
              disabled={page * 50 >= data.pagination.total}
              style={{ padding: '4px 12px', cursor: 'pointer' }}
            >Próxima →</button>
          </div>
        </div>
      )}
    </div>
  )
}
