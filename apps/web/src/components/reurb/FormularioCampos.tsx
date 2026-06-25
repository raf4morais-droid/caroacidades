import type { CSSProperties } from 'react'

export type TipoCampo = 'texto' | 'checkbox' | 'mapa' | 'cpf_telefone'

export const TODOS_PERFIS = ['ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO', 'CIDADAO'] as const

export type CampoFormulario = {
  nome: string
  rotulo: string
  tipo: TipoCampo
  obrigatorio?: boolean
  // req 195: lista de perfis que podem ver este campo; undefined = todos os perfis
  perfisVisiveis?: string[]
}

const TIPOS: { value: TipoCampo; label: string }[] = [
  { value: 'texto',        label: 'Texto simples' },
  { value: 'checkbox',     label: 'Checkbox (sim/não)' },
  { value: 'mapa',         label: 'Mapa simples (selecionar imóvel)' },
  { value: 'cpf_telefone', label: 'CPF / telefone (com máscara)' },
]

const inputSt: CSSProperties = { padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12 }

function togglePerfil(perfis: string[] | undefined, perfil: string): string[] {
  const atual = perfis ?? [...TODOS_PERFIS]
  return atual.includes(perfil) ? atual.filter(p => p !== perfil) : [...atual, perfil]
}

// Construtor de formulário dinâmico por fase (req 194/195) — define campos
// de até 4 tipos (texto, checkbox, mapa simples, CPF/telefone), obrigatoriedade
// e ACL por perfil (req 195)
export function FormularioCampos({ campos, onChange }: { campos: CampoFormulario[]; onChange: (campos: CampoFormulario[]) => void }) {
  const atualizar = (i: number, patch: Partial<CampoFormulario>) => {
    onChange(campos.map((c, idx) => (idx === i ? { ...c, ...patch } : c)))
  }
  const remover = (i: number) => onChange(campos.filter((_, idx) => idx !== i))
  const adicionar = () => onChange([...campos, { nome: `campo_${campos.length + 1}`, rotulo: '', tipo: 'texto', obrigatorio: false }])

  return (
    <div>
      {campos.map((campo, i) => (
        <div key={i} style={{ marginBottom: 10, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 8, background: 'white' }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
            <input
              value={campo.rotulo}
              onChange={e => atualizar(i, { rotulo: e.target.value })}
              placeholder="Rótulo do campo"
              style={{ ...inputSt, flex: 1 }}
            />
            <select value={campo.tipo} onChange={e => atualizar(i, { tipo: e.target.value as TipoCampo })} style={{ ...inputSt, width: 200 }}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <label style={{ fontSize: 11, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
              <input type="checkbox" checked={!!campo.obrigatorio} onChange={e => atualizar(i, { obrigatorio: e.target.checked })} />
              Obrigatório
            </label>
            <button onClick={() => remover(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14 }}>✕</button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 11, color: '#6b7280', whiteSpace: 'nowrap' }}>Visível para:</span>
            {TODOS_PERFIS.map(perfil => {
              const visivel = (campo.perfisVisiveis ?? [...TODOS_PERFIS]).includes(perfil)
              return (
                <label key={perfil} style={{ fontSize: 11, color: visivel ? '#1d4ed8' : '#9ca3af', display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={visivel}
                    onChange={() => atualizar(i, { perfisVisiveis: togglePerfil(campo.perfisVisiveis, perfil) })}
                  />
                  {perfil}
                </label>
              )
            })}
          </div>
        </div>
      ))}
      <button
        onClick={adicionar}
        style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
      >
        + Adicionar campo
      </button>
    </div>
  )
}
