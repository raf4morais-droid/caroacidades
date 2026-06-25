import { lazy, Suspense } from 'react'

const PointCloudViewer = lazy(() =>
  import('../components/PointCloudViewer').then((m) => ({ default: m.PointCloudViewer }))
)

export function NuvemPontosPage() {
  const potreeUrl = import.meta.env.VITE_POTREE_URL

  if (potreeUrl) {
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{
          padding: '10px 20px', background: 'white', borderBottom: '1px solid #e5e7eb',
          display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
        }}>
          <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: 16 }}>Visualização Nuvem de Pontos 3D</h3>
          <span style={{ fontSize: 12, color: '#6b7280' }}>Potree Viewer — Aerolevantamento Tupanciretã 2026</span>
        </div>
        <iframe
          src={potreeUrl}
          title="Potree 3D Point Cloud"
          style={{ flex: 1, border: 'none', width: '100%' }}
          allow="fullscreen"
        />
      </div>
    )
  }

  return (
    <Suspense fallback={
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
        Carregando visualizador 3D…
      </div>
    }>
      <PointCloudViewer />
    </Suspense>
  )
}
