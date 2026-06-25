declare module 'shp-write' {
  interface GeoJSON {
    type: string
    features: unknown[]
    [key: string]: unknown
  }
  function zip(geojson: GeoJSON, options?: Record<string, unknown>): Promise<ArrayBuffer>
  function download(geojson: GeoJSON, options?: Record<string, unknown>): void
}
