import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'
import {
  getMemorialDescritivo,
  desmembrarParcela,
  unificarParcelas,
  getParcelasNoBbox,
} from '../../services/spatial.service'

const bboxSchema = z.object({
  minx: z.coerce.number(),
  miny: z.coerce.number(),
  maxx: z.coerce.number(),
  maxy: z.coerce.number(),
})

const parcelaSchema = z.object({
  codigo: z.string().min(1).max(30),
  bairroId: z.string().uuid(),
  logradouroId: z.string().uuid(),
  loteamentoId: z.string().uuid().optional(),
  quadraId: z.string().uuid().optional(),
  areaM2: z.number().positive().optional(),
  testadaPrincipal: z.number().positive().optional(),
  testadaSecundaria: z.number().positive().optional(),
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }).optional(),
})

export async function parcelasRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Listar parcelas por bbox (para o mapa)
  app.get('/parcelas', async (request, reply) => {
    const parsed = bboxSchema.safeParse(request.query)
    if (!parsed.success) {
      return reply.code(400).send({ error: 'bbox inválido' })
    }
    const parcelas = await getParcelasNoBbox(parsed.data)
    return { data: parcelas }
  })

  // Busca textual por código / logradouro
  app.get('/parcelas/search', async (request, reply) => {
    const { q, page = '1', limit = '50' } = request.query as Record<string, string>
    if (!q || q.length < 2) return reply.code(400).send({ error: 'Mínimo 2 caracteres' })

    const offset = (Number(page) - 1) * Number(limit)
    const rows = await query(
      `SELECT p.id, p.codigo, p.area_m2,
              b.nome AS bairro, l.nome AS logradouro,
              ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry
       FROM sigweb.parcelas p
       LEFT JOIN sigweb.bairros b ON b.id = p.bairro_id
       LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
       WHERE p.codigo ILIKE $1 OR l.nome ILIKE $1
       ORDER BY p.codigo
       LIMIT $2 OFFSET $3`,
      [`%${q}%`, Number(limit), offset]
    )
    const [{ count }] = await query<{ count: string }>(
      `SELECT COUNT(*) FROM sigweb.parcelas p
       LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
       WHERE p.codigo ILIKE $1 OR l.nome ILIKE $1`,
      [`%${q}%`]
    )
    return { data: rows, pagination: { page: Number(page), limit: Number(limit), total: Number(count) } }
  })

  // Detalhe de uma parcela
  app.get('/parcelas/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parcela = await queryOne(
      `SELECT
         p.*,
         b.nome AS bairro_nome, b.codigo AS bairro_codigo,
         l.nome AS logradouro_nome, l.tipo AS logradouro_tipo,
         q.codigo AS quadra_codigo,
         ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry,
         ST_Area(p.geometry) AS area_m2_calc
       FROM sigweb.parcelas p
       LEFT JOIN sigweb.bairros b ON b.id = p.bairro_id
       LEFT JOIN sigweb.logradouros l ON l.id = p.logradouro_id
       LEFT JOIN sigweb.quadras q ON q.id = p.quadra_id
       WHERE p.id = $1`,
      [id]
    )
    if (!parcela) return reply.code(404).send({ error: 'Parcela não encontrada' })
    return parcela
  })

  // Criar parcela
  app.post(
    '/parcelas',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = parcelaSchema.parse(request.body)
      const geomSql = body.geometry
        ? `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($7), 4326), 31982)`
        : `NULL`

      const params: unknown[] = [
        body.codigo, body.bairroId, body.logradouroId,
        body.loteamentoId ?? null, body.quadraId ?? null,
        body.testadaPrincipal ?? null, body.testadaSecundaria ?? null,
      ]
      if (body.geometry) params.push(JSON.stringify(body.geometry))

      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.parcelas
           (codigo, bairro_id, logradouro_id, loteamento_id, quadra_id, testada_principal, testada_secundaria, geometry, area_m2)
         VALUES ($1,$2,$3,$4,$5,$6,$7,${geomSql},${body.geometry ? `ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($7),4326),31982))` : 'NULL'})
         RETURNING id`,
        params
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  // Atualizar geometria da parcela
  app.put(
    '/parcelas/:id/geometry',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { geometry } = request.body as { geometry: object }

      await query(
        `UPDATE sigweb.parcelas
         SET geometry = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), 31982),
             area_m2  = ST_Area(ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($2), 4326), 31982))
         WHERE id = $1`,
        [id, JSON.stringify(geometry)]
      )
      return { ok: true }
    }
  )

  // Deletar parcela
  app.delete(
    '/parcelas/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.parcelas WHERE id = $1`, [id])
      reply.code(204)
    }
  )

  // Memorial descritivo em JSON (o PDF é gerado no frontend com jsPDF)
  app.get('/parcelas/:id/memorial', async (request, reply) => {
    const { id } = request.params as { id: string }
    const memorial = await getMemorialDescritivo(id)
    if (!memorial) return reply.code(404).send({ error: 'Parcela não encontrada' })
    return memorial
  })

  // Edificações da parcela
  app.get('/parcelas/:id/edificacoes', async (request, reply) => {
    const { id } = request.params as { id: string }
    return query(
      `SELECT e.*,
              ST_AsGeoJSON(ST_Transform(e.geometry, 4326))::json AS geometry
       FROM sigweb.edificacoes e WHERE e.parcela_id = $1`,
      [id]
    )
  })

  // Desmembramento
  app.post(
    '/parcelas/:id/desmembrar',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const { linhaGeoJSON } = request.body as { linhaGeoJSON: object }
      const resultado = await desmembrarParcela(id, linhaGeoJSON, request.user.uid)
      reply.code(201)
      return resultado
    }
  )

  // Unificação
  app.post(
    '/parcelas/unificar',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { parcelaIds } = request.body as { parcelaIds: string[] }
      const novoId = await unificarParcelas(parcelaIds, request.user.uid)
      reply.code(201)
      return { id: novoId }
    }
  )

  // Histórico de alterações
  app.get('/parcelas/:id/historico', async (request, reply) => {
    const { id } = request.params as { id: string }
    return query(
      `SELECT h.*, u.nome AS usuario_nome
       FROM sigweb.historico_cartografico h
       LEFT JOIN sigweb.usuarios u ON u.id = h.usuario_id
       WHERE h.entidade = 'parcelas' AND h.entidade_id = $1
       ORDER BY h.created_at DESC`,
      [id]
    )
  })
}
