import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const sepulturaSchema = z.object({
  cemiterioId:       z.string().uuid(),
  codigo:            z.string().min(1).max(30),
  titular:           z.string().optional(),
  falecido:          z.string().optional(),
  dataFalecimento:   z.string().optional(),
  dataSepultamento:  z.string().optional(),
  tipoSepultura:     z.string().optional(),
  situacao:          z.enum(['ocupada','disponivel','perpetua','transferida']).default('ocupada'),
  observacoes:       z.string().optional(),
  latitude:          z.number(),
  longitude:         z.number(),
})

export async function cemiterioRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Cemitérios
  app.get('/cemiterio/cemiterios', async () =>
    query(`SELECT id, nome, ST_AsGeoJSON(ST_Transform(geometry,4326))::json AS geometry
           FROM sigweb.cemiterios ORDER BY nome`)
  )

  app.post(
    '/cemiterio/cemiterios',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { nome, geometry } = request.body as { nome: string; geometry?: object }
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.cemiterios (nome, geometry)
         VALUES ($1, ${geometry ? `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2),4326),31982)` : 'NULL'})
         RETURNING id`,
        geometry ? [nome, JSON.stringify(geometry)] : [nome]
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  // Sepulturas
  app.get('/cemiterio/sepulturas', async (request) => {
    const { cemiterioId, situacao, q } = request.query as Record<string, string>
    const conds: string[] = []
    const params: unknown[] = []

    if (cemiterioId) { conds.push(`s.cemiterio_id = $${params.push(cemiterioId)}`) }
    if (situacao)    { conds.push(`s.situacao = $${params.push(situacao)}`) }
    if (q)           { conds.push(`(s.falecido ILIKE $${params.push('%'+q+'%')} OR s.codigo ILIKE $${params.length})`) }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    return query(
      `SELECT s.*, c.nome AS cemiterio_nome,
              ST_AsGeoJSON(ST_Transform(s.geometry,4326))::json AS geometry
       FROM sigweb.sepulturas s
       JOIN sigweb.cemiterios c ON c.id = s.cemiterio_id
       ${where}
       ORDER BY s.codigo
       LIMIT 1000`,
      params
    )
  })

  app.get('/cemiterio/sepulturas/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const row = await queryOne(
      `SELECT s.*, c.nome AS cemiterio_nome,
              ST_AsGeoJSON(ST_Transform(s.geometry,4326))::json AS geometry
       FROM sigweb.sepulturas s
       JOIN sigweb.cemiterios c ON c.id = s.cemiterio_id
       WHERE s.id = $1`,
      [id]
    )
    if (!row) return reply.code(404).send({ error: 'Sepultura não encontrada' })
    return row
  })

  app.post(
    '/cemiterio/sepulturas',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = sepulturaSchema.parse(request.body)
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.sepulturas
           (cemiterio_id, codigo, titular, falecido, data_falecimento, data_sepultamento,
            tipo_sepultura, situacao, observacoes, geometry)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,
           ST_Transform(ST_SetSRID(ST_Point($11,$10),4326),31982))
         RETURNING id`,
        [
          body.cemiterioId, body.codigo,
          body.titular ?? null, body.falecido ?? null,
          body.dataFalecimento ?? null, body.dataSepultamento ?? null,
          body.tipoSepultura ?? null, body.situacao,
          body.observacoes ?? null,
          body.latitude, body.longitude,
        ]
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  app.put(
    '/cemiterio/sepulturas/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = sepulturaSchema.parse(request.body)
      await query(
        `UPDATE sigweb.sepulturas
         SET cemiterio_id=$2, codigo=$3, titular=$4, falecido=$5,
             data_falecimento=$6, data_sepultamento=$7, tipo_sepultura=$8,
             situacao=$9, observacoes=$10,
             geometry=ST_Transform(ST_SetSRID(ST_Point($12,$11),4326),31982),
             updated_at=now()
         WHERE id=$1`,
        [
          id, body.cemiterioId, body.codigo,
          body.titular ?? null, body.falecido ?? null,
          body.dataFalecimento ?? null, body.dataSepultamento ?? null,
          body.tipoSepultura ?? null, body.situacao, body.observacoes ?? null,
          body.latitude, body.longitude,
        ]
      )
      return { ok: true }
    }
  )

  app.delete(
    '/cemiterio/sepulturas/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.sepulturas WHERE id = $1`, [id])
      reply.code(204)
    }
  )

  // Relatório: contagem por situação
  app.get('/cemiterio/relatorio', async (request) => {
    const { cemiterioId } = request.query as { cemiterioId?: string }
    const params: unknown[] = []
    const where = cemiterioId ? `WHERE cemiterio_id = $${params.push(cemiterioId)}` : ''
    return query(
      `SELECT situacao, COUNT(*)::int AS total
       FROM sigweb.sepulturas ${where}
       GROUP BY situacao ORDER BY total DESC`,
      params
    )
  })
}
