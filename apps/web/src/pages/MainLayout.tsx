import { useState } from 'react'
import { Link, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { signOut } from 'firebase/auth'
import { auth } from '../lib/firebase'
import { useAuthStore } from '../store/auth.store'
import toast from 'react-hot-toast'

const NAV_ITEMS = [
  { path: '/mapa',          label: 'Mapa',                 roles: ['ADMIN','FISCAL_TRIBUTARIO','SETOR_PROJETOS','FISCAL_CAMPO','CIDADAO'] },
  { path: '/cadastro',      label: 'Cadastro Imobiliário', roles: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { path: '/viabilidade',   label: 'Viabilidade',          roles: ['ADMIN','FISCAL_TRIBUTARIO','SETOR_PROJETOS','CIDADAO'] },
  { path: '/iluminacao',    label: 'Iluminação Pública',   roles: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { path: '/arborizacao',   label: 'Arborização',          roles: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { path: '/pgv',           label: 'PGV',                  roles: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { path: '/processos',     label: 'Aprovação de Projetos',roles: ['ADMIN','SETOR_PROJETOS'] },
  { path: '/habite-se',     label: 'Habite-se',            roles: ['ADMIN','SETOR_PROJETOS'] },
  { path: '/reurb',         label: 'REURB',                roles: ['ADMIN','SETOR_PROJETOS'] },
  { path: '/social',        label: 'Cadastro Social',      roles: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { path: '/patrimonio',    label: 'Patrimônio',           roles: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { path: '/cemiterio',     label: 'Cemitério',            roles: ['ADMIN','FISCAL_TRIBUTARIO'] },
  { path: '/nuvem-pontos',  label: 'Nuvem 3D',             roles: ['ADMIN','FISCAL_TRIBUTARIO','SETOR_PROJETOS'] },
]

export function MainLayout() {
  const { user, perfil } = useAuthStore()
  const navigate = useNavigate()
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)

  const visibleItems = NAV_ITEMS.filter(item =>
    !perfil || item.roles.includes(perfil)
  )

  async function handleLogout() {
    await signOut(auth)
    navigate('/login')
    toast.success('Logout realizado')
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', fontFamily: 'system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? 220 : 0,
        background: '#1e3a5f',
        color: 'white',
        display: 'flex',
        flexDirection: 'column',
        transition: 'width 0.2s',
        overflow: 'hidden',
        flexShrink: 0,
      }}>
        <div style={{ padding: '20px 16px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>SIGWEB</h1>
          <p style={{ margin: '2px 0 0', fontSize: 11, opacity: 0.6 }}>Tupanciretã/RS</p>
        </div>

        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {visibleItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              style={{
                display: 'block',
                padding: '9px 16px',
                fontSize: 13,
                color: location.pathname.startsWith(item.path) ? '#93c5fd' : 'rgba(255,255,255,0.8)',
                textDecoration: 'none',
                background: location.pathname.startsWith(item.path) ? 'rgba(255,255,255,0.1)' : 'transparent',
                borderLeft: location.pathname.startsWith(item.path) ? '3px solid #3b82f6' : '3px solid transparent',
              }}
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.1)', fontSize: 12 }}>
          <p style={{ margin: '0 0 4px', opacity: 0.6 }}>{perfil}</p>
          <p style={{ margin: '0 0 8px', fontWeight: 600, fontSize: 13 }}>{user?.displayName ?? user?.email}</p>
          <button
            onClick={handleLogout}
            style={{
              background: 'rgba(255,255,255,0.15)', border: 'none', color: 'white',
              padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontSize: 12, width: '100%',
            }}
          >
            Sair
          </button>
        </div>
      </aside>

      {/* Content */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <header style={{
          height: 48, background: 'white', borderBottom: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 12, flexShrink: 0,
        }}>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, padding: 4 }}
          >
            ☰
          </button>
          <span style={{ fontSize: 14, color: '#6b7280' }}>
            Prefeitura Municipal de Tupanciretã — Sistema de Georreferenciamento
          </span>
        </header>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Outlet />
        </div>
      </main>
    </div>
  )
}
