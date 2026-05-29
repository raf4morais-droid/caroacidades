import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

export async function mobileRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Loteamentos e lotes para o app de recadastramento
  app.get('/mobile/loteamentos', async () =>
    query(`SELECT id, nome, decreto FROM sigweb.loteamentos ORDER BY nome`)
  )

  app.get('/mobile/loteamentos/:id/lotes', async (request) => {
    const { id } = request.params as { id: string }
    return query(
      `SELECT p.id, p.codigo, p.area_m2,
              COALESCE(b.situacao_recadastramento, 'pendente') AS situacao_recadastramento,
              ST_AsGeoJSON(ST_Transform(p.geometry, 4326))::json AS geometry
       FROM sigweb.parcelas p
       LEFT JOIN sigweb.bics b ON b.parcela_id = p.id
         AND b.id = (SELECT id FROM sigweb.bics WHERE parcela_id = p.id ORDER BY created_at DESC LIMIT 1)
       WHERE p.loteamento_id = $1`,
      [id]
    )
  })

  // BICs coletados offline (importação em lote)
  app.post(
    '/mobile/bics',
    { preHandler: requireRole('ADMIN', 'FISCAL_CAMPO', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const bicsSchema = z.array(z.object({
        parcelaId: z.string().uuid(),
        situacaoRecadastramento: z.enum(['visitado', 'recadastrado', 'impedido']),
        areaTerreno: z.number().optional(),
        areaEdificada: z.number().optional(),
        numeroPavimentos: z.number().int().optional(),
        tipologiaConstrutiva: z.string().optional(),
        estadoConservacao: z.string().optional(),
        numeroPredial: z.string().optional(),
        observacoes: z.string().optional(),
        fotoUrls: z.array(z.string()).default([]),
        latitudeColeta: z.number().optional(),
        longitudeColeta: z.number().optional(),
        coletadoEm: z.string().optional(),
      }))

      const bics = bicsSchema.parse(Array.isArray(request.body) ? request.body : [request.body])
      const ids: string[] = []

      for (const bic of bics) {
        const [row] = await query<{ id: string }>(
          `INSERT INTO sigweb.bics
             (parcela_id, situacao_recadastramento, area_terreno, area_edificada,
              numero_pavimentos, tipologia_construtiva, estado_conservacao,
              numero_predial, observacoes, foto_urls,
              latitude_coleta, longitude_coleta, coletado_por, coletado_em, sincronizado_em)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,now())
           RETURNING id`,
          [
            bic.parcelaId, bic.situacaoRecadastramento,
            bic.areaTerreno ?? null, bic.areaEdificada ?? null,
            bic.numeroPavimentos ?? null, bic.tipologiaConstrutiva ?? null,
            bic.estadoConservacao ?? null, bic.numeroPredial ?? null,
            bic.observacoes ?? null, bic.fotoUrls,
            bic.latitudeColeta ?? null, bic.longitudeColeta ?? null,
            request.user.uid, bic.coletadoEm ?? null,
          ]
        )
        ids.push(row.id)
      }

      reply.code(201)
      return { sincronizados: ids.length, ids }
    }
  )

  // Chamados do app de chamados
  app.get('/mobile/chamados', async (request) => {
    const { usuarioId } = request.query as { usuarioId?: string }
    const where = usuarioId ? `WHERE s.solicitante_id = $1` : ''
    const params = usuarioId ? [usuarioId] : []
    return query(
      `SELECT s.*, c.nome AS categoria_nome
       FROM sigweb.solicitacoes_chamado s
       JOIN sigweb.categorias_chamado c ON c.id = s.categoria_id
       ${where}
       ORDER BY s.created_at DESC LIMIT 100`,
      params
    )
  })

  app.post('/mobile/chamados', async (request, reply) => {
    const body = z.object({
      categoriaId: z.string().uuid(),
      descricao: z.string().min(5),
      latitude: z.number(),
      longitude: z.number(),
      endereco: z.string().optional(),
      fotoUrls: z.array(z.string()).default([]),
    }).parse(request.body)

    const [row] = await query<{ id: string }>(
      `INSERT INTO sigweb.solicitacoes_chamado
         (categoria_id, descricao, latitude, longitude, endereco, foto_urls, solicitante_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [
        body.categoriaId, body.descricao, body.latitude, body.longitude,
        body.endereco ?? null, body.fotoUrls, request.user.uid,
      ]
    )
    reply.code(201)
    return { id: row.id }
  })

  // Árvores para o app de arborização
  app.post(
    '/mobile/arvores',
    { preHandler: requireRole('ADMIN', 'FISCAL_CAMPO') },
    async (request, reply) => {
      const body = z.object({
        latitude: z.number(),
        longitude: z.number(),
        especie: z.string().optional(),
        nomePopular: z.string().optional(),
        alturaM: z.number().optional(),
        dapCm: z.number().optional(),
        estadoFitossanitario: z.string().optional(),
        situacaoCalcada: z.string().optional(),
        logradouroId: z.string().uuid().optional(),
        fotoUrls: z.array(z.string()).default([]),
      }).parse(request.body)

      const [row] = await query<{ id: string; codigo: number }>(
        `INSERT INTO sigweb.arvores
           (logradouro_id, especie, nome_popular, altura_m, dap_cm,
            estado_fitossanitario, situacao_calcada, data_cadastro, geometry)
         VALUES ($1,$2,$3,$4,$5,$6,$7,CURRENT_DATE,
           ST_Transform(ST_SetSRID(ST_Point($8,$9),4326),31982))
         RETURNING id, codigo`,
        [
          body.logradouroId ?? null, body.especie ?? null, body.nomePopular ?? null,
          body.alturaM ?? null, body.dapCm ?? null,
          body.estadoFitossanitario ?? null, body.situacaoCalcada ?? null,
          body.longitude, body.latitude,
        ]
      )
      reply.code(201)
      return { id: row.id, codigo: row.codigo }
    }
  )
}
