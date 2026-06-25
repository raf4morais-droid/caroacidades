import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const bodySchema = z.object({
  nome:            z.string().min(1).max(250),
  finalidade:      z.string().min(1).max(100),
  descricao:       z.string().optional(),
  numeroRegistro:  z.string().optional(),
  documentoUrls:   z.array(z.string()).default([]),
  geometry:        z.object({ type: z.string(), coordinates: z.unknown() }).optional(),
})

export async function patrimonioRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/patrimonio', async (request) => {
    const { finalidade, q } = request.query as Record<string, string>
    const conds: string[] = []
    const params: unknown[] = []

    if (finalidade) { conds.push(`finalidade = $${params.push(finalidade)}`); }
    if (q)          { conds.push(`nome ILIKE $${params.push('%' + q + '%')}`); }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    return query(
      `SELECT id, nome, finalidade, descricao, numero_registro, area_m2,
              documento_urls,
              ST_AsGeoJSON(ST_Transform(geometry, 4326))::json AS geometry
       FROM sigweb.patrimonios
       ${where}
       ORDER BY finalidade, nome`,
      params
    )
  })

  app.get('/patrimonio/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const row = await queryOne(
      `SELECT *, ST_AsGeoJSON(ST_Transform(geometry, 4326))::json AS geometry
       FROM sigweb.patrimonios WHERE id = $1`,
      [id]
    )
    if (!row) return reply.code(404).send({ error: 'Patrimônio não encontrado' })
    return row
  })

  app.post(
    '/patrimonio',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = bodySchema.parse(request.body)
      const geomSql = body.geometry
        ? `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($6), 4326), 31982)`
        : 'NULL'

      const params: unknown[] = [
        body.nome, body.finalidade,
        body.descricao ?? null, body.numeroRegistro ?? null,
        body.documentoUrls,
      ]
      if (body.geometry) params.push(JSON.stringify(body.geometry))

      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.patrimonios
           (nome, finalidade, descricao, numero_registro, documento_urls, geometry, area_m2)
         VALUES ($1,$2,$3,$4,$5,${geomSql},${body.geometry ? `ST_Area(${geomSql})` : 'NULL'})
         RETURNING id`,
        params
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  app.put(
    '/patrimonio/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = bodySchema.parse(request.body)

      await query(
        `UPDATE sigweb.patrimonios
         SET nome=$2, finalidade=$3, descricao=$4, numero_registro=$5,
             documento_urls=$6, updated_at=now()
         WHERE id=$1`,
        [id, body.nome, body.finalidade, body.descricao ?? null, body.numeroRegistro ?? null, body.documentoUrls]
      )
      if (body.geometry) {
        await query(
          `UPDATE sigweb.patrimonios
           SET geometry=ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2),4326),31982),
               area_m2=ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2),4326),31982))
           WHERE id=$1`,
          [id, JSON.stringify(body.geometry)]
        )
      }
      return { ok: true }
    }
  )

  app.delete(
    '/patrimonio/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.patrimonios WHERE id = $1`, [id])
      reply.code(204)
    }
  )
}
