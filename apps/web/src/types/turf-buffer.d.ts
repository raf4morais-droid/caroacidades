declare module '@turf/buffer' {
  import { Feature, Geometry } from 'geojson'

  type Units = 'meters' | 'kilometers' | 'miles' | 'degrees' | 'radians'
  type BufferOptions = { units?: Units }

  function buffer(
    geojson: Geometry | Feature<Geometry>,
    radius: number,
    options?: BufferOptions
  ): Feature<Geometry>

  export default buffer
}
