import { readFileSync } from 'fs'
import { join } from 'path'
import pool from './pool'

const geojsonPath = process.env.GEOJSON_PATH ?? join(__dirname, '../../bairros_tupariceta.geojson')
const geojson = JSON.parse(readFileSync(geojsonPath, 'utf-8'))

async function main() {
  const client = await pool.connect()
  let inserted = 0
  let skipped = 0

  try {
    await client.query('BEGIN')

    for (const feature of geojson.features) {
      const { NM_BAIRRO: nome, CD_BAIRRO: codigo } = feature.properties
      const geometryJson = JSON.stringify(feature.geometry)

      const { rowCount } = await client.query(
        `INSERT INTO sigweb.bairros (nome, codigo, geometry)
         SELECT $1, $2, ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 31982))
         WHERE NOT EXISTS (SELECT 1 FROM sigweb.bairros WHERE codigo = $4)`,
        [nome, codigo, geometryJson, codigo]
      )

      if (rowCount && rowCount > 0) {
        console.log(`  ✓ ${nome} (${codigo})`)
        inserted++
      } else {
        console.log(`  - ${nome} (${codigo}) já existe, pulando`)
        skipped++
      }
    }

    await client.query('COMMIT')
    console.log(`\nConcluído: ${inserted} inseridos, ${skipped} já existiam.`)
  } catch (err) {
    await client.query('ROLLBACK')
    console.error('Erro ao inserir bairros:', err)
    process.exit(1)
  } finally {
    client.release()
    await pool.end()
  }
}

main()
