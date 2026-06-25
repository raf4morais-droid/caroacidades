import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const bboxSchema = z.object({
  minx: z.coerce.number(),
  miny: z.coerce.number(),
  maxx: z.coerce.number(),
  maxy: z.coerce.number(),
})

const bairroSchema = z.object({
  nome: z.string().min(1),
  codigo: z.string().min(1),
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }).optional(),
})

export async function bairrosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/bairros', async (request, reply) => {
    const queryParams = request.query as Record<string, string | undefined>
    if (queryParams.minx && queryParams.miny && queryParams.maxx && queryParams.maxy) {
      const bbox = bboxSchema.parse(queryParams)
      const rows = await query(
        `SELECT id, nome, codigo,
                ST_AsGeoJSON(ST_Transform(geometry, 4326))::json AS geometry
         FROM sigweb.bairros
         WHERE geometry && ST_MakeEnvelope($1,$2,$3,$4, 31982)`,
        [bbox.minx, bbox.miny, bbox.maxx, bbox.maxy]
      )
      return { data: rows }
    }

    const rows = await query(
      `SELECT id, nome, codigo,
              ST_AsGeoJSON(ST_Transform(geometry, 4326))::json AS geometry
       FROM sigweb.bairros
       ORDER BY nome`)
    return { data: rows }
  })

  app.get('/bairros/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const bairro = await queryOne(
      `SELECT id, nome, codigo,
              ST_AsGeoJSON(ST_Transform(geometry, 4326))::json AS geometry
       FROM sigweb.bairros
       WHERE id = $1`,
      [id]
    )
    if (!bairro) return reply.code(404).send({ error: 'Bairro não encontrado' })
    return bairro
  })

  app.post(
    '/bairros',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = bairroSchema.parse(request.body)
      const params: unknown[] = [body.nome, body.codigo]
      const geomSql = body.geometry
        ? `ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 31982))`
        : 'NULL'
      if (body.geometry) params.push(JSON.stringify(body.geometry))

      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.bairros (nome, codigo, geometry)
         VALUES ($1, $2, ${geomSql})
         RETURNING id`,
        params
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  app.put(
    '/bairros/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = bairroSchema.partial().parse(request.body)
      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1

      if (body.nome !== undefined) { updates.push(`nome = $${idx++}`); params.push(body.nome) }
      if (body.codigo !== undefined) { updates.push(`codigo = $${idx++}`); params.push(body.codigo) }
      if (body.geometry) {
        updates.push(`geometry = ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($${idx++}), 4326), 31982))`)
        params.push(JSON.stringify(body.geometry))
      }

      if (!updates.length) {
        return reply.code(400).send({ error: 'Nenhum campo para atualizar' })
      }

      params.push(id)
      await query(`UPDATE sigweb.bairros SET ${updates.join(', ')} WHERE id = $${idx}`, params)
      return { ok: true }
    }
  )

  app.delete(
    '/bairros/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.bairros WHERE id = $1`, [id])
      reply.code(204)
    }
  )
}
