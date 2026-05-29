import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const numeracaoSchema = z.object({
  logradouroId: z.string().uuid(),
  numeroPar: z.number().int().positive(),
  numeroImpar: z.number().int().positive(),
  inverteLado: z.boolean().default(false),
})

export async function cartografiaRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Logradouros com geometria (para o mapa)
  app.get('/cartografia/logradouros', async (request) => {
    const { minx, miny, maxx, maxy, q } = request.query as Record<string, string>

    if (q && q.length >= 2) {
      return query(
        `SELECT id, nome, tipo, codigo,
                ST_AsGeoJSON(ST_Transform(geometry, 4326))::json AS geometry
         FROM sigweb.logradouros WHERE nome ILIKE $1 ORDER BY nome LIMIT 50`,
        [`%${q}%`]
      )
    }

    if (minx && miny && maxx && maxy) {
      return query(
        `SELECT id, nome, tipo, codigo,
                ST_AsGeoJSON(ST_Transform(geometry, 4326))::json AS geometry
         FROM sigweb.logradouros
         WHERE ST_Intersects(geometry, ST_Transform(ST_MakeEnvelope($1,$2,$3,$4,4326),31982))`,
        [minx, miny, maxx, maxy]
      )
    }

    return query(`SELECT id, nome, tipo, codigo FROM sigweb.logradouros ORDER BY nome LIMIT 500`)
  })

  // Quadras com geometria
  app.get('/cartografia/quadras', async (request) => {
    const { minx, miny, maxx, maxy, loteamentoId } = request.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []

    if (minx && miny && maxx && maxy) {
      conditions.push(`ST_Intersects(q.geometry, ST_Transform(ST_MakeEnvelope($1,$2,$3,$4,4326),31982))`)
      params.push(minx, miny, maxx, maxy)
    }
    if (loteamentoId) {
      conditions.push(`q.loteamento_id = $${params.length + 1}`)
      params.push(loteamentoId)
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    return query(
      `SELECT q.id, q.codigo, q.loteamento_id, lt.nome AS loteamento_nome,
              ST_AsGeoJSON(ST_Transform(q.geometry, 4326))::json AS geometry
       FROM sigweb.quadras q
       LEFT JOIN sigweb.loteamentos lt ON lt.id = q.loteamento_id
       ${where} LIMIT 1000`,
      params
    )
  })

  // Bairros
  app.get('/cartografia/bairros', async () =>
    query(
      `SELECT id, nome, codigo,
              ST_AsGeoJSON(ST_Transform(geometry, 4326))::json AS geometry
       FROM sigweb.bairros ORDER BY nome`
    )
  )

  // Numeração predial automatizada
  app.post(
    '/cartografia/numeracao-predial',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = numeracaoSchema.parse(request.body)

      // Lotes lindeiros ao logradouro ordenados por distância ao ponto inicial
      const lotes = await query<{
        id: string
        edificacao_ids: string[]
        distancia: number
        lado: string
      }>(
        `WITH lotes_lindeiros AS (
           SELECT
             p.id,
             ARRAY_AGG(e.id) AS edificacao_ids,
             ST_Distance(ST_StartPoint(l.geometry), ST_Centroid(p.geometry)) AS distancia,
             CASE
               WHEN ST_Distance(l.geometry, p.geometry) < 1
                 AND MOD(ROUND(ST_LineLocatePoint(l.geometry, ST_Centroid(p.geometry)) * 1000)::int, 2) = 0
               THEN 'par' ELSE 'impar'
             END AS lado
           FROM sigweb.parcelas p
           LEFT JOIN sigweb.edificacoes e ON e.parcela_id = p.id
           JOIN sigweb.logradouros l ON l.id = $1
           WHERE ST_DWithin(p.geometry, l.geometry, 30)
           GROUP BY p.id, l.geometry
         )
         SELECT * FROM lotes_lindeiros ORDER BY distancia`,
        [body.logradouroId]
      )

      const pares = lotes.filter(l => l.lado === (body.inverteLado ? 'impar' : 'par'))
      const impares = lotes.filter(l => l.lado === (body.inverteLado ? 'par' : 'impar'))

      const numeracoes: { edificacaoId: string; numero: string }[] = []
      pares.forEach((lote, i) => {
        const n = body.numeroPar + i * 2
        for (const eid of lote.edificacao_ids ?? []) {
          numeracoes.push({ edificacaoId: eid, numero: String(n) })
        }
      })
      impares.forEach((lote, i) => {
        const n = body.numeroImpar + i * 2
        for (const eid of lote.edificacao_ids ?? []) {
          numeracoes.push({ edificacaoId: eid, numero: String(n) })
        }
      })

      return { preview: numeracoes, totalLotes: lotes.length }
    }
  )

  // Confirmar numeração
  app.put(
    '/cartografia/numeracao-predial/confirmar',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { numeracoes } = request.body as {
        numeracoes: { edificacaoId: string; numero: string }[]
      }
      for (const item of numeracoes) {
        await query(
          `UPDATE sigweb.edificacoes SET numero_predial = $2 WHERE id = $1`,
          [item.edificacaoId, item.numero]
        )
      }
      return { atualizados: numeracoes.length }
    }
  )

  // Histórico cartográfico
  app.get('/cartografia/historico', async (request) => {
    const { entidade, entidadeId, page = '1', limit = '50' } = request.query as Record<string, string>
    const conditions: string[] = []
    const params: unknown[] = []
    let i = 1

    if (entidade)   { conditions.push(`h.entidade = $${i++}`);    params.push(entidade) }
    if (entidadeId) { conditions.push(`h.entidade_id = $${i++}`); params.push(entidadeId) }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const offset = (Number(page) - 1) * Number(limit)
    params.push(Number(limit), offset)

    return query(
      `SELECT h.*, u.nome AS usuario_nome
       FROM sigweb.historico_cartografico h
       LEFT JOIN sigweb.usuarios u ON u.id = h.usuario_id
       ${where}
       ORDER BY h.created_at DESC
       LIMIT $${i++} OFFSET $${i}`,
      params
    )
  })
}
