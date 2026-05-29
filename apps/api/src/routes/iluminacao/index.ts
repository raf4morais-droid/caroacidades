import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const osSchema = z.object({
  posteId: z.string().uuid(),
  tipoDefeitoId: z.string().uuid().optional(),
  equipeId: z.string().uuid().optional(),
  observacoes: z.string().optional(),
})

export async function iluminacaoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Postes — listagem por bbox
  app.get('/iluminacao/postes', async (request) => {
    const { minx, miny, maxx, maxy } = request.query as Record<string, string>
    if (minx && miny && maxx && maxy) {
      return query(
        `SELECT p.id, p.codigo, p.tipo, p.potencia_w, p.situacao,
                l.nome AS logradouro,
                ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry
         FROM sigweb.postes p
         LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
         WHERE ST_Intersects(p.geometry, ST_Transform(ST_MakeEnvelope($1,$2,$3,$4,4326),31982))`,
        [minx, miny, maxx, maxy]
      )
    }
    return query(`SELECT id, codigo, tipo, situacao FROM sigweb.postes LIMIT 500`)
  })

  app.get('/iluminacao/postes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const row = await queryOne(
      `SELECT p.*, l.nome AS logradouro_nome,
              ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry
       FROM sigweb.postes p
       LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
       WHERE p.id = $1`,
      [id]
    )
    if (!row) return reply.code(404).send({ error: 'Poste não encontrado' })
    return row
  })

  // Ordens de Serviço
  app.get('/iluminacao/os', async (request) => {
    const { situacao, page = '1', limit = '50' } = request.query as Record<string, string>
    const offset = (Number(page) - 1) * Number(limit)
    const where = situacao ? `WHERE os.situacao = $3` : ''
    const params: unknown[] = [Number(limit), offset]
    if (situacao) params.push(situacao)

    return query(
      `SELECT os.*, p.codigo AS poste_codigo, td.nome AS tipo_defeito,
              e.nome AS equipe_nome,
              ST_AsGeoJSON(ST_Transform(p2.geometry, 4326))::json AS poste_geometry
       FROM sigweb.ordens_servico_ip os
       JOIN sigweb.postes p2 ON p2.id = os.poste_id
       LEFT JOIN sigweb.tipos_defeito td ON td.id = os.tipo_defeito_id
       LEFT JOIN sigweb.equipes_manutencao e ON e.id = os.equipe_id
       LEFT JOIN sigweb.postes p ON p.id = os.poste_id
       ${where}
       ORDER BY os.created_at DESC LIMIT $1 OFFSET $2`,
      params
    )
  })

  app.post('/iluminacao/os', async (request, reply) => {
    const body = osSchema.parse(request.body)
    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.ordens_servico_ip (poste_id, tipo_defeito_id, equipe_id, observacoes, created_by)
       VALUES ($1,$2,$3,$4,$5)
       RETURNING id`,
      [body.posteId, body.tipoDefeitoId ?? null, body.equipeId ?? null, body.observacoes ?? null, request.user.uid]
    )

    await query(`UPDATE sigweb.postes SET situacao = 'defeito' WHERE id = $1`, [body.posteId])
    reply.code(201)
    return { id: row.id }
  })

  app.patch(
    '/iluminacao/os/:id/situacao',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { situacao, equipeId } = request.body as { situacao: string; equipeId?: string }

      await query(
        `UPDATE sigweb.ordens_servico_ip
         SET situacao = $2,
             equipe_id = COALESCE($3, equipe_id),
             concluida_em = CASE WHEN $2 = 'concluida' THEN now() ELSE NULL END
         WHERE id = $1`,
        [id, situacao, equipeId ?? null]
      )

      if (situacao === 'concluida') {
        const os = await queryOne<{ poste_id: string }>(`SELECT poste_id FROM sigweb.ordens_servico_ip WHERE id = $1`, [id])
        if (os) await query(`UPDATE sigweb.postes SET situacao = 'normal' WHERE id = $1`, [os.poste_id])
      } else if (situacao === 'em_andamento') {
        const os = await queryOne<{ poste_id: string }>(`SELECT poste_id FROM sigweb.ordens_servico_ip WHERE id = $1`, [id])
        if (os) await query(`UPDATE sigweb.postes SET situacao = 'em_manutencao' WHERE id = $1`, [os.poste_id])
      }

      return { ok: true }
    }
  )

  // Estoque
  app.get('/iluminacao/estoque', async () => {
    return query(
      `SELECT e.*, p.nome AS produto_nome, p.unidade, l.nome AS local_nome
       FROM sigweb.estoque e
       JOIN sigweb.produtos p ON p.id = e.produto_id
       JOIN sigweb.locais_estoque l ON l.id = e.local_id
       ORDER BY p.nome, l.nome`
    )
  })

  app.post(
    '/iluminacao/estoque/movimentacao',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { estoqueId, tipo, quantidade, osId, observacoes } = request.body as {
        estoqueId: string; tipo: string; quantidade: number; osId?: string; observacoes?: string
      }

      const delta = tipo === 'entrada' ? quantidade : -quantidade
      await query(
        `UPDATE sigweb.estoque SET quantidade = quantidade + $2 WHERE id = $1`,
        [estoqueId, delta]
      )
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.movimentacoes_estoque (estoque_id, tipo, quantidade, os_id, observacoes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
        [estoqueId, tipo, quantidade, osId ?? null, observacoes ?? null, request.user.uid]
      )
      reply.code(201)
      return { id: row.id }
    }
  )
}
