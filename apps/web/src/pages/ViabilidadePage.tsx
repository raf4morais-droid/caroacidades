import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import api from '../lib/api'
import toast from 'react-hot-toast'

type TipoViabilidade = 'edificacao' | 'parcelamento' | 'cnae'

export function ViabilidadePage() {
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
    onSuccess: (data) => setResultado(data),
    onError: () => toast.error('Erro ao consultar viabilidade'),
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
              {{ viavel: 'VIÁVEL', inviavel: 'INVIÁVEL', condicional: 'CONDICIONAL' }[resultado.resultado]}
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

          <div style={{ marginTop: 16, padding: '10px 14px', background: '#f3f4f6', borderRadius: 6, fontSize: 12, color: '#6b7280' }}>
            Código de verificação: <strong style={{ fontFamily: 'monospace' }}>{resultado.codigo_verificacao}</strong>
          </div>
        </div>
      )}
    </div>
  )
}
