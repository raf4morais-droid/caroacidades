import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import 'jspdf-autotable'
import L from 'leaflet'
import api from '../lib/api'
import { useMapStore } from '../store/map.store'
import toast from 'react-hot-toast'
import { FormularioCampos, type CampoFormulario } from '../components/reurb/FormularioCampos'

const TUPANCIRETA: [number, number] = [-29.079, -53.841]

const btnVer: React.CSSProperties = {
  padding: '3px 8px', background: '#eff6ff', color: '#2563eb',
  border: '1px solid #bfdbfe', borderRadius: 5, cursor: 'pointer',
  fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap',
}

type Mensagem = { id: string; texto: string; publica: boolean; autor_id: string | null; autor_nome: string; created_at: string }

// Entrada do histórico de mudanças de situação — req 152
type HistoricoEntry = { de: string; para: string; usuario: string; data: string }

// Membro da equipe (não-cidadão) para atribuição de responsável — req 129
type Equipe = { id: string; nome: string; perfil: string }

type Chamado = {
  id: string
  descricao: string
  categoria_nome: string
  categoria_boletim: CampoFormulario[]
  respostas_boletim: Record<string, unknown>
  situacao: string
  endereco: string | null
  latitude: number
  longitude: number
  foto_urls: string[]
  mensagens: Mensagem[]
  historico: HistoricoEntry[]
  analista_id: string | null
  analista_nome: string | null
  created_at: string
}

type Categoria = {
  id: string; nome: string; descricao: string | null; privada: boolean; ativa: boolean
  boletim: CampoFormulario[]
  categoria_pai_id: string | null; cor: string | null; icone_url: string | null
}

const SIT: Record<string, { label: string; color: string }> = {
  aberta:        { label: 'Aberta',          color: '#3b82f6' },
  em_analise:    { label: 'Em análise',      color: '#f59e0b' },
  em_andamento:  { label: 'Em andamento',    color: '#8b5cf6' },
  concluida:     { label: 'Concluída',       color: '#10b981' },
  cancelada:     { label: 'Cancelada',       color: '#9ca3af' },
}

export function AppMobileGestaoPage() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const { setPendingTarget } = useMapStore()
  const [selected, setSelected] = useState<Chamado | null>(null)
  const [filtroSit, setFiltroSit] = useState('')
  const [showBoletins, setShowBoletins] = useState(false)
  const [showMapa, setShowMapa] = useState(false)
  const [textoMsg, setTextoMsg] = useState('')
  const [msgPublica, setMsgPublica] = useState(true)
  const mapDiv = useRef<HTMLDivElement>(null)
  const lmap = useRef<L.Map | null>(null)
  const markersLayer = useRef<L.LayerGroup>(L.layerGroup())
  const rowRefs = useRef<Map<string, HTMLTableRowElement>>(new Map())

  const { data: chamados = [] } = useQuery<Chamado[]>({
    queryKey: ['chamados', filtroSit],
    queryFn: () => api.get(`/mobile/chamados${filtroSit ? `?situacao=${filtroSit}` : ''}`).then(r => r.data),
  })

  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ['mobile-categorias'],
    queryFn: () => api.get('/mobile/categorias').then(r => r.data),
  })

  // Equipe (não-cidadãos) para atribuição de responsável — req 129
  const { data: equipe = [] } = useQuery<Equipe[]>({
    queryKey: ['mobile-equipe'],
    queryFn: () => api.get('/mobile/equipe').then(r => r.data),
  })

  // Alterar categoria do chamado — notifica o cidadão (sino + push FCM) — req 143/144
  const alterarCategoria = useMutation({
    mutationFn: ({ id, categoriaId }: { id: string; categoriaId: string }) =>
      api.patch(`/mobile/chamados/${id}/categoria`, { categoriaId }),
    onSuccess: () => {
      toast.success('Categoria atualizada — cidadão notificado')
      qc.invalidateQueries({ queryKey: ['chamados'] })
    },
    onError: () => toast.error('Erro ao atualizar categoria'),
  })

  const atualizarSit = useMutation({
    mutationFn: ({ id, situacao }: { id: string; situacao: string }) =>
      api.patch(`/mobile/chamados/${id}/situacao`, { situacao }),
    onSuccess: () => {
      toast.success('Situação atualizada')
      qc.invalidateQueries({ queryKey: ['chamados'] })
    },
    onError: () => toast.error('Erro ao atualizar'),
  })

  // Atribuir responsável (analista) pelo chamado — req 129
  const atribuirAnalista = useMutation({
    mutationFn: ({ id, analistaId }: { id: string; analistaId: string | null }) =>
      api.patch(`/mobile/chamados/${id}/analista`, { analistaId }),
    onSuccess: (_data, vars) => {
      toast.success('Responsável atualizado')
      setSelected(s => s && s.id === vars.id
        ? { ...s, analista_id: vars.analistaId, analista_nome: equipe.find(e => e.id === vars.analistaId)?.nome ?? null }
        : s)
      qc.invalidateQueries({ queryKey: ['chamados'] })
    },
    onError: () => toast.error('Erro ao atribuir responsável'),
  })

  const enviarMensagem = useMutation({
    mutationFn: () => api.post(`/mobile/chamados/${selected!.id}/mensagens`, { texto: textoMsg, publica: msgPublica }),
    onSuccess: (res) => {
      toast.success(msgPublica ? 'Mensagem enviada ao cidadão' : 'Mensagem interna registrada')
      setTextoMsg('')
      setSelected(s => s ? { ...s, mensagens: [...(s.mensagens ?? []), res.data] } : s)
      qc.invalidateQueries({ queryKey: ['chamados'] })
    },
    onError: () => toast.error('Erro ao enviar mensagem'),
  })

  // Impressão da solicitação: mapa, mensagens, questionário e histórico — req 152
  function imprimirChamado(c: Chamado) {
    const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
    const sit = SIT[c.situacao]

    pdf.setFontSize(16)
    pdf.text('Solicitação de Chamado', 14, 20)
    pdf.setFontSize(10)
    pdf.text(`Categoria: ${c.categoria_nome}`, 14, 30)
    pdf.text(`Situação: ${sit?.label ?? c.situacao}`, 14, 36)
    pdf.text(`Aberto em: ${new Date(c.created_at).toLocaleString('pt-BR')}`, 14, 42)
    const descricao = pdf.splitTextToSize(`Descrição: ${c.descricao}`, 182)
    pdf.text(descricao, 14, 50)
    let y = 50 + descricao.length * 5 + 6

    // Mapa: localização da solicitação
    pdf.setFontSize(11)
    pdf.text('Localização', 14, y)
    pdf.setFontSize(10)
    y += 6
    pdf.text(`Endereço: ${c.endereco ?? '—'}`, 14, y)
    y += 6
    pdf.text(`Coordenadas: ${c.latitude?.toFixed(6)}, ${c.longitude?.toFixed(6)}`, 14, y)
    y += 6
    pdf.text(`Google Maps: https://www.google.com/maps?q=${c.latitude},${c.longitude}`, 14, y)
    y += 12

    // Questionário (boletim) respondido pelo cidadão
    if (c.categoria_boletim?.length > 0) {
      pdf.setFontSize(11)
      pdf.text('Questionário', 14, y)
      ;(pdf as any).autoTable({
        startY: y + 4,
        head: [['Pergunta', 'Resposta']],
        body: c.categoria_boletim.map(campo => {
          const resposta = c.respostas_boletim?.[campo.nome]
          const exibicao = campo.tipo === 'checkbox'
            ? (resposta ? 'Sim' : 'Não')
            : (resposta == null || resposta === '' ? '—' : String(resposta))
          return [campo.rotulo, exibicao]
        }),
        theme: 'striped',
        headStyles: { fillColor: [37, 99, 235] },
        styles: { fontSize: 9 },
        margin: { left: 14, right: 14 },
      })
      y = ((pdf as any).lastAutoTable?.finalY ?? y) + 12
    }

    // Mensagens públicas e privadas
    pdf.setFontSize(11)
    pdf.text('Mensagens', 14, y)
    y += 6
    pdf.setFontSize(9)
    if ((c.mensagens ?? []).length === 0) {
      pdf.text('Nenhuma mensagem registrada', 14, y)
      y += 6
    } else {
      for (const m of c.mensagens) {
        if (y > pdf.internal.pageSize.height - 20) { pdf.addPage(); y = 20 }
        const cabecalho = `${m.publica ? 'Pública' : 'Privada'} — ${m.autor_nome} — ${new Date(m.created_at).toLocaleString('pt-BR')}`
        pdf.text(cabecalho, 14, y)
        y += 5
        const texto = pdf.splitTextToSize(m.texto, 182)
        pdf.text(texto, 14, y)
        y += texto.length * 5 + 4
      }
    }
    y += 6

    // Histórico de mudanças de situação — req 152
    if (y > pdf.internal.pageSize.height - 30) { pdf.addPage(); y = 20 }
    pdf.setFontSize(11)
    pdf.text('Histórico', 14, y)
    y += 6
    pdf.setFontSize(9)
    pdf.text(`Aberto em ${new Date(c.created_at).toLocaleString('pt-BR')} — situação inicial: Aberta`, 14, y)
    y += 5
    if ((c.historico ?? []).length === 0) {
      pdf.text(`Sem alterações de situação — situação atual: ${sit?.label ?? c.situacao}`, 14, y)
    } else {
      for (const h of c.historico) {
        if (y > pdf.internal.pageSize.height - 20) { pdf.addPage(); y = 20 }
        const de = SIT[h.de]?.label ?? h.de
        const para = SIT[h.para]?.label ?? h.para
        pdf.text(`${new Date(h.data).toLocaleString('pt-BR')} — ${de} → ${para} (${h.usuario})`, 14, y)
        y += 5
      }
    }

    pdf.setFontSize(8)
    pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, pdf.internal.pageSize.height - 10)
    pdf.save(`Chamado_${c.id.slice(0, 8)}.pdf`)
  }

  const contadores = Object.fromEntries(
    Object.keys(SIT).map(k => [k, chamados.filter(c => c.situacao === k).length])
  )

  // Mapa embutido: clicar num marcador seleciona/destaca a linha na tabela — req 141
  useEffect(() => {
    if (!showMapa || !mapDiv.current || lmap.current) return
    const map = L.map(mapDiv.current, { center: TUPANCIRETA, zoom: 13, zoomControl: true })
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap', maxZoom: 20,
    }).addTo(map)
    markersLayer.current.addTo(map)
    lmap.current = map
    setTimeout(() => map.invalidateSize(), 100)
    return () => { map.remove(); lmap.current = null }
  }, [showMapa])

  useEffect(() => {
    if (!showMapa || !lmap.current) return
    const group = markersLayer.current
    group.clearLayers()
    chamados.forEach(c => {
      if (!c.latitude || !c.longitude) return
      const cor = SIT[c.situacao]?.color ?? '#9ca3af'
      const isSelected = selected?.id === c.id
      const marker = L.circleMarker([c.latitude, c.longitude], {
        radius: isSelected ? 9 : 6,
        color: isSelected ? '#1e3a5f' : cor,
        fillColor: cor, fillOpacity: 0.85, weight: isSelected ? 3 : 1,
      })
      marker.bindTooltip(`${c.categoria_nome} — ${SIT[c.situacao]?.label ?? c.situacao}`)
      marker.on('click', () => {
        setSelected(c)
        rowRefs.current.get(c.id)?.scrollIntoView({ block: 'nearest' })
      })
      group.addLayer(marker)
    })
  }, [chamados, selected, showMapa])

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Lista */}
      <div style={{ flex: 1, padding: 24, overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div>
            <h2 style={{ margin: 0, color: '#1e3a5f', fontSize: 20 }}>Gestão do App de Chamados</h2>
            <p style={{ margin: '4px 0 0', color: '#6b7280', fontSize: 13 }}>{chamados.length} chamados</p>
          </div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button
              onClick={() => setShowBoletins(true)}
              style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
            >
              📋 Categorias e boletins (req 132/134/135)
            </button>
            <button
              onClick={() => setShowMapa(s => !s)}
              style={{
                background: showMapa ? '#1e3a5f' : '#eff6ff', color: showMapa ? 'white' : '#1d4ed8',
                border: '1px solid #bfdbfe', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
              }}
            >
              🗺 {showMapa ? 'Ocultar mapa' : 'Mapa (req 141)'}
            </button>
          <select
            value={filtroSit}
            onChange={e => setFiltroSit(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
          >
            <option value="">Todas as situações</option>
            {Object.entries(SIT).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
            </select>
          </div>
        </div>

        {/* Contadores por situação */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20, flexWrap: 'wrap' }}>
          {Object.entries(SIT).map(([k, v]) => (
            <button
              key={k}
              onClick={() => setFiltroSit(filtroSit === k ? '' : k)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 8, cursor: 'pointer', fontSize: 12,
                border: `2px solid ${filtroSit === k ? v.color : '#e5e7eb'}`,
                background: filtroSit === k ? v.color + '15' : 'white',
                color: filtroSit === k ? v.color : '#374151',
                fontWeight: filtroSit === k ? 700 : 400,
              }}
            >
              <span style={{ fontWeight: 700, fontSize: 16 }}>{contadores[k] ?? 0}</span>
              {v.label}
            </button>
          ))}
        </div>

        {/* Mapa: clicar num marcador seleciona/destaca a linha na tabela — req 141 */}
        {showMapa && (
          <div ref={mapDiv} style={{ height: 320, borderRadius: 8, border: '1px solid #e5e7eb', marginBottom: 16 }} />
        )}

        {/* Tabela */}
        <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
                {['Categoria', 'Descrição', 'Endereço', 'Situação', 'Data', 'Mapa', 'Ações'].map(h => (
                  <th key={h} style={{ padding: '10px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chamados.map(c => {
                const sit = SIT[c.situacao] ?? { label: c.situacao, color: '#9ca3af' }
                const prox = { aberta: 'em_analise', em_analise: 'em_andamento', em_andamento: 'concluida' }[c.situacao]
                const proxLabel = { aberta: 'Analisar', em_analise: 'Iniciar', em_andamento: 'Concluir' }[c.situacao]
                return (
                  <tr
                    key={c.id}
                    ref={el => { if (el) rowRefs.current.set(c.id, el); else rowRefs.current.delete(c.id) }}
                    onClick={() => setSelected(c)}
                    style={{
                      borderBottom: '1px solid #f3f4f6', cursor: 'pointer',
                      background: selected?.id === c.id ? '#eff6ff' : 'white',
                    }}
                  >
                    <td style={{ padding: '10px 12px', fontWeight: 600, color: '#1e3a5f' }}>
                      {c.categoria_nome}
                    </td>
                    <td style={{ padding: '10px 12px', color: '#374151', maxWidth: 200 }}>
                      <span title={c.descricao} style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {c.descricao}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#6b7280', fontSize: 12 }}>
                      {c.endereco ?? `${c.latitude?.toFixed(4)}, ${c.longitude?.toFixed(4)}`}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span style={{ background: sit.color + '22', color: sit.color, padding: '2px 8px', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                        {sit.label}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#9ca3af', fontSize: 12 }}>
                      {new Date(c.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {c.latitude && c.longitude ? (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            setPendingTarget({ lat: c.latitude, lng: c.longitude, zoom: 18 })
                            navigate('/mapa')
                          }}
                          style={btnVer}
                        >
                          📍 Ver
                        </button>
                      ) : <span style={{ color: '#d1d5db', fontSize: 11 }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {prox && (
                        <button
                          onClick={e => { e.stopPropagation(); atualizarSit.mutate({ id: c.id, situacao: prox }) }}
                          style={{
                            background: SIT[prox]?.color + '22', color: SIT[prox]?.color,
                            border: 'none', padding: '4px 10px', borderRadius: 6,
                            cursor: 'pointer', fontSize: 12, fontWeight: 600,
                          }}
                        >
                          {proxLabel}
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
              {chamados.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                  Nenhum chamado encontrado
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detalhe */}
      {selected && (
        <div style={{ width: 320, background: 'white', borderLeft: '1px solid #e5e7eb', overflowY: 'auto', padding: 20, flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 15, color: '#1e3a5f' }}>{selected.categoria_nome}</h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => imprimirChamado(selected)}
                title="Imprimir solicitação (mapa, mensagens, questionário e histórico)"
                style={{ background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: 6, padding: '4px 10px', cursor: 'pointer', fontSize: 12 }}
              >
                🖨 Imprimir
              </button>
              <button onClick={() => setSelected(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af' }}>✕</button>
            </div>
          </div>

          <div style={{ fontSize: 13, marginBottom: 16, color: '#374151', lineHeight: 1.5 }}>
            {selected.descricao}
          </div>

          <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
            📍 {selected.endereco ?? `${selected.latitude?.toFixed(5)}, ${selected.longitude?.toFixed(5)}`}
          </div>

          <div style={{ marginBottom: 16 }}>
            {(() => {
              const sit = SIT[selected.situacao]
              return (
                <span style={{ background: sit?.color + '22', color: sit?.color, padding: '4px 12px', borderRadius: 12, fontSize: 12, fontWeight: 700 }}>
                  {sit?.label ?? selected.situacao}
                </span>
              )
            })()}
          </div>

          {/* Alterar categoria — notifica o cidadão (sino + push FCM) — req 143/144 */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 6px' }}>Categoria</p>
            <select
              value={selected.categoria_nome}
              onChange={e => {
                const nova = categorias.find(c => c.nome === e.target.value)
                if (nova && nova.nome !== selected.categoria_nome) {
                  alterarCategoria.mutate({ id: selected.id, categoriaId: nova.id })
                }
              }}
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
            >
              {!categorias.some(c => c.nome === selected.categoria_nome) && (
                <option value={selected.categoria_nome}>{selected.categoria_nome}</option>
              )}
              {categorias.map(c => <option key={c.id} value={c.nome}>{c.nome}</option>)}
            </select>
          </div>

          {/* Responsável (analista) pelo chamado — req 129 */}
          <div style={{ marginBottom: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 6px' }}>Responsável</p>
            <select
              value={selected.analista_id ?? ''}
              onChange={e => atribuirAnalista.mutate({ id: selected.id, analistaId: e.target.value || null })}
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13 }}
            >
              <option value="">— Não atribuído —</option>
              {equipe.map(u => <option key={u.id} value={u.id}>{u.nome} ({u.perfil})</option>)}
            </select>
          </div>

          {/* Fotos */}
          {selected.foto_urls?.length > 0 && (
            <div>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 8px' }}>Fotos</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {selected.foto_urls.map((url, i) => (
                  <a key={i} href={url} target="_blank" rel="noreferrer">
                    <img src={url} alt="foto" style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb' }} />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Respostas do Boletim (req 150) */}
          {selected.categoria_boletim?.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 8px' }}>
                Respostas do boletim
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {selected.categoria_boletim.map((campo, i) => {
                  const resposta = selected.respostas_boletim?.[campo.nome]
                  const exibicao = campo.tipo === 'checkbox'
                    ? (resposta ? 'Sim' : 'Não')
                    : (resposta == null || resposta === '' ? '—' : String(resposta))
                  return (
                    <div key={i} style={{ background: '#f9fafb', border: '1px solid #f3f4f6', borderRadius: 6, padding: '8px 10px' }}>
                      <p style={{ margin: '0 0 2px', fontSize: 11, color: '#6b7280' }}>{campo.rotulo}</p>
                      <p style={{ margin: 0, fontSize: 13, color: '#1e3a5f', fontWeight: 600 }}>{exibicao}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Mensagens públicas e privadas (req 147/148/149) */}
          <div style={{ marginTop: 16 }}>
            <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 8px' }}>
              Mensagens
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10 }}>
              {(selected.mensagens ?? []).map(m => (
                <div
                  key={m.id}
                  style={{
                    borderRadius: 6, padding: '8px 10px', fontSize: 12.5,
                    background: m.publica ? '#eff6ff' : '#fff7ed',
                    border: `1px solid ${m.publica ? '#bfdbfe' : '#fed7aa'}`,
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <span style={{ fontWeight: 700, color: m.publica ? '#1d4ed8' : '#c2410c' }}>
                      {m.publica ? '🌐 Pública — visível ao cidadão' : '🔒 Privada — uso interno'}
                    </span>
                    <span style={{ fontSize: 10, color: '#9ca3af' }}>{new Date(m.created_at).toLocaleString('pt-BR')}</span>
                  </div>
                  <p style={{ margin: '0 0 2px', color: '#374151' }}>{m.texto}</p>
                  <p style={{ margin: 0, fontSize: 10, color: '#9ca3af' }}>{m.autor_nome}</p>
                </div>
              ))}
              {(selected.mensagens ?? []).length === 0 && (
                <p style={{ fontSize: 12, color: '#9ca3af', fontStyle: 'italic', margin: 0 }}>Nenhuma mensagem registrada</p>
              )}
            </div>

            {/* Compositor — funciona mesmo com a solicitação finalizada (req 149) */}
            <textarea
              value={textoMsg}
              onChange={e => setTextoMsg(e.target.value)}
              placeholder="Escrever mensagem..."
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12.5, resize: 'vertical', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
              <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5 }}>
                <input type="checkbox" checked={msgPublica} onChange={e => setMsgPublica(e.target.checked)} />
                {msgPublica ? '🌐 Enviar como pública (notifica o cidadão — req 147)' : '🔒 Enviar como privada (req 148)'}
              </label>
              <button
                onClick={() => textoMsg.trim() && enviarMensagem.mutate()}
                disabled={enviarMensagem.isPending || !textoMsg.trim()}
                style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '7px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 12.5 }}
              >
                Enviar
              </button>
            </div>
          </div>

          <div style={{ marginTop: 16, padding: '10px 0', borderTop: '1px solid #f3f4f6', fontSize: 12, color: '#9ca3af' }}>
            Aberto em {new Date(selected.created_at).toLocaleString('pt-BR')}
          </div>

          {/* Ações de localização */}
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <a
              href={`https://www.google.com/maps?q=${selected.latitude},${selected.longitude}`}
              target="_blank"
              rel="noreferrer"
              style={{ flex: 1, textAlign: 'center', background: '#eff6ff', color: '#2563eb', padding: '8px', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}
            >
              Google Maps
            </a>
            {selected.latitude && selected.longitude && (
              <button
                onClick={() => {
                  setPendingTarget({ lat: selected.latitude, lng: selected.longitude, zoom: 18 })
                  navigate('/mapa')
                }}
                style={{ flex: 1, background: '#1e3a5f', color: 'white', border: 'none', padding: '8px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              >
                Ver no SIG
              </button>
            )}
          </div>
        </div>
      )}

      {showBoletins && <CategoriaConfigManager onClose={() => setShowBoletins(false)} />}
    </div>
  )
}

const catLabelSt = { fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 3, textTransform: 'uppercase' as const }
const catInputSt = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }

// Configuração de categorias do app de Chamados: hierarquia pai/filho (req 134),
// cor e ícone (req 135) e boletim/questionário do Fluxo de Trabalho (req 132)
function CategoriaConfigManager({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [campos, setCampos] = useState<CampoFormulario[]>([])
  const [categoriaPaiId, setCategoriaPaiId] = useState('')
  const [cor, setCor] = useState('#1e3a5f')
  const [iconeUrl, setIconeUrl] = useState('')
  const [privada, setPrivada] = useState(false)

  const { data: categorias = [] } = useQuery<Categoria[]>({
    queryKey: ['mobile-categorias'],
    queryFn: () => api.get('/mobile/categorias').then(r => r.data),
  })

  const categoria = categorias.find(c => c.id === selectedId) ?? null
  const raizes = categorias.filter(c => !c.categoria_pai_id)
  const filhasDe = (paiId: string) => categorias.filter(c => c.categoria_pai_id === paiId)

  useEffect(() => {
    setCampos(categoria?.boletim ?? [])
    setCategoriaPaiId(categoria?.categoria_pai_id ?? '')
    setCor(categoria?.cor ?? '#1e3a5f')
    setIconeUrl(categoria?.icone_url ?? '')
    setPrivada(categoria?.privada ?? false)
  }, [categoria])

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['mobile-categorias'] })
    qc.invalidateQueries({ queryKey: ['chamados'] })
  }

  const salvarConfig = useMutation({
    mutationFn: () => api.patch(`/mobile/categorias/${selectedId}`, {
      categoriaPaiId: categoriaPaiId || null, cor: cor || null, iconeUrl: iconeUrl || null, privada,
    }),
    onSuccess: () => { toast.success('Categoria atualizada'); invalidar() },
    onError: () => toast.error('Erro ao salvar categoria'),
  })

  const salvarBoletim = useMutation({
    mutationFn: () => api.put(`/mobile/categorias/${selectedId}/boletim`, { boletim: campos }),
    onSuccess: () => { toast.success('Boletim salvo'); invalidar() },
    onError: () => toast.error('Erro ao salvar boletim'),
  })

  const renderCategoria = (c: Categoria, nivel: number) => (
    <div key={c.id}>
      <div
        onClick={() => setSelectedId(c.id)}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '7px 10px', paddingLeft: 10 + nivel * 16, borderRadius: 6, cursor: 'pointer', marginBottom: 3, fontSize: 13,
          background: selectedId === c.id ? '#eff6ff' : 'transparent',
          border: selectedId === c.id ? '1px solid #bfdbfe' : '1px solid transparent',
          color: selectedId === c.id ? '#1d4ed8' : '#374151',
        }}
      >
        {c.cor && <span style={{ width: 10, height: 10, borderRadius: '50%', background: c.cor, flexShrink: 0, border: '1px solid rgba(0,0,0,0.15)' }} />}
        {c.icone_url && <img src={c.icone_url} alt="" style={{ width: 16, height: 16, objectFit: 'cover', borderRadius: 3, flexShrink: 0 }} />}
        <span style={{ flex: 1 }}>{c.nome}</span>
        {c.boletim?.length > 0 && (
          <span style={{ fontSize: 10, background: '#dcfce7', color: '#16a34a', borderRadius: 8, padding: '1px 6px', fontWeight: 700 }}>
            {c.boletim.length}
          </span>
        )}
      </div>
      {filhasDe(c.id).map(filha => renderCategoria(filha, nivel + 1))}
    </div>
  )

  return (
    <div
      onClick={onClose}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background: 'white', borderRadius: 10, width: 760, maxWidth: '92vw', maxHeight: '85vh', overflow: 'hidden', display: 'flex' }}
      >
        {/* Hierarquia de categorias (req 134) */}
        <div style={{ width: 240, borderRight: '1px solid #e5e7eb', overflowY: 'auto', padding: 16, flexShrink: 0 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 14, color: '#1e3a5f' }}>Categorias</h3>
          {raizes.map(c => renderCategoria(c, 0))}
          {categorias.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af' }}>Nenhuma categoria cadastrada</p>}
        </div>

        {/* Editor da categoria selecionada */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, fontSize: 15, color: '#1e3a5f' }}>
              Configurar categoria {categoria ? `— ${categoria.nome}` : ''}
            </h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, color: '#9ca3af' }}>✕</button>
          </div>

          {!categoria && <p style={{ fontSize: 13, color: '#9ca3af' }}>Selecione uma categoria para configurar hierarquia, cor, ícone e boletim.</p>}

          {categoria && (
            <>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
                <div>
                  <label style={catLabelSt}>Categoria pai (req 134)</label>
                  <select
                    value={categoriaPaiId}
                    onChange={e => setCategoriaPaiId(e.target.value)}
                    style={{ ...catInputSt, width: 220 }}
                  >
                    <option value="">— Categoria de nível superior —</option>
                    {categorias.filter(c => c.id !== categoria.id).map(c => (
                      <option key={c.id} value={c.id}>{c.nome}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={catLabelSt}>Cor (req 135)</label>
                  <input
                    type="color" value={cor} onChange={e => setCor(e.target.value)}
                    style={{ width: 44, height: 33, padding: 2, border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 220 }}>
                  <label style={catLabelSt}>Ícone — URL .png/.jpg (req 135)</label>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <input
                      value={iconeUrl} onChange={e => setIconeUrl(e.target.value)}
                      placeholder="https://.../icone.png"
                      style={{ ...catInputSt, flex: 1 }}
                    />
                    {iconeUrl && <img src={iconeUrl} alt="ícone" style={{ width: 30, height: 30, objectFit: 'cover', borderRadius: 4, border: '1px solid #e5e7eb' }} />}
                  </div>
                </div>
                <div>
                  <label style={catLabelSt}>&nbsp;</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, height: 33, fontSize: 13, color: '#374151', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                    <input type="checkbox" checked={privada} onChange={e => setPrivada(e.target.checked)} />
                    Categoria privada — somente fiscais (req 137)
                  </label>
                </div>
                <button
                  onClick={() => salvarConfig.mutate()}
                  disabled={salvarConfig.isPending}
                  style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
                >
                  Salvar categoria
                </button>
              </div>

              <hr style={{ border: 'none', borderTop: '1px solid #f3f4f6', margin: '6px 0 18px' }} />

              <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 6px' }}>
                Boletim (questionário) do Fluxo de Trabalho — req 132
              </p>
              <p style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
                Perguntas que o cidadão responde ao abrir uma solicitação desta categoria. As respostas ficam visíveis no detalhe do chamado (req 150).
              </p>
              <FormularioCampos campos={campos} onChange={setCampos} />
              <button
                onClick={() => salvarBoletim.mutate()}
                disabled={salvarBoletim.isPending}
                style={{ marginTop: 14, background: '#1e3a5f', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              >
                Salvar boletim
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
