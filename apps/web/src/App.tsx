import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/auth.store'
import { useAuthInit } from './hooks/useAuth'
import { MainLayout } from './pages/MainLayout'
import { LoginPage } from './pages/LoginPage'
import { MapPage } from './pages/MapPage'
import { CadastroPage } from './pages/CadastroPage'
import { ViabilidadePage } from './pages/ViabilidadePage'
import { IluminacaoPage } from './pages/IluminacaoPage'
import { PGVPage } from './pages/PGVPage'
import { NuvemPontosPage } from './pages/NuvemPontosPage'

const qc = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 1 },
  },
})

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuthStore()
  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f9fafb', color: '#6b7280', fontSize: 16,
      }}>
        Carregando SIGWEB...
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  useAuthInit()

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <AuthGuard>
            <MainLayout />
          </AuthGuard>
        }
      >
        <Route index element={<Navigate to="/mapa" replace />} />
        <Route path="mapa"         element={<MapPage />} />
        <Route path="cadastro"     element={<CadastroPage />} />
        <Route path="viabilidade"  element={<ViabilidadePage />} />
        <Route path="iluminacao"   element={<IluminacaoPage />} />
        <Route path="pgv"          element={<PGVPage />} />
        <Route path="nuvem-pontos" element={<NuvemPontosPage />} />
        {/* Módulos adicionais — serão expandidos */}
        <Route path="arborizacao"  element={<PlaceholderPage title="Arborização Urbana" />} />
        <Route path="processos"    element={<PlaceholderPage title="Aprovação de Projetos" />} />
        <Route path="habite-se"    element={<PlaceholderPage title="Habite-se Online" />} />
        <Route path="reurb"        element={<PlaceholderPage title="REURB Digital" />} />
        <Route path="social"       element={<PlaceholderPage title="Cadastro Social" />} />
        <Route path="patrimonio"   element={<PlaceholderPage title="Patrimônio Imobiliário" />} />
        <Route path="cemiterio"    element={<PlaceholderPage title="Gestão de Cemitérios" />} />
      </Route>
    </Routes>
  )
}

function PlaceholderPage({ title }: { title: string }) {
  return (
    <div style={{ padding: 32 }}>
      <h2 style={{ color: '#1e3a5f' }}>{title}</h2>
      <p style={{ color: '#6b7280' }}>Módulo em desenvolvimento.</p>
    </div>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={qc}>
      <BrowserRouter>
        <AppRoutes />
        <Toaster position="top-right" />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
