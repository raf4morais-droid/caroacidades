import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import jsPDF from 'jspdf'
import api from '../lib/api'
import toast from 'react-hot-toast'

type TipoViabilidade = 'edificacao' | 'parcelamento' | 'cnae'

type ConsultaHistorico = {
  id: string
  codigo_verificacao: string
  tipo: TipoViabilidade
  resultado: string
  observacoes: string | null
  parametros: any
  parcela_codigo: string
  created_at: string
}

const TIPO_LABEL: Record<string, string> = { edificacao: 'Edificação', parcelamento: 'Parcelamento', cnae: 'CNAE' }
const RESULTADO_LABEL: Record<string, string> = { viavel: 'VIÁVEL', inviavel: 'INVIÁVEL', condicional: 'CONDICIONAL' }

// Reimpressão da consulta em PDF (req 43) — sem imagem do mapa (mesmo critério honesto do req 152
function imprimirConsulta(c: {
  tipo: string
  resultado: string
  observacoes?: string | null
  parametros?: any
  codigo_verificacao: string
  created_at?: string
  parcela_codigo?: string
}) {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' })
  pdf.setFontSize(16)
  pdf.text('Consulta de Viabilidade Urbana', 14, 20)
  pdf.setFontSize(10)
  let y = 32
  pdf.text(`Tipo: ${TIPO_LABEL[c.tipo] ?? c.tipo}`, 14, y); y += 6
  if (c.parcela_codigo) { pdf.text(`Parcela: ${c.parcela_codigo}`, 14, y); y += 6 }
  pdf.text(`Resultado: ${RESULTADO_LABEL[c.resultado] ?? c.resultado}`, 14, y); y += 6
  if (c.created_at) { pdf.text(`Data: ${new Date(c.created_at).toLocaleString('pt-BR')}`, 14, y); y += 6 }
  y += 4

  if (c.parametros?.zona) {
    pdf.setFontSize(11)
    pdf.text(`Parâmetros da zona (${c.parametros.zona})`, 14, y)
    pdf.setFontSize(10)
    y += 7
    if (c.parametros.to) { pdf.text(`Taxa de Ocupação: ${c.parametros.to}%`, 14, y); y += 6 }
    if (c.parametros.caMax) { pdf.text(`CA máximo: ${c.parametros.caMax}`, 14, y); y += 6 }
    if (c.parametros.afastamentoFrontal) { pdf.text(`Afastamento frontal: ${c.parametros.afastamentoFrontal} m`, 14, y); y += 6 }
    if (c.parametros.gabarito) { pdf.text(`Gabarito máximo: ${c.parametros.gabarito} m`, 14, y); y += 6 }
    y += 4
  }

  if (c.observacoes) {
    pdf.setFontSize(11)
    pdf.text('Observações', 14, y)
    pdf.setFontSize(9)
    y += 6
    pdf.text(pdf.splitTextToSize(c.observacoes, 182), 14, y)
    y += 12
  }

  pdf.setFontSize(8)
  pdf.text(`Código de verificação: ${c.codigo_verificacao}`, 14, pdf.internal.pageSize.height - 16)
  pdf.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, 14, pdf.internal.pageSize.height - 10)
  pdf.save(`Viabilidade_${c.codigo_verificacao.slice(0, 8)}.pdf`)
}

export function ViabilidadePage() {
  const qc = useQueryClient()
  const [tipo, setTipo] = useState<TipoViabilidade>('edificacao')
  const [parcelaId, setParcelaId] = useState('')
  const [cnae, setCnae] = useState('')
  const [tipoObra, setTipoObra] = useState('residencial')
  const [resultado, setResultado] = useState<any>(null)

  const consultar = useMutation({
    mutationFn: () => {
      if (tipo === 'edificacao') return api.post('/viabilidade/edificacao', { parcelaId, tipoObra }).then(r => r.data)
      if (tipo === 'parcelamento') return api.post('/viabilidade/parcelamento', { parcelaId }).then(r => r.data)
      return api.post('/viabilidade/cnae', { parcelaId, cnaeCodigo: cnae }).then(r => r.data)
    },
    onSuccess: (data) => {
      setResultado(data)
      qc.invalidateQueries({ queryKey: ['viabilidade-historico'] })
    },
    onError: () => toast.error('Erro ao consultar viabilidade'),
  })

  // req 43: histórico de consultas emitidas, com reimpressão em PDF
  const { data: historico = [] } = useQuery<ConsultaHistorico[]>({
    queryKey: ['viabilidade-historico'],
    queryFn: () => api.get('/viabilidade/historico').then(r => r.data.data ?? []),
  })

  const COR: Record<string, string> = { viavel: '#22c55e', inviavel: '#ef4444', condicional: '#f59e0b' }

  return (
    <div style={{ padding: 24, maxWidth: 700 }}>
      <h2 style={{ margin: '0 0 24px', color: '#1e3a5f' }}>Consulta de Viabilidade Urbana</h2>

      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {(['edificacao', 'parcelamento', 'cnae'] as TipoViabilidade[]).map(t => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              style={{
                padding: '8px 18px', border: '1px solid', borderRadius: 6, cursor: 'pointer', fontSize: 13,
                background: tipo === t ? '#2563eb' : 'white',
                color: tipo === t ? 'white' : '#374151',
                borderColor: tipo === t ? '#2563eb' : '#d1d5db',
              }}
            >
              {{ edificacao: 'Edificação', parcelamento: 'Parcelamento', cnae: 'CNAE' }[t]}
            </button>
          ))}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>ID da Parcela *</label>
          <input
            value={parcelaId}
            onChange={e => setParcelaId(e.target.value)}
            placeholder="UUID da parcela (ou clique no mapa)"
            style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
          />
        </div>

        {tipo === 'edificacao' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Tipo de Obra</label>
            <select
              value={tipoObra}
              onChange={e => setTipoObra(e.target.value)}
              style={{ padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, width: '100%' }}
            >
              <option value="residencial">Residencial unifamiliar</option>
              <option value="residencial_multi">Residencial multifamiliar</option>
              <option value="comercial">Comercial</option>
              <option value="industrial">Industrial</option>
              <option value="institucional">Institucional</option>
            </select>
          </div>
        )}

        {tipo === 'cnae' && (
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Código CNAE *</label>
            <input
              value={cnae}
              onChange={e => setCnae(e.target.value)}
              placeholder="Ex: 4711-3/01"
              style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' }}
            />
          </div>
        )}

        <button
          onClick={() => consultar.mutate()}
          disabled={!parcelaId || consultar.isPending}
          style={{
            padding: '10px 24px', background: '#2563eb', color: 'white',
            border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 14, fontWeight: 600,
          }}
        >
          {consultar.isPending ? 'Consultando...' : 'Consultar'}
        </button>
      </div>

      {resultado && (
        <div style={{
          background: 'white', border: `2px solid ${COR[resultado.resultado]}`,
          borderRadius: 8, padding: 24,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ margin: 0, color: '#1e3a5f' }}>Resultado da Consulta</h3>
            <span style={{
              background: COR[resultado.resultado] + '22',
              color: COR[resultado.resultado],
              padding: '4px 14px', borderRadius: 20, fontWeight: 700, fontSize: 14,
            }}>
              {({ viavel: 'VIÁVEL', inviavel: 'INVIÁVEL', condicional: 'CONDICIONAL' } as Record<string, string>)[resultado.resultado]}
            </span>
          </div>

          <p style={{ margin: '0 0 12px', fontSize: 14, color: '#374151' }}>{resultado.observacoes}</p>

          {resultado.parametros && (
            <div style={{ background: '#f9fafb', borderRadius: 6, padding: 16, fontSize: 13 }}>
              <strong>Parâmetros da zona ({resultado.parametros.zona}):</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 20 }}>
                {resultado.parametros.to && <li>Taxa de Ocupação: {resultado.parametros.to}%</li>}
                {resultado.parametros.caMax && <li>CA máximo: {resultado.parametros.caMax}</li>}
                {resultado.parametros.afastamentoFrontal && <li>Afastamento frontal: {resultado.parametros.afastamentoFrontal} m</li>}
                {resultado.parametros.gabarito && <li>Gabarito máximo: {resultado.parametros.gabarito} m</li>}
              </ul>
            </div>
          )}

          <div style={{ marginTop: 16, padding: '10px 14px', background: '#f3f4f6', borderRadius: 6, fontSize: 12, color: '#6b7280', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Código de verificação: <strong style={{ fontFamily: 'monospace' }}>{resultado.codigo_verificacao}</strong></span>
            <button
              onClick={() => imprimirConsulta({ ...resultado, tipo })}
              style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '6px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
            >
              🖨 Imprimir PDF
            </button>
          </div>
        </div>
      )}

      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 8, padding: 24, marginTop: 24 }}>
        <h3 style={{ margin: '0 0 16px', color: '#1e3a5f', fontSize: 16 }}>Histórico de Consultas Emitidas</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {['Código', 'Tipo', 'Parcela', 'Resultado', 'Data', 'Ações'].map(h => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 600, color: '#374151', fontSize: 12 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {historico.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                <td style={{ padding: '8px 10px', fontFamily: 'monospace', fontSize: 11 }}>{c.codigo_verificacao.slice(0, 8)}</td>
                <td style={{ padding: '8px 10px' }}>{TIPO_LABEL[c.tipo] ?? c.tipo}</td>
                <td style={{ padding: '8px 10px', color: '#6b7280' }}>{c.parcela_codigo ?? '—'}</td>
                <td style={{ padding: '8px 10px' }}>
                  <span style={{ background: (COR[c.resultado] ?? '#9ca3af') + '22', color: COR[c.resultado] ?? '#9ca3af', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>
                    {RESULTADO_LABEL[c.resultado] ?? c.resultado}
                  </span>
                </td>
                <td style={{ padding: '8px 10px', color: '#6b7280' }}>{new Date(c.created_at).toLocaleDateString('pt-BR')}</td>
                <td style={{ padding: '8px 10px' }}>
                  <button
                    onClick={() => imprimirConsulta(c)}
                    style={{ background: '#eff6ff', color: '#1d4ed8', border: 'none', padding: '4px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                  >
                    🖨 PDF
                  </button>
                </td>
              </tr>
            ))}
            {historico.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>Nenhuma consulta emitida</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
