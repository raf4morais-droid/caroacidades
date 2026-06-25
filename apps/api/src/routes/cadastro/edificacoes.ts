import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
import { utils, write } from 'xlsx'
import { authMiddleware } from '../../middleware/auth.middleware'
import { requireRole } from '../../middleware/rbac.middleware'

const EXPORT_FORMATS = ['csv', 'xml', 'xlsx'] as const

type ExportFormat = (typeof EXPORT_FORMATS)[number]

function escapeCsv(value: unknown) {
  const text = value == null ? '' : String(value)
  return `"${text.replace(/"/g, '""')}"`
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return ''
  const headers = Object.keys(rows[0])
  const lines = [headers.map(escapeCsv).join(',')]
  for (const row of rows) {
    lines.push(headers.map((key) => escapeCsv(row[key])).join(','))
  }
  return lines.join('\r\n')
}

function toXml(rootName: string, rows: Record<string, unknown>[]) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
  xml += `<${rootName}>\n`
  for (const row of rows) {
    xml += '  <row>\n'
    for (const [key, value] of Object.entries(row)) {
      xml += `    <${key}>${value == null ? '' : String(value)}</${key}>\n`
    }
    xml += '  </row>\n'
  }
  xml += `</${rootName}>\n`
  return xml
}

function toXlsx(rows: Record<string, unknown>[]) {
  const worksheet = utils.json_to_sheet(rows)
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, worksheet, 'export')
  return write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

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

// Cria notificações de irregularidade para ADMIN/FISCAL_TRIBUTARIO (req 27)
async function notificarIrregularidade(edificacaoId: string, autorUid: string) {
  const usuarios = await query<{ id: string }>(
    `SELECT id FROM sigweb.usuarios WHERE perfil IN ('ADMIN', 'FISCAL_TRIBUTARIO') AND ativo = true`
  )
  const edificacao = await queryOne<{ inscricao_imobiliaria: string | null; numero_predial: string | null }>(
    `SELECT inscricao_imobiliaria, numero_predial FROM sigweb.edificacoes WHERE id = $1`,
    [edificacaoId]
  )
  const ref = edificacao?.inscricao_imobiliaria || edificacao?.numero_predial || edificacaoId.slice(0, 8)
  for (const u of usuarios) {
    await query(
      `INSERT INTO sigweb.notificacoes (usuario_id, tipo, titulo, conteudo, referencia_id, criado_por)
       VALUES ($1, 'irregularidade_edificacao', 'Edificação marcada como irregular',
               $2, $3, $4)`,
      [u.id, `A edificação ${ref} foi marcada como irregular e aguarda providências.`, edificacaoId, autorUid]
    )
  }
}

export async function edificacoesRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  // Listar edificações com busca/filtro/paginação (req 20/21)
  app.get('/edificacoes', async (request) => {
    const { q = '', situacao, parcela_id, page = '1', limit = '50' } = request.query as Record<string, string>
    const offset = (Number(page) - 1) * Number(limit)

    const where: string[] = []
    const params: unknown[] = []
    let i = 1

    if (q.trim()) {
      where.push(`(e.inscricao_imobiliaria ILIKE $${i} OR e.numero_predial ILIKE $${i} OR e.cadastro_imobiliario ILIKE $${i} OR p.codigo ILIKE $${i})`)
      params.push(`%${q.trim()}%`)
      i++
    }
    if (situacao) { where.push(`e.situacao = $${i++}`); params.push(situacao) }
    if (parcela_id) { where.push(`e.parcela_id = $${i++}`); params.push(parcela_id) }

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

    const rows = await query(
      `SELECT e.id, e.inscricao_imobiliaria, e.cadastro_imobiliario, e.area_construida,
              e.parcela_id, e.proprietario_id, e.face_quadra, e.numero_predial, e.situacao,
              p.codigo AS parcela_codigo, pe.nome AS proprietario_nome
       FROM sigweb.edificacoes e
       LEFT JOIN sigweb.parcelas p ON p.id = e.parcela_id
       LEFT JOIN sigweb.pessoas pe ON pe.id = e.proprietario_id
       ${whereSql}
       ORDER BY e.created_at DESC
       LIMIT $${i} OFFSET $${i + 1}`,
      [...params, Number(limit), offset]
    )

    const [{ count }] = await query<{ count: string }>(
      `SELECT COUNT(*) FROM sigweb.edificacoes e LEFT JOIN sigweb.parcelas p ON p.id = e.parcela_id ${whereSql}`,
      params
    )
    return { data: rows, pagination: { page: Number(page), limit: Number(limit), total: Number(count) } }
  })

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
      if (body.situacao === 'irregular') await notificarIrregularidade(row.id, request.user.uid)
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
      if (body.situacao === 'irregular') await notificarIrregularidade(id, request.user.uid)
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

  app.get('/edificacoes/export', async (request, reply) => {
    const { format = 'csv' } = request.query as { format?: string }
    if (!EXPORT_FORMATS.includes(format as ExportFormat)) {
      return reply.code(400).send({ error: 'Formato inválido. Use csv, xml ou xlsx.' })
    }

    const rows = await query<Record<string, unknown>>(
      `SELECT e.id, e.inscricao_imobiliaria, e.cadastro_imobiliario, e.area_construida,
              e.parcela_id, e.proprietario_id, e.face_quadra, e.numero_predial, e.situacao
       FROM sigweb.edificacoes e
       ORDER BY e.created_at DESC`
    )

    const filename = `edificacoes.${format}`
    if (format === 'csv') {
      const csv = toCsv(rows)
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return csv
    }

    if (format === 'xml') {
      const xml = toXml('edificacoes', rows)
      reply.header('Content-Type', 'application/xml; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return xml
    }

    const buffer = toXlsx(rows)
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    return buffer
  })

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
