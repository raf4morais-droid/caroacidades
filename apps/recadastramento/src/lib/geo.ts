type LatLng = { latitude: number; longitude: number }
type AnelGeoJSON = [number, number][]

function anelParaLatLng(anel: AnelGeoJSON): LatLng[] {
  return anel.map(([longitude, latitude]) => ({ latitude, longitude }))
}

// Converte geometria GeoJSON (Polygon/MultiPolygon, EPSG:4326) em anéis prontos
// para o componente <Polygon> do react-native-maps (contorno + buracos)
export function geometryParaPoligonos(geometry: { type: string; coordinates: any }): { contorno: LatLng[]; buracos: LatLng[][] }[] {
  if (geometry.type === 'Polygon') {
    const [contorno, ...buracos] = geometry.coordinates as AnelGeoJSON[]
    return [{ contorno: anelParaLatLng(contorno), buracos: buracos.map(anelParaLatLng) }]
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as AnelGeoJSON[][]).map(([contorno, ...buracos]) => ({
      contorno: anelParaLatLng(contorno),
      buracos: buracos.map(anelParaLatLng),
    }))
  }
  return []
}

export function centroide(pontos: LatLng[]): LatLng {
  const soma = pontos.reduce((acc, p) => ({ latitude: acc.latitude + p.latitude, longitude: acc.longitude + p.longitude }), { latitude: 0, longitude: 0 })
  return { latitude: soma.latitude / pontos.length, longitude: soma.longitude / pontos.length }
}

export const CORES_SITUACAO: Record<string, string> = {
  pendente: '#9ca3af',
  visitado: '#f59e0b',
  recadastrado: '#16a34a',
  impedido: '#dc2626',
}
