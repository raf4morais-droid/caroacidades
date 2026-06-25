import { useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../../lib/api'
import toast from 'react-hot-toast'
import { BpmnEditor } from './BpmnEditor'
import { FormularioCampos, type CampoFormulario } from './FormularioCampos'

const PERFIS = ['ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS', 'FISCAL_CAMPO', 'CIDADAO'] as const

type Fluxo = { id: string; nome: string; setor: string | null; descricao: string | null; ativo: boolean; updated_at: string }
type Fase = {
  id?: string; nome: string; ordem: number; perfis: string[]
  tempo_medio_horas: number | null
  cor: string | null; duracao_minutos: number | null; avisar_duracao: boolean
  encerra_processo: boolean
  formulario: CampoFormulario[]
}
type FluxoDetalhe = Fluxo & { bpmn_xml: string | null; fases: Fase[] }

const inputSt = { padding: '7px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, outline: 'none' }
const labelSt = { fontSize: 11, fontWeight: 600, color: '#6b7280', display: 'block', marginBottom: 3, textTransform: 'uppercase' as const }

// Gerenciador de Fluxos BPMN do REURB (req 189-195): lista, editor visual do
// diagrama, configuração de setor/perfis/tempo médio por fase e formulários dinâmicos
export function FluxosBpmnManager() {
  const qc = useQueryClient()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [novoNome, setNovoNome] = useState('')
  const [criando, setCriando] = useState(false)

  const [nome, setNome] = useState('')
  const [setor, setSetor] = useState('')
  const [descricao, setDescricao] = useState('')
  const [bpmnXml, setBpmnXml] = useState('')
  const [fases, setFases] = useState<Fase[]>([])

  const { data: fluxos = [] } = useQuery<Fluxo[]>({
    queryKey: ['reurb-fluxos'],
    queryFn: () => api.get('/reurb/fluxos').then(r => r.data),
  })

  const { data: detalhe } = useQuery<FluxoDetalhe>({
    queryKey: ['reurb-fluxo', selectedId],
    queryFn: () => api.get(`/reurb/fluxos/${selectedId}`).then(r => r.data),
    enabled: !!selectedId,
  })

  useEffect(() => {
    if (!detalhe) return
    setNome(detalhe.nome)
    setSetor(detalhe.setor ?? '')
    setDescricao(detalhe.descricao ?? '')
    setBpmnXml(detalhe.bpmn_xml ?? '')
    setFases(detalhe.fases.map(f => ({
      ...f, perfis: f.perfis ?? [], formulario: f.formulario ?? [],
      cor: f.cor ?? null, duracao_minutos: f.duracao_minutos ?? null, avisar_duracao: f.avisar_duracao ?? false,
      encerra_processo: f.encerra_processo ?? false,
    })))
  }, [detalhe])

  const criar = useMutation({
    mutationFn: () => api.post('/reurb/fluxos', { nome: novoNome }),
    onSuccess: (res) => {
      toast.success('Fluxo criado')
      qc.invalidateQueries({ queryKey: ['reurb-fluxos'] })
      setSelectedId(res.data.id)
      setNovoNome('')
      setCriando(false)
    },
    onError: () => toast.error('Erro ao criar fluxo'),
  })

  const salvar = useMutation({
    mutationFn: () => api.put(`/reurb/fluxos/${selectedId}`, {
      nome, setor: setor || undefined, descricao: descricao || undefined, bpmnXml,
      fases: fases.map((f, i) => ({
        ...f, ordem: i + 1, tempoMedioHoras: f.tempo_medio_horas,
        duracaoMinutos: f.duracao_minutos, avisarDuracao: f.avisar_duracao,
        encerraProcesso: f.encerra_processo,
      })),
    }),
    onSuccess: () => {
      toast.success('Fluxo salvo')
      qc.invalidateQueries({ queryKey: ['reurb-fluxos'] })
      qc.invalidateQueries({ queryKey: ['reurb-fluxo', selectedId] })
    },
    onError: () => toast.error('Erro ao salvar fluxo'),
  })

  const toggleAtivo = useMutation({
    mutationFn: (ativo: boolean) => api.patch(`/reurb/fluxos/${selectedId}/ativo`, { ativo }),
    onSuccess: () => {
      toast.success('Status do fluxo atualizado')
      qc.invalidateQueries({ queryKey: ['reurb-fluxos'] })
      qc.invalidateQueries({ queryKey: ['reurb-fluxo', selectedId] })
    },
  })

  const excluir = useMutation({
    mutationFn: (id: string) => api.delete(`/reurb/fluxos/${id}`),
    onSuccess: () => {
      toast.success('Fluxo excluído')
      qc.invalidateQueries({ queryKey: ['reurb-fluxos'] })
      setSelectedId(null)
    },
    onError: () => toast.error('Erro ao excluir fluxo'),
  })

  const adicionarFase = () => setFases([...fases, {
    nome: `Fase ${fases.length + 1}`, ordem: fases.length + 1, perfis: [],
    tempo_medio_horas: null, cor: null, duracao_minutos: null, avisar_duracao: false,
    encerra_processo: false, formulario: [],
  }])
  const removerFase = (i: number) => setFases(fases.filter((_, idx) => idx !== i))
  const atualizarFase = (i: number, patch: Partial<Fase>) =>
    setFases(fases.map((f, idx) => (idx === i ? { ...f, ...patch } : f)))
  const moverFase = (i: number, dir: -1 | 1) => {
    const j = i + dir
    if (j < 0 || j >= fases.length) return
    const novas = [...fases]
    ;[novas[i], novas[j]] = [novas[j], novas[i]]
    setFases(novas)
  }
  const togglePerfilFase = (i: number, perfil: string) =>
    atualizarFase(i, {
      perfis: fases[i].perfis.includes(perfil)
        ? fases[i].perfis.filter(p => p !== perfil)
        : [...fases[i].perfis, perfil],
    })

  return (
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* Lista de fluxos */}
      <div style={{ width: 260, borderRight: '1px solid #e5e7eb', overflowY: 'auto', padding: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, color: '#1e3a5f' }}>Fluxos BPMN</h3>
          <button
            onClick={() => setCriando(c => !c)}
            style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
          >
            + Novo
          </button>
        </div>

        {criando && (
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <input
              autoFocus
              value={novoNome}
              onChange={e => setNovoNome(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && novoNome.trim() && criar.mutate()}
              placeholder="Nome do fluxo"
              style={{ ...inputSt, flex: 1, fontSize: 12, padding: '6px 8px' }}
            />
            <button
              onClick={() => novoNome.trim() && criar.mutate()}
              disabled={criar.isPending}
              style={{ background: '#dbeafe', color: '#1d4ed8', border: 'none', padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
            >
              Criar
            </button>
          </div>
        )}

        {fluxos.map(f => (
          <div
            key={f.id}
            onClick={() => setSelectedId(f.id)}
            style={{
              padding: '8px 10px', borderRadius: 6, cursor: 'pointer', marginBottom: 4, fontSize: 13,
              background: selectedId === f.id ? '#eff6ff' : 'transparent',
              border: selectedId === f.id ? '1px solid #bfdbfe' : '1px solid transparent',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 600, color: '#1e3a5f' }}>{f.nome}</span>
              <span style={{
                fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                background: f.ativo ? '#d1fae5' : '#f3f4f6', color: f.ativo ? '#059669' : '#6b7280',
              }}>
                {f.ativo ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            {f.setor && <span style={{ fontSize: 11, color: '#9ca3af' }}>{f.setor}</span>}
          </div>
        ))}
        {fluxos.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af' }}>Nenhum fluxo cadastrado</p>}
      </div>

      {/* Editor do fluxo selecionado */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
        {!detalhe && <p style={{ color: '#9ca3af', fontSize: 13 }}>Selecione ou crie um fluxo para configurar.</p>}

        {detalhe && (
          <>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
              <div>
                <label style={labelSt}>Nome</label>
                <input value={nome} onChange={e => setNome(e.target.value)} style={{ ...inputSt, width: 220 }} />
              </div>
              <div>
                <label style={labelSt}>Setor / Departamento (req 190)</label>
                <input value={setor} onChange={e => setSetor(e.target.value)} placeholder="Ex: Setor de Projetos" style={{ ...inputSt, width: 220 }} />
              </div>
              <div style={{ flex: 1, minWidth: 200 }}>
                <label style={labelSt}>Descrição</label>
                <input value={descricao} onChange={e => setDescricao(e.target.value)} style={{ ...inputSt, width: '100%' }} />
              </div>
              <button
                onClick={() => toggleAtivo.mutate(!detalhe.ativo)}
                style={{
                  padding: '7px 14px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                  background: detalhe.ativo ? '#fee2e2' : '#d1fae5', color: detalhe.ativo ? '#b91c1c' : '#059669',
                }}
              >
                {detalhe.ativo ? 'Desativar fluxo' : 'Ativar fluxo'}
              </button>
              <button
                onClick={() => salvar.mutate()}
                disabled={salvar.isPending}
                style={{ background: '#1e3a5f', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}
              >
                Salvar
              </button>
              <button
                onClick={() => { if (confirm(`Excluir o fluxo "${detalhe.nome}"?`)) excluir.mutate(detalhe.id) }}
                style={{ background: 'none', color: '#ef4444', border: '1px solid #fecaca', padding: '7px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
              >
                Excluir
              </button>
            </div>

            <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: '0 0 6px' }}>
              Diagrama do fluxo (req 189)
            </p>
            <div style={{ height: 380, border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 24 }}>
              <BpmnEditor xml={bpmnXml} reloadKey={detalhe.id} onChange={setBpmnXml} />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
              <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', margin: 0 }}>
                Fases / User Tasks (req 191, 193, 194, 195)
              </p>
              <button
                onClick={adicionarFase}
                style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', padding: '5px 12px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
              >
                + Adicionar fase
              </button>
            </div>

            {fases.map((fase, i) => (
              <div key={i} style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 14, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <label style={labelSt}>Ordem (req 131)</label>
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button
                        onClick={() => moverFase(i, -1)} disabled={i === 0} title="Mover para cima"
                        style={{ ...inputSt, padding: '4px 9px', cursor: i === 0 ? 'default' : 'pointer', opacity: i === 0 ? 0.4 : 1 }}
                      >▲</button>
                      <button
                        onClick={() => moverFase(i, 1)} disabled={i === fases.length - 1} title="Mover para baixo"
                        style={{ ...inputSt, padding: '4px 9px', cursor: i === fases.length - 1 ? 'default' : 'pointer', opacity: i === fases.length - 1 ? 0.4 : 1 }}
                      >▼</button>
                      <span style={{ ...inputSt, padding: '7px 10px', background: '#eff6ff', color: '#1d4ed8', fontWeight: 700 }}>{i + 1}</span>
                    </div>
                  </div>
                  <div>
                    <label style={labelSt}>Nome da fase</label>
                    <input value={fase.nome} onChange={e => atualizarFase(i, { nome: e.target.value })} style={{ ...inputSt, width: 220 }} />
                  </div>
                  <div>
                    <label style={labelSt}>Cor (req 128)</label>
                    <input
                      type="color"
                      value={fase.cor ?? '#1e3a5f'}
                      onChange={e => atualizarFase(i, { cor: e.target.value })}
                      style={{ width: 44, height: 33, padding: 2, border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}
                    />
                  </div>
                  <div>
                    <label style={labelSt}>Duração da fase (minutos) — req 128</label>
                    <input
                      type="number" min={0}
                      value={fase.duracao_minutos ?? ''}
                      onChange={e => atualizarFase(i, { duracao_minutos: e.target.value === '' ? null : Number(e.target.value) })}
                      style={{ ...inputSt, width: 140 }}
                    />
                  </div>
                  <div>
                    <label style={labelSt}>Tempo médio (horas) — req 193</label>
                    <input
                      type="number" min={0}
                      value={fase.tempo_medio_horas ?? ''}
                      onChange={e => atualizarFase(i, { tempo_medio_horas: e.target.value === '' ? null : Number(e.target.value) })}
                      style={{ ...inputSt, width: 140 }}
                    />
                  </div>
                  <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, paddingBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={fase.avisar_duracao}
                      onChange={e => atualizarFase(i, { avisar_duracao: e.target.checked })}
                    />
                    Avisar quando exceder a duração (req 128)
                  </label>
                  <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 5, paddingBottom: 8 }}>
                    <input
                      type="checkbox"
                      checked={fase.encerra_processo}
                      onChange={e => atualizarFase(i, { encerra_processo: e.target.checked })}
                    />
                    Fase de encerramento (finaliza o processo ao ser concluída) — req 130
                  </label>
                  <div style={{ marginLeft: 'auto' }}>
                    <button onClick={() => removerFase(i)} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 13 }}>
                      Remover fase
                    </button>
                  </div>
                </div>

                <label style={labelSt}>Perfis com acesso a esta fase (req 191)</label>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                  {PERFIS.map(perfil => (
                    <label key={perfil} style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <input type="checkbox" checked={fase.perfis.includes(perfil)} onChange={() => togglePerfilFase(i, perfil)} />
                      {perfil}
                    </label>
                  ))}
                </div>

                <label style={labelSt}>Formulário desta fase (req 194/195)</label>
                <FormularioCampos campos={fase.formulario} onChange={campos => atualizarFase(i, { formulario: campos })} />
              </div>
            ))}
            {fases.length === 0 && <p style={{ fontSize: 12, color: '#9ca3af' }}>Nenhuma fase configurada — adicione fases para definir o fluxo de aprovação.</p>}
          </>
        )}
      </div>
    </div>
  )
}
