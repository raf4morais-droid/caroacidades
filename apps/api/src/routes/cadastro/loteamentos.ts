import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { query, queryOne } from '../../db/pool'
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
  const { utils, write } = require('xlsx')
  const worksheet = utils.json_to_sheet(rows)
  const workbook = utils.book_new()
  utils.book_append_sheet(workbook, worksheet, 'export')
  return write(workbook, { bookType: 'xlsx', type: 'buffer' })
}

const loteamentoSchema = z.object({
  nome: z.string().min(1),
  decreto: z.string().optional(),
  dataAprovacao: z.string().optional(),
})

export async function loteamentosRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware)

  app.get('/loteamentos', async (request) => {
    const { q, page = '1', limit = '50' } = request.query as Record<string, string | undefined>
    const offset = (Number(page) - 1) * Number(limit)

    if (q && q.trim().length > 1) {
      const filter = `%${q.trim()}%`
      const rows = await query(
        `SELECT id, nome, decreto, TO_CHAR(data_aprovacao, 'YYYY-MM-DD') AS data_aprovacao, created_at, updated_at,
                ST_AsGeoJSON(ST_Transform(geometry, 4326))::json AS geometry
         FROM sigweb.loteamentos
         WHERE nome ILIKE $1 OR decreto ILIKE $1
         ORDER BY nome
         LIMIT $2 OFFSET $3`,
        [filter, Number(limit), offset]
      )
      const [{ count }] = await query<{ count: string }>(
        `SELECT COUNT(*) FROM sigweb.loteamentos
         WHERE nome ILIKE $1 OR decreto ILIKE $1`,
        [filter]
      )
      return { data: rows, pagination: { page: Number(page), limit: Number(limit), total: Number(count) } }
    }

    const rows = await query(
      `SELECT id, nome, decreto, TO_CHAR(data_aprovacao, 'YYYY-MM-DD') AS data_aprovacao, created_at, updated_at
       FROM sigweb.loteamentos
       ORDER BY nome
       LIMIT $1 OFFSET $2`,
      [Number(limit), offset]
    )
    const [{ count }] = await query<{ count: string }>(`SELECT COUNT(*) FROM sigweb.loteamentos`, [])
    return { data: rows, pagination: { page: Number(page), limit: Number(limit), total: Number(count) } }
  })

  app.get('/loteamentos/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const loteamento = await queryOne(
      `SELECT id, nome, decreto, TO_CHAR(data_aprovacao, 'YYYY-MM-DD') AS data_aprovacao, created_at, updated_at
       FROM sigweb.loteamentos
       WHERE id = $1`,
      [id]
    )
    if (!loteamento) return reply.code(404).send({ error: 'Loteamento não encontrado' })
    return loteamento
  })

  app.post(
    '/loteamentos',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const body = loteamentoSchema.parse(request.body)
      const [row] = await query<{ id: string }>(
        `INSERT INTO sigweb.loteamentos (nome, decreto, data_aprovacao)
         VALUES ($1, $2, $3)
         RETURNING id`,
        [body.nome, body.decreto ?? null, body.dataAprovacao ?? null]
      )
      reply.code(201)
      return { id: row.id }
    }
  )

  app.put(
    '/loteamentos/:id',
    { preHandler: requireRole('ADMIN', 'FISCAL_TRIBUTARIO') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      const body = loteamentoSchema.partial().parse(request.body)
      const updates: string[] = []
      const params: unknown[] = []
      let idx = 1

      if (body.nome !== undefined) { updates.push(`nome = $${idx++}`); params.push(body.nome) }
      if (body.decreto !== undefined) { updates.push(`decreto = $${idx++}`); params.push(body.decreto ?? null) }
      if (body.dataAprovacao !== undefined) { updates.push(`data_aprovacao = $${idx++}`); params.push(body.dataAprovacao ?? null) }

      if (!updates.length) {
        return reply.code(400).send({ error: 'Nenhum campo para atualizar' })
      }

      params.push(id)
      await query(`UPDATE sigweb.loteamentos SET ${updates.join(', ')} WHERE id = $${idx}`, params)
      return { ok: true }
    }
  )

  app.delete(
    '/loteamentos/:id',
    { preHandler: requireRole('ADMIN') },
    async (request, reply) => {
      const { id } = request.params as { id: string }
      await query(`DELETE FROM sigweb.loteamentos WHERE id = $1`, [id])
      reply.code(204)
    }
  )

  app.get('/loteamentos/export', async (request, reply) => {
    const { format = 'csv' } = request.query as { format?: string }
    if (!EXPORT_FORMATS.includes(format as ExportFormat)) {
      return reply.code(400).send({ error: 'Formato inválido. Use csv, xml ou xlsx.' })
    }

    const rows = await query<Record<string, unknown>>(
      `SELECT id, nome, decreto, TO_CHAR(data_aprovacao, 'YYYY-MM-DD') AS data_aprovacao
       FROM sigweb.loteamentos
       ORDER BY nome`
    )
    const filename = `loteamentos.${format}`

    if (format === 'csv') {
      const csv = toCsv(rows)
      reply.header('Content-Type', 'text/csv; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return csv
    }

    if (format === 'xml') {
      const xml = toXml('loteamentos', rows)
      reply.header('Content-Type', 'application/xml; charset=utf-8')
      reply.header('Content-Disposition', `attachment; filename="${filename}"`)
      return xml
    }

    const buffer = toXlsx(rows)
    reply.header('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    reply.header('Content-Disposition', `attachment; filename="${filename}"`)
    return buffer
  })
}
