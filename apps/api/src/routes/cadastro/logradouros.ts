import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const logradouroSchema = z.object({
  nome: z.string().min(1),
  tipo: z.string().min(1).default('Rua'),
  codigo: z.string().min(1),
  cep: z.string().optional(),
  bairroId: z.string().uuid().optional(),
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }).optional(),
})

export async function logradourosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/logradouros', async (request) => {
    const { q } = request.query as { q?: string }
    const filter = q?.trim()

    if (filter) {
      return query(
        `SELECT l.id, l.nome, l.tipo, l.codigo, l.cep, l.bairro_id,
                ST_AsGeoJSON(ST_Transform(l.geometry, 4326))::json AS geometry,
                b.nome AS bairro_nome
         FROM sigweb.logradouros l
         LEFT JOIN sigweb.bairros b ON b.id = l.bairro_id
         WHERE l.nome ILIKE $1 OR l.codigo ILIKE $1
         ORDER BY l.nome`,
        [`%${filter}%`]
      )
    }

    return query(
      `SELECT l.id, l.nome, l.tipo, l.codigo, l.cep, l.bairro_id,
              ST_AsGeoJSON(ST_Transform(l.geometry, 4326))::json AS geometry,
              b.nome AS bairro_nome
       FROM sigweb.logradouros l
       LEFT JOIN sigweb.bairros b ON b.id = l.bairro_id
       ORDER BY l.nome`
    )
  })

  app.get('/logradouros/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const logradouro = await queryOne(
      `SELECT l.id, l.nome, l.tipo, l.codigo, l.cep, l.bairro_id,
              ST_AsGeoJSON(ST_Transform(l.geometry, 4326))::json AS geometry,
              b.nome AS bairro_nome
       FROM sigweb.logradouros l
       LEFT JOIN sigweb.bairros b ON b.id = l.bairro_id
       WHERE l.id = $1`,
      [id]
    )
    if (!logradouro) return reply.code(404).send({ error: 'Logradouro não encontrado' })
    return logradouro
  })

  app.post(
    '/logradouros',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = logradouroSchema.parse(request.body)
      const params: unknown[] = [body.nome, body.tipo, body.codigo, body.cep ?? null, body.bairroId ?? null]
      const geomSql = body.geometry
        ? `ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($6), 4326), 31982))`
        : 'NULL'
      if (body.geometry) params.push(JSON.stringify(body.geometry))

      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.logradouros (nome, tipo, codigo, cep, bairro_id, geometry)
         VALUES ($1, $2, $3, $4, $5, ${geomSql})
         RETURNING id`,
        params
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  app.put(
    '/logradouros/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = logradouroSchema.partial().parse(request.body)
      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1

      if (body.nome !== undefined) { updates.push(`nome = $${idx++}`); params.push(body.nome) }
      if (body.tipo !== undefined) { updates.push(`tipo = $${idx++}`); params.push(body.tipo) }
      if (body.codigo !== undefined) { updates.push(`codigo = $${idx++}`); params.push(body.codigo) }
      if (body.cep !== undefined) { updates.push(`cep = $${idx++}`); params.push(body.cep) }
      if (body.bairroId !== undefined) { updates.push(`bairro_id = $${idx++}`); params.push(body.bairroId) }
      if (body.geometry) {
        updates.push(`geometry = ST_Multi(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($${idx++}), 4326), 31982))`)
        params.push(JSON.stringify(body.geometry))
      }

      if (!updates.length) {
        return reply.code(400).send({ error: 'Nenhum campo para atualizar' })
      }

      params.push(id)
      await query(`UPDATE sigweb.logradouros SET ${updates.join(', ')} WHERE id = $${idx}`, params)
      return { ok: true }
    }
  )

  app.delete(
    '/logradouros/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.logradouros WHERE id = $1`, [id])
      reply.code(204)
    }
  )
}
