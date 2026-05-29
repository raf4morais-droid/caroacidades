import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

export async function socialRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)
  app.addHook('preHandler', requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'SETOR_PROJETOS'))

  app.get('/social/familias', async (request) => {
    const { situacao, page = '1', limit = '50' } = request.query as Record<string, string>
    const offset = (Number(page) - 1) * Number(limit)
    const where = situacao ? `WHERE f.situacao_cadastral = $3` : ''
    const params: unknown[] = [Number(limit), offset]
    if (situacao) params.push(situacao)

    return query(
      `SELECT f.*, e.inscricao_imobiliaria,
              ST_AsGeoJSON(ST_Transform(ed.geometry, 4326))::json AS geometry
       FROM sigweb.familias f
       LEFT JOIN sigweb.edificacoes e ON e.id = f.edificacao_id
       LEFT JOIN sigweb.edificacoes ed ON ed.id = f.edificacao_id
       ${where}
       ORDER BY f.codigo
       LIMIT $1 OFFSET $2`,
      params
    )
  })

  app.get('/social/familias/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const familia = await queryOne(`SELECT * FROM sigweb.familias WHERE id = $1`, [id])
    if (!familia) return reply.code(404).send({ error: 'Família não encontrada' })

    const membros = await query(
      `SELECT id, nome, data_nascimento, sexo, escolaridade, parentesco, compoe_renda
       FROM sigweb.pessoas_social WHERE familia_id = $1`,
      [id]
    )
    const rendas = await query(
      `SELECT r.*, tr.nome AS tipo_renda_nome
       FROM sigweb.rendas r
       JOIN sigweb.pessoas_social ps ON ps.id = r.pessoa_id
       LEFT JOIN sigweb.tipos_renda tr ON tr.id = r.tipo_renda_id
       WHERE ps.familia_id = $1`,
      [id]
    )
    return { ...familia, membros, rendas }
  })

  app.post(
    '/social/familias',
    async (request, reply) => {
      const body = z.object({
        edificacaoId: z.string().uuid().optional(),
        situacaoCadastral: z.string().default('ativo'),
        qtdMembros: z.number().int().min(1),
        programasSociais: z.array(z.string()).default([]),
      }).parse(request.body)

      const [row] = await query<{ id: string; codigo: string }>(
        `INSERT INTO sigweb.familias (codigo, edificacao_id, situacao_cadastral, qtd_membros, programas_sociais)
         VALUES ('FAM-' || LPAD(nextval('sigweb.seq_reurb')::text, 6, '0'), $1,$2,$3,$4)
         RETURNING id, codigo`,
        [body.edificacaoId ?? null, body.situacaoCadastral, body.qtdMembros, body.programasSociais]
      )
      reply.code(201)
      return { id: row.id, codigo: row.codigo }
    }
  )

  // Recalcula renda bruta e per capita da família
  app.post('/social/familias/:id/recalcular-renda', async (request, reply) => {
    const { id } = request.params as { id: string }
    await query(
      `UPDATE sigweb.familias f
       SET renda_bruta = (
         SELECT COALESCE(SUM(r.valor), 0)
         FROM sigweb.rendas r
         JOIN sigweb.pessoas_social ps ON ps.id = r.pessoa_id
         WHERE ps.familia_id = f.id AND r.compoe_renda = TRUE
       ),
       renda_per_capita = (
         SELECT COALESCE(SUM(r.valor), 0) / NULLIF(f2.qtd_membros, 0)
         FROM sigweb.rendas r
         JOIN sigweb.pessoas_social ps ON ps.id = r.pessoa_id
         JOIN sigweb.familias f2 ON f2.id = ps.familia_id
         WHERE ps.familia_id = f.id AND r.compoe_renda = TRUE
       )
       WHERE f.id = $1`,
      [id]
    )
    return { ok: true }
  })

  // Estatísticas para o gráfico pizza no mapa
  app.get('/social/stats', async () =>
    query(
      `SELECT situacao_cadastral, COUNT(*)::int AS total
       FROM sigweb.familias GROUP BY situacao_cadastral ORDER BY total DESC`
    )
  )
}
