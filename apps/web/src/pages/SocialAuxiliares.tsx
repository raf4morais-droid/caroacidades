import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import toast from 'react-hot-toast'
import api from '../lib/api'

type Option = { value: string; label: string }

type Field = {
  key: string
  label: string
  type: 'text' | 'number' | 'date' | 'select'
  options?: Option[]
  required?: boolean
  default?: string
  span?: boolean
}

type Column = { key: string; label: string; render?: (value: any, item: any) => React.ReactNode }

const inputSt: React.CSSProperties = {
  padding: '6px 8px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 12, boxSizing: 'border-box', width: '100%',
}
const saveBtnSt: React.CSSProperties = {
  background: '#1e3a5f', color: 'white', border: 'none', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 12,
}

// Componente genérico de CRUD para os cadastros auxiliares do Módulo Social
// (Tipos de Entidade, Entidades, Serviços Sociais, Programas, Empreendimentos
// e Eventos Sociais — req 87)
export function CatalogManager({ title, endpoint, fields, columns }: {
  title: string; endpoint: string; fields: Field[]; columns: Column[]
}) {
  const qc = useQueryClient()
  const queryKey = ['social-catalog', endpoint]
  const { data: items = [] } = useQuery<any[]>({
    queryKey,
    queryFn: () => api.get(endpoint).then(r => r.data),
  })
  const [form, setForm] = useState<Record<string, string>>({})

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const add = useMutation({
    mutationFn: () => {
      const payload: Record<string, unknown> = {}
      fields.forEach(f => {
        const v = form[f.key]
        if (f.type === 'number') payload[f.key] = v ? Number(v) : null
        else payload[f.key] = v || f.default || null
      })
      return api.post(endpoint, payload)
    },
    onSuccess: () => {
      toast.success('Adicionado')
      setForm({})
      qc.invalidateQueries({ queryKey })
    },
    onError: () => toast.error('Erro ao adicionar'),
  })

  const del = useMutation({
    mutationFn: (id: string) => api.delete(`${endpoint}/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
    onError: () => toast.error('Erro ao remover'),
  })

  const requiredOk = fields.filter(f => f.required).every(f => (form[f.key] ?? '').trim())

  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#374151', margin: '0 0 6px' }}>{title}</p>
      <div style={{ background: 'white', border: '1px solid #e5e7eb', borderRadius: 6, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f9fafb', borderBottom: '1px solid #e5e7eb' }}>
              {columns.map(c => (
                <th key={c.key} style={{ padding: '6px 8px', textAlign: 'left', fontWeight: 600, color: '#374151' }}>{c.label}</th>
              ))}
              <th style={{ width: 32 }} />
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id} style={{ borderBottom: '1px solid #f3f4f6' }}>
                {columns.map(c => (
                  <td key={c.key} style={{ padding: '6px 8px' }}>
                    {c.render ? c.render(item[c.key], item) : (item[c.key] ?? '—')}
                  </td>
                ))}
                <td style={{ padding: '6px 8px', textAlign: 'center' }}>
                  <button onClick={() => del.mutate(item.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>✕</button>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={columns.length + 1} style={{ padding: 12, textAlign: 'center', color: '#9ca3af' }}>Nenhum registro</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginTop: 8 }}>
        {fields.map(f => (
          <div key={f.key} style={{ gridColumn: f.span ? '1 / -1' : undefined }}>
            {f.type === 'select' ? (
              <select value={form[f.key] ?? ''} onChange={e => set(f.key, e.target.value)} style={inputSt}>
                <option value="">{f.label}</option>
                {(f.options ?? []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input
                type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'}
                placeholder={f.label + (f.required ? '*' : '')}
                value={form[f.key] ?? ''}
                onChange={e => set(f.key, e.target.value)}
                style={inputSt}
              />
            )}
          </div>
        ))}
      </div>
      <button onClick={() => add.mutate()} disabled={!requiredOk || add.isPending} style={{ ...saveBtnSt, marginTop: 6 }}>+ Adicionar</button>
    </div>
  )
}

const TABS = [
  { key: 'tipos', label: 'Tipos de Entidade' },
  { key: 'entidades', label: 'Entidades' },
  { key: 'servicos', label: 'Serviços Sociais' },
  { key: 'programas', label: 'Programas' },
  { key: 'empreendimentos', label: 'Empreendimentos' },
  { key: 'eventos', label: 'Eventos' },
] as const

const SITUACOES_EMPREENDIMENTO: Option[] = [
  { value: 'planejamento', label: 'Planejamento' },
  { value: 'em_obras', label: 'Em obras' },
  { value: 'concluido', label: 'Concluído' },
  { value: 'entregue', label: 'Entregue' },
]

// Painel colapsável com os cadastros auxiliares do Módulo Social — req 87
export function CadastrosAuxiliaresPanel() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<typeof TABS[number]['key']>('entidades')

  const { data: tiposEntidade = [] } = useQuery<{ id: string; nome: string }[]>({
    queryKey: ['social-catalog', '/social/tipos-entidade'],
    queryFn: () => api.get('/social/tipos-entidade').then(r => r.data),
    enabled: open,
  })
  const { data: entidades = [] } = useQuery<{ id: string; nome: string }[]>({
    queryKey: ['social-catalog', '/social/entidades'],
    queryFn: () => api.get('/social/entidades').then(r => r.data),
    enabled: open,
  })
  const { data: servicos = [] } = useQuery<{ id: string; nome: string }[]>({
    queryKey: ['social-catalog', '/social/servicos'],
    queryFn: () => api.get('/social/servicos').then(r => r.data),
    enabled: open,
  })

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        style={{ background: '#eff6ff', color: '#1d4ed8', border: '1px solid #bfdbfe', borderRadius: 6, padding: '8px 12px', fontSize: 12, cursor: 'pointer', marginBottom: 16 }}
      >
        ⚙ Cadastros auxiliares
      </button>
    )
  }

  return (
    <div style={{ background: 'white', borderRadius: 8, border: '1px solid #e5e7eb', padding: 16, marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#374151', textTransform: 'uppercase' }}>Cadastros auxiliares</p>
        <button onClick={() => setOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: '#9ca3af' }}>✕</button>
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '4px 10px', borderRadius: 12, fontSize: 12, cursor: 'pointer',
              border: '1px solid ' + (tab === t.key ? '#1e3a5f' : '#d1d5db'),
              background: tab === t.key ? '#1e3a5f' : 'white',
              color: tab === t.key ? 'white' : '#374151',
            }}
          >{t.label}</button>
        ))}
      </div>

      {tab === 'tipos' && (
        <CatalogManager
          title="Tipos de Entidade"
          endpoint="/social/tipos-entidade"
          fields={[{ key: 'nome', label: 'Nome', type: 'text', required: true }]}
          columns={[{ key: 'nome', label: 'Nome' }]}
        />
      )}
      {tab === 'entidades' && (
        <CatalogManager
          title="Entidades"
          endpoint="/social/entidades"
          fields={[
            { key: 'nome', label: 'Nome', type: 'text', required: true, span: true },
            { key: 'tipoEntidadeId', label: 'Tipo de entidade', type: 'select', options: tiposEntidade.map(t => ({ value: t.id, label: t.nome })) },
            { key: 'cnpj', label: 'CNPJ', type: 'text' },
            { key: 'telefone', label: 'Telefone', type: 'text' },
            { key: 'contato', label: 'Contato', type: 'text' },
            { key: 'endereco', label: 'Endereço', type: 'text', span: true },
          ]}
          columns={[
            { key: 'nome', label: 'Nome' },
            { key: 'tipo_entidade_nome', label: 'Tipo' },
            { key: 'telefone', label: 'Telefone' },
            { key: 'contato', label: 'Contato' },
          ]}
        />
      )}
      {tab === 'servicos' && (
        <CatalogManager
          title="Serviços Sociais"
          endpoint="/social/servicos"
          fields={[
            { key: 'nome', label: 'Nome', type: 'text', required: true, span: true },
            { key: 'entidadeId', label: 'Entidade', type: 'select', options: entidades.map(e => ({ value: e.id, label: e.nome })) },
            { key: 'descricao', label: 'Descrição', type: 'text', span: true },
          ]}
          columns={[
            { key: 'nome', label: 'Nome' },
            { key: 'entidade_nome', label: 'Entidade' },
            { key: 'descricao', label: 'Descrição' },
          ]}
        />
      )}
      {tab === 'programas' && (
        <CatalogManager
          title="Programas Sociais"
          endpoint="/social/programas"
          fields={[
            { key: 'nome', label: 'Nome', type: 'text', required: true, span: true },
            { key: 'descricao', label: 'Descrição', type: 'text', span: true },
          ]}
          columns={[
            { key: 'nome', label: 'Nome' },
            { key: 'descricao', label: 'Descrição' },
          ]}
        />
      )}
      {tab === 'empreendimentos' && (
        <CatalogManager
          title="Empreendimentos"
          endpoint="/social/empreendimentos"
          fields={[
            { key: 'nome', label: 'Nome', type: 'text', required: true, span: true },
            { key: 'situacao', label: 'Situação', type: 'select', options: SITUACOES_EMPREENDIMENTO, default: 'planejamento' },
            { key: 'qtdUnidades', label: 'Qtd. unidades', type: 'number' },
            { key: 'descricao', label: 'Descrição', type: 'text', span: true },
          ]}
          columns={[
            { key: 'nome', label: 'Nome' },
            { key: 'situacao', label: 'Situação' },
            { key: 'qtd_unidades', label: 'Unidades' },
          ]}
        />
      )}
      {tab === 'eventos' && (
        <CatalogManager
          title="Eventos Sociais"
          endpoint="/social/eventos"
          fields={[
            { key: 'nome', label: 'Nome', type: 'text', required: true, span: true },
            { key: 'tipo', label: 'Tipo', type: 'text' },
            { key: 'dataEvento', label: 'Data', type: 'date' },
            { key: 'entidadeId', label: 'Entidade', type: 'select', options: entidades.map(e => ({ value: e.id, label: e.nome })) },
            { key: 'servicoId', label: 'Serviço', type: 'select', options: servicos.map(s => ({ value: s.id, label: s.nome })) },
            { key: 'descricao', label: 'Descrição', type: 'text', span: true },
          ]}
          columns={[
            { key: 'nome', label: 'Nome' },
            { key: 'tipo', label: 'Tipo' },
            { key: 'data_evento', label: 'Data', render: v => v ? new Date(v).toLocaleDateString('pt-BR') : '—' },
            { key: 'entidade_nome', label: 'Entidade' },
          ]}
        />
      )}
    </div>
  )
}
