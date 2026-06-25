import { useState } from 'react'
import { ProcessosPage, PERFIS_ANALISE } from './ProcessosPage'
import { FluxosBpmnManager } from '../components/reurb/FluxosBpmnManager'
import { ReurbDashboard } from '../components/reurb/ReurbDashboard'
import { useAuthStore } from '../store/auth.store'

const TABS = [
  { key: 'processos', label: 'Processos REURB' },
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'fluxos',    label: 'Editor de Fluxos BPMN' },
] as const

// REURB usa o mesmo fluxo genérico de processos (filtrado por tipo 'reurb')
// e um editor de fluxos BPMN configurável por setor (req 189-195)
export function ReurbPage() {
  const { perfil } = useAuthStore()
  const podeAnalisar = !!perfil && PERFIS_ANALISE.includes(perfil)
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('processos')
  const tabs = TABS.filter(t => t.key !== 'dashboard' || podeAnalisar)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ display: 'flex', gap: 8, padding: '14px 24px 0' }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            style={{
              padding: '8px 16px', borderRadius: '8px 8px 0 0', border: '1px solid #d1d5db', borderBottom: 'none',
              background: tab === t.key ? 'white' : '#f3f4f6', color: tab === t.key ? '#1e3a5f' : '#6b7280',
              fontWeight: tab === t.key ? 600 : 400, cursor: 'pointer', fontSize: 13,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', borderTop: '1px solid #d1d5db' }}>
        {tab === 'processos' && <ProcessosPage tipo="reurb" />}
        {tab === 'dashboard' && <ReurbDashboard />}
        {tab === 'fluxos' && <FluxosBpmnManager />}
      </div>
    </div>
  )
}
