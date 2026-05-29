import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const edificacaoSchema = z.object({
  inscricaoImobiliaria: z.string().optional(),
  cadastroImobiliario: z.string().optional(),
  areaConstruida: z.number().positive().optional(),
  parcelaId: z.string().uuid(),
  proprietarioId: z.string().uuid().optional(),
  faceQuadra: z.string().optional(),
  numeroPredial: z.string().optional(),
  situacao: z.enum(['regular', 'irregular', 'em_construcao', 'demolida', 'terreno_vazio']).default('regular'),
  geometry: z.object({ type: z.string(), coordinates: z.unknown() }).optional(),
})

const importMobileSchema = z.array(z.object({
  parcelaId: z.string().uuid(),
  situacaoRecadastramento: z.enum(['pendente', 'visitado', 'recadastrado', 'impedido']),
  areaTerreno: z.number().optional(),
  areaEdificada: z.number().optional(),
  numeroPavimentos: z.number().int().optional(),
  tipologiaConstrutiva: z.string().optional(),
  estadoConservacao: z.string().optional(),
  numeroPredial: z.string().optional(),
  observacoes: z.string().optional(),
  fotoUrls: z.array(z.string()),
  latitudeColeta: z.number().optional(),
  longitudeColeta: z.number().optional(),
  coletadoEm: z.string().optional(),
}))

export async function edificacoesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/edificacoes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const row = await queryOne(
      `SELECT e.*,
              p.nome AS proprietario_nome,
              ST_AsGeoJSON(ST_Transform(e.geometry, 4326))::json AS geometry
       FROM sigweb.edificacoes e
       LEFT JOIN sigweb.pessoas p ON p.id = e.proprietario_id
       WHERE e.id = $1`,
      [id]
    )
    if (!row) return reply.code(404).send({ error: 'Edificação não encontrada' })
    return row
  })

  app.post(
    '/edificacoes',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = edificacaoSchema.parse(request.body)
      const geomSql = body.geometry
        ? `ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($8), 4326), 31982)`
        : `NULL`

      const params: unknown[] = [
        body.inscricaoImobiliaria ?? null,
        body.cadastroImobiliario ?? null,
        body.areaConstruida ?? null,
        body.parcelaId,
        body.proprietarioId ?? null,
        body.faceQuadra ?? null,
        body.numeroPredial ?? null,
        body.situacao,
      ]
      if (body.geometry) params.push(JSON.stringify(body.geometry))

      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.edificacoes
           (inscricao_imobiliaria, cadastro_imobiliario, area_construida, parcela_id,
            proprietario_id, face_quadra, numero_predial, situacao, geometry)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,${geomSql})
         RETURNING id`,
        params
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  app.put(
    '/edificacoes/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = edificacaoSchema.partial().parse(request.body)

      const updates: string[] = []
      const params: unknown[] = []
      let i = 1

      if (body.situacao !== undefined)        { updates.push(`situacao = $${i++}`);              params.push(body.situacao) }
      if (body.numeroPredial !== undefined)   { updates.push(`numero_predial = $${i++}`);        params.push(body.numeroPredial) }
      if (body.areaConstruida !== undefined)  { updates.push(`area_construida = $${i++}`);       params.push(body.areaConstruida) }
      if (body.proprietarioId !== undefined)  { updates.push(`proprietario_id = $${i++}`);       params.push(body.proprietarioId) }
      if (body.geometry)                      { updates.push(`geometry = ST_Transform(ST_SetSRID(ST_GeomFromGeoJSON($${i++}),4326),31982)`); params.push(JSON.stringify(body.geometry)) }

      if (updates.length === 0) return reply.code(400).send({ error: 'Nenhum campo para atualizar' })

      params.push(id)
      await query(`UPDATE sigweb.edificacoes SET ${updates.join(', ')} WHERE id = $${i}`, params)
      return { ok: true }
    }
  )

  app.delete(
    '/edificacoes/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.edificacoes WHERE id = $1`, [id])
      reply.code(204)
    }
  )

  // Importação em lote de BICs coletados pelos apps móveis
  app.post(
    '/edificacoes/importar-mobile',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO', 'FISCAL_CAMPO') },
    async (request, reply) => {
      const bics = importMobileSchema.parse(request.body)
      const inseridos: string[] = []

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
        inseridos.push(row.id)

        await query(
          `UPDATE sigweb.parcelas SET updated_at = now() WHERE id = $1`,
          [bic.parcelaId]
        )
      }

      reply.code(201)
      return { inseridos: inseridos.length, ids: inseridos }
    }
  )

  // BICs de uma parcela
  app.get('/parcelas/:id/bics', async (request, reply) => {
    const { id } = request.params as { id: string }
    return query(`SELECT * FROM sigweb.bics WHERE parcela_id = $1 ORDER BY created_at DESC`, [id])
  })
}
