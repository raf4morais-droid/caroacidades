import { useMapStore } from '../../store/map.store'

const LAYERS = [
  { id: 'parcelas',    label: 'Lotes/Parcelas' },
  { id: 'edificacoes', label: 'Edificações' },
  { id: 'postes',      label: 'Postes' },
  { id: 'arvores',     label: 'Árvores' },
  { id: 'zonas_uso',   label: 'Zonas de Uso' },
  { id: 'pgv',         label: 'PGV (valores)' },
  { id: '360_terrestre', label: 'Imageamento 360°' },
]

export function LayerControl() {
  const { activeLayers, toggleLayer } = useMapStore()

  return (
    <div
      style={{
        position: 'absolute',
        top: 80,
        right: 10,
        background: 'white',
        borderRadius: 8,
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
        padding: '8px 12px',
        zIndex: 1000,
        minWidth: 160,
      }}
    >
      <p style={{ fontSize: 11, fontWeight: 700, margin: '0 0 6px', color: '#374151', textTransform: 'uppercase' }}>
        Camadas
      </p>
      {LAYERS.map((layer) => (
        <label
          key={layer.id}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', marginBottom: 4 }}
        >
          <input
            type="checkbox"
            checked={activeLayers.includes(layer.id)}
            onChange={() => toggleLayer(layer.id)}
          />
          {layer.label}
        </label>
      ))}
    </div>
  )
}
