import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const zonaSchema = z.object({
  nome: z.string().min(1),
  codigo: z.string().min(1),
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }).optional(),
})

export async function zonasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/zonas', async () => {
    const rows = await query(
      `SELECT id, nome, codigo,
              ST_AsGeoJSON(ST_Transform(geometry, 4326))::json AS geometry
       FROM sigweb.zonas_uso
       ORDER BY nome`
    )
    return { data: rows }
  })

  app.get('/zonas/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const zona = await queryOne(
      `SELECT id, nome, codigo,
              ST_AsGeoJSON(ST_Transform(geometry, 4326))::json AS geometry
       FROM sigweb.zonas_uso
       WHERE id = $1`,
      [id]
    )
    if (!zona) return reply.code(404).send({ error: 'Zona não encontrada' })
    return zona
  })

  app.post(
    '/zonas',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS') },
    async (request, reply) => {
      const body = zonaSchema.parse(request.body)
      const params: unknown[] = [body.nome, body.codigo]
      const geomSql = body.geometry
        ? `ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), 31982))`
        : 'NULL'
      if (body.geometry) params.push(JSON.stringify(body.geometry))

      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.zonas_uso (nome, codigo, geometry)
         VALUES ($1, $2, ${geomSql})
         RETURNING id`,
        params
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  app.put(
    '/zonas/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = zonaSchema.partial().parse(request.body)
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
      await query(`UPDATE sigweb.zonas_uso SET ${updates.join(', ')} WHERE id = $${idx}`, params)
      return { ok: true }
    }
  )

  app.delete(
    '/zonas/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.zonas_uso WHERE id = $1`, [id])
      reply.code(204)
    }
  )
}
