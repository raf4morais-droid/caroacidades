import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'react-hot-toast'
import { useAuthStore } from './store/auth.store'
import { useAuthInit } from './hooks/useAuth'
import { MainLayout } from './pages/MainLayout'
import { LoginPage } from './pages/LoginPage'
import { MapPage } from './pages/MapPage'
import { CadastroPage } from './pages/CadastroPage'
import { EdificacoesPage } from './pages/EdificacoesPage'
import { ViabilidadePage } from './pages/ViabilidadePage'
import { IluminacaoPage } from './pages/IluminacaoPage'
import { PGVPage } from './pages/PGVPage'

import { ArboriacaoPage } from './pages/ArboriacaoPage'
import { SocialPage } from './pages/SocialPage'
import { ProcessosPage } from './pages/ProcessosPage'
import { ReurbPage } from './pages/ReurbPage'
import { PatrimonioPage } from './pages/PatrimonioPage'
import { CemiterioPage } from './pages/CemiterioPage'
import { NumeracaoPredialPage } from './pages/NumeracaoPredialPage'
import { AppMobileGestaoPage } from './pages/AppMobileGestaoPage'
import { NuvemPontosPage } from './pages/NuvemPontosPage'
import { BancoDadosPage } from './pages/BancoDadosPage'
import { GestaoSIGPage } from './pages/GestaoSIGPage'
import { ParcelaDetailPage } from './pages/ParcelaDetailPage'
import { EstoquePage } from './pages/EstoquePage'
import { SinterPage } from './pages/SinterPage'

const qc = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
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
      <Route path="/" element={<AuthGuard><MainLayout /></AuthGuard>}>
        <Route index element={<Navigate to="/mapa" replace />} />
        <Route path="mapa"        element={<MapPage />} />
        <Route path="cadastro"    element={<CadastroPage />} />
        <Route path="edificacoes" element={<EdificacoesPage />} />
        <Route path="cadastro/parcelas/:id" element={<ParcelaDetailPage />} />
        <Route path="viabilidade" element={<ViabilidadePage />} />
        <Route path="iluminacao"  element={<IluminacaoPage />} />
        <Route path="arborizacao" element={<ArboriacaoPage />} />
        <Route path="pgv"         element={<PGVPage />} />
        <Route path="processos"   element={<ProcessosPage tipo="aprovacao_projeto" />} />
        <Route path="habite-se"   element={<ProcessosPage tipo="habite_se" />} />
        <Route path="reurb"       element={<ReurbPage />} />
        <Route path="social"      element={<SocialPage />} />
        <Route path="patrimonio"      element={<PatrimonioPage />} />
        <Route path="cemiterio"       element={<CemiterioPage />} />
        <Route path="numeracao"       element={<NumeracaoPredialPage />} />
        <Route path="app-mobile"      element={<AppMobileGestaoPage />} />
        <Route path="nuvem-pontos"    element={<NuvemPontosPage />} />
        <Route path="banco-dados"     element={<BancoDadosPage />} />
        <Route path="gestao-sig"      element={<GestaoSIGPage />} />
        <Route path="estoque"         element={<EstoquePage />} />
        <Route path="sinter"          element={<SinterPage />} />
        <Route path="*" element={<Navigate to="/mapa" replace />} />
      </Route>
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
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
