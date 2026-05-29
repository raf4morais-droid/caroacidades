import { query, queryOne } from '../db/pool'

export interface MemorialDescritivo {
  vertices: { n: number; x: number; y: number; azimute: string; distancia: number }[]
  confrontantes: { id: string; codigo?: string; logradouro?: string }[]
  areaM2: number
  perimetro: number
}

export async function getMemorialDescritivo(parcelaId: string): Promise<MemorialDescritivo | null> {
  const parcela = await queryOne<{ area: number; perimetro: number; geojson: string }>(
    `SELECT
       ST_Area(geometry)      AS area,
       ST_Perimeter(geometry) AS perimetro,
       ST_AsGeoJSON(ST_Transform(geometry, 4326)) AS geojson
     FROM sigweb.parcelas WHERE id = $1`,
    [parcelaId]
  )
  if (!parcela) return null

  const confrontantes = await query<{ id: string; codigo: string }>(
    `SELECT b.id, b.codigo
     FROM sigweb.parcelas a
     JOIN sigweb.parcelas b ON ST_Touches(a.geometry, b.geometry)
     WHERE a.id = $1 AND b.id != $1`,
    [parcelaId]
  )

  const geom = JSON.parse(parcela.geojson)
  const coords: [number, number][] = geom.coordinates[0]

  const vertices = coords.slice(0, -1).map((coord, i) => {
    const next = coords[(i + 1) % (coords.length - 1)]
    const dx = next[0] - coord[0]
    const dy = next[1] - coord[1]
    const distRad = Math.sqrt(dx * dx + dy * dy) * 111_319.9
    const azRad = Math.atan2(dx, dy)
    const azDeg = ((azRad * 180) / Math.PI + 360) % 360
    const graus = Math.floor(azDeg)
    const minutos = Math.floor((azDeg - graus) * 60)
    const segundos = Math.round(((azDeg - graus) * 60 - minutos) * 60)
    return {
      n: i + 1,
      x: coord[0],
      y: coord[1],
      azimute: `${graus}°${minutos}'${segundos}"`,
      distancia: Math.round(distRad * 100) / 100,
    }
  })

  return {
    vertices,
    confrontantes,
    areaM2: Math.round(parcela.area * 100) / 100,
    perimetro: Math.round(parcela.perimetro * 100) / 100,
  }
}

export async function desmembrarParcela(
  parcelaId: string,
  linhaGeoJSON: object,
  usuarioId: string
): Promise<{ novas: string[] }> {
  const linhaWKT = await queryOne<{ wkt: string }>(
    `SELECT ST_AsText(ST_GeomFromGeoJSON($1)) AS wkt`,
    [JSON.stringify(linhaGeoJSON)]
  )
  if (!linhaWKT) throw new Error('Geometria de divisão inválida')

  const partes = await query<{ geom: string }>(
    `SELECT (ST_Dump(ST_Split(p.geometry, ST_Transform(ST_GeomFromGeoJSON($2), 31982)))).geom::text AS geom
     FROM sigweb.parcelas p WHERE p.id = $1`,
    [parcelaId, JSON.stringify(linhaGeoJSON)]
  )

  if (partes.length < 2) throw new Error('A linha não divide a parcela em dois polígonos')

  const original = await queryOne<{ codigo: string; bairro_id: string; logradouro_id: string; loteamento_id: string; quadra_id: string }>(
    `SELECT codigo, bairro_id, logradouro_id, loteamento_id, quadra_id FROM sigweb.parcelas WHERE id = $1`,
    [parcelaId]
  )
  if (!original) throw new Error('Parcela não encontrada')

  const novasIds: string[] = []
  for (let i = 0; i < partes.length; i++) {
    const rows = await query<{ id: string }>(
      `INSERT INTO sigweb.parcelas (codigo, bairro_id, logradouro_id, loteamento_id, quadra_id, geometry, area_m2)
       VALUES ($1, $2, $3, $4, $5, $6::geometry, ST_Area($6::geometry))
       RETURNING id`,
      [
        `${original.codigo}-${i + 1}`,
        original.bairro_id,
        original.logradouro_id,
        original.loteamento_id,
        original.quadra_id,
        partes[i].geom,
      ]
    )
    novasIds.push(rows[0].id)
  }

  await query(
    `INSERT INTO sigweb.historico_cartografico (entidade, entidade_id, operacao, usuario_id)
     VALUES ('parcelas', $1, 'desmembramento', $2)`,
    [parcelaId, usuarioId]
  )
  await query(`DELETE FROM sigweb.parcelas WHERE id = $1`, [parcelaId])

  return { novas: novasIds }
}

export async function unificarParcelas(
  parcelaIds: string[],
  usuarioId: string
): Promise<string> {
  if (parcelaIds.length < 2) throw new Error('Selecione ao menos 2 parcelas')

  const placeholders = parcelaIds.map((_, i) => `$${i + 1}`).join(',')
  const base = await queryOne<{
    bairro_id: string
    logradouro_id: string
    loteamento_id: string
    quadra_id: string
    codigo: string
  }>(
    `SELECT bairro_id, logradouro_id, loteamento_id, quadra_id, codigo
     FROM sigweb.parcelas WHERE id = $1`,
    [parcelaIds[0]]
  )
  if (!base) throw new Error('Parcela não encontrada')

  const rows = await query<{ id: string }>(
    `INSERT INTO sigweb.parcelas (codigo, bairro_id, logradouro_id, loteamento_id, quadra_id, geometry, area_m2)
     SELECT
       $${parcelaIds.length + 1},
       $${parcelaIds.length + 2},
       $${parcelaIds.length + 3},
       $${parcelaIds.length + 4},
       $${parcelaIds.length + 5},
       ST_Union(geometry),
       ST_Area(ST_Union(geometry))
     FROM sigweb.parcelas
     WHERE id IN (${placeholders})
     RETURNING id`,
    [
      ...parcelaIds,
      `${base.codigo}-U`,
      base.bairro_id,
      base.logradouro_id,
      base.loteamento_id,
      base.quadra_id,
    ]
  )

  for (const id of parcelaIds) {
    await query(
      `INSERT INTO sigweb.historico_cartografico (entidade, entidade_id, operacao, usuario_id)
       VALUES ('parcelas', $1, 'unificacao', $2)`,
      [id, usuarioId]
    )
  }
  await query(`DELETE FROM sigweb.parcelas WHERE id IN (${placeholders})`, parcelaIds)

  return rows[0].id
}

export async function getParcelasNoBbox(bbox: { minx: number; miny: number; maxx: number; maxy: number }) {
  return query(
    `SELECT
       p.id, p.codigo, p.area_m2, p.numero_predial_principal,
       b.nome AS bairro, l.nome AS logradouro,
       ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry
     FROM sigweb.parcelas p
     LEFT JOIN sigweb.bairros b ON b.id = p.bairro_id
     LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
     WHERE ST_Intersects(p.geometry, ST_Transform(ST_MakeEnvelope($1,$2,$3,$4,4326),31982))
     LIMIT 2000`,
    [bbox.minx, bbox.miny, bbox.maxx, bbox.maxy]
  )
}
