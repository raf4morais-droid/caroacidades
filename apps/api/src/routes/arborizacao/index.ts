import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

export async function arborizacaoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/arborizacao/arvores', async (request) => {
    const { minx, miny, maxx, maxy } = request.query as Record<string, string>
    if (minx && miny && maxx && maxy) {
      return query(
        `SELECT a.id, a.codigo, a.especie, a.nome_popular, a.estado_fitossanitario,
                ST_AsGeoJSON(ST_Transform(a.geometry, 4326))::json AS geometry
         FROM sigweb.arvores a
         WHERE ST_Intersects(a.geometry, ST_Transform(ST_MakeEnvelope($1,$2,$3,$4,4326),31982))`,
        [minx, miny, maxx, maxy]
      )
    }
    return query(`SELECT id, codigo, especie, estado_fitossanitario FROM sigweb.arvores LIMIT 1000`)
  })

  app.get('/arborizacao/arvores/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const row = await queryOne(
      `SELECT a.*, l.nome AS logradouro_nome,
              ST_AsGeoJSON(ST_Transform(a.geometry, 4326))::json AS geometry
       FROM sigweb.arvores a
       LEFT JOIN sigweb.logradouros l ON l.id = a.logradouro_id
       WHERE a.id = $1`,
      [id]
    )
    if (!row) return reply.code(404).send({ error: 'Árvore não encontrada' })
    return row
  })

  app.post(
    '/arborizacao/os',
    async (request, reply) => {
      const body = z.object({
        arvoreId: z.string().uuid(),
        tipo: z.string().min(1),
        equipeId: z.string().uuid().optional(),
        observacoes: z.string().optional(),
      }).parse(request.body)

      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.ordens_servico_arb (arvore_id, tipo, equipe_id, observacoes, created_by)
         VALUES ($1,$2,$3,$4,$5) RETURNING id`,
        [body.arvoreId, body.tipo, body.equipeId ?? null, body.observacoes ?? null, request.user.uid]
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  app.patch(
    '/arborizacao/os/:id/situacao',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { situacao } = request.body as { situacao: string }
      await query(
        `UPDATE sigweb.ordens_servico_arb
         SET situacao = $2, concluida_em = CASE WHEN $2 = 'concluida' THEN now() ELSE NULL END
         WHERE id = $1`,
        [id, situacao]
      )
      return { ok: true }
    }
  )
}
