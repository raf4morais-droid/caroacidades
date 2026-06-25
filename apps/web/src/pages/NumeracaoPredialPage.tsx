import { useState, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import L from 'leaflet'
import api from '../lib/api'
import { SIGMap } from '../components/map/SIGMap'
import { useMapStore } from '../store/map.store'
import toast from 'react-hot-toast'

type Lote = {
  parcelaId: string
  codigo: string
  areaM2: number
  fracAoLongo: number
  lado: number
  edificacaoId: string | null
  numeroPredialAtual: string | null
  inscricaoImobiliaria: string | null
}

type Numeracao = {
  parcelaId: string
  edificacaoId: string | null
  lado: string
  numeroPredialGerado: string
}

// Componente interno: permite clicar no mapa para definir o ponto de
// partida da numeração (req 99) — exibe um marcador no ponto escolhido
function PontoPartidaLayer({
  ativo,
  ponto,
  onEscolher,
}: {
  ativo: boolean
  ponto: { lat: number; lng: number } | null
  onEscolher: (p: { lat: number; lng: number }) => void
}) {
  const map = useMapStore(s => s.map)

  useEffect(() => {
    if (!map || !ativo) return
    const handler = (e: L.LeafletMouseEvent) => onEscolher({ lat: e.latlng.lat, lng: e.latlng.lng })
    map.on('click', handler)
    map.getContainer().style.cursor = 'crosshair'
    return () => {
      map.off('click', handler)
      map.getContainer().style.cursor = ''
    }
  }, [map, ativo, onEscolher])

  useEffect(() => {
    if (!map || !ponto) return
    const marker = L.marker([ponto.lat, ponto.lng], {
      icon: L.divIcon({
        className: '',
        html: '<div style="width:18px;height:18px;border-radius:50%;background:#dc2626;border:3px solid white;box-shadow:0 1px 4px rgba(0,0,0,0.4)"></div>',
        iconSize: [18, 18],
        iconAnchor: [9, 9],
      }),
    }).bindTooltip('Ponto de partida da numeração', { permanent: false })
    marker.addTo(map)
    return () => { map.removeLayer(marker) }
  }, [map, ponto])

  return null
}

// Componente interno: renderiza lotes coloridos sobre o SIGMap (req 96)
function NumeracaoMapLayer({ lotes, numeracoes }: { lotes: Lote[]; numeracoes: Numeracao[] }) {
  const map = useMapStore(s => s.map)

  useEffect(() => {
    if (!map) return
    const lotesComGeom = lotes.filter((l: any) => l.geometry)
    if (!lotesComGeom.length) return

    const layer = L.geoJSON(
      { type: 'FeatureCollection', features: lotesComGeom.map((l: any) => ({
          type: 'Feature',
          properties: { parcelaId: l.parcelaId, codigo: l.codigo, lado: l.lado, edificacaoId: l.edificacaoId, numeroPredialGerado: numeracoes.find(n => n.parcelaId === l.parcelaId)?.numeroPredialGerado },
          geometry: l.geometry,
        }))
      } as any,
      {
        style: (f) => {
          const { lado, edificacaoId } = f?.properties ?? {}
          const isPar = lado < 0
          const cor = !edificacaoId ? '#9ca3af' : isPar ? '#3b82f6' : '#f59e0b'
          return { color: cor, weight: 2, fillColor: cor, fillOpacity: 0.35 }
        },
        onEachFeature: (f, layer) => {
          const { codigo, numeroPredialGerado, lado, edificacaoId } = f.properties ?? {}
          const isPar = lado < 0
          layer.bindTooltip(
            `<strong>${codigo}</strong><br>${!edificacaoId ? 'Sem edificação' : isPar ? 'Par' : 'Ímpar'}${numeroPredialGerado ? ` — nº ${numeroPredialGerado}` : ''}`,
            { permanent: false, sticky: true }
          )
        },
      }
    )
    layer.addTo(map)
    if (lotesComGeom.length > 0) map.fitBounds(layer.getBounds(), { padding: [40, 40] })
    return () => { map.removeLayer(layer) }
  }, [map, lotes, numeracoes]) // eslint-disable-line react-hooks/exhaustive-deps

  return null
}

export function NumeracaoPredialPage() {
  const qc = useQueryClient()
  const [tab, setTab] = useState<'config' | 'mapa'>('config')
  const [logradouroId, setLogradouroId] = useState('')
  const [logradouroNome, setLogradouroNome] = useState('')
  const [numeracoes, setNumeracoes] = useState<Numeracao[]>([])
  const [inicioPar, setInicioPar] = useState(2)
  const [inicioImpar, setInicioImpar] = useState(1)
  const [etapa, setEtapa] = useState<'buscar' | 'gerar' | 'confirmar'>('buscar')
  const [busca, setBusca] = useState('')
  const [resultadosBusca, setResultadosBusca] = useState<{ id: string; nome: string; tipo: string }[]>([])

  // req 99: ponto de partida da numeração informado no mapa
  const [pontoPartida, setPontoPartida] = useState<{ lat: number; lng: number } | null>(null)
  const [marcandoPonto, setMarcandoPonto] = useState(false)

  async function buscarLogradouro(q: string) {
    setBusca(q)
    if (q.length < 2) { setResultadosBusca([]); return }
    const res = await api.get(`/logradouros?q=${encodeURIComponent(q)}`)
    setResultadosBusca((res.data ?? []).slice(0, 8))
  }

  function selecionarLogradouro(l: { id: string; nome: string; tipo: string }) {
    setLogradouroId(l.id)
    setLogradouroNome(`${l.tipo} ${l.nome}`)
    setBusca(`${l.tipo} ${l.nome}`)
    setResultadosBusca([])
    setEtapa('gerar')
    setNumeracoes([])
    setPontoPartida(null)
    setMarcandoPonto(false)
  }

  const { data: lotesData } = useQuery({
    queryKey: ['numeracao-lotes', logradouroId, pontoPartida],
    queryFn: () => {
      const params = pontoPartida ? `?pontoLon=${pontoPartida.lng}&pontoLat=${pontoPartida.lat}` : ''
      return api.get(`/numeracao/logradouro/${logradouroId}/lotes${params}`).then(r => r.data)
    },
    enabled: !!logradouroId,
  })

  function escolherPontoPartida(p: { lat: number; lng: number }) {
    setPontoPartida(p)
    setMarcandoPonto(false)
    setNumeracoes([])
    setEtapa('gerar')
  }

  const lotes: Lote[] = lotesData?.lotes ?? []

  // req 102: permite ajustar manualmente o número gerado antes de confirmar
  function atualizarNumeroGerado(parcelaId: string, valor: string) {
    setNumeracoes(numeracoes.map(n => (n.parcelaId === parcelaId ? { ...n, numeroPredialGerado: valor } : n)))
  }

  const gerar = useMutation({
    mutationFn: () => api.post('/numeracao/gerar', {
      logradouroId,
      numeroinicioPar: inicioPar,
      numeroInicioImpar: inicioImpar,
      lotes: lotes.map(l => ({ parcelaId: l.parcelaId, edificacaoId: l.edificacaoId, lado: l.lado, inverter: false })),
    }),
    onSuccess: (res) => {
      setNumeracoes(res.data.numeracoes)
      setEtapa('confirmar')
    },
    onError: () => toast.error('Erro ao gerar numeração'),
  })

  const confirmar = useMutation({
    mutationFn: () => api.post('/numeracao/confirmar', {
      logradouroId,
      numeroinicioPar: inicioPar,
      numeroInicioImpar: inicioImpar,
      numeracoes: numeracoes
        .filter(n => n.edificacaoId)
        .map(n => ({ edificacaoId: n.edificacaoId!, numeroPredialGerado: n.numeroPredialGerado })),
    }),
    onSuccess: (res) => {
      toast.success(`${res.data.atualizadas} edificações atualizadas${res.data.divergencias > 0 ? ` · ${res.data.divergencias} divergências registradas` : ''}`)
      setEtapa('buscar')
      setLogradouroId('')
      setLogradouroNome('')
      setBusca('')
      setNumeracoes([])
      qc.invalidateQueries({ queryKey: ['numeracao-lotes'] })
    },
    onError: () => toast.error('Erro ao confirmar numeração'),
  })

  const { data: divergencias = [] } = useQuery({
    queryKey: ['divergencias-numeracao'],
    queryFn: () => api.get('/numeracao/divergencias?resolvida=false').then(r => r.data),
  })

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Abas */}
      <div style={{ display: 'flex', borderBottom: '2px solid #e5e7eb', background: 'white', flexShrink: 0 }}>
        {([{ id: 'config', label: 'Configuração' }, { id: 'mapa', label: 'Mapa Par/Ímpar' }] as const).map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '12px 24px', border: 'none', background: 'none', cursor: 'pointer',
            fontSize: 14, fontWeight: tab === t.id ? 700 : 400,
            color: tab === t.id ? '#1e3a5f' : '#6b7280',
            borderBottom: tab === t.id ? '2px solid #1e3a5f' : '2px solid transparent',
            marginBottom: -2,
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'mapa' && (
        <div style={{ flex: 1, position: 'relative' }}>
          {/* Legenda flutuante */}
          <div style={{
            position: 'absolute', top: 12, right: 12, zIndex: 1000,
            background: 'white', borderRadius: 8, padding: '10px 14px',
            boxShadow: '0 2px 10px rgba(0,0,0,0.15)', fontSize: 12,
          }}>
            <div style={{ fontWeight: 700, color: '#374151', marginBottom: 6 }}>Legenda</div>
            {[
              { cor: '#3b82f6', label: 'Par (lado direito)' },
              { cor: '#f59e0b', label: 'Ímpar (lado esquerdo)' },
              { cor: '#9ca3af', label: 'Sem edificação' },
            ].map(({ cor, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                <span style={{ width: 12, height: 12, borderRadius: 2, background: cor, flexShrink: 0 }} />
                <span style={{ color: '#374151' }}>{label}</span>
              </div>
            ))}
            {!logradouroId && (
              <p style={{ margin: '8px 0 0', color: '#9ca3af', fontSize: 11 }}>
                Selecione um logradouro na aba Configuração
              </p>
            )}
          </div>
          {marcandoPonto && (
            <div style={{
              position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 1000,
              background: '#dc2626', color: 'white', borderRadius: 8, padding: '8px 16px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.15)', fontSize: 13, fontWeight: 600,
            }}>
              Clique no mapa para definir o ponto de partida da numeração (req 99)
            </div>
          )}
          <SIGMap />
          {lotes.length > 0 && <NumeracaoMapLayer lotes={lotes} numeracoes={numeracoes} />}
          <PontoPartidaLayer ativo={marcandoPonto} ponto={pontoPartida} onEscolher={escolherPontoPartida} />
        </div>
      )}

      {tab === 'config' && (
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
      <h2 style={{ margin: '0 0 6px', color: '#1e3a5f', fontSize: 20 }}>Numeração Predial</h2>
      <p style={{ margin: '0 0 24px', color: '#6b7280', fontSize: 13 }}>
        Geração automática de numeração sequencial par/ímpar por logradouro
      </p>

      {/* Busca de logradouro */}
      <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: 20, marginBottom: 20 }}>
        <p style={{ margin: '0 0 10px', fontWeight: 600, color: '#374151', fontSize: 14 }}>
          1. Selecione o logradouro
        </p>
        <div style={{ position: 'relative', maxWidth: 500 }}>
          <input
            value={busca}
            onChange={e => buscarLogradouro(e.target.value)}
            placeholder="Digite o nome do logradouro..."
            style={{ width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }}
          />
          {resultadosBusca.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.12)', zIndex: 100, overflow: 'hidden', marginTop: 2 }}>
              {resultadosBusca.map(l => (
                <button key={l.id} onClick={() => selecionarLogradouro(l)}
                  style={{ display: 'block', width: '100%', padding: '9px 14px', border: 'none', background: 'white', textAlign: 'left', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #f3f4f6' }}>
                  <strong>{l.tipo}</strong> {l.nome}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Config e lotes */}
      {logradouroId && (
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: 20, marginBottom: 20 }}>
          <p style={{ margin: '0 0 14px', fontWeight: 600, color: '#374151', fontSize: 14 }}>
            2. Configure a numeração — <span style={{ color: '#2563eb' }}>{logradouroNome}</span>
          </p>

          {/* req 99: ponto de partida da numeração no mapa */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            <button
              onClick={() => { setMarcandoPonto(true); setTab('mapa') }}
              style={{
                background: marcandoPonto ? '#dc2626' : 'white', color: marcandoPonto ? 'white' : '#374151',
                border: '1px solid #d1d5db', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
              }}
            >
              📍 {marcandoPonto ? 'Clique no mapa para definir o ponto…' : pontoPartida ? 'Redefinir ponto de partida' : 'Marcar ponto de partida no mapa'}
            </button>
            {pontoPartida && !marcandoPonto && (
              <>
                <span style={{ fontSize: 12, color: '#6b7280' }}>
                  Numeração inicia próxima ao ponto marcado ({pontoPartida.lat.toFixed(5)}, {pontoPartida.lng.toFixed(5)})
                </span>
                <button onClick={() => { setPontoPartida(null); setNumeracoes([]) }}
                  style={{ background: 'none', border: 'none', color: '#dc2626', cursor: 'pointer', fontSize: 12, textDecoration: 'underline', padding: 0 }}>
                  Limpar
                </button>
              </>
            )}
          </div>

          <div style={{ display: 'flex', gap: 24, marginBottom: 16, alignItems: 'flex-end' }}>
            <div>
              <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Início par (lado direito)</label>
              <input type="number" min={2} step={2} value={inicioPar}
                onChange={e => setInicioPar(Number(e.target.value))}
                style={{ width: 100, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
            </div>
            <div>
              <label style={{ fontSize: 12, color: '#6b7280', display: 'block', marginBottom: 4 }}>Início ímpar (lado esquerdo)</label>
              <input type="number" min={1} step={2} value={inicioImpar}
                onChange={e => setInicioImpar(Number(e.target.value))}
                style={{ width: 100, padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }} />
            </div>
            <button onClick={() => gerar.mutate()} disabled={lotes.length === 0 || gerar.isPending}
              style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
              {gerar.isPending ? 'Gerando...' : `Gerar numeração (${lotes.length} lotes)`}
            </button>
          </div>

          <div style={{ display: 'flex', gap: 12, marginBottom: 10 }}>
            {[
              { color: '#3b82f6', label: 'Par (lado direito)' },
              { color: '#f59e0b', label: 'Ímpar (lado esquerdo)' },
              { color: '#9ca3af', label: 'Sem edificação' },
            ].map(l => (
              <div key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}>
                <div style={{ width: 12, height: 12, borderRadius: 3, background: l.color }} />
                {l.label}
              </div>
            ))}
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Parcela', 'Lado', 'Nº atual', 'Nº gerado', 'Posição'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lotes.map(l => {
                const n = numeracoes.find(n => n.parcelaId === l.parcelaId)
                const isPar = l.lado < 0
                const cor = !l.edificacaoId ? '#9ca3af' : isPar ? '#3b82f6' : '#f59e0b'
                return (
                  <tr key={l.parcelaId} style={{ borderBottom: '1px solid #f3f4f6' }}>
                    <td style={{ padding: '8px 12px', fontWeight: 600 }}>{l.codigo}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span style={{ background: cor + '22', color: cor, padding: '2px 8px', borderRadius: 10, fontSize: 12, fontWeight: 600 }}>
                        {!l.edificacaoId ? 'Terreno' : isPar ? 'Par' : 'Ímpar'}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', color: '#6b7280' }}>{l.numeroPredialAtual ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      {n ? (
                        etapa === 'confirmar' && l.edificacaoId ? (
                          <input
                            value={n.numeroPredialGerado}
                            onChange={e => atualizarNumeroGerado(l.parcelaId, e.target.value)}
                            style={{
                              width: 80, padding: '4px 8px', borderRadius: 6, fontSize: 13, fontWeight: 700,
                              border: '1px solid #d1d5db',
                              color: n.numeroPredialGerado !== l.numeroPredialAtual ? '#dc2626' : '#059669',
                            }}
                          />
                        ) : (
                          <span style={{ fontWeight: 700, color: n.numeroPredialGerado !== l.numeroPredialAtual ? '#dc2626' : '#059669' }}>
                            {n.numeroPredialGerado}
                          </span>
                        )
                      ) : '—'}
                    </td>
                    <td style={{ padding: '8px 12px', color: '#9ca3af', fontSize: 11 }}>
                      {(l.fracAoLongo * 100).toFixed(0)}% do logradouro
                    </td>
                  </tr>
                )
              })}
              {lotes.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Nenhum lote encontrado neste logradouro</td></tr>
              )}
            </tbody>
          </table>

          {etapa === 'confirmar' && numeracoes.length > 0 && (
            <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button onClick={() => { setEtapa('gerar'); setNumeracoes([]) }}
                style={{ background: 'white', border: '1px solid #d1d5db', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
                Rever
              </button>
              <button onClick={() => confirmar.mutate()} disabled={confirmar.isPending}
                style={{ background: '#059669', color: 'white', border: 'none', padding: '8px 20px', borderRadius: 6, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
                {confirmar.isPending ? 'Salvando...' : '✓ Confirmar e salvar numeração'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Divergências */}
      {divergencias.length > 0 && (
        <div style={{ background: 'white', borderRadius: 10, border: '1px solid #e5e7eb', padding: 20 }}>
          <p style={{ margin: '0 0 12px', fontWeight: 600, color: '#dc2626', fontSize: 14 }}>
            ⚠ {divergencias.length} divergências pendentes de resolução
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#fef2f2', borderBottom: '1px solid #fecaca' }}>
                {['Inscrição', 'Logradouro', 'Nº atual', 'Nº gerado'].map(h => (
                  <th key={h} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#991b1b', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {divergencias.slice(0, 20).map((d: any) => (
                <tr key={d.id} style={{ borderBottom: '1px solid #fef2f2' }}>
                  <td style={{ padding: '8px 12px' }}>{d.inscricao_imobiliaria ?? '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#6b7280' }}>{d.logradouro_nome ?? '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#dc2626', fontWeight: 600 }}>{d.numero_atual ?? '—'}</td>
                  <td style={{ padding: '8px 12px', color: '#059669', fontWeight: 600 }}>{d.numero_gerado ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </div>
      )}
    </div>
  )
}
