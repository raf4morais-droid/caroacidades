import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

export const MIGRATION_ARVORES_SITUACAO = `
  ALTER TABLE sigweb.arvores
    ADD COLUMN IF NOT EXISTS situacao TEXT NOT NULL DEFAULT 'normal'
      CHECK (situacao IN ('normal','com_solicitacao','em_manutencao'));
`

export async function arborizacaoRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Árvores — bbox ou listagem geral
  app.get('/arborizacao/arvores', async (request) => {
    const { minx, miny, maxx, maxy, q } = request.query as Record<string, string>
    if (minx && miny && maxx && maxy) {
      return query(
        `SELECT a.id, a.codigo, a.especie, a.nome_popular, a.estado_fitossanitario,
                ST_AsGeoJSON(ST_Transform(a.geometry, 4326))::json AS geometry
         FROM sigweb.arvores a
         WHERE ST_Intersects(a.geometry, ST_Transform(ST_MakeEnvelope($1,$2,$3,$4,4326),31982))`,
        [minx, miny, maxx, maxy]
      )
    }
    const where = q ? `WHERE a.especie ILIKE $1 OR a.nome_popular ILIKE $1` : ''
    const params = q ? [`%${q}%`] : []
    return query(
      `SELECT a.id, a.codigo, a.especie, a.nome_popular, a.estado_fitossanitario,
              l.nome AS logradouro,
              ST_AsGeoJSON(ST_Transform(a.geometry,4326))::json AS geometry
       FROM sigweb.arvores a
       LEFT JOIN sigweb.logradouros l ON l.id = a.logradouro_id
       ${where}
       ORDER BY a.codigo
       LIMIT 1000`,
      params
    )
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

  // OS por árvore (req 80, 85)
  app.get('/arborizacao/arvores/:id/os', async (request) => {
    const { id } = request.params as { id: string }
    return query(
      `SELECT os.*, e.nome AS equipe_nome
       FROM sigweb.ordens_servico_arb os
       LEFT JOIN sigweb.equipes_manutencao e ON e.id = os.equipe_id
       WHERE os.arvore_id = $1
       ORDER BY os.created_at DESC`,
      [id]
    )
  })

  // OS de arborização — listagem com filtros
  app.get('/arborizacao/os', async (request) => {
    const { situacao, page = '1', limit = '50' } = request.query as Record<string, string>
    const offset = (Number(page) - 1) * Number(limit)
    const conds: string[] = []
    const params: unknown[] = []

    if (situacao) { conds.push(`os.situacao = $${params.push(situacao)}`) }

    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : ''
    params.push(Number(limit), offset)

    return query(
      `SELECT os.*, a.codigo AS arvore_codigo, a.especie,
              e.nome AS equipe_nome, l.nome AS logradouro_nome,
              ST_AsGeoJSON(ST_Transform(a.geometry,4326))::json AS arvore_geometry
       FROM sigweb.ordens_servico_arb os
       JOIN sigweb.arvores a ON a.id = os.arvore_id
       LEFT JOIN sigweb.equipes_manutencao e ON e.id = os.equipe_id
       LEFT JOIN sigweb.logradouros l ON l.id = a.logradouro_id
       ${where}
       ORDER BY os.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    )
  })

  app.post('/arborizacao/os', async (request, reply) => {
    const body = z.object({
      arvoreId:    z.string().uuid(),
      tipo:        z.string().min(1),
      equipeId:    z.string().uuid().optional(),
      observacoes: z.string().optional(),
    }).parse(request.body)

    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.ordens_servico_arb (arvore_id, tipo, equipe_id, observacoes, created_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [body.arvoreId, body.tipo, body.equipeId ?? null, body.observacoes ?? null, request.user.uid]
    )
    // req 77: árvore muda de cor no mapa ao receber solicitação de manutenção
    await query(`UPDATE sigweb.arvores SET situacao = 'com_solicitacao' WHERE id = $1`, [body.arvoreId])
    reply.code(201)
    return { id: row.id }
  })

  app.patch(
    '/arborizacao/os/:id/situacao',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request) => {
      const { id } = request.params as { id: string }
      const { situacao } = request.body as { situacao: string }
      await query(
        `UPDATE sigweb.ordens_servico_arb
         SET situacao=$2, concluida_em=CASE WHEN $2='concluida' THEN now() ELSE NULL END
         WHERE id=$1`,
        [id, situacao]
      )

      // req 82: cor da árvore reflete fase do processo
      const os = await queryOne<{ arvore_id: string }>(`SELECT arvore_id FROM sigweb.ordens_servico_arb WHERE id = $1`, [id])
      if (os) {
        let novoStatus: string
        if (situacao === 'em_andamento') {
          novoStatus = 'em_manutencao'
        } else if (situacao === 'concluida') {
          const [{ aberto }] = await query<{ aberto: string }>(
            `SELECT COUNT(*) AS aberto FROM sigweb.ordens_servico_arb
             WHERE arvore_id = $1 AND situacao NOT IN ('concluida','cancelada') AND id <> $2`,
            [os.arvore_id, id]
          )
          novoStatus = Number(aberto) > 0 ? 'com_solicitacao' : 'normal'
        } else {
          novoStatus = 'com_solicitacao'
        }
        await query(`UPDATE sigweb.arvores SET situacao = $2 WHERE id = $1`, [os.arvore_id, novoStatus])
      }

      return { ok: true }
    }
  )

  // Boletim Cadastral — atualiza dados dendrométricos e fitossanitários da árvore (req 72)
  app.patch('/arborizacao/arvores/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const body = z.object({
      altura_m:              z.number().nonnegative().optional(),
      dap_cm:                z.number().nonnegative().optional(),
      estado_fitossanitario: z.string().optional(),
      situacao_calcada:      z.string().optional(),
      conflito_rede:         z.boolean().optional(),
      observacoes:           z.string().optional(),
    }).parse(request.body)

    const sets: string[] = []
    const params: unknown[] = [id]

    if (body.altura_m !== undefined)              { params.push(body.altura_m);              sets.push(`altura_m = $${params.length}`) }
    if (body.dap_cm !== undefined)                { params.push(body.dap_cm);                sets.push(`dap_cm = $${params.length}`) }
    if (body.estado_fitossanitario !== undefined) { params.push(body.estado_fitossanitario); sets.push(`estado_fitossanitario = $${params.length}`) }
    if (body.situacao_calcada !== undefined)      { params.push(body.situacao_calcada);      sets.push(`situacao_calcada = $${params.length}`) }
    if (body.conflito_rede !== undefined)         { params.push(body.conflito_rede);         sets.push(`conflito_rede = $${params.length}`) }
    if (body.observacoes !== undefined)           { params.push(body.observacoes);           sets.push(`observacoes = $${params.length}`) }

    if (sets.length === 0) return reply.code(400).send({ error: 'Nenhum campo para atualizar' })

    const updated = await queryOne(
      `UPDATE sigweb.arvores SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING id`,
      params
    )
    if (!updated) return reply.code(404).send({ error: 'Árvore não encontrada' })
    return { ok: true }
  })

  // Tipos de serviço disponíveis
  app.get('/arborizacao/tipos', async () =>
    query(`SELECT id, nome FROM sigweb.tipos_servico_arb ORDER BY nome`)
  )

  // Boletins de arborização
  app.get('/arborizacao/boletins', async (request) => {
    const { page = '1', limit = '50' } = request.query as Record<string, string>
    const offset = (Number(page) - 1) * Number(limit)
    return query(
      `SELECT b.*, a.codigo AS arvore_codigo, a.especie, u.nome AS usuario_nome
       FROM sigweb.boletins_arborizacao b
       JOIN sigweb.arvores a ON a.id = b.arvore_id
       LEFT JOIN sigweb.usuarios u ON u.id = b.created_by
       ORDER BY b.created_at DESC
       LIMIT $1 OFFSET $2`,
      [Number(limit), offset]
    )
  })
}
