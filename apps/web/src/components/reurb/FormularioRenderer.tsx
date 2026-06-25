import { useEffect } from 'react'
import { useMapStore } from '../../store/map.store'
import { useAuthStore } from '../../store/auth.store'
import { SIGMap } from '../map/SIGMap'
import type { CampoFormulario } from './FormularioCampos'

// Aplica máscara de CPF (11 dígitos: XXX.XXX.XXX-XX) ou telefone ((XX) XXXX[X]-XXXX)
function maskCpfTelefone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 11)
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  let out = ''
  if (d.length > 0) out += `(${d.slice(0, 2)}`
  if (d.length >= 2) out += ') '
  if (d.length > 2) out += d.slice(2, d.length > 6 ? 7 : d.length)
  if (d.length > 6) out += `-${d.slice(7)}`
  return out
}

const labelSt = { fontSize: 12, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 4 }
const inputSt = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none', width: '100%' }

// Renderiza o formulário dinâmico configurado para a fase (req 194) e
// preenche `valores[campo.nome]` conforme o usuário interage
export function FormularioRenderer({
  campos, valores, onChange,
}: {
  campos: CampoFormulario[]
  valores: Record<string, unknown>
  onChange: (nome: string, valor: unknown) => void
}) {
  const { selectedParcelaId } = useMapStore()
  const { perfil } = useAuthStore()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {campos.map(campo => {
        if (campo.perfisVisiveis?.length && !campo.perfisVisiveis.includes(perfil ?? '')) return null
        return (
          <div key={campo.nome}>
            <label style={labelSt}>{campo.rotulo}{campo.obrigatorio && ' *'}</label>

            {campo.tipo === 'texto' && (
              <input
                value={String(valores[campo.nome] ?? '')}
                onChange={e => onChange(campo.nome, e.target.value)}
                style={inputSt}
              />
            )}

            {campo.tipo === 'checkbox' && (
              <input
                type="checkbox"
                checked={!!valores[campo.nome]}
                onChange={e => onChange(campo.nome, e.target.checked)}
                style={{ width: 18, height: 18 }}
              />
            )}

            {campo.tipo === 'cpf_telefone' && (
              <input
                value={String(valores[campo.nome] ?? '')}
                onChange={e => onChange(campo.nome, maskCpfTelefone(e.target.value))}
                placeholder="000.000.000-00 ou (00) 00000-0000"
                style={inputSt}
              />
            )}

            {campo.tipo === 'mapa' && (
              <CampoMapa nome={campo.nome} valor={valores[campo.nome]} onChange={onChange} selectedParcelaId={selectedParcelaId} />
            )}
          </div>
        )
      })}
    </div>
  )
}

function CampoMapa({
  nome, valor, onChange, selectedParcelaId,
}: {
  nome: string
  valor: unknown
  onChange: (nome: string, valor: unknown) => void
  selectedParcelaId: string | null
}) {
  // Sincroniza a parcela escolhida no mini-mapa com o valor do campo do formulário
  useEffect(() => {
    if (selectedParcelaId && selectedParcelaId !== valor) onChange(nome, selectedParcelaId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedParcelaId])

  return (
    <div>
      <div style={{ height: 220, borderRadius: 8, overflow: 'hidden', border: '1px solid #d1d5db' }}>
        <SIGMap compact />
      </div>
      <p style={{ margin: '6px 0 0', fontSize: 12, color: '#6b7280' }}>
        Imóvel selecionado: <strong>{(valor as string) ?? '— clique em uma parcela no mapa —'}</strong>
      </p>
    </div>
  )
}
