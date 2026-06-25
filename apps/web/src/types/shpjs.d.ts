declare module 'shpjs' {
  function shp(buffer: ArrayBuffer | string): Promise<GeoJSON.FeatureCollection | GeoJSON.FeatureCollection[]>
  export = shp
}
