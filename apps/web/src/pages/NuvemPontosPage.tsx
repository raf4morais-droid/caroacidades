export function NuvemPontosPage() {
  const potreeUrl = import.meta.env.VITE_POTREE_URL

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{
        padding: '10px 20px', background: 'white', borderBottom: '1px solid #e5e7eb',
        display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0,
      }}>
        <h3 style={{ margin: 0, color: '#1e3a5f', fontSize: 16 }}>Visualização Nuvem de Pontos 3D</h3>
        <span style={{ fontSize: 12, color: '#6b7280' }}>Potree Viewer — Aerolevantamento Tupanciretã 2026</span>
      </div>

      {potreeUrl ? (
        <iframe
          src={potreeUrl}
          title="Potree 3D Point Cloud"
          style={{ flex: 1, border: 'none', width: '100%' }}
          allow="fullscreen"
        />
      ) : (
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 12, color: '#6b7280',
        }}>
          <div style={{ fontSize: 48 }}>🛰️</div>
          <p style={{ margin: 0, fontSize: 16 }}>Nuvem de pontos não configurada</p>
          <p style={{ margin: 0, fontSize: 13 }}>
            Configure <code>VITE_POTREE_URL</code> no arquivo <code>.env</code> com a URL do Potree Viewer hospedado no Cloud Storage.
          </p>
        </div>
      )}
    </div>
  )
}
